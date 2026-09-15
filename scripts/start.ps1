[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot "backend"
$frontendRoot = Join-Path $projectRoot "frontend"
$venvRoot = Join-Path $projectRoot ".venv"
$frontendUrl = "http://localhost:3000"
$backendHealthUrl = "http://localhost:8000/api/v1/health"

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

function Wait-MySql([string]$DockerPath, [string]$ContainerName, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "SilentlyContinue"
            & $DockerPath exec $ContainerName sh -lc 'mysqladmin ping -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' *> $null
            if ($LASTEXITCODE -eq 0) { return }
        }
        finally {
            $ErrorActionPreference = $previousPreference
        }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for MySQL in the existing '$ContainerName' container."
}

function Test-HttpEndpoint([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch { return $false }
}

function Wait-HttpEndpoint([string]$Url, [int]$TimeoutSeconds, [string]$ServiceName) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpEndpoint $Url) { return }
        Start-Sleep -Seconds 1
    }
    throw "Timed out waiting for $ServiceName at $Url. Check its terminal window for details."
}

function Assert-PortAvailable([int]$Port, [string]$ServiceName) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $Port is occupied by another process, so $ServiceName cannot start." }
}

function Get-PnpmRunner {
    foreach ($name in @("pnpm.cmd", "pnpm")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return [PSCustomObject]@{ FilePath = $command.Source; PrefixArguments = @(); DisplayName = "pnpm" }
        }
    }

    $candidates = @()
    if ($env:PNPM_HOME) { $candidates += Join-Path $env:PNPM_HOME "pnpm.cmd" }
    if ($env:APPDATA) { $candidates += Join-Path $env:APPDATA "npm\pnpm.cmd" }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA "pnpm\pnpm.cmd" }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return [PSCustomObject]@{ FilePath = $candidate; PrefixArguments = @(); DisplayName = "pnpm" }
        }
    }

    foreach ($name in @("corepack.cmd", "corepack")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return [PSCustomObject]@{ FilePath = $command.Source; PrefixArguments = @("pnpm"); DisplayName = "Corepack pnpm" }
        }
    }

    foreach ($name in @("npx.cmd", "npx")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return [PSCustomObject]@{ FilePath = $command.Source; PrefixArguments = @("--yes", "pnpm@10.15.1"); DisplayName = "pnpm 10.15.1 via npx" }
        }
    }

    throw "Node.js LTS is required for local frontend development."
}

function Get-BackendPython {
    $venvPython = Join-Path $venvRoot "Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) { return $venvPython }

    $pythonLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($pythonLauncher) {
        Write-Step "Creating the Python 3.12 virtual environment"
        & $pythonLauncher.Source -3.12 -m venv $venvRoot
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $venvPython)) { return $venvPython }
    }

    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $isSupported = & $pythonCommand.Source -c "import sys; print(int(sys.version_info >= (3, 12)))"
        if ($isSupported -eq "1") {
            Write-Step "Creating the Python virtual environment"
            & $pythonCommand.Source -m venv $venvRoot
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $venvPython)) { return $venvPython }
        }
    }

    throw "Python 3.12 or newer is required for local backend development."
}

function ConvertTo-EncodedCommand([string]$Command) {
    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
}

function ConvertTo-PowerShellLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
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
    Write-Step "Checking development tools"
    $dockerCommand = Get-Command docker -ErrorAction Stop
    $backendPython = Get-BackendPython
    $pnpmRunner = Get-PnpmRunner
    Write-Host "Backend Python: $backendPython"
    Write-Host "Frontend runner: $($pnpmRunner.DisplayName)"

    if ($CheckOnly) {
        Write-Host "Development prerequisites are available." -ForegroundColor Green
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

    $mysqlContainer = if ($env:MYSQL_CONTAINER_NAME) { $env:MYSQL_CONTAINER_NAME } else { "mysql" }
    $mysqlContainerId = (& $dockerCommand.Source ps -aq --filter "name=^/$mysqlContainer$").Trim()
    if (-not $mysqlContainerId) {
        throw "The existing MySQL container '$mysqlContainer' was not found. Set MYSQL_CONTAINER_NAME if it uses another name."
    }

    Write-Step "Reusing the existing MySQL container '$mysqlContainer'"
    & $dockerCommand.Source compose stop backend frontend
    $mysqlState = (& $dockerCommand.Source inspect --format "{{.State.Status}}" $mysqlContainer).Trim()
    if ($mysqlState -ne "running") {
        & $dockerCommand.Source start $mysqlContainer
        if ($LASTEXITCODE -ne 0) { throw "The existing MySQL container '$mysqlContainer' could not be started." }
    }
    Wait-MySql -DockerPath $dockerCommand.Source -ContainerName $mysqlContainer -TimeoutSeconds 120

    if (-not $env:DATABASE_URL -and -not (Test-Path -LiteralPath (Join-Path $backendRoot ".env"))) {
        throw "backend/.env is missing. Configure DATABASE_URL for the existing MySQL database first."
    }

    Write-Step "Checking backend dependencies"
    & $backendPython -c "import fastapi, pymysql, sqlalchemy, uvicorn" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Push-Location $backendRoot
        try {
            & $backendPython -m pip install -e ".[dev]"
            if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
        }
        finally { Pop-Location }
    }

    Write-Step "Synchronizing frontend dependencies"
    Push-Location $frontendRoot
    try {
        $previousCi = $env:CI
        $env:CI = "true"
        $installArguments = @($pnpmRunner.PrefixArguments) + @("install", "--frozen-lockfile")
        & $pnpmRunner.FilePath @installArguments
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
    }
    finally {
        $env:CI = $previousCi
        Pop-Location
    }

    if (Test-HttpEndpoint $backendHealthUrl) {
        Write-Step "Backend is already running"
    }
    else {
        Assert-PortAvailable -Port 8000 -ServiceName "the backend"
        Write-Step "Opening the FastAPI development terminal"
        $backendCommand = "`$host.UI.RawUI.WindowTitle = 'AniNexus Backend'; Set-Location -LiteralPath " + (ConvertTo-PowerShellLiteral $backendRoot) + "; & " + (ConvertTo-PowerShellLiteral $backendPython) + " -m uvicorn aninexus_backend.main:app --reload --host 127.0.0.1 --port 8000"
        Start-Process -FilePath powershell.exe -ArgumentList @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-EncodedCommand", (ConvertTo-EncodedCommand $backendCommand)) -WorkingDirectory $backendRoot
        Wait-HttpEndpoint -Url $backendHealthUrl -TimeoutSeconds 90 -ServiceName "backend API"
    }

    if (Test-HttpEndpoint $frontendUrl) {
        Write-Step "Frontend is already running"
    }
    else {
        Assert-PortAvailable -Port 3000 -ServiceName "the frontend"
        Write-Step "Opening the Next.js development terminal"
        $runnerArguments = @($pnpmRunner.PrefixArguments) + @("dev")
        $runnerArgumentText = ($runnerArguments | ForEach-Object { ConvertTo-PowerShellLiteral $_ }) -join " "
        $frontendCommand = "`$host.UI.RawUI.WindowTitle = 'AniNexus Frontend'; Set-Location -LiteralPath " + (ConvertTo-PowerShellLiteral $frontendRoot) + "; & " + (ConvertTo-PowerShellLiteral $pnpmRunner.FilePath) + " $runnerArgumentText"
        Start-Process -FilePath powershell.exe -ArgumentList @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-EncodedCommand", (ConvertTo-EncodedCommand $frontendCommand)) -WorkingDirectory $frontendRoot
        Wait-HttpEndpoint -Url $frontendUrl -TimeoutSeconds 90 -ServiceName "frontend"
    }

    Write-Host "`nAniNexus development environment is ready." -ForegroundColor Green
    Write-Host "Frontend: $frontendUrl"
    Write-Host "Backend:  http://localhost:8000/docs"
    Write-Host "Database: existing '$mysqlContainer' Docker container"

    if (-not $NoBrowser) {
        $chromePath = Get-ChromePath
        if ($chromePath) { Start-Process -FilePath $chromePath -ArgumentList $frontendUrl }
        else { Write-Warning "Google Chrome was not found. Open $frontendUrl manually." }
    }
}
catch {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Check the backend/frontend terminal windows and run 'docker logs mysql' for database logs."
    exit 1
}
