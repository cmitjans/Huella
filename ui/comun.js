// Ayudas compartidas por la ventana emergente y el mapa.
import { TIPOS, DATOS, ORDEN_DATOS } from '../src/categorias.js';
import { empresaDe } from '../src/empresas.js';

/** Datos que te identifican directamente: se marcan con resaltador. */
export const IDENTIFICAN = new Set(['escritura', 'comportamiento', 'contacto', 'cookie', 'identificador', 'huella', 'grabacion']);

/** Lo que los scripts observan dentro de la página (se muestra aparte de las etiquetas). */
export const OBSERVADO = new Set(['escritura', 'comportamiento', 'atencion']);

/** Crea un elemento: el('p', {class: 'x'}, 'texto', otroElemento). */
export function el(etiqueta, attrs = {}, ...hijos) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat(Infinity)) {
    if (h == null || h === false) continue;
    e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return e;
}

/** Etiquetas de los datos recibidos, en orden de importancia. */
export function etiquetasDatos(datos, conCantidad = false, excluir = null) {
  const ul = el('ul', { class: 'datos' });
  for (const cat of ORDEN_DATOS) {
    if (!datos[cat] || excluir?.has(cat)) continue;
    ul.append(el('li', { class: 'dato' + (IDENTIFICAN.has(cat) ? ' identifica' : ''), title: DATOS[cat].nombre },
      DATOS[cat].corto, conCantidad ? ` ${datos[cat]}` : ''));
  }
  return ul;
}

export function puntoTipo(tipo) {
  return el('span', { class: 'punto', style: { background: (TIPOS[tipo] || TIPOS.desconocida).color }, 'aria-hidden': 'true' });
}

export const plural = (n, uno, varios) => `${n.toLocaleString('es-CL')} ${n === 1 ? uno : varios}`;

export function peso(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString('es-CL')} KB`;
  return `${bytes} bytes`;
}

/** Une una lista en español: ['a','b','c'] → 'a, b y c'. */
export function unir(lista) {
  if (lista.length <= 1) return lista.join('');
  return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}

export function fecha(ts) {
  return new Date(ts).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
}

const PRIORIDAD_TIPO = ['grabacion', 'identidad', 'publicidad', 'redes', 'analitica', 'antifraude', 'rastreo', 'atencion',
  'riesgo', 'pagos', 'contenido', 'consentimiento', 'infraestructura', 'otros', 'desconocida'];

/** ¿Esta empresa rastrea, o al menos recibió algo que te identifica? */
export function rastrea(tipo, datos) {
  return !!(TIPOS[tipo]?.rastrea || [...IDENTIFICAN].some(c => datos[c]));
}

/**
 * Convierte lo guardado en chrome.storage.local en un modelo por empresa y por sitio.
 * Los dominios de una misma empresa se agrupan (doubleclick.net y google-analytics.com → Google).
 */
export function construirModelo(todo) {
  const sitios = new Map();
  const empresas = new Map();
  const porDominio = new Map();

  for (const [k, r] of Object.entries(todo)) {
    if (k.startsWith('p:')) sitios.set(r.s, { ...r, empresas: new Set() });
  }

  for (const [k, t] of Object.entries(todo)) {
    if (!k.startsWith('t:')) continue;
    const host = Object.keys(t.hosts || {})[0] || t.s;
    const info = empresaDe(host) || empresaDe(t.s);
    const clave = info ? info.nombre : t.s;
    let emp = empresas.get(clave);
    if (!emp) {
      emp = {
        clave, nombre: clave, conocida: !!info, politica: info?.politica || '', huellaDDG: 0,
        dominios: [], sitios: new Map(), datos: {}, ej: {}, cookies: {}, duracion: {}, tecnicas: {},
        disfrazado: false, peticionesPorTipo: {}, salida: [], entrada: [], n: 0,
        obs: {}, obsSitios: {}, bytes: 0, tiempoMs: 0, scrollMax: 0,
      };
      empresas.set(clave, emp);
    }
    const tipo = info ? info.categoria : 'desconocida';
    for (const [q, n] of Object.entries(t.obs || {})) emp.obs[q] = (emp.obs[q] || 0) + n;
    for (const [q, l] of Object.entries(t.obsSitios || {})) emp.obsSitios[q] = [...new Set([...(emp.obsSitios[q] || []), ...l])];
    emp.bytes += t.bytes || 0;
    emp.tiempoMs += t.tiempoMs || 0;
    emp.scrollMax = Math.max(emp.scrollMax, t.scrollMax || 0);
    emp.dominios.push({ s: t.s, n: t.n, tipo, hosts: t.hosts });
    emp.peticionesPorTipo[tipo] = (emp.peticionesPorTipo[tipo] || 0) + t.n;
    emp.huellaDDG = Math.max(emp.huellaDDG, info?.huella || 0);
    emp.n += t.n;
    if (t.disfrazado) emp.disfrazado = true;
    for (const [s, ts] of Object.entries(t.sitios || {})) emp.sitios.set(s, Math.max(ts, emp.sitios.get(s) || 0));
    for (const [c, n] of Object.entries(t.datos || {})) emp.datos[c] = (emp.datos[c] || 0) + n;
    for (const [c, lista] of Object.entries(t.ej || {})) {
      const destino = emp.ej[c] || (emp.ej[c] = []);
      for (const m of lista) if (destino.length < 6 && !destino.some(x => x.campo === m.campo)) destino.push(m);
    }
    for (const [c, n] of Object.entries(t.cookies || {})) emp.cookies[c] = (emp.cookies[c] || 0) + n;
    for (const [c, d] of Object.entries(t.duracion || {})) emp.duracion[c] = Math.max(d, emp.duracion[c] || 0);
    for (const [c, n] of Object.entries(t.tecnicas || {})) emp.tecnicas[c] = (emp.tecnicas[c] || 0) + n;
    porDominio.set(t.s, emp);
  }

  for (const emp of empresas.values()) {
    // Tipo principal: el que más peticiones tuvo entre los que rastrean; si no, el que más tuvo.
    const tipos = Object.entries(emp.peticionesPorTipo).sort((a, b) => b[1] - a[1]);
    const rastreadores = tipos.filter(([t]) => TIPOS[t]?.rastrea);
    emp.tipo = (rastreadores[0] || tipos[0] || ['desconocida'])[0];
    emp.tipos = tipos.map(([t]) => t).sort((a, b) => PRIORIDAD_TIPO.indexOf(a) - PRIORIDAD_TIPO.indexOf(b));
    emp.rastrea = rastrea(emp.tipo, emp.datos) || emp.tipos.some(t => TIPOS[t]?.rastrea);
    for (const s of emp.sitios.keys()) sitios.get(s)?.empresas.add(emp.clave);
  }

  // Enlaces entre empresas (no entre dominios de la misma empresa).
  const enlaces = new Map();
  const empresaDeDominio = s => porDominio.get(s) || crearEmpresaSuelta(s, empresas, porDominio);
  for (const [k, e] of Object.entries(todo)) {
    if (!k.startsWith('e:')) continue;
    const a = empresaDeDominio(e.a);
    const b = empresaDeDominio(e.b);
    if (a === b) continue;
    const clave = `${a.clave}>${b.clave}>${e.tipo}`;
    let x = enlaces.get(clave);
    if (!x) {
      x = { desde: a, hacia: b, tipo: e.tipo, n: 0, sitios: new Set(), ej: e.ej, dominios: new Set() };
      enlaces.set(clave, x);
      a.salida.push(x);
      b.entrada.push(x);
    }
    x.n += e.n;
    x.dominios.add(`${e.a} → ${e.b}`);
    for (const s of Object.keys(e.sitios || {})) x.sitios.add(s);
  }

  const visitas = [...sitios.values()].reduce((n, s) => n + (s.visitas || 0), 0);
  return {
    sitios, empresas, enlaces: [...enlaces.values()], visitas,
    desde: todo.meta?.desde || Date.now(), ajustes: todo.ajustes || {},
  };
}

/** Una empresa que solo aparece en un enlace (por ejemplo, la fuente de un identificador universal). */
function crearEmpresaSuelta(dominio, empresas, porDominio) {
  const info = empresaDe(dominio);
  const clave = info ? info.nombre : dominio;
  let emp = empresas.get(clave);
  if (!emp) {
    emp = {
      clave, nombre: clave, conocida: !!info, politica: info?.politica || '', huellaDDG: info?.huella || 0,
      dominios: [{ s: dominio, n: 0, tipo: info ? info.categoria : 'desconocida' }], sitios: new Map(), datos: {}, ej: {},
      cookies: {}, duracion: {}, tecnicas: {}, disfrazado: false, peticionesPorTipo: {}, salida: [], entrada: [], n: 0,
      obs: {}, obsSitios: {}, bytes: 0, tiempoMs: 0, scrollMax: 0,
      tipo: info ? info.categoria : 'desconocida', soloEnlace: true,
    };
    emp.tipos = [emp.tipo];
    emp.rastrea = !!TIPOS[emp.tipo]?.rastrea;
    empresas.set(clave, emp);
  }
  porDominio.set(dominio, emp);
  return emp;
}

/** Empresas de una pestaña (lo que guarda el servicio de fondo en chrome.storage.session). */
export function empresasDePestana(pestana) {
  const out = new Map();
  for (const [tercero, t] of Object.entries(pestana?.terc || {})) {
    const clave = t.empresa || tercero;
    const e = out.get(clave) || { nombre: clave, tipo: t.tipo, datos: {}, dominios: [], n: 0, porTipo: {}, obs: {}, bytes: 0, tiempoMs: 0, scroll: 0 };
    e.dominios.push(tercero);
    e.n += t.n;
    e.bytes += t.bytes || 0;
    e.tiempoMs += t.tiempoMs || 0;
    e.scroll = Math.max(e.scroll, t.scroll || 0);
    for (const [q, n] of Object.entries(t.obs || {})) e.obs[q] = (e.obs[q] || 0) + n;
    e.porTipo[t.tipo] = (e.porTipo[t.tipo] || 0) + t.n;
    for (const [c, n] of Object.entries(t.d)) e.datos[c] = (e.datos[c] || 0) + n;
    out.set(clave, e);
  }
  for (const e of out.values()) {
    // Igual que en el mapa: el tipo con más envíos entre los que rastrean.
    const tipos = Object.entries(e.porTipo).sort((a, b) => b[1] - a[1]);
    e.tipo = (tipos.find(([t]) => TIPOS[t]?.rastrea) || tipos[0])[0];
    e.rastrea = rastrea(e.tipo, e.datos);
  }
  return [...out.values()];
}

export function ordenarPorImportancia(lista) {
  const valor = e => (e.datos.escritura ? 100 : 0) + (e.datos.comportamiento ? 50 : 0) +
    [...IDENTIFICAN].filter(c => e.datos[c]).length * 10 + Object.keys(e.datos).length;
  return lista.sort((a, b) => valor(b) - valor(a) || b.n - a.n);
}
