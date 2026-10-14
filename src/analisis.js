// Lee una petición que tu navegador envía a un tercero y reconoce qué datos tuyos lleva.
// Solo funciones puras: no guardan nada ni se conectan a nada, así se pueden probar aparte.

import { getDomain } from './vendor/tldts.js';

// ---------------------------------------------------------------- dominios

export function hostDe(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

/** El "sitio" de un host o URL: el dominio registrable (noticias.ejemplo.cl → ejemplo.cl). */
export function sitioDe(hostOUrl) {
  if (!hostOUrl) return '';
  const host = /[/:]/.test(hostOUrl) ? hostDe(hostOUrl) : String(hostOUrl).toLowerCase();
  if (!host) return '';
  return getDomain(host, { allowPrivateDomains: true }) || host;
}

export function esWeb(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// ---------------------------------------------------------------- valores

/** Divide un nombre de campo en palabras: 'udff[em]' → ['udff','em'], 'userId' → ['user','id']. */
export function palabras(nombre) {
  return String(nombre)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function compacto(nombre) {
  return String(nombre).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** ¿Este valor parece un código que identifica a alguien (y no una palabra, fecha o número chico)? */
export function pareceIdentificador(v) {
  if (typeof v !== 'string') return false;
  v = v.trim();
  if (v.length < 8 || v.length > 200) return false;
  if (/\s/.test(v)) return false;
  if (/^(https?:)?\/\//i.test(v)) return false;
  if (/^(true|false|null|undefined|none|nan|unknown)$/i.test(v)) return false;
  if (/^\d+x\d+$/i.test(v)) return false;                          // 1920x1080
  if (/^\d{1,3}(\.\d{1,5}){1,3}$/.test(v)) return false;           // versiones y decimales
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return false;                  // fechas
  if (/^\d{10}$|^\d{13}$/.test(v)) {                               // marcas de tiempo
    const s = Number(v.slice(0, 10));
    if (s > 946684800 && s < 4102444800) return false;
  }
  if (/^\d{1,8}$/.test(v)) return false;
  if (new Set(v).size < 6) return false;
  return /\d/.test(v) || (/[a-z]/.test(v) && /[A-Z]/.test(v) && v.length >= 16);
}

export function esHash(v) {
  return typeof v === 'string' && /^([a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})$/i.test(v.trim());
}

const CORREO = /^[^\s@"<>]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i;
export function esCorreo(v) {
  return typeof v === 'string' && CORREO.test(v.trim());
}

/** Huella corta de un valor para compararlo sin guardarlo (FNV-1a de 52 bits). */
export function resumen(v) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(36) + '.' + (h2 & 0xfffff).toString(36);
}

/** Partes de un valor que podrían ser identificadores: 'GA1.1.123456789.1690000000' → incluye '123456789.1690000000'. */
export function partesId(v) {
  const out = new Set();
  if (pareceIdentificador(v)) out.add(v);
  const trozos = v.split(/[|:;,]/);
  for (const t of trozos) if (t !== v && pareceIdentificador(t)) out.add(t);
  // Cookies de Google Analytics y similares: GA1.2.<id>.<fecha>
  const m = v.match(/^[A-Za-z]{2}\d\.\d\.(.+)$/);
  if (m && pareceIdentificador(m[1])) out.add(m[1]);
  return [...out];
}

// ---------------------------------------------------------------- qué muestra cada campo

/** Campos conocidos de los rastreadores más comunes: [categoría, explicación]. */
const CONOCIDOS = {
  // Google Analytics
  dl: ['pagina', 'Dirección de la página (Google Analytics)'],
  dh: ['pagina', 'Sitio de la página'],
  dp: ['pagina', 'Ruta de la página'],
  dr: ['origen', 'Página de la que venías'],
  dt: ['titulo', 'Título de la página'],
  cid: ['identificador', 'Identificador de tu navegador (Google Analytics)'],
  uid: ['identificador', 'Identificador de usuario que asignó el sitio'],
  sid: ['identificador', 'Identificador de tu visita'],
  sct: ['acciones', 'Cuántas veces has visitado el sitio'],
  seg: ['acciones', 'Si la visita fue activa'],
  en: ['acciones', 'Nombre del evento'],
  ea: ['acciones', 'Acción del evento'],
  ec: ['acciones', 'Categoría del evento'],
  el: ['acciones', 'Etiqueta del evento'],
  sr: ['dispositivo', 'Resolución de pantalla'],
  vp: ['dispositivo', 'Tamaño de la ventana'],
  sd: ['dispositivo', 'Colores de la pantalla'],
  ul: ['dispositivo', 'Idioma'],
  uaa: ['dispositivo', 'Arquitectura del procesador'],
  uab: ['dispositivo', 'Bits del sistema'],
  uafvl: ['dispositivo', 'Versión exacta del navegador'],
  uam: ['dispositivo', 'Modelo del equipo'],
  uamb: ['dispositivo', 'Si es un celular'],
  uap: ['dispositivo', 'Sistema operativo'],
  uapv: ['dispositivo', 'Versión del sistema'],
  uaw: ['dispositivo', 'Tipo de sistema'],
  // Meta (Facebook)
  ev: ['acciones', 'Evento (Meta)'],
  fbp: ['identificador', 'Identificador de Meta para tu navegador'],
  _fbp: ['identificador', 'Identificador de Meta para tu navegador'],
  fbc: ['identificador', 'Identificador de un clic tuyo en un anuncio de Meta'],
  rl: ['origen', 'Página de la que venías'],
  // Clics en anuncios
  gclid: ['identificador', 'Identificador de un clic tuyo en un anuncio de Google'],
  gbraid: ['identificador', 'Identificador de un clic tuyo en un anuncio de Google'],
  wbraid: ['identificador', 'Identificador de un clic tuyo en un anuncio de Google'],
  dclid: ['identificador', 'Identificador de un clic tuyo en un anuncio de Google'],
  fbclid: ['identificador', 'Identificador de un clic tuyo en un enlace de Facebook'],
  msclkid: ['identificador', 'Identificador de un clic tuyo en un anuncio de Microsoft'],
  ttclid: ['identificador', 'Identificador de un clic tuyo en un anuncio de TikTok'],
  twclid: ['identificador', 'Identificador de un clic tuyo en un anuncio de X'],
  li_fat_id: ['identificador', 'Identificador de un clic tuyo en un anuncio de LinkedIn'],
  epik: ['identificador', 'Identificador de un clic tuyo en un anuncio de Pinterest'],
};

/** Campos que no son datos tuyos (cuentas del sitio, avisos de consentimiento, subastas). */
const IGNORAR = new Set([
  'tid', 'id', 'v', 'z', '_', 'cb', 'rnd', 'random', 'ord', 'correlator', 'cachebuster', 'ts', 'timestamp', 't',
  'gdpr', 'gdprconsent', 'usprivacy', 'gpp', 'gppsid', 'addtlconsent', 'consent', 'tcf', 'tcstring', 'cmp', 'gcs', 'gcd',
  'auctionid', 'bidid', 'bidrequestid', 'transactionid', 'impid', 'requestid', 'reqid', 'adunitcode', 'nonce',
]);
const PALABRAS_SUBASTA = new Set(['auction', 'bid', 'bidder', 'imp', 'impression', 'request', 'transaction', 'slot', 'adunit', 'creative', 'placement']);

const P_CONTACTO = new Set(['em', 'email', 'mail', 'emails', 'hem', 'ph', 'phone', 'tel', 'telefono', 'mobile', 'msisdn',
  'fn', 'ln', 'firstname', 'lastname', 'ge', 'gender', 'db', 'dob', 'birthday', 'birthdate']);
const P_DATOS_USUARIO = new Set(['ud', 'udff', 'userdata', 'user_data']);
const P_UBICACION = new Set(['lat', 'lng', 'lon', 'latitude', 'longitude', 'geo', 'zip', 'zipcode', 'postal', 'postalcode', 'city']);
const P_BUSQUEDA = new Set(['q', 'query', 'search', 'searchterm', 'searchquery', 'keyword', 'keywords', 'kw', 'term']);
const P_ACCIONES = new Set(['event', 'events', 'eventname', 'evt', 'action', 'conversion', 'purchase', 'revenue', 'currency',
  'transaction', 'order', 'orderid', 'cart', 'product', 'products', 'items', 'contentids', 'contents', 'ep', 'epn', 'cd',
  'value', 'checkout', 'click', 'clicks', 'scroll', 'pageview']);
const P_DISPOSITIVO = new Set(['screen', 'resolution', 'viewport', 'sw', 'sh', 'vw', 'vh', 'dpr', 'pixelratio', 'colordepth',
  'lang', 'language', 'locale', 'tz', 'timezone', 'tzo', 'ua', 'useragent', 'platform', 'os', 'osv', 'browser', 'device',
  'devicetype', 'model', 'make', 'hw', 'cpu', 'memory', 'mem', 'connection', 'conn', 'battery', 'plugins', 'fonts',
  'orientation', 'res', 'touch']);
const P_ID = new Set(['cid', 'uid', 'userid', 'clientid', 'visitorid', 'deviceid', 'did', 'anonymousid', 'anonid', 'guid',
  'uuid', 'puid', 'buid', 'tuid', 'xuid', 'partneruid', 'externalid', 'extid', 'sessionid', 'ppid', 'gpid', 'idfa', 'adid',
  'gaid', 'aaid', 'ifa', 'rdid', 'euid', 'uid2', 'id5', 'pubcid', 'sharedid', 'criteoid', 'tdid', 'ttdid', 'buyeruid',
  'cookieid', 'vid', 'mid', 'fbp', 'fbc', 'gid', 'ga', 'userkey', 'memberid', 'customerid', 'profileid', 'ssid', 'pid1']);

/**
 * Clasifica un campo enviado. Devuelve { categoria, nota } o null si no dice nada de ti.
 * ctx: { sitioPagina, idConocido(valor) → bool }
 */
export function clasificarCampo(nombre, valor, ctx = {}) {
  if (valor == null) return null;
  valor = String(valor);
  if (!valor.trim()) return null;
  const c = compacto(nombre);
  const pal = palabras(nombre);
  const ultima = pal[pal.length - 1] || '';
  if (IGNORAR.has(c) || pal.some(p => PALABRAS_SUBASTA.has(p))) {
    // Excepción: un valor que ya vimos como identificador tuyo sí cuenta, se llame como se llame.
    if (ctx.idConocido && pareceIdentificador(valor) && ctx.idConocido(valor)) {
      return { categoria: 'identificador', nota: 'Un identificador tuyo que ya había usado otra empresa' };
    }
    return null;
  }

  if (CONOCIDOS[c] || CONOCIDOS[String(nombre).toLowerCase()]) {
    const [categoria, nota] = CONOCIDOS[String(nombre).toLowerCase()] || CONOCIDOS[c];
    return { categoria, nota };
  }

  // Datos personales: por el nombre del campo o porque el valor es un correo.
  if (esCorreo(valor)) return { categoria: 'contacto', nota: 'Correo electrónico sin cifrar' };
  if (pal.some(p => P_CONTACTO.has(p)) || pal.some(p => P_DATOS_USUARIO.has(p)) || /email|phone/.test(c)) {
    if (esHash(valor)) return { categoria: 'contacto', nota: 'Dato personal cifrado con hash (correo, teléfono, nombre…)' };
    const util = valor.trim().length >= 5 && !/^(true|false|null|undefined|\d)$/i.test(valor.trim());
    if (util && (pal.some(p => P_DATOS_USUARIO.has(p)) || /email|phone/.test(c) || ['em', 'ph', 'email', 'phone'].includes(ultima))) {
      return { categoria: 'contacto', nota: 'Dato personal' };
    }
  }

  // Direcciones web: la página actual o la anterior.
  const url = comoUrl(valor);
  if (url) {
    const sitio = sitioDe(url.hostname);
    const esRef = pal.some(p => ['ref', 'referrer', 'referer', 'rurl', 'prev', 'previous', 'from'].includes(p));
    if (esRef && sitio) return { categoria: 'origen', nota: 'Página de la que venías' };
    // Solo cuenta si es la dirección completa: el sitio a secas casi siempre lo saben igual.
    if (ctx.sitioPagina && sitio === ctx.sitioPagina && (url.pathname.length > 1 || url.search)) {
      return { categoria: 'pagina', nota: 'Dirección de la página' };
    }
    return null;
  }

  if (pal.some(p => P_UBICACION.has(p))) return { categoria: 'ubicacion', nota: 'Ubicación' };
  if (['title', 'pagetitle', 'tl'].includes(c) || ultima === 'title') return { categoria: 'titulo', nota: 'Título de la página' };
  if (pal.some(p => P_BUSQUEDA.has(p)) && valor.length <= 200) return { categoria: 'busqueda', nota: 'Texto buscado' };

  // Identificadores: por nombre, o porque el valor ya lo vimos como identificador tuyo.
  const nombreDeId = P_ID.has(c) || pal.some(p => P_ID.has(p)) || ((ultima === 'id' || /[a-z]id$/.test(c)) && pal.length > 1);
  if (pareceIdentificador(valor)) {
    if (ctx.idConocido && ctx.idConocido(valor)) return { categoria: 'identificador', nota: 'Un identificador tuyo que ya había usado otra empresa' };
    if (nombreDeId) return { categoria: 'identificador', nota: 'Identificador' };
  }

  if (pal.some(p => P_ACCIONES.has(p))) return { categoria: 'acciones', nota: 'Detalle de lo que hiciste' };
  if (pal.some(p => P_DISPOSITIVO.has(p))) return { categoria: 'dispositivo', nota: 'Dato de tu equipo' };
  return null;
}

function comoUrl(v) {
  const s = v.trim();
  if (!/^(https?:)?\/\/[^/\s]+/i.test(s)) return null;
  try { return new URL(s.startsWith('//') ? 'https:' + s : s); } catch { return null; }
}

/** Texto que se muestra para un valor enviado, sin exponer más de lo necesario. */
export function mostrar(valor, categoria) {
  const v = String(valor).trim();
  switch (categoria) {
    case 'pagina':
    case 'origen': {
      const u = comoUrl(v);
      if (!u) return recortar(v, 90);
      return recortar(u.hostname + u.pathname, 90) + (u.search ? ' (con parámetros)' : '');
    }
    case 'cookie':
    case 'identificador':
      return v.length <= 6 ? v : `${v.slice(0, 4)}… (${v.length} caracteres)`;
    case 'contacto':
      if (esHash(v)) return `código de ${v.length} caracteres`;
      if (esCorreo(v)) return v[0] + '•••@' + v.split('@')[1];
      return '•••';
    default:
      return recortar(v, 60);
  }
}

function recortar(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------- campos de una petición

/** Lista plana de [nombre, valor] de un objeto JSON: {user:{ext:{eids:[…]}}} → 'user.ext.eids.0.source'. */
export function aplanar(obj, prefijo = '', out = [], profundidad = 0) {
  if (out.length > 600 || profundidad > 8) return out;
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object') { out.push([prefijo, String(obj)]); return out; }
  if (Array.isArray(obj)) {
    obj.slice(0, 50).forEach((v, i) => aplanar(v, prefijo ? `${prefijo}.${i}` : String(i), out, profundidad + 1));
    return out;
  }
  for (const [k, v] of Object.entries(obj)) aplanar(v, prefijo ? `${prefijo}.${k}` : k, out, profundidad + 1);
  return out;
}

function camposDeTexto(texto, out) {
  const t = texto.trim();
  if (!t) return;
  if (t[0] === '{' || t[0] === '[') {
    try { aplanar(JSON.parse(t), '', out); return; } catch { /* no es JSON */ }
  }
  // Formato de formulario; algunos (Google Analytics 4) envían varios eventos, uno por línea.
  if (/^[^\s=&]+=/.test(t)) {
    for (const linea of t.split('\n').slice(0, 50)) {
      for (const [k, v] of new URLSearchParams(linea)) out.push([k, v]);
    }
  }
}

/** Todos los campos que lleva una petición: parámetros de la URL y cuerpo. Los valores JSON se abren. */
export function camposDe(url, cuerpo) {
  const out = [];
  try {
    for (const [k, v] of new URL(url).searchParams) out.push([k, v]);
  } catch { /* URL rara */ }
  if (cuerpo) {
    if (cuerpo.formData) {
      for (const [k, vs] of Object.entries(cuerpo.formData)) for (const v of [].concat(vs)) out.push([k, v]);
    } else if (typeof cuerpo.texto === 'string') {
      camposDeTexto(cuerpo.texto.slice(0, 65536), out);
    }
  }
  // Valores que a su vez son JSON (por ejemplo data={"…"}): se abren con el nombre como prefijo.
  const extra = [];
  for (const [k, v] of out) {
    const s = String(v).trim();
    if (s.length > 2 && s.length < 20000 && (s[0] === '{' || s[0] === '[')) {
      try { aplanar(JSON.parse(s), k, extra); } catch { /* texto normal */ }
    }
  }
  return out.concat(extra).slice(0, 800);
}

export function leerCookies(cabecera) {
  const out = [];
  for (const parte of String(cabecera || '').split(';')) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    out.push([parte.slice(0, i).trim(), parte.slice(i + 1).trim()]);
  }
  return out;
}

/** Días que dura una cookie según su cabecera Set-Cookie (0 = solo mientras el navegador está abierto). */
export function duracionCookie(setCookie, ahora = Date.now()) {
  const maxAge = /;\s*max-age=(-?\d+)/i.exec(setCookie);
  if (maxAge) return Math.max(0, Math.round(Number(maxAge[1]) / 86400));
  const exp = /;\s*expires=([^;]+)/i.exec(setCookie);
  if (exp) {
    const t = Date.parse(exp[1]);
    if (!Number.isNaN(t)) return Math.max(0, Math.round((t - ahora) / 86400000));
  }
  return 0;
}

const PISTAS_CLIENTE = {
  'sec-ch-ua-full-version-list': 'Versión exacta del navegador',
  'sec-ch-ua-platform-version': 'Versión del sistema',
  'sec-ch-ua-model': 'Modelo del equipo',
  'sec-ch-ua-arch': 'Arquitectura del procesador',
  'sec-ch-ua-bitness': 'Bits del sistema',
};

/**
 * Analiza una petición a un tercero.
 * p: { url, cabeceras: [{name, value}], cuerpo: {formData}|{texto}, sitioPagina }
 * ctx: { idConocido(valor) → bool }
 * Devuelve { datos: {categoria: [{campo, valor, nota}]}, ids: [valores], cookies: [nombres], eids: [dominios] }
 */
export function analizarPeticion(p, ctx = {}) {
  const datos = {};
  const ids = new Set();
  const cookies = [];
  const eids = new Set();
  const agregar = (categoria, campo, valor, nota) => {
    const lista = datos[categoria] || (datos[categoria] = []);
    if (lista.length < 6 && !lista.some(x => x.campo === campo)) lista.push({ campo, valor: mostrar(valor, categoria), nota });
  };
  const contexto = { sitioPagina: p.sitioPagina, idConocido: ctx.idConocido };

  for (const [nombre, valor] of camposDe(p.url, p.cuerpo)) {
    const pal = palabras(nombre);
    // Identificadores "universales" en subastas de anuncios (OpenRTB): user.ext.eids[].source
    if (pal.includes('eids') && pal[pal.length - 1] === 'source' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(valor)) {
      eids.add(sitioDe(valor));
      continue;
    }
    if (pal.includes('eids') && (pal[pal.length - 1] === 'id' || pal.includes('uids')) && pareceIdentificador(valor)) {
      agregar('identificador', nombre, valor, 'Identificador universal entregado en una subasta de anuncios');
      ids.add(valor);
      continue;
    }
    const r = clasificarCampo(nombre, valor, contexto);
    if (!r) continue;
    agregar(r.categoria, nombre, valor, r.nota);
    if (r.categoria === 'identificador') for (const x of partesId(valor)) ids.add(x);
  }

  for (const { name, value } of p.cabeceras || []) {
    const n = name.toLowerCase();
    if (n === 'cookie') {
      for (const [nombre, valor] of leerCookies(value)) {
        if (COOKIES_CONSENTIMIENTO.test(nombre)) continue;
        const partes = idsDeCookie(decodificar(valor));
        if (!partes.length) continue;
        cookies.push(nombre);
        agregar('cookie', nombre, valor, 'Cookie con un identificador');
        for (const x of partes) ids.add(x);
      }
    } else if (n === 'referer' && value) {
      const u = comoUrl(value);
      if (u && sitioDe(u.hostname) === p.sitioPagina && (u.pathname.length > 1 || u.search)) {
        agregar('pagina', 'Referer', value, 'Dirección de la página (cabecera Referer)');
      }
    } else if (PISTAS_CLIENTE[n]) {
      agregar('dispositivo', name, value, PISTAS_CLIENTE[n]);
    }
  }

  return { datos, ids: [...ids], cookies, eids: [...eids] };
}

const COOKIES_CONSENTIMIENTO = /consent|gdpr|usprivacy|optanon|cookieyes|cookielaw|didomi|euconsent|_cmp|cmpc/i;

/** Identificadores dentro del valor de una cookie. Si la cookie guarda varios campos (a=1&b=2), solo los que terminan en "id". */
export function idsDeCookie(valor) {
  const sinRelleno = valor.replace(/=+$/, '');
  if (!/=/.test(sinRelleno)) return partesId(valor);
  const out = [];
  for (const [k, v] of new URLSearchParams(valor.replace(/[|;,]/g, '&'))) {
    if (/id$/i.test(k) && pareceIdentificador(v)) out.push(v);
  }
  return out;
}

function decodificar(v) {
  try { return decodeURIComponent(v); } catch { return v; }
}

/** ¿La URL lleva algún valor con forma de identificador? (para distinguir sincronización de cookies). */
export function llevaIdentificador(url, idConocido) {
  for (const [nombre, valor] of camposDe(url)) {
    if (!pareceIdentificador(valor)) continue;
    if (idConocido && idConocido(valor)) return true;
    const pal = palabras(nombre);
    if (P_ID.has(compacto(nombre)) || pal.some(p => P_ID.has(p) || p === 'id' || p.endsWith('uid') || p.endsWith('id'))) return true;
  }
  return false;
}
