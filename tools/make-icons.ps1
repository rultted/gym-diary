# Генерирует PNG-иконки приложения (гантель на тёмном фоне) в docs/icons
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\docs\icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($size in 180, 192, 512) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::FromArgb(15, 17, 21))

    $s = $size / 100.0
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 138, 61))

    # гриф + блины (x, y, w, h в процентах от размера)
    $rects = @(
        @(18, 47, 64, 6),
        @(14, 38, 8, 24), @(24, 29, 10, 42),
        @(66, 29, 10, 42), @(78, 38, 8, 24)
    )
    foreach ($r in $rects) {
        $g.FillRectangle($brush, [single]($r[0] * $s), [single]($r[1] * $s), [single]($r[2] * $s), [single]($r[3] * $s))
    }

    $g.Dispose()
    $bmp.Save((Join-Path $out "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}
Write-Output "Icons written to $out"
