Write-Host "=== DrowsyGuard build environment ===" -ForegroundColor Cyan
Write-Host "Node:"; node --version
Write-Host "npm:"; npm --version
Write-Host "Java:"; java -version
Write-Host "ADB devices:"; adb devices
Write-Host "`nExpected: Node 20/22, JDK 17, Android SDK/ADB installed, and an Android device/emulator available."
Write-Host "This script only checks commands; it does not change environment variables."
