// Ventana emergente: quién recibió datos tuyos en la pestaña actual.
import { TIPOS, TECNICAS } from '../src/categorias.js';
import { el, etiquetasDatos, puntoTipo, plural, empresasDePestana, ordenarPorImportancia } from './comun.js';

const $ = id => document.getElementById(id);

async function mostrar() {
  // ?tab=<id> permite abrir esta ventana para una pestaña específica (se usa en las pruebas).
  const pedida = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = pedida ? [await chrome.tabs.get(pedida)] : await chrome.tabs.query({ active: true, currentWindow: true });
  const { ajustes = {} } = await chrome.storage.local.get('ajustes');
  $('pausa').hidden = !ajustes.pausa;

  if (!tab || !/^https?:/.test(tab.url || '')) {
    $('sitio').textContent = 'Esta pestaña';
    $('resumen').textContent = 'Huella solo mira páginas web normales (http y https).';
    return;
  }
  const clave = 'tab:' + tab.id;
  const pestana = (await chrome.storage.session.get(clave))[clave];
  $('sitio').textContent = pestana?.sitio || new URL(tab.url).hostname;

  const empresas = ordenarPorImportancia(empresasDePestana(pestana));
  const rastrean = empresas.filter(e => e.rastrea);
  const otras = empresas.filter(e => !e.rastrea);
  const lista = $('lista');
  lista.replaceChildren();

  if (!pestana) {
    $('resumen').textContent = 'Todavía no hay registro de esta pestaña. Recárgala para ver quién recibe datos.';
    return;
  }
  $('resumen').textContent = rastrean.length
    ? `${plural(rastrean.length, 'empresa recibió', 'empresas recibieron')} datos tuyos en esta página.`
    : 'Ninguna empresa de rastreo ha recibido datos tuyos en esta página.';

  if (rastrean.length) {
    lista.append(el('ol', {}, rastrean.map(e => el('li', { class: 'empresa' },
      el('div', { class: 'nombre' },
        el('strong', {}, e.nombre),
        el('span', { class: 'tipo' }, puntoTipo(e.tipo), (TIPOS[e.tipo] || TIPOS.desconocida).nombre)),
      etiquetasDatos(e.datos)))));
  }

  const propia = Object.keys(pestana.propia || {});
  if (propia.length) {
    lista.append(el('p', { class: 'propia' },
      'El propio sitio usó técnicas de huella digital: ',
      propia.map(t => TECNICAS[t]?.nombre.toLowerCase() || t).join(', '), '.'));
  }

  if (otras.length) {
    lista.append(el('details', {},
      el('summary', {}, `${plural(otras.length, 'servicio más', 'servicios más')} que no rastrean (archivos, fuentes, videos…)`),
      el('ul', { class: 'apagado' }, otras.map(e => el('li', {}, e.nombre, ' — ', (TIPOS[e.tipo] || TIPOS.desconocida).nombre.toLowerCase())))));
  }
}

$('abrir-mapa').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui/mapa.html') });
  window.close();
});

$('reanudar').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ tipo: 'ajustes', ajustes: { pausa: false } });
  $('pausa').hidden = true;
});

mostrar();
