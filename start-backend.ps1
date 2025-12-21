param(
    [int]$Port = 8080
)

function Get-PidsOnPort {
    param([int]$Port)

    $pids = @()
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        }
    } catch {
        $lines = netstat -ano | Select-String -Pattern "[:.]$Port\s"
        foreach ($line in $lines) {
            $parts = ($line -split "\s+") | Where-Object { $_ -ne "" }
            if ($parts.Count -ge 5) {
                $pids += [int]$parts[-1]
            }
        }
        $pids = $pids | Select-Object -Unique
    }

    return $pids
}

$pids = Get-PidsOnPort -Port $Port
if ($pids.Count -gt 0) {
    foreach ($pid in $pids) {
        if ($pid -and $pid -ne 0) {
            try {
                Stop-Process -Id $pid -Force -ErrorAction Stop
                Write-Host "Stopped PID $pid on port $Port."
            } catch {
                Write-Warning "Failed to stop PID ${pid}: $($_.Exception.Message)"
            }
        }
    }
} else {
    Write-Host "No processes found on port $Port."
}

# Give the OS a moment to release the port.
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 150
    if ((Get-PidsOnPort -Port $Port).Count -eq 0) {
        break
    }
}

Write-Host "Port $Port is free."
