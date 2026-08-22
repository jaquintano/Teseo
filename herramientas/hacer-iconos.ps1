# Genera el logotipo del menu y los iconos de la aplicacion desde el dibujo
# nuevo. La figura entera, que es lo que tiene fuerza: el gesto de la mano y
# la posicion del torso.
#
# Uso:  iconos.ps1 <carpeta de destino>
Add-Type -AssemblyName System.Drawing

$origen = Join-Path $PSScriptRoot "..\iconos\logo-teseo-original.jpg"
$destino = if ($args[0]) { $args[0] } else { Join-Path $PSScriptRoot "..\iconos" }
if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Force $destino | Out-Null }

$src = New-Object System.Drawing.Bitmap($origen)

function Reducir($imagen, $ancho, $alto) {
  # En dos pasos, pasando primero por el doble de tamano. El dibujo es linea
  # fina y muy contrastada: bajarlo de golpe se come trazos enteros, y el paso
  # intermedio hace que el remuestreo promedie en vez de escoger.
  $medio = New-Object System.Drawing.Bitmap([int]($ancho * 2), [int]($alto * 2))
  $g = [System.Drawing.Graphics]::FromImage($medio)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($imagen, 0, 0, $medio.Width, $medio.Height)
  $g.Dispose()

  $fin = New-Object System.Drawing.Bitmap([int]$ancho, [int]$alto)
  $g2 = [System.Drawing.Graphics]::FromImage($fin)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g2.DrawImage($medio, 0, 0, $fin.Width, $fin.Height)
  $g2.Dispose()
  $medio.Dispose()
  return $fin
}

function ColorDelBorde($imagen) {
  # Se toma el color de las cuatro esquinas del propio dibujo, para que lo que
  # se rellene alrededor sea exactamente su fondo y no se vea la junta.
  $r = 0; $g = 0; $b = 0; $n = 0
  $lado = [Math]::Max(4, [int]($imagen.Width * 0.06))
  $derecha = $imagen.Width - $lado
  $abajo = $imagen.Height - $lado
  $esquinas = New-Object System.Collections.ArrayList
  [void]$esquinas.Add(@(0, 0))
  [void]$esquinas.Add(@($derecha, 0))
  [void]$esquinas.Add(@(0, $abajo))
  [void]$esquinas.Add(@($derecha, $abajo))

  foreach ($esquina in $esquinas) {
    for ($x = 0; $x -lt $lado; $x++) {
      for ($y = 0; $y -lt $lado; $y++) {
        $c = $imagen.GetPixel($esquina[0] + $x, $esquina[1] + $y)
        $r += $c.R; $g += $c.G; $b += $c.B; $n++
      }
    }
  }
  return [System.Drawing.Color]::FromArgb([int]($r / $n), [int]($g / $n), [int]($b / $n))
}

function Cuadrado($imagen, $lado, $parte) {
  # `parte` es cuanto del lado ocupa el dibujo. Uno para los iconos normales;
  # menos para el maskable, que Android recorta hasta un circulo y hay que
  # dejarle margen o le corta la mano al tirador.
  $escala = ($lado * $parte) / [Math]::Max($imagen.Width, $imagen.Height)
  $ancho = [int][Math]::Round($imagen.Width * $escala)
  $alto = [int][Math]::Round($imagen.Height * $escala)
  $reducido = Reducir $imagen $ancho $alto

  $lienzo = New-Object System.Drawing.Bitmap([int]$lado, [int]$lado)
  $g = [System.Drawing.Graphics]::FromImage($lienzo)
  $g.Clear((ColorDelBorde $reducido))
  $g.DrawImage($reducido, [int](($lado - $ancho) / 2), [int](($lado - $alto) / 2), $ancho, $alto)
  $g.Dispose()
  $reducido.Dispose()
  return $lienzo
}

function GuardarJpeg($imagen, $ruta, $calidad) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]$calidad)
  $imagen.Save($ruta, $codec, $params)
}

# --- El logotipo del menu ---
# Se ve a 440 px de ancho como mucho, asi que 880 es exactamente el doble: lo
# justo para que se vea nitido en una pantalla de doble densidad sin cargar
# pixeles que nadie va a mirar.
$alturaMenu = [int][Math]::Round(880 * $src.Height / $src.Width)
$menu = Reducir $src 880 $alturaMenu
GuardarJpeg $menu ($destino + "\logo-teseo.jpg") 88
$menu.Dispose()

# --- Los iconos ---
foreach ($icono in @(@('icon-512.png', 512, 1.0), @('icon-192.png', 192, 1.0),
                     @('apple-touch-icon.png', 180, 1.0),
                     @('icon-maskable-512.png', 512, 0.78))) {
  $img = Cuadrado $src $icono[1] $icono[2]
  $img.Save($destino + "\" + $icono[0], [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
}

$src.Dispose()

Get-ChildItem $destino -File | ForEach-Object { "{0} - {1:N0} bytes" -f $_.Name, $_.Length }

