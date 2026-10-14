// Servicio de fondo de Huella.
// Solo OBSERVA las peticiones que hacen las páginas (no bloquea ni cambia nada) y anota, para cada
// tercero, qué datos tuyos recibió y desde qué sitio. La extensión no se conecta a internet:
// su política de seguridad (manifest.json) le prohíbe abrir conexiones.

import { analizarPeticion, sitioDe, hostDe, esWeb, resumen, llevaIdentificador, duracionCookie, idsDeCookie, leerCookies } from './analisis.js';
import { empresaDe, elegirScript } from './empresas.js';
import { TIPOS, OBSERVA, CAMPOS, DATOS, TECNICAS } from './categorias.js';
import * as registro from './registro.js';

const FILTRO = { urls: ['http://*/*', 'https://*/*'] };

// ------------------------------------------------------------ estado en memoria

/** Por pestaña: la página abierta y a quién le ha enviado datos. Se guarda en chrome.storage.session para la ventana emergente. */
const pestanas = new Map();
/** Peticiones en curso: el cuerpo llega antes que las cabeceras. */
const pendientes = new Map();
/** Sitios por los que pasó una petición redirigida (para no contar dos veces una sincronización). */
const cadenas = new Map();
/** Identificadores ya vistos (solo su resumen, nunca el valor) → quién los recibió primero. */
const duenos = new Map();
const MAX_DUENOS = 20000;
let duenosSucios = false;
const pestanasSucias = new Set();
let temporizadorSesion = null;

const listo = Promise.all([
  registro.cargar(),
  chrome.storage.session.get('duenos').then(r => {
    for (const [h, quien, s] of r.duenos || []) duenos.set(h, { quien, s });
  }).catch(() => {}),
]);

// ------------------------------------------------------------ pestañas

function nuevaPestana(tabId, url) {
  const p = { url, sitio: sitioDe(url), inicio: Date.now(), terc: {}, propia: {}, vistos: {}, ult: [] };
  pestanas.set(tabId, p);
  marcarPestana(tabId);
  return p;
}

async function paginaDe(tabId, iniciador) {
  if (tabId >= 0) {
    const p = pestanas.get(tabId);
    if (p) return p;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!esWeb(tab.url)) return null;
      if (pestanas.has(tabId)) return pestanas.get(tabId);
      // Chrome apaga el servicio de fondo cuando está inactivo; al volver se recupera lo anotado en la pestaña.
      const guardada = (await chrome.storage.session.get('tab:' + tabId).catch(() => ({})))['tab:' + tabId];
      if (pestanas.has(tabId)) return pestanas.get(tabId);
      if (guardada && guardada.sitio === sitioDe(tab.url)) {
        const q = { vistos: {}, ult: [], propia: {}, terc: {}, ...guardada };
        pestanas.set(tabId, q);
        return q;
      }
      return nuevaPestana(tabId, tab.url);
    } catch { /* la pestaña ya no existe */ }
  }
  // Sin pestaña (por ejemplo, el service worker de un sitio): se usa el sitio que hizo la petición.
  if (esWeb(iniciador)) return { url: iniciador, sitio: sitioDe(iniciador), sinPestana: true, terc: {}, propia: {}, vistos: {}, ult: [] };
  return null;
}

/**
 * Anota en la pestaña lo que recibió u observó un tercero.
 * extra: { bytes, tiempoMs, scrollPct, obs: 'mouse'|'lectura:correo'…, evento: texto para el registro en vivo }
 */
function anotarEnPestana(pag, tabId, tercero, empresa, categorias, extra = {}) {
  if (pag.sinPestana) return;
  const ahora = Date.now();
  const t = pag.terc[tercero] || (pag.terc[tercero] = {
    n: 0, d: {}, empresa: empresa ? empresa.nombre : '', tipo: empresa ? empresa.categoria : 'desconocida',
    bytes: 0, tiempoMs: 0, scroll: 0, obs: {}, primero: ahora, ultimo: ahora,
  });
  if (!extra.obs && !extra.observacion) { t.n++; t.ultimo = ahora; }
  for (const c of categorias) t.d[c] = (t.d[c] || 0) + 1;
  t.bytes = (t.bytes || 0) + (extra.bytes || 0);
  t.tiempoMs = (t.tiempoMs || 0) + (extra.tiempoMs || 0);
  if (extra.scrollPct) t.scroll = Math.max(t.scroll || 0, extra.scrollPct);
  if (extra.obs) { t.obs = t.obs || {}; t.obs[extra.obs] = (t.obs[extra.obs] || 0) + 1; }
  if (extra.evento) {
    pag.ult = pag.ult || [];
    pag.ult.unshift({ t: ahora, s: tercero, e: t.empresa || tercero, q: extra.evento, fuerte: !!extra.fuerte });
    if (pag.ult.length > 30) pag.ult.length = 30;
  }
  marcarPestana(tabId);
}

/** Texto corto para el registro en vivo: qué recibió una empresa en un envío. */
function describirEnvio(datos, bytes) {
  const orden = ['escritura', 'contacto', 'grabacion', 'huella', 'cookie', 'identificador', 'atencion', 'pagina', 'busqueda', 'acciones', 'origen', 'titulo', 'ubicacion', 'dispositivo'];
  const que = orden.filter(c => datos[c]).map(c => DATOS[c].corto.toLowerCase());
  const peso = bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} bytes`;
  return que.length ? `recibió ${que.slice(0, 3).join(', ')} (${peso})` : `recibió una petición (${peso})`;
}

function marcarPestana(tabId) {
  pestanasSucias.add(tabId);
  if (!temporizadorSesion) temporizadorSesion = setTimeout(guardarSesion, 700);
}

/** Cuántas empresas que rastrean recibieron datos en esta pestaña (para el número sobre el ícono). */
export function contarEmpresas(pag) {
  const nombres = new Set();
  for (const [tercero, t] of Object.entries(pag.terc)) {
    const rastrea = TIPOS[t.tipo]?.rastrea || t.d.cookie || t.d.identificador || t.d.contacto || t.d.huella;
    if (rastrea) nombres.add(t.empresa || tercero);
  }
  return nombres.size;
}

async function guardarSesion() {
  temporizadorSesion = null;
  const cambios = {};
  for (const tabId of pestanasSucias) {
    const p = pestanas.get(tabId);
    if (!p) continue;
    cambios['tab:' + tabId] = p;
    const n = contarEmpresas(p);
    chrome.action.setBadgeText({ tabId, text: n ? String(n) : '' }).catch(() => {});
  }
  pestanasSucias.clear();
  if (duenosSucios) {
    duenosSucios = false;
    cambios.duenos = [...duenos].map(([h, d]) => [h, d.quien, d.s]);
  }
  try { await chrome.storage.session.set(cambios); } catch { /* la sesión puede estar llena; no es grave */ }
}

chrome.tabs.onRemoved.addListener(tabId => {
  pestanas.delete(tabId);
  chrome.storage.session.remove('tab:' + tabId).catch(() => {});
});

// Páginas que cambian de dirección sin recargar (aplicaciones web): se actualiza la URL.
chrome.tabs.onUpdated.addListener((tabId, cambio) => {
  if (!cambio.url || !esWeb(cambio.url)) return;
  const p = pestanas.get(tabId);
  if (p && sitioDe(cambio.url) === p.sitio) { p.url = cambio.url; marcarPestana(tabId); }
  else if (p) nuevaPestana(tabId, cambio.url);
});

// ------------------------------------------------------------ identificadores compartidos

function idConocido(valor) {
  return duenos.has(resumen(valor));
}

/** Anota quién recibió cada identificador. Si otro ya lo había recibido, es un dato compartido entre ambos. */
function seguirIds(ids, tercero, quien, sitioPagina, campoEjemplo, excluir) {
  for (const id of ids) {
    const h = resumen(id);
    const antes = duenos.get(h);
    if (!antes) {
      duenos.set(h, { quien, s: tercero });
      duenosSucios = true;
      if (duenos.size > MAX_DUENOS) duenos.delete(duenos.keys().next().value);
    } else if (antes.quien !== quien && antes.s !== tercero && !excluir?.has(antes.s)) {
      registro.enlace(antes.s, tercero, 'mismo-id', sitioPagina, campoEjemplo);
    }
  }
}

// ------------------------------------------------------------ peticiones

function cuerpoDe(requestBody) {
  if (!requestBody) return null;
  if (requestBody.formData) return { formData: requestBody.formData };
  if (!requestBody.raw) return null;
  const partes = [];
  let total = 0;
  for (const r of requestBody.raw) {
    if (!r.bytes) continue;
    const b = new Uint8Array(r.bytes);
    partes.push(b.subarray(0, Math.max(0, 65536 - total)));
    total += b.length;
    if (total >= 65536) break;
  }
  if (!partes.length) return null;
  const texto = new TextDecoder('utf-8', { fatal: false }).decode(partes.length === 1 ? partes[0] : concatenar(partes));
  // Contenido binario o comprimido: no se puede leer.
  if ((texto.match(/�/g) || []).length > 8) return null;
  return { texto };
}

function concatenar(partes) {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
}

chrome.webRequest.onBeforeRequest.addListener(det => {
  if (registro.leerAjustes().pausa) return;
  if (det.type === 'main_frame') {
    if (det.tabId >= 0) {
      nuevaPestana(det.tabId, det.url);
      listo.then(() => registro.visita(sitioDe(det.url)));
    }
    return;
  }
  if (pendientes.size > 3000) pendientes.delete(pendientes.keys().next().value);
  let tam = det.url.length;
  for (const r of det.requestBody?.raw || []) tam += r.bytes ? r.bytes.byteLength : 0;
  if (det.requestBody?.formData) tam += JSON.stringify(det.requestBody.formData).length;
  pendientes.set(det.requestId, {
    url: det.url,
    tam,
    cuerpo: cuerpoDe(det.requestBody),
    pagina: paginaDe(det.tabId, det.initiator),
  });
}, FILTRO, ['requestBody']);

chrome.webRequest.onSendHeaders.addListener(async det => {
  const pend = pendientes.get(det.requestId);
  if (!pend || pend.url !== det.url) return;
  await listo;
  const pag = await pend.pagina;
  if (!pag || !pag.sitio) return;

  const host = hostDe(det.url);
  const tercero = sitioDe(host);
  let ruta = '';
  try { ruta = new URL(det.url).pathname; } catch { /* nada */ }
  const empresa = empresaDe(host, ruta);
  const disfrazado = !!empresa?.disfrazado;
  if (tercero === pag.sitio && !disfrazado) return;            // el propio sitio
  // Un rastreador disfrazado se anota con el nombre real de su dueño.
  const clave = disfrazado ? sitioDe(empresa.dominio) : tercero;

  const r = analizarPeticion({ url: det.url, cabeceras: det.requestHeaders, cuerpo: pend.cuerpo, sitioPagina: pag.sitio }, { idConocido });
  if (empresa?.categoria === 'grabacion') {
    r.datos.grabacion = [{ campo: host, valor: host, nota: 'Servicio de grabación de sesión' }];
  }
  registro.envio({
    sitioPagina: pag.sitio, tercero: clave, host, datos: r.datos, cookies: r.cookies, disfrazado,
    bytes: pend.tam, tiempoMs: r.tiempoMs, scrollPct: r.scrollPct,
  });
  const rastrea = TIPOS[empresa?.categoria]?.rastrea || ['cookie', 'identificador', 'contacto', 'grabacion'].some(c => r.datos[c]);
  anotarEnPestana(pag, det.tabId, clave, empresa, Object.keys(r.datos), {
    bytes: pend.tam, tiempoMs: r.tiempoMs, scrollPct: r.scrollPct,
    evento: rastrea ? describirEnvio(r.datos, pend.tam) : '',
  });

  const quien = empresa ? empresa.nombre : clave;
  seguirIds(r.ids, clave, quien, pag.sitio, det.url, cadenas.get(det.requestId));
  for (const fuente of r.eids) {
    if (fuente && fuente !== clave) registro.enlace(fuente, clave, 'id-universal', pag.sitio, `Identificador de ${fuente}`);
  }
  // Dentro del recuadro de un tercero (un anuncio, por ejemplo), ese tercero llamó a otro.
  if (det.frameId !== 0 && esWeb(det.initiator)) {
    const desde = sitioDe(det.initiator);
    if (desde !== pag.sitio && desde !== clave) registro.enlace(desde, clave, 'llamada', pag.sitio, det.url);
  }
}, FILTRO, ['requestHeaders', 'extraHeaders']);

chrome.webRequest.onBeforeRedirect.addListener(async det => {
  const pend = pendientes.get(det.requestId);
  if (!pend) return;
  await listo;
  const pag = await pend.pagina;
  if (!pag) return;
  const a = sitioDe(det.url);
  const b = sitioDe(det.redirectUrl);
  if (!esWeb(det.redirectUrl) || a === b || a === pag.sitio || b === pag.sitio) return;
  const cadena = cadenas.get(det.requestId) || new Set();
  cadena.add(a);
  cadenas.set(det.requestId, cadena);
  if (cadenas.size > 500) cadenas.delete(cadenas.keys().next().value);
  const tipo = llevaIdentificador(det.redirectUrl, idConocido) ? 'sincronizacion' : 'redireccion';
  registro.enlace(a, b, tipo, pag.sitio, det.redirectUrl);
}, FILTRO);

chrome.webRequest.onHeadersReceived.addListener(async det => {
  const pend = pendientes.get(det.requestId);
  if (!pend) return;
  const cookies = (det.responseHeaders || []).filter(h => h.name.toLowerCase() === 'set-cookie');
  if (!cookies.length) return;
  await listo;
  const pag = await pend.pagina;
  if (!pag) return;
  const host = hostDe(det.url);
  const empresa = empresaDe(host);
  const tercero = empresa?.disfrazado ? sitioDe(empresa.dominio) : sitioDe(host);
  if (tercero === pag.sitio) return;
  for (const h of cookies) {
    for (const linea of String(h.value).split('\n')) {
      const [nombre, valor] = leerCookies(linea.split(';')[0])[0] || [];
      if (!nombre) continue;
      const ids = idsDeCookie(valor || '');
      if (!ids.length) continue;
      registro.cookieGuardada(tercero, nombre, duracionCookie(linea));
      seguirIds(ids, tercero, empresa ? empresa.nombre : tercero, pag.sitio, '');
    }
  }
}, FILTRO, ['responseHeaders', 'extraHeaders']);

const terminar = det => { pendientes.delete(det.requestId); cadenas.delete(det.requestId); };
chrome.webRequest.onCompleted.addListener(terminar, FILTRO);
chrome.webRequest.onErrorOccurred.addListener(terminar, FILTRO);

// ------------------------------------------------------------ mensajes


chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (msg?.tipo === 'huella') {
    if (!sender.tab || registro.leerAjustes().pausa) return;
    (async () => {
      await listo;
      const pag = await paginaDe(sender.tab.id, sender.tab.url);
      if (!pag) return;
      const scripts = (Array.isArray(msg.scripts) ? msg.scripts : [msg.script]).map(x => String(x || '').slice(0, 500)).slice(0, 8);
      const elegido = elegirScript(scripts, pag.sitio);
      const script = elegido ? elegido.url : pag.url;
      const empresa = elegido?.empresa || null;
      let sitioScript = elegido ? elegido.sitio : pag.sitio;
      if (empresa?.disfrazado) sitioScript = sitioDe(empresa.dominio);
      const tecnica = String(msg.tecnica || '');
      const extra = String(msg.extra || '');

      if (tecnica === 'escucha' || tecnica === 'lectura') {
        // Que el propio sitio escuche o lea sus formularios es normal: solo cuentan los terceros.
        if (sitioScript === pag.sitio) return;
        if (tecnica === 'escucha' && !OBSERVA[extra]) return;
        if (tecnica === 'lectura' && !CAMPOS[extra]) return;
        const que = tecnica === 'lectura' ? 'lectura:' + extra : extra;
        pag.vistos = pag.vistos || {};
        if (pag.vistos[sitioScript + '|' + que]) return;   // una vez por página
        pag.vistos[sitioScript + '|' + que] = 1;
        registro.observa(pag.sitio, sitioScript, que, script);
        const evento = tecnica === 'lectura'
          ? `leyó lo que escribiste en ${CAMPOS[extra]}`
          : `escucha: ${OBSERVA[extra].nombre.toLowerCase()}`;
        anotarEnPestana(pag, sender.tab.id, sitioScript, empresa, [tecnica === 'lectura' ? 'escritura' : 'comportamiento'],
          { obs: que, evento, fuerte: tecnica === 'lectura' || extra === 'teclas' });
        return;
      }

      registro.huella(pag.sitio, sitioScript, tecnica, script);
      if (sitioScript === pag.sitio) {
        pag.propia[tecnica] = (pag.propia[tecnica] || 0) + 1;
        marcarPestana(sender.tab.id);
      } else {
        anotarEnPestana(pag, sender.tab.id, sitioScript, empresa, ['huella'], { evento: `midió tu equipo (${(TECNICAS[tecnica]?.nombre || tecnica).toLowerCase()}) para sacar su huella digital`, observacion: true, fuerte: true });
      }
    })();
    return;
  }
  // Solo las pantallas de la propia extensión pueden pedir esto.
  if (sender.id !== chrome.runtime.id || sender.tab?.url?.startsWith('http')) return;
  if (msg?.tipo === 'borrar') {
    duenos.clear();
    duenosSucios = true;
    registro.borrarTodo().then(() => responder({ ok: true }));
    return true;
  }
  if (msg?.tipo === 'ajustes') {
    registro.cambiarAjustes(msg.ajustes || {});
    chrome.storage.local.set({ ajustes: registro.leerAjustes() }).then(() => {
      if (msg.ajustes && 'dias' in msg.ajustes) registro.podar();
      return registro.guardar();
    }).then(() => responder({ ok: true }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.action.setBadgeBackgroundColor({ color: '#18213d' }).catch(() => {});
  if (reason === 'install') chrome.tabs.create({ url: 'ui/mapa.html#bienvenida' });
});
