<#
.SYNOPSIS
  Baut SchulBuddy und lädt es auf den manitu-Webspace hoch.

.DESCRIPTION
  Liest die Serverdaten aus deploy/deploy.config.json (Vorlage: deploy.config.sample.json).
  protocol "ssh" (empfohlen, braucht SSH-Zugang): lädt ein Archiv hoch, entpackt es neben der
  laufenden Version und tauscht dann in einem Schritt aus.
  protocol "sftp" lädt Datei für Datei mit dem in Windows enthaltenen OpenSSH hoch,
  "ftps" nutzt curl.exe (FTP mit TLS). Passwörter werden nur abgefragt und nirgends gespeichert.

.PARAMETER SkipVendor
  api/vendor nicht hochladen (spart Zeit, wenn sich die PHP-Abhängigkeiten nicht geändert haben).

.PARAMETER DryRun
  Nur bauen und anzeigen, was hochgeladen würde.

.EXAMPLE
  ./deploy/deploy.ps1
  ./deploy/deploy.ps1 -SkipVendor
#>
param([switch]$SkipVendor, [switch]$DryRun)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $PSScriptRoot 'deploy.config.json'
if (-not (Test-Path $configPath)) {
  throw 'deploy/deploy.config.json fehlt. Kopiere deploy/deploy.config.sample.json und trage die Serverdaten ein.'
}
$cfg = Get-Content $configPath -Raw | ConvertFrom-Json

Push-Location $root
try {
  node tools/build.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Build fehlgeschlagen.' }
} finally {
  Pop-Location
}

$dist = (Join-Path $root 'dist') -replace '\\', '/'
$files = Get-ChildItem $dist -Recurse -File -Force |
  ForEach-Object { ($_.FullName -replace '\\', '/').Substring($dist.Length + 1) } |
  Sort-Object
if ($SkipVendor) { $files = $files | Where-Object { $_ -notlike 'api/vendor/*' } }
$remote = $cfg.remotePath.TrimEnd('/')

Write-Host "$($files.Count) Dateien -> $($cfg.protocol)://$($cfg.host)$remote/"
if ($DryRun) { $files; return }

$target = if ($cfg.user) { "$($cfg.user)@$($cfg.host)" } else { $cfg.host }
$port = if ($cfg.port) { $cfg.port } else { 22 }

switch ($cfg.protocol) {
  'ssh' {
    if ($SkipVendor) { Write-Host 'Hinweis: -SkipVendor ist bei ssh nicht nötig, das Archiv enthält alles.' }
    $archive = Join-Path ([IO.Path]::GetTempPath()) 'schulbuddy-deploy.tar.gz'
    tar -czf $archive -C $dist .
    if ($LASTEXITCODE -ne 0) { throw 'Archiv konnte nicht erstellt werden.' }
    scp -q -P $port $archive "${target}:schulbuddy-deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Hochladen per scp fehlgeschlagen.' }
    Remove-Item $archive
    # Neben der laufenden Version entpacken, Rechte setzen, dann austauschen.
    $script = @"
set -e
T='$remote'
rm -rf "`$T.new" "`$T.old"
mkdir -p "`$T.new"
tar -xzf ~/schulbuddy-deploy.tar.gz -C "`$T.new"
find "`$T.new" -type d -exec chmod 2755 {} +
find "`$T.new" -type f -exec chmod 644 {} +
if [ -d "`$T" ]; then mv "`$T" "`$T.old"; fi
mv "`$T.new" "`$T"
rm -rf "`$T.old" ~/schulbuddy-deploy.tar.gz
echo "Online-Version ausgetauscht: `$T"
"@
    ($script -replace "`r", '') | ssh -p $port $target 'bash -s'
    if ($LASTEXITCODE -ne 0) { throw 'Entpacken auf dem Server fehlgeschlagen.' }
  }
  'sftp' {
    # Alle Zielordner anlegen (Fehler bei vorhandenen Ordnern sind harmlos), dann jede Datei hochladen.
    $dirs = foreach ($f in $files) {
      $parts = $f.Split('/')
      for ($i = 1; $i -lt $parts.Count; $i++) { $parts[0..($i - 1)] -join '/' }
    }
    $commands = @()
    $commands += $dirs | Sort-Object -Unique | ForEach-Object { "mkdir `"$remote/$_`"" }
    $commands += $files | ForEach-Object { "put `"$dist/$_`" `"$remote/$_`"" }
    $commands += 'bye'
    $port = if ($cfg.port) { $cfg.port } else { 22 }
    $commands | sftp -P $port "$($cfg.user)@$($cfg.host)"
    if ($LASTEXITCODE -ne 0) { throw 'Upload per SFTP fehlgeschlagen.' }
  }
  'ftps' {
    $secure = Read-Host "FTP-Passwort für $($cfg.user)" -AsSecureString
    $password = [Net.NetworkCredential]::new('', $secure).Password
    $escape = { param($s) $s -replace '\\', '\\' -replace '"', '\"' }
    $lines = @("user = `"$(& $escape $cfg.user):$(& $escape $password)`"", 'ftp-create-dirs', 'ssl-reqd', 'show-error', 'silent')
    foreach ($f in $files) {
      $lines += "upload-file = `"$dist/$f`""
      $lines += "url = `"ftp://$($cfg.host)$remote/$f`""
    }
    $curlConfig = New-TemporaryFile
    try {
      [IO.File]::WriteAllLines($curlConfig.FullName, [string[]]$lines)
      curl.exe --config $curlConfig.FullName
      if ($LASTEXITCODE -ne 0) { throw "Upload per FTPS fehlgeschlagen (curl-Fehler $LASTEXITCODE)." }
    } finally {
      Remove-Item $curlConfig -Force
      $password = $null
    }
  }
  default { throw "Unbekanntes Protokoll '$($cfg.protocol)'. Erlaubt: sftp, ftps." }
}

Write-Host 'Fertig. App öffnen: https://schoolbuddy.thiesreinhold.de' -ForegroundColor Green
