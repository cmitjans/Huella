// Ventana del ícono y panel lateral "en vivo": quién recibe datos tuyos en la pestaña actual y qué observa.
// La misma página sirve para ambos; el panel se queda abierto al costado y se actualiza mientras navegas.
import { TIPOS, TECNICAS, OBSERVA, CAMPOS } from '../src/categorias.js';
import { duracion } from '../src/analisis.js';
import { el, etiquetasDatos, puntoTipo, plural, peso, unir, empresasDePestana, ordenarPorImportancia, OBSERVADO } from './comun.js';

const esPanel = document.body.classList.contains('panel');
const params = new URLSearchParams(location.search);
// ?tab=<id> permite abrir esta ventana para una pestaña específica (se usa en las pruebas).
const pestanaPedida = Number(params.get('tab')) || 0;

let tabActual = null;
let vistos = new Set();   // eventos ya mostrados en el registro en vivo, para resaltar los nuevos
let primeraVez = true;

async function pestana() {
  if (pestanaPedida) return chrome.tabs.get(pestanaPedida).catch(() => null);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/** Frases sobre lo que la empresa observó dentro de la página. */
function frasesObservadas(e) {
  const out = [];
  const lecturas = Object.keys(e.obs || {}).filter(q => q.startsWith('lectura:')).map(q => q.slice(8));
  if (lecturas.length) {
    out.push(el('li', { class: 'rojo' }, `Leyó lo que escribiste en ${unir(lecturas.map(c => CAMPOS[c] || CAMPOS.otro))}.`));
  }
  const escucha = Object.keys(OBSERVA).filter(q => e.obs?.[q]);
  if (escucha.length) {
    out.push(el('li', {}, 'Escucha en toda la página: ', unir(escucha.map(q => OBSERVA[q].nombre.toLowerCase())), '.'));
  }
  const tiempo = [];
  if (e.tiempoMs >= 1000) tiempo.push(`que estuviste ${duracion(e.tiempoMs)} activo`);
  if (e.scroll) tiempo.push(`que bajaste hasta el ${e.scroll}% de la página`);
  if (tiempo.length) out.push(el('li', {}, `Le informaron ${unir(tiempo)}.`));
  return out.length ? el('ul', { class: 'observa' }, out) : null;
}

function tarjeta(e) {
  const vol = [];
  if (e.n) vol.push(plural(e.n, 'envío', 'envíos'));
  if (e.bytes) vol.push(peso(e.bytes));
  return el('li', { class: 'empresa' },
    el('div', { class: 'nombre' },
      el('strong', {}, e.nombre),
      el('span', { class: 'tipo' }, puntoTipo(e.tipo), (TIPOS[e.tipo] || TIPOS.desconocida).nombre)),
    frasesObservadas(e),
    etiquetasDatos(e.datos, false, OBSERVADO),
    vol.length ? el('p', { class: 'volumen' }, vol.join(' · ')) : null);
}

function registroEnVivo(pest) {
  const ult = pest?.ult || [];
  const lista = el('ol', { 'aria-live': 'polite' });
  for (const ev of ult.slice(0, 25)) {
    const clave = `${ev.t}|${ev.s}|${ev.q}`;
    const nuevo = !primeraVez && !vistos.has(clave);
    vistos.add(clave);
    lista.append(el('li', { class: (ev.fuerte ? 'fuerte' : '') + (nuevo ? ' nuevo' : '') },
      el('span', { class: 'hora' }, new Date(ev.t).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })),
      el('span', {}, el('strong', {}, ev.e), ' ', el('span', { class: 'que' }, ev.q))));
  }
  return el('section', { class: 'vivo' },
    el('h2', {}, el('span', { class: 'latido', 'aria-hidden': 'true' }), 'En vivo'),
    ult.length ? lista : el('p', { class: 'apagado pequeno' }, 'Navega como siempre: aquí aparecerá cada envío a empresas de rastreo, y lo que empiezan a observar, en el momento en que ocurre.'));
}

async function mostrar() {
  const tab = await pestana();
  const cambio = tab?.id !== tabActual?.id;
  tabActual = tab;
  if (cambio) { vistos = new Set(); primeraVez = true; }
  const { ajustes = {} } = await chrome.storage.local.get('ajustes');

  const partes = [];
  const cabecera = el('header', {}, el('h1', { id: 'sitio' }, 'Esta pestaña'), el('p', { id: 'resumen', class: 'apagado' }));
  partes.push(cabecera);
  if (ajustes.pausa) {
    partes.push(el('div', { class: 'pausa' }, el('span', {}, 'El registro está en pausa: no se anota nada nuevo.'),
      el('button', { type: 'button', onclick: async () => {
        await chrome.runtime.sendMessage({ tipo: 'ajustes', ajustes: { pausa: false } });
        mostrar();
      } }, 'Reanudar')));
  }

  const lista = el('main', {});
  partes.push(lista);
  let pest = null;

  if (!tab || !/^https?:/.test(tab.url || '')) {
    cabecera.querySelector('#resumen').textContent = 'Huella solo mira páginas web normales (http y https).';
  } else {
    const clave = 'tab:' + tab.id;
    pest = (await chrome.storage.session.get(clave))[clave];
    cabecera.querySelector('#sitio').textContent = pest?.sitio || new URL(tab.url).hostname;

    const empresas = ordenarPorImportancia(empresasDePestana(pest));
    const rastrean = empresas.filter(e => e.rastrea);
    const otras = empresas.filter(e => !e.rastrea);
    const observan = rastrean.filter(e => e.datos.comportamiento || e.datos.escritura);

    let resumen;
    if (!pest) resumen = 'Todavía no hay registro de esta pestaña. Recárgala para ver quién recibe datos.';
    else if (!rastrean.length) resumen = 'Ninguna empresa de rastreo ha recibido datos tuyos en esta página.';
    else {
      resumen = `${plural(rastrean.length, 'empresa recibió', 'empresas recibieron')} datos tuyos en esta página`;
      resumen += observan.length ? `, y ${observan.length === 1 ? 'una observa' : `${observan.length} observan`} lo que haces en ella.` : '.';
    }
    cabecera.querySelector('#resumen').textContent = resumen;

    if (!esPanel && tab) {
      cabecera.append(el('button', { class: 'vivo-boton', type: 'button', onclick: () => abrirPanel(tab) }, 'Verlo en vivo al costado'));
    }

    if (rastrean.length) lista.append(el('ol', {}, rastrean.map(tarjeta)));

    const propia = Object.keys(pest?.propia || {});
    if (propia.length) {
      lista.append(el('p', { class: 'propia' }, 'El propio sitio usó técnicas de huella digital: ',
        propia.map(t => TECNICAS[t]?.nombre.toLowerCase() || t).join(', '), '.'));
    }
    if (otras.length) {
      lista.append(el('details', {},
        el('summary', {}, `${plural(otras.length, 'servicio más', 'servicios más')} que no rastrean (archivos, fuentes, videos…)`),
        el('ul', { class: 'apagado' }, otras.map(e => el('li', {}, e.nombre, ' — ', (TIPOS[e.tipo] || TIPOS.desconocida).nombre.toLowerCase())))));
    }
  }

  if (esPanel) partes.push(registroEnVivo(pest));
  partes.push(el('footer', {},
    el('button', { class: 'principal', type: 'button', onclick: abrirMapa }, 'Ver el mapa completo'),
    el('p', {}, 'Solo observa. Todo queda en este computador.')));

  // Conservar la posición de lectura al actualizar.
  const y = esPanel ? window.scrollY : document.querySelector('main')?.scrollTop || 0;
  document.body.replaceChildren(...partes);
  if (esPanel) window.scrollTo(0, y); else lista.scrollTop = y;
  primeraVez = false;
}

function abrirPanel(tab) {
  // Debe llamarse directo desde el clic: Chrome solo abre el panel como respuesta a una acción tuya.
  chrome.sidePanel.open({ windowId: tab.windowId }).then(() => window.close()).catch(() => {});
}

function abrirMapa() {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui/mapa.html') });
  if (!esPanel) window.close();
}

// Actualizar cuando llegan datos nuevos (como máximo dos veces por segundo).
let pendiente = null;
function actualizar() {
  if (pendiente) return;
  pendiente = setTimeout(() => { pendiente = null; mostrar(); }, 500);
}
chrome.storage.session.onChanged.addListener(cambios => {
  if (tabActual && cambios['tab:' + tabActual.id]) actualizar();
});
chrome.storage.local.onChanged.addListener(cambios => { if (cambios.ajustes) actualizar(); });
if (esPanel && !pestanaPedida) {
  chrome.tabs.onActivated.addListener(actualizar);
  chrome.tabs.onUpdated.addListener((id, cambio) => { if (cambio.url || cambio.status === 'loading') actualizar(); });
  chrome.windows.onFocusChanged.addListener(actualizar);
}

mostrar();
