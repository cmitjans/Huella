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

$repo = 'https://api.github.com/repos/cmitjans/Huella'
# Se usa el último cambio exacto, así no llegan copias viejas guardadas en caché.
$sha = (Invoke-RestMethod "$repo/commits/main").sha
$lista = Invoke-RestMethod "$repo/git/trees/$($sha)?recursive=1"
foreach ($a in $lista.tree) {
  if ($a.type -ne 'blob' -or $a.path -notmatch '^(manifest\.json|actualizar-huella\.cmd|src/|ui/|iconos/)') { continue }
  $destino = Join-Path $carpeta $a.path
  New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/cmitjans/Huella/$sha/$($a.path)" -OutFile $destino
}

# Ícono en el escritorio para la próxima vez (solo en Windows, y solo si no existe).
if ($env:OS -eq 'Windows_NT') {
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

$version = (Get-Content (Join-Path $carpeta 'manifest.json') -Raw | ConvertFrom-Json).version
Write-Host ''
Write-Host "Listo: Huella $version en $carpeta"
Write-Host 'Para aplicarla, toca el botón de recargar (la flecha circular) en la tarjeta de Huella en chrome://extensions.'
