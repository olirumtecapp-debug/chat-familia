Add-Type -AssemblyName System.Drawing

$sourcePath = "D:\Chatfamily\client\public\ChatForAll-Logo-cropped.png"
if (-not (Test-Path $sourcePath)) {
    $sourcePath = "D:\Chatfamily\client\public\ChatForAll-Logo.png"
}

$src = [System.Drawing.Image]::FromFile($sourcePath)
Write-Host "Source image size: $($src.Width)x$($src.Height)"

function Resize-Image($source, $targetPath, $width, $height) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($source, 0, 0, $width, $height)
    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $targetPath ($width x $height)"
}

Resize-Image $src "D:\Chatfamily\client\public\icon-192.png" 192 192
Resize-Image $src "D:\Chatfamily\client\public\icon-512.png" 512 512
Resize-Image $src "D:\Chatfamily\client\public\icon-maskable-512.png" 512 512
Resize-Image $src "D:\Chatfamily\client\public\apple-touch-icon.png" 180 180
Resize-Image $src "D:\Chatfamily\client\public\favicon.png" 64 64

$src.Dispose()
Write-Host "Icons generation complete!"
