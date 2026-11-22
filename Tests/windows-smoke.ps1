$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$env:GWENT_TEST_PORT = $listener.LocalEndpoint.Port
$listener.Stop()
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$env:GWENT_TEST_PORT"
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:TEMP ("gwent-qa-" + [Guid]::NewGuid())
$app = Start-Process -FilePath (Join-Path $root 'Gwent.exe') -WindowStyle Hidden -PassThru
try {
    node (Join-Path $PSScriptRoot 'windows-smoke.cjs')
    $status = $LASTEXITCODE
} finally {
    if (!$app.HasExited) { $null = $app.CloseMainWindow(); if (!$app.WaitForExit(5000)) { $app.Kill() } }
}
exit $status

