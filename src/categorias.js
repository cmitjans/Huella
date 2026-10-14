// Nombres y explicaciones que comparten la extensión y sus pantallas.

/** Qué tipo de empresa es. El color se usa en el mapa. */
export const TIPOS = {
  publicidad:      { nombre: 'Publicidad', color: '#d9822b', rastrea: true,
                     texto: 'Muestran anuncios y arman perfiles de tus intereses para elegir cuáles mostrarte.' },
  identidad:       { nombre: 'Identidad y perfiles', color: '#14866d', rastrea: true,
                     texto: 'Su negocio es reconocerte entre sitios y empresas: unen identificadores y venden o comparten perfiles de audiencia.' },
  grabacion:       { nombre: 'Grabación de sesión', color: '#b8336a', rastrea: true,
                     texto: 'Registran tus movimientos, clics y a veces lo que escribes, para poder reproducir tu visita.' },
  analitica:       { nombre: 'Análisis y medición', color: '#2f7bbf', rastrea: true,
                     texto: 'Miden qué páginas ves, cuánto tiempo te quedas y qué haces, para el sitio o para estudios de audiencia.' },
  redes:           { nombre: 'Redes sociales', color: '#7357c9', rastrea: true,
                     texto: 'Botones, inicios de sesión o contenido de redes sociales. Les avisan qué sitios visitas, aunque no hagas clic.' },
  rastreo:         { nombre: 'Rastreo (sin detalle)', color: '#a0522d', rastrea: true,
                     texto: 'La lista de DuckDuckGo la marca como rastreador, sin decir para qué.' },
  antifraude:      { nombre: 'Antifraude y bots', color: '#6b7a1f', rastrea: true,
                     texto: 'Verifican que seas una persona y no un robot. Para eso suelen medir tu equipo con técnicas de huella digital.' },
  atencion:        { nombre: 'Chat y marketing', color: '#3d8fa6', rastrea: true,
                     texto: 'Chats de ayuda, formularios y herramientas de marketing que siguen tu visita.' },
  riesgo:          { nombre: 'Riesgosa', color: '#c43b2e', rastrea: true,
                     texto: 'Marcada por comportamiento de alto riesgo o malicioso.' },
  pagos:           { nombre: 'Pagos', color: '#3d8c40', rastrea: false,
                     texto: 'Servicios de pago. Reciben datos de tu equipo para evitar fraudes.' },
  consentimiento:  { nombre: 'Aviso de cookies', color: '#8c93a3', rastrea: false,
                     texto: 'Muestran el aviso de cookies y guardan lo que elegiste.' },
  contenido:       { nombre: 'Contenido incrustado', color: '#a08c6a', rastrea: false,
                     texto: 'Videos, mapas u otro contenido de otra empresa dentro de la página.' },
  infraestructura: { nombre: 'Infraestructura', color: '#9aa0aa', rastrea: false,
                     texto: 'Servidores de archivos, fuentes tipográficas o redes de distribución. Ven tu IP y el sitio, pero su función no es rastrear.' },
  otros:           { nombre: 'Otros servicios', color: '#9aa0aa', rastrea: false,
                     texto: 'Empresa conocida que no aparece como rastreador en la lista.' },
  desconocida:     { nombre: 'Desconocida', color: '#6b7488', rastrea: false,
                     texto: 'No sabemos a quién pertenece este dominio.' },
};

/** Qué dato tuyo salió. El orden es el de importancia al mostrarlos. */
export const DATOS = {
  contacto: {
    nombre: 'Correo, teléfono u otros datos personales',
    corto: 'Datos personales',
    texto: 'A veces van "cifrados" con un hash. Aun así la empresa puede compararlos con los que ya tiene y saber exactamente quién eres.',
  },
  cookie: {
    nombre: 'Su cookie en tu navegador',
    corto: 'Cookie',
    texto: 'Un identificador que la empresa guardó en tu navegador. Le llega desde todos los sitios donde está presente, así puede unir lo que haces en cada uno.',
  },
  identificador: {
    nombre: 'Un identificador tuyo',
    corto: 'Identificador',
    texto: 'Un código que distingue a tu navegador, tu sesión o el clic que hiciste en un anuncio.',
  },
  huella: {
    nombre: 'Huella digital de tu equipo',
    corto: 'Huella digital',
    texto: 'Técnicas que dibujan o miden cosas invisibles en tu equipo para sacar un código casi único. Funcionan aunque borres las cookies.',
  },
  grabacion: {
    nombre: 'Grabación de tu visita',
    corto: 'Grabación',
    texto: 'Movimientos del mouse, clics, desplazamientos y a veces lo que escribes, para reproducir tu visita como un video.',
  },
  pagina: {
    nombre: 'La página exacta que estás viendo',
    corto: 'Página',
    texto: 'La dirección completa. Con eso saben qué lees, qué producto miras o qué buscaste en el sitio.',
  },
  busqueda: {
    nombre: 'Lo que buscaste',
    corto: 'Búsqueda',
    texto: 'Las palabras que escribiste en un buscador del sitio.',
  },
  acciones: {
    nombre: 'Lo que haces en la página',
    corto: 'Acciones',
    texto: 'Eventos como ver la página, hacer clic, agregar al carro, comprar o cuántas veces has vuelto.',
  },
  origen: {
    nombre: 'De dónde venías',
    corto: 'Página anterior',
    texto: 'La página que viste antes. Permite seguir tu recorrido de un sitio a otro.',
  },
  titulo: {
    nombre: 'El título de la página',
    corto: 'Título',
    texto: 'El título que aparece en la pestaña. Suele decir de qué se trata lo que lees.',
  },
  ubicacion: {
    nombre: 'Tu ubicación',
    corto: 'Ubicación',
    texto: 'Coordenadas, ciudad o código postal.',
  },
  dispositivo: {
    nombre: 'Datos de tu equipo',
    corto: 'Equipo',
    texto: 'Pantalla, idioma, zona horaria, sistema y navegador. Por separado son comunes; juntos ayudan a reconocerte.',
  },
};

export const ORDEN_DATOS = Object.keys(DATOS);

/** Cómo se pasan datos entre empresas. */
export const ENLACES = {
  'id-universal': {
    nombre: 'Le entregó tu identificador',
    texto: 'Un identificador "universal" de la primera empresa viajó a la segunda dentro de una subasta de anuncios. Sirve para que ambas sepan que eres la misma persona.',
  },
  sincronizacion: {
    nombre: 'Sincronizó identificadores',
    texto: 'La primera empresa hizo que tu navegador visitara a la segunda llevando un identificador. Así emparejan sus códigos para ti (se llama "sincronización de cookies").',
  },
  'mismo-id': {
    nombre: 'Recibieron el mismo identificador',
    texto: 'Ambas empresas recibieron exactamente el mismo código que te identifica, así que pueden cruzar lo que saben de ti.',
  },
  redireccion: {
    nombre: 'Te redirigió',
    texto: 'Una petición a la primera empresa terminó en la segunda, sin que se viera un identificador.',
  },
  llamada: {
    nombre: 'La llamó desde su espacio',
    texto: 'Dentro de un recuadro (por ejemplo un anuncio) de la primera empresa, se cargó contenido de la segunda, que recibe tu IP, tus cookies y el contexto.',
  },
};

/** Técnicas de huella digital que detecta el script de página. */
export const TECNICAS = {
  canvas:  { nombre: 'Dibujo invisible', texto: 'Dibujó una imagen oculta y la leyó: cada tarjeta gráfica la dibuja levemente distinta.' },
  webgl:   { nombre: 'Tarjeta gráfica', texto: 'Preguntó el modelo exacto de tu tarjeta gráfica.' },
  audio:   { nombre: 'Audio', texto: 'Procesó un sonido sin reproducirlo: el resultado varía según tu equipo.' },
  fuentes: { nombre: 'Fuentes instaladas', texto: 'Midió muchos textos para averiguar qué tipografías tienes instaladas.' },
  sistema: { nombre: 'Detalles del sistema', texto: 'Pidió la versión exacta de tu sistema, modelo y navegador.' },
  webrtc:  { nombre: 'Conexión directa (WebRTC)', texto: 'Abrió una conexión que puede revelar tu IP, incluso la de tu red local.' },
};

/** Lo que recibe cualquier servidor al que tu navegador le pide algo. */
export const SIEMPRE = [
  ['Tu dirección IP', 'Revela tu ubicación aproximada (ciudad) y tu compañía de internet.'],
  ['Tu navegador y sistema', 'Por ejemplo "Chrome en Windows".'],
  ['Tu idioma', 'El que tiene configurado el navegador.'],
  ['El sitio desde el que llega', 'Casi siempre saben en qué sitio estabas, aunque no vean la página exacta.'],
  ['La hora', 'Cuándo ocurrió cada visita.'],
];
