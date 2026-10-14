# Huella

Extensión de Chrome que muestra **qué datos tuyos reciben empresas terceras mientras navegas, a quién le llegan y cómo se los pasan entre ellas**.

Su único fin es que veas lo que otros recolectan sobre ti. **Solo observa**: no bloquea ni cambia nada, no se conecta a internet y todo lo que anota queda guardado únicamente en tu computador.

## Instalar

El repositorio es la extensión tal cual: se carga directo desde una copia en tu computador, sin descomprimir nada.

### Con PowerShell (no hay que instalar nada)

Abre **PowerShell** desde el menú Inicio, pega esto y presiona Enter. Baja los archivos de la extensión uno por uno desde GitHub y los deja en la carpeta `Documentos\Huella`:

```powershell
$carpeta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Huella'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = 'Tls12'
$lista = Invoke-RestMethod 'https://api.github.com/repos/cmitjans/Huella/git/trees/main?recursive=1'
foreach ($a in $lista.tree) {
  if ($a.type -ne 'blob' -or $a.path -notmatch '^(manifest\.json|src/|ui/|iconos/)') { continue }
  $destino = Join-Path $carpeta $a.path
  New-Item -ItemType Directory -Force -Path (Split-Path $destino) | Out-Null
  Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/cmitjans/Huella/main/$($a.path)" -OutFile $destino
}
"Listo. Elige esta carpeta en Chrome: $carpeta"
```

Luego en Chrome abre `chrome://extensions`, activa **Modo de desarrollador**, toca **Cargar extensión sin empaquetar** y elige la carpeta que indica el mensaje final. Para **actualizar**, pega el mismo comando otra vez y toca el botón de recargar de Huella en `chrome://extensions`.

### Con GitHub Desktop

1. Copia el repositorio a tu computador. La forma más simple es con [GitHub Desktop](https://desktop.github.com): **File → Clone repository**, elige `cmitjans/Huella` y una carpeta fija (por ejemplo, Documentos). Si usas la terminal: `git clone https://github.com/cmitjans/Huella.git`.
2. En Chrome abre `chrome://extensions`, activa **Modo de desarrollador** (arriba a la derecha) y toca **Cargar extensión sin empaquetar**. Elige la carpeta `Huella` que se creó.
3. Toca el ícono de la pieza de rompecabezas en la barra de Chrome y fija Huella con el alfiler.

Para **actualizar**: en GitHub Desktop toca **Fetch origin** y luego **Pull origin** (o `git pull` en la terminal), y después el botón de recargar de Huella en `chrome://extensions`. Lo registrado se conserva mientras uses siempre la misma carpeta.

Chrome puede avisar al iniciar que tienes extensiones en modo de desarrollador: es normal para extensiones instaladas así.

## Cómo leerla

- **El número sobre el ícono**: cuántas empresas de rastreo recibieron datos tuyos en la página que estás viendo.
- **La ventana** (al tocar el ícono): esas empresas y qué recibió cada una. Las etiquetas amarillas son datos que te identifican.
- **El mapa** (botón "Ver el mapa completo"): al centro estás tú; en el primer anillo, los sitios que visitaste; en el segundo, las empresas que recibieron datos desde ellos. Las líneas rojas son empresas pasándose identificadores tuyos. Haz clic en cualquier punto para ver el detalle.

### Qué datos reconoce

| Dato | Qué significa |
| --- | --- |
| Datos personales | Correo, teléfono, nombre o ciudad, a veces "cifrados" con hash (la empresa igual puede compararlos con los suyos). |
| Cookie | Un identificador que la empresa guardó en tu navegador y le llega desde todos los sitios donde está presente. |
| Identificador | Un código de tu navegador, tu sesión o del clic que hiciste en un anuncio. |
| Huella digital | Técnicas que miden tu equipo (canvas, tarjeta gráfica, audio, fuentes) para reconocerte sin cookies. |
| Grabación | Servicios que graban tus movimientos, clics y lo que escribes. |
| Página, búsqueda, título, página anterior | Qué estás viendo y de dónde venías. |
| Acciones | Ver página, clics, agregar al carro, compras. |
| Equipo, ubicación | Pantalla, idioma, sistema; coordenadas o código postal. |

### Cómo detecta que se comparten datos

| En el mapa | Qué pasó en tu navegador |
| --- | --- |
| Le entregó tu identificador | En una subasta de anuncios viajó un identificador "universal" (ID5, LiveRamp, UID2…) a otra empresa. |
| Sincronizó identificadores | Una empresa hizo que tu navegador visitara a otra llevando su código para ti ("sincronización de cookies"). |
| Recibieron el mismo identificador | Dos empresas recibieron exactamente el mismo código tuyo. |
| Te redirigió / la llamó desde su espacio | Una petición pasó de una empresa a otra, o un anuncio de una cargó contenido de otra (línea punteada: prueba más débil). |

## Lo que no puede ver

Huella ve lo que sale de tu navegador, no lo que pasa después: si las empresas venden tus datos, los cruzan con otras bases o los envían de servidor a servidor, eso ocurre fuera de tu computador. Tampoco ve las apps del teléfono (para eso está [Rastreadores](https://github.com/cmitjans/Rastreadores)). La sección "Lo que no se ve" de la extensión explica esto y cómo pedirle tus datos a cada empresa.

## Privacidad de la propia extensión

| Permiso | Para qué |
| --- | --- |
| Leer las peticiones de las páginas (`webRequest` y acceso a los sitios) | Ver a quién le envía datos cada página y qué lleva. Solo observa; no puede bloquear ni modificar. |
| Almacenamiento | Guardar el registro en tu computador. |
| Cookies | Mostrarte qué cookies tiene guardadas una empresa, si lo pides. El valor nunca se muestra. |
| Script en las páginas | Detectar técnicas de huella digital. Deja pasar cada llamada sin cambios y solo anota cuál fue. |

- **No se conecta a internet**: su política de seguridad (`connect-src 'none'` en `manifest.json`) se lo prohíbe, y la prueba automática lo verifica.
- Los identificadores se guardan recortados (`8473… (19 caracteres)`). Para comparar identificadores entre empresas usa un resumen que no permite recuperarlos, y lo borra al cerrar Chrome.
- Lo registrado incluye qué sitios visitaste. Se borra solo después de 30 días (lo puedes cambiar en Ajustes) y puedes borrarlo todo cuando quieras.
- No funciona en pestañas de incógnito, salvo que lo actives en `chrome://extensions`.

## Pruebas

Las pruebas no usan datos de nadie ni salen a internet:

- `node --test pruebas/*.test.mjs` prueba el análisis con valores inventados.
- `npm install && npx playwright install chromium && node pruebas/e2e/prueba-local.mjs` abre un Chromium real con la extensión. Todos los dominios se redirigen a un servidor falso en tu propio computador, con valores como `PRUEBA9x8y7z6`. No se simulan correos ni teléfonos.

## De dónde sale la lista de empresas

De la lista pública de rastreadores de [DuckDuckGo](https://github.com/duckduckgo/tracker-blocklists) (licencia CC BY-NC-SA 4.0), más ajustes propios en `src/empresas.js`. Ver `src/datos/LEEME.md`. El análisis de dominios usa [tldts](https://github.com/remusao/tldts) (MIT).

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/fondo.js` | Observa las peticiones y anota qué recibió cada tercero. |
| `src/analisis.js` | Reconoce qué datos lleva cada petición (sin guardar nada). |
| `src/empresas.js` | A qué empresa pertenece cada dominio. |
| `src/registro.js` | Guarda el resumen en el almacenamiento local. |
| `src/pagina-huella.js`, `src/puente.js` | Detectan técnicas de huella digital en las páginas. |
| `ui/ventana.*` | La ventana del ícono. |
| `ui/mapa.*` | El mapa, las listas y los ajustes. |
