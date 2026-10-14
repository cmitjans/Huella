# Instala o actualiza Huella: baja los archivos de la extensión desde GitHub a una carpeta de tu computador.
# Solo copia archivos; no instala programas ni cambia nada más, salvo crear (una vez) el ícono
# "Actualizar Huella" en el escritorio.
#
# Carpeta: la que indique la variable HUELLA_CARPETA (la pone actualizar-huella.cmd) o Documentos\Huella.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = 'Tls12'

$carpeta = $env:HUELLA_CARPETA
if (-not $carpeta) { $carpeta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Huella' }
$carpeta = $carpeta.TrimEnd('\', '/')

$raw = 'https://raw.githubusercontent.com/cmitjans/Huella'
# Se usa el último cambio exacto (así no llegan copias viejas guardadas en caché). Si no se puede
# consultar a GitHub cuál es, se usa la rama principal y la lista de archivos del repositorio.
$sha = $null
try { $sha = (Invoke-RestMethod 'https://api.github.com/repos/cmitjans/Huella/commits/main').sha } catch { }
$version = if ($sha) { $sha } else { 'main' }
$lista = (New-Object Net.WebClient).DownloadString("$raw/$version/herramientas/archivos.txt") -split "`n" |
  ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^(manifest\.json|actualizar-huella\.cmd|src/|ui/|iconos/)' }
foreach ($ruta in $lista) {
  $destino = Join-Path $carpeta $ruta
  New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
  Invoke-WebRequest -UseBasicParsing "$raw/$version/$ruta" -OutFile $destino
}

# Ícono en el escritorio para la próxima vez: solo al instalar con el comando de PowerShell, no cuando
# se actualiza con el ícono (así no reaparece si lo moviste a otra carpeta). Solo en Windows.
if ($env:OS -eq 'Windows_NT' -and -not $env:HUELLA_CARPETA) {
  try {
    $escritorio = [Environment]::GetFolderPath('Desktop')
    $acceso = Join-Path $escritorio 'Actualizar Huella.lnk'
    if (-not (Test-Path $acceso)) {
      $atajo = (New-Object -ComObject WScript.Shell).CreateShortcut($acceso)
      $atajo.TargetPath = Join-Path $carpeta 'actualizar-huella.cmd'
      $atajo.WorkingDirectory = $carpeta
      $atajo.Description = 'Baja la versión más reciente de Huella'
      $atajo.Save()
      Write-Host 'Se creó el ícono "Actualizar Huella" en el escritorio.'
    }
  } catch { }
}

$numero = (Get-Content (Join-Path $carpeta 'manifest.json') -Raw | ConvertFrom-Json).version
Write-Host ''
Write-Host "Listo: Huella $numero en $carpeta"
Write-Host 'Para aplicarla, toca el botón de recargar (la flecha circular) en la tarjeta de Huella en chrome://extensions.'
