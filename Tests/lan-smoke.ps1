$ErrorActionPreference = 'Stop'
$apps = @()
try {
    foreach ($seat in 'HOST','GUEST') {
        $socket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $socket.Start()
        $port = $socket.LocalEndpoint.Port
        $socket.Stop()
        [Environment]::SetEnvironmentVariable("GWENT_QA_$seat", $port)
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port"
        $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:TEMP ("gwent-lan-qa-" + [Guid]::NewGuid())
        $apps += Start-Process -FilePath (Join-Path (Split-Path $PSScriptRoot) 'Gwent.exe') -WindowStyle Hidden -PassThru
    }
    node (Join-Path $PSScriptRoot 'lan-smoke.cjs')
    $status = $LASTEXITCODE
} finally {
    foreach ($app in $apps) {
        if (!$app.HasExited) { $null = $app.CloseMainWindow(); if (!$app.WaitForExit(5000)) { $app.Kill() } }
    }
}
exit $status
