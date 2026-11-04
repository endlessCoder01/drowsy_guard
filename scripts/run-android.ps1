$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.\package.json')) {
  throw 'Run this script from the DrowsyGuard project root.'
}

Write-Host 'Installing JavaScript dependencies...' -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

if (-not (Test-Path '.\android')) {
  Write-Host 'Generating Android native project...' -ForegroundColor Cyan
  npx expo prebuild --platform android
  if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed.' }
}

Write-Host 'Building and installing DrowsyGuard...' -ForegroundColor Cyan
npx expo run:android
if ($LASTEXITCODE -ne 0) { throw 'Android build/install failed. Read README.md troubleshooting.' }
