<#
.SYNOPSIS
  Startet App, Test-Anmeldeanbieter und Test-Claude-API lokal und führt die API-Tests aus.
.EXAMPLE
  ./tests/php/run.ps1 -Php C:\tools\php\php.exe
#>
param([string]$Php = 'php')

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$ini = Join-Path (Split-Path $Php -Parent) 'php.ini'
$phpArgs = if ($Php -ne 'php' -and (Test-Path $ini)) { @('-c', $ini) } else { @() }

Remove-Item -Recurse -Force (Join-Path ([IO.Path]::GetTempPath()) 'sb-test-data') -ErrorAction SilentlyContinue
$env:SCHULBUDDY_CONFIG = Join-Path $PSScriptRoot 'test-config.php'

$servers = @(
  Start-Process $Php -ArgumentList ($phpArgs + @('-S', '127.0.0.1:8090', '-t', "$root/public")) -PassThru -WindowStyle Hidden
  Start-Process $Php -ArgumentList ($phpArgs + @('-S', '127.0.0.1:8091', "$PSScriptRoot/mock-idp.php")) -PassThru -WindowStyle Hidden
  Start-Process $Php -ArgumentList ($phpArgs + @('-S', '127.0.0.1:8092', "$PSScriptRoot/mock-anthropic.php")) -PassThru -WindowStyle Hidden
)
try {
  Start-Sleep -Milliseconds 800
  & $Php @phpArgs (Join-Path $PSScriptRoot 'api-test.php')
  $code = $LASTEXITCODE
} finally {
  $servers | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item Env:SCHULBUDDY_CONFIG
}
exit $code
