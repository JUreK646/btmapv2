$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = (Get-Command node -ErrorAction SilentlyContinue).Source
if (!$taskNode -or !(Test-Path -LiteralPath $taskNode)) {
  $taskNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (!(Test-Path -LiteralPath $taskNode)) { throw 'Zainstaluj Node.js 24 lub nowszy.' }
if (!(Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { throw 'Najpierw zainstaluj zależności: pnpm install' }
Write-Host 'BTMap v2: http://127.0.0.1:5174/btmap'
Write-Host 'Zatrzymanie serwera: Ctrl+C'
& $taskNode scripts/dev.mjs
