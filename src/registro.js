// Guarda lo observado, resumido, en el almacenamiento local de Chrome (chrome.storage.local).
// Nada de esto sale del navegador. Claves:
//   p:<sitio que visitaste>     a quién le envió datos ese sitio
//   t:<sitio tercero>           qué recibió ese tercero y desde qué sitios
//   e:<a>><b>><tipo>            un tercero pasándole algo a otro
//   ajustes, meta

const LIMITE_SITIOS_POR_TERCERO = 1000;
const LIMITE_TERCEROS_POR_SITIO = 400;
const LIMITE_EJEMPLOS = 4;

export const AJUSTES_INICIALES = { pausa: false, dias: 30 };

const registros = new Map();
const sucios = new Set();
const borrados = new Set();
let ajustes = { ...AJUSTES_INICIALES };
let meta = { desde: Date.now(), ultimaPoda: 0 };
let listo = null;
let temporizador = null;

export function cargar() {
  if (!listo) {
    listo = chrome.storage.local.get(null).then(todo => {
      for (const [k, v] of Object.entries(todo)) {
        if (k === 'ajustes') ajustes = { ...AJUSTES_INICIALES, ...v };
        else if (k === 'meta') meta = { ...meta, ...v };
        else if (/^[pte]:/.test(k)) registros.set(k, v);
      }
      if (!todo.meta) { sucios.add('meta'); programar(); }
    });
  }
  return listo;
}

export const leerAjustes = () => ajustes;
export function cambiarAjustes(nuevos) { ajustes = { ...ajustes, ...nuevos }; }

function obtener(clave, crear) {
  let r = registros.get(clave);
  if (!r) { r = crear(); registros.set(clave, r); }
  sucios.add(clave);
  borrados.delete(clave);
  programar();
  return r;
}

function limitar(obj, max) {
  const claves = Object.keys(obj);
  if (claves.length <= max) return;
  claves.sort((a, b) => obj[a] - obj[b]);
  for (const k of claves.slice(0, claves.length - max)) delete obj[k];
}

/** Una visita a una página (navegación principal). */
export function visita(sitio, ahora = Date.now()) {
  const p = obtener('p:' + sitio, () => ({ s: sitio, visitas: 0, primero: ahora, ultimo: ahora, terc: {} }));
  p.visitas++;
  p.ultimo = ahora;
}

/**
 * Un envío de datos de un sitio a un tercero.
 * envio: { sitioPagina, tercero, host, datos: {cat: [{campo, valor, nota}]}, cookies: [nombres], disfrazado }
 */
export function envio(e, ahora = Date.now()) {
  const t = obtener('t:' + e.tercero, () => ({
    s: e.tercero, n: 0, primero: ahora, ultimo: ahora, hosts: {}, datos: {}, sitios: {}, ej: {}, cookies: {}, duracion: {}, tecnicas: {},
  }));
  t.n++;
  t.ultimo = ahora;
  t.hosts[e.host] = (t.hosts[e.host] || 0) + 1;
  limitar(t.hosts, 25);
  t.sitios[e.sitioPagina] = ahora;
  limitar(t.sitios, LIMITE_SITIOS_POR_TERCERO);
  if (e.disfrazado) t.disfrazado = true;
  for (const n of e.cookies || []) t.cookies[n] = (t.cookies[n] || 0) + 1;
  limitar(t.cookies, 40);
  for (const [cat, muestras] of Object.entries(e.datos)) {
    t.datos[cat] = (t.datos[cat] || 0) + 1;
    const lista = t.ej[cat] || (t.ej[cat] = []);
    for (const m of muestras) {
      if (lista.length >= LIMITE_EJEMPLOS) break;
      if (lista.some(x => x.campo === m.campo)) continue;
      lista.push({ ...m, sitio: e.sitioPagina, host: e.host, t: ahora });
    }
  }

  const p = obtener('p:' + e.sitioPagina, () => ({ s: e.sitioPagina, visitas: 0, primero: ahora, ultimo: ahora, terc: {} }));
  p.ultimo = ahora;
  const pt = p.terc[e.tercero] || (p.terc[e.tercero] = { n: 0, u: ahora, d: {} });
  pt.n++;
  pt.u = ahora;
  for (const cat of Object.keys(e.datos)) pt.d[cat] = (pt.d[cat] || 0) + 1;
  if (Object.keys(p.terc).length > LIMITE_TERCEROS_POR_SITIO) {
    const viejos = Object.entries(p.terc).sort((a, b) => a[1].u - b[1].u);
    for (const [k] of viejos.slice(0, viejos.length - LIMITE_TERCEROS_POR_SITIO)) delete p.terc[k];
  }
}

/** Una cookie que un tercero guardó en tu navegador, con cuántos días dura. */
export function cookieGuardada(tercero, nombre, dias, ahora = Date.now()) {
  const t = registros.get('t:' + tercero);
  if (!t) return;   // solo se anota para terceros que ya recibieron algo
  if ((t.duracion[nombre] || 0) >= dias) return;
  t.duracion[nombre] = dias;
  limitar(t.duracion, 40);
  t.ultimo = ahora;
  sucios.add('t:' + tercero);
  programar();
}

/** Una técnica de huella digital usada por un script. Si el script es del propio sitio, va al sitio. */
export function huella(sitioPagina, sitioScript, tecnica, script, ahora = Date.now()) {
  if (sitioScript === sitioPagina) {
    const p = obtener('p:' + sitioPagina, () => ({ s: sitioPagina, visitas: 0, primero: ahora, ultimo: ahora, terc: {} }));
    p.propia = p.propia || {};
    p.propia[tecnica] = (p.propia[tecnica] || 0) + 1;
    return;
  }
  envio({
    sitioPagina, tercero: sitioScript, host: hostSeguro(script) || sitioScript, cookies: [],
    datos: { huella: [{ campo: tecnica, valor: recortar(script, 90), nota: 'Script que la usó' }] },
  }, ahora);
  const t = registros.get('t:' + sitioScript);
  t.tecnicas[tecnica] = (t.tecnicas[tecnica] || 0) + 1;
}

/** Un tercero pasándole algo a otro. */
export function enlace(a, b, tipo, sitioPagina, ejemplo, ahora = Date.now()) {
  if (!a || !b || a === b) return;
  const e = obtener(`e:${a}>${b}>${tipo}`, () => ({ a, b, tipo, n: 0, primero: ahora, ultimo: ahora, sitios: {}, ej: '' }));
  e.n++;
  e.ultimo = ahora;
  if (sitioPagina) { e.sitios[sitioPagina] = ahora; limitar(e.sitios, 200); }
  if (ejemplo && !e.ej) e.ej = recortar(ejemplo, 200);
}

export async function borrarTodo() {
  await cargar();
  registros.clear();
  sucios.clear();
  borrados.clear();
  meta = { desde: Date.now(), ultimaPoda: Date.now() };
  const todo = await chrome.storage.local.get(null);
  const quitar = Object.keys(todo).filter(k => k !== 'ajustes');
  await chrome.storage.local.remove(quitar);
  await chrome.storage.local.set({ meta });
}

/** Quita lo más antiguo que el plazo elegido en Ajustes. */
export function podar(ahora = Date.now()) {
  meta.ultimaPoda = ahora;
  sucios.add('meta');
  if (!ajustes.dias) return;
  const limite = ahora - ajustes.dias * 86400000;
  for (const [k, r] of registros) {
    if (k.startsWith('p:')) {
      if (r.ultimo < limite) { quitar(k); continue; }
      for (const [s, x] of Object.entries(r.terc)) if (x.u < limite) delete r.terc[s];
    } else {
      for (const [s, ts] of Object.entries(r.sitios)) if (ts < limite) delete r.sitios[s];
      if (!Object.keys(r.sitios).length && r.ultimo < limite) { quitar(k); continue; }
      if (k.startsWith('t:')) {
        for (const lista of Object.values(r.ej)) {
          for (let i = lista.length - 1; i >= 0; i--) if (lista[i].t < limite) lista.splice(i, 1);
        }
      }
    }
    sucios.add(k);
  }
  if (meta.desde < limite) meta.desde = limite;
}

function quitar(k) {
  registros.delete(k);
  sucios.delete(k);
  borrados.add(k);
}

function programar() {
  if (!temporizador) temporizador = setTimeout(guardar, 1000);
}

export async function guardar() {
  temporizador = null;
  if (Date.now() - meta.ultimaPoda > 6 * 3600000) podar();
  const cambios = {};
  for (const k of sucios) {
    if (k === 'meta') cambios.meta = meta;
    else if (registros.has(k)) cambios[k] = registros.get(k);
  }
  sucios.clear();
  const quitarClaves = [...borrados];
  borrados.clear();
  try {
    if (Object.keys(cambios).length) await chrome.storage.local.set(cambios);
    if (quitarClaves.length) await chrome.storage.local.remove(quitarClaves);
  } catch (err) {
    console.warn('Huella: no se pudo guardar', err);
  }
}

function hostSeguro(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function recortar(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
