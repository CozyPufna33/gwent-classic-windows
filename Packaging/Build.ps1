param(
    [switch]$Packages,
    [string]$Rar = "$env:ProgramFiles\WinRAR\Rar.exe",
    [string]$Iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
Push-Location $root
try {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    & $compiler /nologo /target:winexe /platform:x64 /codepage:65001 /win32icon:Native\Gwent.ico /out:Gwent.exe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:Native\Microsoft.Web.WebView2.Core.dll /reference:Native\Microsoft.Web.WebView2.WinForms.dll Native\Gwent.cs Native\LanLink.cs
    if ($LASTEXITCODE) { throw 'Windows launcher build failed.' }
    if (!$Packages) { return }
    if (!(Test-Path -LiteralPath $Rar) -or !(Test-Path -LiteralPath $Iscc)) { throw 'Provide the paths to Rar.exe and ISCC.exe.' }
    $dist = (New-Item -ItemType Directory -Path 'dist' -Force).FullName
    $stage = (New-Item -ItemType Directory -Path (Join-Path $env:TEMP ('gwent-package-' + [guid]::NewGuid()))).FullName
    $payload = Join-Path $stage 'Gwent Classic'
    foreach ($sub in 'Game','Native') { New-Item -ItemType Directory -Path (Join-Path $payload $sub) -Force | Out-Null }
    Copy-Item -LiteralPath 'Gwent.exe','Gwent.exe.config','README.md' -Destination $payload
    $guide = if (Test-Path 'GAME-GUIDE.md') { 'GAME-GUIDE.md' } else { 'PROCITAJ.md' }
    Copy-Item -LiteralPath $guide -Destination (Join-Path $payload 'GAME-GUIDE.md')
    Copy-Item -Path 'Game\*.js','Game\*.css','Game\index.html','Game\LICENSE' -Destination (Join-Path $payload 'Game')
    Copy-Item -LiteralPath 'Game\img','Game\music','Game\sfx','Game\svg' -Destination (Join-Path $payload 'Game') -Recurse
    Copy-Item -Path 'Native\*.dll','Native\WebView2-*.txt' -Destination (Join-Path $payload 'Native')
    $rarName = 'Gwent-Classic-1.0.0-Portable.rar'
    Push-Location $stage
    try {
        & $Rar a -ma5 -m3 -idq $rarName 'Gwent Classic'
        if ($LASTEXITCODE) { throw 'RAR creation failed.' }
        & $Rar t -idq $rarName
        if ($LASTEXITCODE) { throw 'RAR integrity test failed.' }
        Copy-Item -LiteralPath $rarName -Destination $dist
    } finally { Pop-Location }
    & $Iscc /Qp "/DPayload=$payload" "/O$dist" (Join-Path $PSScriptRoot 'Game.iss')
    if ($LASTEXITCODE) { throw 'Installer compilation failed.' }
    $assets = $rarName,'Gwent-Classic-1.0.0-Setup.exe'
    $lines = foreach ($name in $assets) {
        (Get-FileHash -LiteralPath (Join-Path $dist $name) -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $name
    }
    $lines | Set-Content -LiteralPath (Join-Path $dist 'SHA256SUMS.txt') -Encoding ascii
    Write-Output "Release files: $dist"
} finally { Pop-Location }
