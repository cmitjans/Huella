// A qué empresa pertenece cada dominio y qué hace.
// Base: lista de DuckDuckGo (src/datos/rastreadores.js). Encima, ajustes propios para que los
// nombres y categorías se entiendan mejor y para cubrir empresas que esa lista no tiene.

import ddg from './datos/rastreadores.js';
import { TIPOS } from './categorias.js';
import { sitioDe, hostDe, esWeb } from './analisis.js';

/** Nombres más reconocibles para algunas empresas de la lista de DuckDuckGo. */
const RENOMBRAR = {
  'Facebook': 'Meta',
  'Twitter': 'X (Twitter)',
  'Amazon.com': 'Amazon',
  'Salesforce.com': 'Salesforce',
  'Verizon Media': 'Yahoo',
  'ByteDance': 'TikTok (ByteDance)',
  'SEEDTAG ADVERTISING': 'Seedtag',
  'International Business Machines': 'IBM',
  'Teads ( Luxenbourg ) SA': 'Teads',
};

/** Categoría corregida para dominios que la lista no clasifica bien. Gana la coincidencia más específica. */
const CATEGORIA = {
  // Google
  'doubleclick.net': 'publicidad', 'googlesyndication.com': 'publicidad', 'googleadservices.com': 'publicidad',
  'googletagservices.com': 'publicidad', '2mdn.net': 'publicidad', 'google.com': 'publicidad',
  'google-analytics.com': 'analitica', 'googletagmanager.com': 'analitica', 'app-measurement.com': 'analitica',
  'analytics.google.com': 'analitica',
  'youtube.com': 'contenido', 'youtube-nocookie.com': 'contenido', 'ytimg.com': 'contenido', 'googlevideo.com': 'contenido',
  'maps.googleapis.com': 'contenido',
  'gstatic.com': 'infraestructura', 'googleapis.com': 'infraestructura', 'googleusercontent.com': 'infraestructura',
  'recaptcha.net': 'antifraude',
  // Meta
  'facebook.net': 'publicidad', 'facebook.com': 'publicidad', 'instagram.com': 'redes',
  'fbcdn.net': 'infraestructura', 'cdninstagram.com': 'infraestructura',
  // Microsoft
  'clarity.ms': 'grabacion', 'bing.com': 'publicidad', 'adnxs.com': 'publicidad', 'adnxs-simple.com': 'publicidad',
  'linkedin.com': 'publicidad', 'licdn.com': 'publicidad',
  // Otras redes y publicidad
  'tiktok.com': 'publicidad', 'tiktokw.us': 'publicidad', 'ads-twitter.com': 'publicidad', 'twitter.com': 'redes', 'x.com': 'redes',
  'twimg.com': 'infraestructura', 'seedtag.com': 'publicidad', 'chartbeat.com': 'analitica', 'chartbeat.net': 'analitica',
  'scorecardresearch.com': 'analitica', 'moatads.com': 'analitica',
  // Identidad, perfiles y corredores de datos
  'uidapi.com': 'identidad', 'rlcdn.com': 'identidad', 'liveramp.com': 'identidad', 'pippio.com': 'identidad',
  'id5-sync.com': 'identidad', 'crwdcntrl.net': 'identidad', 'tapad.com': 'identidad', 'agkn.com': 'identidad',
  'eyeota.net': 'identidad', 'demdex.net': 'identidad', 'bluekai.com': 'identidad', 'bkrtx.com': 'identidad',
  'krxd.net': 'identidad', 'rfihub.com': 'identidad', 'ml314.com': 'identidad', 'permutive.com': 'identidad',
  'permutive.app': 'identidad', 'cxense.com': 'identidad', 'liadm.com': 'identidad', 'intentiq.com': 'identidad',
  'zeotap.com': 'identidad', '33across.com': 'publicidad',
  // Grabación de sesión
  'hotjar.com': 'grabacion', 'hotjar.io': 'grabacion', 'contentsquare.net': 'grabacion', 'fullstory.com': 'grabacion',
  'logrocket.com': 'grabacion', 'lr-ingest.io': 'grabacion', 'lr-ingest.com': 'grabacion', 'smartlook.com': 'grabacion',
  'smartlook.cloud': 'grabacion', 'mouseflow.com': 'grabacion', 'luckyorange.com': 'grabacion', 'luckyorange.net': 'grabacion',
  'quantummetric.com': 'grabacion', 'inspectlet.com': 'grabacion',
  // Antifraude y bots
  'online-metrix.net': 'antifraude', 'perimeterx.net': 'antifraude', 'px-cdn.net': 'antifraude', 'px-cloud.net': 'antifraude',
  'captcha-delivery.com': 'antifraude', 'datadome.co': 'antifraude', 'hcaptcha.com': 'antifraude',
  'arkoselabs.com': 'antifraude', 'funcaptcha.com': 'antifraude', 'challenges.cloudflare.com': 'antifraude',
  'siftscience.com': 'antifraude', 'sift.com': 'antifraude', 'forter.com': 'antifraude', 'riskified.com': 'antifraude',
  'adsafeprotected.com': 'antifraude', 'doubleverify.com': 'antifraude',
  // Infraestructura y análisis técnico
  'cloudflare.com': 'infraestructura', 'cdnjs.cloudflare.com': 'infraestructura', 'cloudflareinsights.com': 'analitica',
  'jsdelivr.net': 'infraestructura', 'unpkg.com': 'infraestructura', 'akamaihd.net': 'infraestructura',
  'akamaized.net': 'infraestructura', 'go-mpulse.net': 'analitica', 'fastly.net': 'infraestructura',
  'cloudfront.net': 'infraestructura', 'amazonaws.com': 'infraestructura', 'typekit.net': 'infraestructura',
  'wp.com': 'infraestructura', 'stats.wp.com': 'analitica', 'pixel.wp.com': 'analitica',
  'sentry.io': 'analitica', 'sentry-cdn.com': 'analitica', 'nr-data.net': 'analitica',
  'browser-intake-datadoghq.com': 'analitica',
  // Avisos de cookies
  'cookielaw.org': 'consentimiento', 'onetrust.com': 'consentimiento', 'cookiebot.com': 'consentimiento',
  'usercentrics.eu': 'consentimiento', 'privacy-center.org': 'consentimiento', 'didomi.io': 'consentimiento',
  'consensu.org': 'consentimiento', 'trustarc.com': 'consentimiento',
};

/** Rutas específicas dentro de un dominio que hacen otra cosa. */
const CATEGORIA_RUTA = {
  'google.com': [['/recaptcha', 'antifraude'], ['/maps', 'contenido']],
};

/** Empresas que la lista de DuckDuckGo no tiene (o tiene sin dueño). */
const NUEVAS = [
  ['Fingerprint', 'antifraude', ['fpjs.io', 'fpcdn.io', 'fingerprint.com', 'fpjscdn.net'], 'https://fingerprint.com/privacy-policy/'],
  ['OneTrust', 'consentimiento', ['cookielaw.org', 'onetrust.com']],
  ['ThreatMetrix (LexisNexis)', 'antifraude', ['online-metrix.net']],
  ['HUMAN Security', 'antifraude', ['perimeterx.net', 'px-cdn.net', 'px-cloud.net', 'humansecurity.com']],
  ['DataDome', 'antifraude', ['captcha-delivery.com', 'datadome.co']],
  ['Mercado Libre', 'pagos', ['mercadolibre.com', 'mercadolibre.cl', 'mercadolibre.com.ar', 'mercadolibre.com.mx',
    'mercadolivre.com.br', 'mercadopago.com', 'mercadopago.cl', 'mlstatic.com']],
  ['VTEX', 'infraestructura', ['vtex.com', 'vtexassets.com', 'vteximg.com.br', 'vtexcommercestable.com.br']],
  ['Yandex', 'analitica', ['mc.yandex.ru', 'mc.yandex.com']],
  ['Marfeel', 'analitica', ['marfeel.com', 'mrf.io']],
];

const EMPRESAS_DDG = ddg.empresas.map(([nombre, politica]) => ({ nombre: RENOMBRAR[nombre] || nombre, politica }));
const EMPRESAS_NUEVAS = new Map();
for (const [nombre, categoria, dominios, politica = ''] of NUEVAS) {
  for (const d of dominios) EMPRESAS_NUEVAS.set(d, { nombre, categoria, politica });
}

/** 'a.b.ejemplo.com' → ['a.b.ejemplo.com', 'b.ejemplo.com', 'ejemplo.com', 'com'] */
function sufijos(host) {
  const partes = host.split('.');
  const out = [];
  for (let i = 0; i < partes.length; i++) out.push(partes.slice(i).join('.'));
  return out;
}

const cache = new Map();

/**
 * Empresa dueña de un host, o null si no se conoce.
 * Devuelve { nombre, categoria, politica, huella (0–3 según DuckDuckGo), rastreador, disfrazado, dominio }.
 */
export function empresaDe(host, ruta = '') {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  const clave = host + (CATEGORIA_RUTA[host.replace(/^www\./, '')] ? ruta : '');
  if (cache.has(clave)) return cache.get(clave);

  let disfrazado = false;
  // Rastreadores "disfrazados": un subdominio del propio sitio que en realidad apunta a otra empresa.
  for (const h of sufijos(host)) {
    if (ddg.cnames[h]) { host = ddg.cnames[h]; disfrazado = true; break; }
  }

  let categoria = null;
  let info = null;
  for (const h of sufijos(host)) {
    if (categoria === null) {
      for (const [prefijo, cat] of CATEGORIA_RUTA[h] || []) {
        if (ruta.startsWith(prefijo)) { categoria = cat; break; }
      }
    }
    if (categoria === null && CATEGORIA[h]) categoria = CATEGORIA[h];
    const nueva = EMPRESAS_NUEVAS.get(h);
    if (nueva) {
      info = { nombre: nueva.nombre, categoria: nueva.categoria, politica: nueva.politica, huella: 0, rastreador: true, dominio: h };
      break;
    }
    const r = ddg.rastreadores[h];
    if (r) {
      const e = EMPRESAS_DDG[r[0]];
      info = { nombre: e.nombre, categoria: r[1], politica: e.politica, huella: r[2], rastreador: true, dominio: h };
      break;
    }
    const d = ddg.dominios[h];
    if (d !== undefined) {
      const e = EMPRESAS_DDG[d];
      info = { nombre: e.nombre, categoria: 'otros', politica: e.politica, huella: 0, rastreador: false, dominio: h };
      break;
    }
  }
  if (info) {
    if (categoria) info.categoria = categoria;
    info.disfrazado = disfrazado;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(clave, info);
  return info;
}

export const FECHA_LISTA = ddg.fecha;

/**
 * Entre los scripts de la pila de llamadas, cuál es el responsable:
 * el primero que sea de una empresa de rastreo; si no hay, el más externo que no sea una biblioteca
 * de infraestructura (por ejemplo jQuery desde un CDN), porque es el que inició la llamada.
 */
export function elegirScript(scripts, sitioPagina) {
  const info = scripts.filter(esWeb).map(url => {
    let ruta = '';
    try { ruta = new URL(url).pathname; } catch { /* nada */ }
    return { url, sitio: sitioDe(url), empresa: empresaDe(hostDe(url), ruta) };
  });
  if (!info.length) return null;
  const rastreador = info.find(x => x.sitio !== sitioPagina && x.empresa && TIPOS[x.empresa.categoria]?.rastrea);
  if (rastreador) return rastreador;
  const utiles = info.filter(x => !['infraestructura'].includes(x.empresa?.categoria));
  const lista = utiles.length ? utiles : info;
  return lista[lista.length - 1];
}
