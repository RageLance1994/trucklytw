$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Stop-ProcessesOnPort {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($procId in $pids) {
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Warning "Failed to stop process $procId on port $Port. $($_.Exception.Message)"
        }
    }
}

Stop-ProcessesOnPort -Port 8080
Stop-ProcessesOnPort -Port 5173

$backendCmd = "cd `"$root\backend`"; npx nodemon"
$frontendCmd = "cd `"$root\frontend`"; npm run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd
