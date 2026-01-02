$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendCmd = "cd `"$root\backend`"; npx nodemon"
$frontendCmd = "cd `"$root\frontend`"; npm run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd
