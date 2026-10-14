// Servicio de fondo de Huella.
// Solo OBSERVA las peticiones que hacen las páginas (no bloquea ni cambia nada) y anota, para cada
// tercero, qué datos tuyos recibió y desde qué sitio. La extensión no se conecta a internet:
// su política de seguridad (manifest.json) le prohíbe abrir conexiones.

import { analizarPeticion, sitioDe, hostDe, esWeb, resumen, llevaIdentificador, duracionCookie, idsDeCookie, leerCookies } from './analisis.js';
import { empresaDe } from './empresas.js';
import { TIPOS } from './categorias.js';
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
  const p = { url, sitio: sitioDe(url), inicio: Date.now(), terc: {}, propia: {} };
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
      if (esWeb(tab.url)) return pestanas.get(tabId) || nuevaPestana(tabId, tab.url);
    } catch { /* la pestaña ya no existe */ }
  }
  // Sin pestaña (por ejemplo, el service worker de un sitio): se usa el sitio que hizo la petición.
  if (esWeb(iniciador)) return { url: iniciador, sitio: sitioDe(iniciador), sinPestana: true, terc: {}, propia: {} };
  return null;
}

function anotarEnPestana(pag, tabId, tercero, empresa, categorias) {
  if (pag.sinPestana) return;
  const t = pag.terc[tercero] || (pag.terc[tercero] = {
    n: 0, d: {}, empresa: empresa ? empresa.nombre : '', tipo: empresa ? empresa.categoria : 'desconocida',
  });
  t.n++;
  for (const c of categorias) t.d[c] = (t.d[c] || 0) + 1;
  marcarPestana(tabId);
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
  pendientes.set(det.requestId, {
    url: det.url,
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
  registro.envio({ sitioPagina: pag.sitio, tercero: clave, host, datos: r.datos, cookies: r.cookies, disfrazado });
  anotarEnPestana(pag, det.tabId, clave, empresa, Object.keys(r.datos));

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
      const script = String(msg.script || '').slice(0, 500);
      const sitioScript = esWeb(script) ? sitioDe(script) : pag.sitio;
      const tecnica = String(msg.tecnica || '').slice(0, 20);
      registro.huella(pag.sitio, sitioScript, tecnica, script);
      if (sitioScript === pag.sitio) {
        pag.propia[tecnica] = (pag.propia[tecnica] || 0) + 1;
        marcarPestana(sender.tab.id);
      } else {
        anotarEnPestana(pag, sender.tab.id, sitioScript, empresaDe(hostDe(script)), ['huella']);
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
