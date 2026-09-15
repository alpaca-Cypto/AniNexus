[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$SkipBuild,
    [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
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
    Write-Step "Checking Docker"
    $dockerCommand = Get-Command docker -ErrorAction Stop
    if ($CheckOnly) {
        Write-Host "Docker CLI is available." -ForegroundColor Green
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

    Write-Step "Starting the full Docker environment"
    $composeArguments = @("compose", "up", "-d")
    if (-not $SkipBuild) { $composeArguments += "--build" }
    $composeArguments += @("mysql", "backend", "frontend")
    & $dockerCommand.Source @composeArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed to start AniNexus." }

    Write-Step "Waiting for services"
    Wait-HttpEndpoint -Url $backendHealthUrl -TimeoutSeconds 120 -ServiceName "backend API"
    Wait-HttpEndpoint -Url $frontendUrl -TimeoutSeconds 180 -ServiceName "frontend"

    Write-Host "`nAniNexus Docker environment is ready." -ForegroundColor Green
    Write-Host "Frontend: $frontendUrl"
    Write-Host "Backend:  http://localhost:8000/docs"

    if (-not $NoBrowser) {
        $chromePath = Get-ChromePath
        if ($chromePath) { Start-Process -FilePath $chromePath -ArgumentList $frontendUrl }
        else { Write-Warning "Google Chrome was not found. Open $frontendUrl manually." }
    }
}
catch {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Run 'docker compose logs backend mysql frontend' from $projectRoot for logs."
    exit 1
}
