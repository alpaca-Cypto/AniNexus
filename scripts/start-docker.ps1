[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$SkipBuild,
    [switch]$CheckOnly,
    [string]$EnvFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot "compose.production.yaml"
$localSecretsComposeFile = Join-Path $projectRoot "compose.production.local-secrets.yaml"
$mysqlSecretVolume = "aninexus-production_local_secrets"
$appSecretVolume = "aninexus-production_app_secrets"
$envFile = if ($EnvFile) { [IO.Path]::GetFullPath($EnvFile) } else { Join-Path $projectRoot ".env.production.local" }
$frontendUrl = "http://localhost:3000"
$backendHealthUrl = "$frontendUrl/api/v1/health"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-DockerEngine([string]$DockerPath) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        & $DockerPath info *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Wait-DockerEngine([string]$DockerPath, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-DockerEngine $DockerPath) { return }
        Start-Sleep -Seconds 2
    }
    throw "Docker Desktop did not become ready within $TimeoutSeconds seconds."
}

function Get-SecretSource([string]$EnvironmentFile, [string]$Name) {
    $configuredValue = $null
    foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
        if ($line -match "^\s*$Name\s*=\s*(.*)$") {
            $configuredValue = $Matches[1]
            break
        }
    }
    $candidates = @(
        [PSCustomObject]@{ Value = [Environment]::GetEnvironmentVariable($Name); Source = "process environment" },
        [PSCustomObject]@{ Value = $configuredValue; Source = $EnvironmentFile }
    )
    $problems = @()
    foreach ($candidate in $candidates) {
        if (-not $candidate.Value) { continue }
        $path = $candidate.Value.Trim().Trim('"', "'")
        if (-not [IO.Path]::IsPathRooted($path)) {
            $problems += "$($candidate.Source): path is not absolute"
            continue
        }
        try {
            $file = Get-Item -LiteralPath $path -ErrorAction Stop
        }
        catch {
            $problems += "$($candidate.Source): cannot access '$path' ($($_.Exception.Message))"
            continue
        }
        $reason = if ($file -isnot [IO.FileInfo]) { "the path is a directory, not a password file" }
            elseif ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { "links and reparse points are not supported" }
            elseif ($file.Length -lt 1) { "the password file is empty" }
        if ($reason) {
            $problems += "$($candidate.Source): '$path' is invalid ($reason)"
            continue
        }
        if ($problems.Count -gt 0) {
            Write-Warning "${Name}: using the valid path from $($candidate.Source); the earlier source was invalid."
        }
        return $file.FullName
    }
    if ($problems.Count -eq 0) { throw "$Name is missing from the production environment." }
    throw "$Name has no accessible password file: $($problems -join '; ')"
}

function Test-SecretVolume([string]$DockerPath, [string]$VolumeName) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        & $DockerPath volume inspect $VolumeName *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Invoke-DockerQuiet([string]$DockerPath, [string[]]$Arguments) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        & $DockerPath @Arguments *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Copy-ToSecretVolume([string]$DockerPath, [string]$VolumeName, [string]$PasswordSource, [string]$RootPasswordSource) {
    if (-not (Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @("volume", "create", $VolumeName))) {
        throw "Could not create the Docker secret volume."
    }

    $stageContainer = "aninexus-secret-stage-$([guid]::NewGuid().ToString('N'))"
    if (-not (Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @(
        "run", "-d", "--name", $stageContainer, "--mount",
        "type=volume,source=$VolumeName,target=/run/secrets", "--entrypoint", "sh",
        "mysql:8.4.11", "-c", "sleep 3600"
    ))) { throw "Could not open the Docker secret volume." }
    try {
        if (-not (Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @(
            "cp", $PasswordSource, "${stageContainer}:/run/secrets/mysql_password.pending"
        ))) { throw "Could not copy the application database password." }
        if ($RootPasswordSource) {
            if (-not (Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @(
                "cp", $RootPasswordSource, "${stageContainer}:/run/secrets/mysql_root_password.pending"
            ))) { throw "Could not copy the MySQL root password." }
            $finalize = 'set -e; test -s /run/secrets/mysql_password.pending; test -s /run/secrets/mysql_root_password.pending; chmod 0400 /run/secrets/mysql_password.pending /run/secrets/mysql_root_password.pending; mv -f /run/secrets/mysql_password.pending /run/secrets/mysql_password; mv -f /run/secrets/mysql_root_password.pending /run/secrets/mysql_root_password'
        }
        else {
            $finalize = 'set -e; test -s /run/secrets/mysql_password.pending; chmod 0400 /run/secrets/mysql_password.pending; mv -f /run/secrets/mysql_password.pending /run/secrets/mysql_password'
        }
        if (-not (Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @(
            "exec", $stageContainer, "sh", "-c", $finalize
        ))) { throw "Could not finalize passwords in the Docker secret volume." }
    }
    finally {
        Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @("rm", "-f", $stageContainer) | Out-Null
    }
}

function Initialize-SecretVolumes([string]$DockerPath, [string]$EnvironmentFile) {
    Write-Step "Copying MySQL passwords into Docker-managed secret volumes"
    $passwordSource = Get-SecretSource -EnvironmentFile $EnvironmentFile -Name "ANINEXUS_MYSQL_PASSWORD_FILE"
    $rootPasswordSource = Get-SecretSource -EnvironmentFile $EnvironmentFile -Name "ANINEXUS_MYSQL_ROOT_PASSWORD_FILE"
    Copy-ToSecretVolume -DockerPath $DockerPath -VolumeName $mysqlSecretVolume -PasswordSource $passwordSource -RootPasswordSource $rootPasswordSource
    Copy-ToSecretVolume -DockerPath $DockerPath -VolumeName $appSecretVolume -PasswordSource $passwordSource -RootPasswordSource ""
}

function Assert-SecretMounts([string]$DockerPath, [string]$EnvironmentFile, [string]$ComposePath, [string]$OverridePath) {
    Write-Step "Checking MySQL password mounts"
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        & $DockerPath compose --env-file $EnvironmentFile -f $ComposePath -f $OverridePath run --rm --no-deps --entrypoint sh mysql -c 'test -f /run/secrets/mysql_password && test -r /run/secrets/mysql_password && test -f /run/secrets/mysql_root_password && test -r /run/secrets/mysql_root_password' *> $null
        $mountsAvailable = $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if (-not $mountsAvailable) {
        throw "Docker cannot read the MySQL passwords from its private volume; the database volume has not been changed."
    }
    if (-not (Invoke-DockerQuiet -DockerPath $DockerPath -Arguments @(
        "run", "--rm", "--entrypoint", "sh", "--mount",
        "type=volume,source=$appSecretVolume,target=/run/secrets,readonly",
        "mysql:8.4.11", "-c",
        'test -f /run/secrets/mysql_password && test -r /run/secrets/mysql_password && test ! -e /run/secrets/mysql_root_password'
    ))) {
        throw "The application secret volume is missing its password or contains the MySQL root password."
    }
}

function Test-HttpEndpoint([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    }
    catch { return $false }
}

function Wait-HttpEndpoint([string]$Url, [int]$TimeoutSeconds, [string]$ServiceName) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpEndpoint $Url) { return }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for $ServiceName at $Url"
}

function Get-ChromePath {
    $candidates = @(
        (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    $chromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
    if ($chromeCommand) { return $chromeCommand.Source }
    return $null
}

try {
    Set-Location $projectRoot
    Write-Step "Checking Docker"
    $dockerCommand = Get-Command docker -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $envFile)) {
        throw "Production environment file is missing: $envFile"
    }
    Get-SecretSource -EnvironmentFile $envFile -Name "ANINEXUS_MYSQL_PASSWORD_FILE" | Out-Null
    Get-SecretSource -EnvironmentFile $envFile -Name "ANINEXUS_MYSQL_ROOT_PASSWORD_FILE" | Out-Null
    Write-Host "Compose file: $composeFile"
    Write-Host "Local secrets override: $localSecretsComposeFile"
    Write-Host "Environment file: $envFile"
    & $dockerCommand.Source compose --env-file $envFile -f $composeFile -f $localSecretsComposeFile config --quiet
    if ($LASTEXITCODE -ne 0) { throw "Production Compose configuration is invalid." }
    if ($CheckOnly) {
        if (Test-DockerEngine $dockerCommand.Source) {
            if ((Test-SecretVolume -DockerPath $dockerCommand.Source -VolumeName $mysqlSecretVolume) -and
                (Test-SecretVolume -DockerPath $dockerCommand.Source -VolumeName $appSecretVolume)) {
                Assert-SecretMounts -DockerPath $dockerCommand.Source -EnvironmentFile $envFile -ComposePath $composeFile -OverridePath $localSecretsComposeFile
            }
            else {
                Write-Warning "Docker secret volume has not been initialized; run start.cmd to create it."
            }
        }
        else {
            Write-Warning "Docker is not running; MySQL password mounts were not checked."
        }
        Write-Host "Production preview configuration and available mounts are valid." -ForegroundColor Green
        exit 0
    }

    if (-not (Test-DockerEngine $dockerCommand.Source)) {
        $dockerDesktopPath = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
        if (-not (Test-Path -LiteralPath $dockerDesktopPath)) {
            throw "Docker Desktop is not running and could not be found at $dockerDesktopPath."
        }
        Write-Step "Starting Docker Desktop"
        Start-Process -FilePath $dockerDesktopPath -WindowStyle Hidden
        Wait-DockerEngine -DockerPath $dockerCommand.Source -TimeoutSeconds 120
    }

    Initialize-SecretVolumes -DockerPath $dockerCommand.Source -EnvironmentFile $envFile
    Assert-SecretMounts -DockerPath $dockerCommand.Source -EnvironmentFile $envFile -ComposePath $composeFile -OverridePath $localSecretsComposeFile

    Write-Step "Starting the isolated production preview"
    $composeArguments = @("compose", "--env-file", $envFile, "-f", $composeFile, "-f", $localSecretsComposeFile, "up", "-d")
    if (-not $SkipBuild) { $composeArguments += "--build" }
    $composeArguments += @("mysql", "backend", "frontend", "bangumi-refresh")
    & $dockerCommand.Source @composeArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed to start AniNexus." }

    Write-Step "Waiting for services"
    Wait-HttpEndpoint -Url $frontendUrl -TimeoutSeconds 180 -ServiceName "frontend"
    Wait-HttpEndpoint -Url $backendHealthUrl -TimeoutSeconds 120 -ServiceName "backend API through the frontend proxy"

    Write-Host "`nAniNexus production preview is ready." -ForegroundColor Green
    Write-Host "Frontend: $frontendUrl"
    Write-Host "Backend health: $backendHealthUrl"
    Write-Host "Database: aninexus-production MySQL service"

    if (-not $NoBrowser) {
        $chromePath = Get-ChromePath
        if ($chromePath) { Start-Process -FilePath $chromePath -ArgumentList $frontendUrl }
        else { Write-Warning "Google Chrome was not found. Open $frontendUrl manually." }
    }
}
catch {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Run 'docker compose --env-file .env.production.local -f compose.production.yaml -f compose.production.local-secrets.yaml logs backend mysql frontend' from $projectRoot for logs."
    exit 1
}
