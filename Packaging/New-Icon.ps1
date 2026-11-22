$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot
$shield = [Drawing.Image]::FromFile((Join-Path $root 'Game\img\icons\deck_shield_realms.png'))
$sizes = 16,24,32,48,64,128,256
$images = @()
foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size,$size)
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.ScaleTransform($size/256.0,$size/256.0)
    if ($size -gt 24) {
        foreach ($angle in -15,-7,2) {
            $state = $g.Save()
            $g.TranslateTransform(140,202)
            $g.RotateTransform($angle)
            $g.FillRectangle([Drawing.Brushes]::DarkGoldenrod,-88,-177,138,202)
            $g.FillRectangle([Drawing.Brushes]::MidnightBlue,-82,-171,126,190)
            if ($angle -eq 2) { $g.DrawImage($shield,-79,-152,120,138) }
            $g.Restore($state)
        }
    } else { $g.DrawImage($shield,10,0,236,256) }
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
    $images += ,$stream.ToArray()
    $stream.Dispose()
    $g.Dispose()
    $bitmap.Dispose()
}
$shield.Dispose()
$writer = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $root 'Native\Gwent.ico')))
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16*$sizes.Count
    for ($i=0; $i -lt $sizes.Count; $i++) {
        $dimension = [byte]($sizes[$i] % 256)
        $writer.Write($dimension)
        $writer.Write($dimension)
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length)
        $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($image in $images) { $writer.Write([byte[]]$image) }
} finally { $writer.Dispose() }
