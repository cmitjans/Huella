// Página principal: el mapa de quién recibe tus datos y con quién los comparte.
import { TIPOS, DATOS, ORDEN_DATOS, ENLACES, TECNICAS, SIEMPRE, OBSERVA, CAMPOS } from '../src/categorias.js';
import { duracion } from '../src/analisis.js';
import { FECHA_LISTA } from '../src/empresas.js';
import { el, etiquetasDatos, puntoTipo, plural, fecha, peso, unir, construirModelo, OBSERVADO } from './comun.js';

const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const FUERTES = new Set(['id-universal', 'sincronizacion', 'mismo-id']);
const MAX_EMPRESAS = 60;
const MAX_SITIOS = 90;

let modelo = null;
let seleccion = null;   // { tipo: 'empresa'|'sitio', clave }

// ------------------------------------------------------------ carga y navegación

async function cargar() {
  modelo = construirModelo(await chrome.storage.local.get(null));
  dibujarTitular();
  mostrarVista();
}

function vistaActual() {
  const h = location.hash.slice(1);
  return ['mapa', 'empresas', 'sitios', 'limites', 'ajustes'].includes(h) ? h : 'mapa';
}

function mostrarVista() {
  const vista = vistaActual();
  $('bienvenida').hidden = location.hash !== '#bienvenida';
  for (const a of document.querySelectorAll('.barra nav a')) {
    if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  for (const s of document.querySelectorAll('[data-seccion]')) s.hidden = s.dataset.seccion !== vista;
  $('titular').hidden = ['limites', 'ajustes'].includes(vista);
  if (vista === 'mapa') dibujarMapa();
  if (vista === 'empresas') dibujarEmpresas();
  if (vista === 'sitios') dibujarSitios();
  if (vista === 'limites') dibujarLimites();
  if (vista === 'ajustes') dibujarAjustes();
  if (['limites', 'ajustes'].includes(vista)) cerrarDetalle();
  else if (seleccion) abrirDetalle(seleccion);
}

window.addEventListener('hashchange', mostrarVista);
$('cerrar-bienvenida').addEventListener('click', () => { location.hash = '#mapa'; });

// Si llegan datos nuevos mientras la página está abierta, se actualiza (como máximo cada 4 segundos).
let pendiente = null;
chrome.storage.onChanged.addListener(area => {
  if (area !== 'local' || pendiente) return;
  pendiente = setTimeout(() => { pendiente = null; cargar(); }, 4000);
});

// ------------------------------------------------------------ titular

function empresasVisibles(incluirOtros) {
  return [...modelo.empresas.values()].filter(e => (incluirOtros || e.rastrea) && (e.sitios.size || e.salida.length || e.entrada.length));
}

function dibujarTitular() {
  const t = $('titular');
  t.replaceChildren();
  const empresas = empresasVisibles(false).filter(e => e.sitios.size);
  const sitios = [...modelo.sitios.values()].filter(s => [...s.empresas].some(c => modelo.empresas.get(c)?.rastrea));
  if (!empresas.length) {
    t.append('Todavía no hay registros. Navega como siempre unos minutos y vuelve: aquí aparecerá quién recibió datos tuyos.');
    return;
  }
  const comparten = new Set();
  for (const e of modelo.enlaces) {
    if (FUERTES.has(e.tipo)) { comparten.add(e.desde.clave); comparten.add(e.hacia.clave); }
  }
  t.append(`Desde el ${fecha(modelo.desde)}, `, el('strong', {}, plural(empresas.length, 'empresa', 'empresas')),
    ` recibieron datos tuyos desde `, el('strong', {}, plural(sitios.length, 'sitio', 'sitios')), ' que visitaste.');
  if (comparten.size) t.append(' ', el('strong', {}, String(comparten.size)), ' de ellas se pasaron identificadores tuyos.');
  const leen = empresas.filter(e => Object.keys(e.obs).some(q => q.startsWith('lectura:')));
  const escuchan = empresas.filter(e => Object.keys(e.obs).some(q => OBSERVA[q]));
  if (leen.length) t.append(' ', el('strong', {}, String(leen.length)), ` ${leen.length === 1 ? 'leyó' : 'leyeron'} lo que escribiste en formularios.`);
  else if (escuchan.length) t.append(' ', el('strong', {}, String(escuchan.length)), ` ${escuchan.length === 1 ? 'observó' : 'observaron'} tus clics, teclas o movimientos.`);
}

// ------------------------------------------------------------ mapa radial

$('incluir-otros').addEventListener('change', () => dibujarMapa());
window.addEventListener('resize', () => { if (vistaActual() === 'mapa') dibujarMapa(); });

function mediaCircular(angulos) {
  if (!angulos.length) return null;
  let x = 0, y = 0;
  for (const a of angulos) { x += Math.cos(a); y += Math.sin(a); }
  return Math.atan2(y, x);
}

/** Reparte elementos en círculo, en el orden dado, empezando arriba. */
function repartir(lista) {
  const n = lista.length;
  lista.forEach((x, i) => { x.angulo = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1); });
}

/** Ordena por ángulo deseado y reparte parejo. Así quedan cerca los sitios y empresas conectados. */
function ordenarPorDeseado(lista) {
  const norm = a => ((a + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  lista.sort((p, q) => norm(p.deseado ?? p.angulo) - norm(q.deseado ?? q.angulo));
  repartir(lista);
}

function punto(r, a) { return [r * Math.cos(a), r * Math.sin(a)]; }
function f(n) { return Math.round(n * 10) / 10; }

function nodoSvg(etiqueta, attrs = {}, ...hijos) {
  const e = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const h of hijos) if (h) e.append(h);
  return e;
}

function dibujarLeyenda(tipos) {
  const ley = $('leyenda');
  ley.replaceChildren();
  for (const t of tipos) ley.append(el('span', {}, puntoTipo(t), TIPOS[t].nombre));
  const linea = (clase, texto) => {
    const s = nodoSvg('svg', { width: 26, height: 8, 'aria-hidden': 'true' },
      nodoSvg('line', { x1: 1, y1: 4, x2: 25, y2: 4, class: clase, style: 'stroke-opacity:1' }));
    return el('span', {}, s, texto);
  };
  ley.append(linea('arista', 'le envió datos'), linea('comparte', 'se pasaron identificadores'), linea('comparte debil', 'redirección o llamada'));
}

function dibujarMapa() {
  const lienzo = $('lienzo');
  lienzo.replaceChildren();
  if (!modelo) return;
  const incluirOtros = $('incluir-otros').checked;

  let empresas = empresasVisibles(incluirOtros)
    .sort((a, b) => b.sitios.size - a.sitios.size || (b.salida.length + b.entrada.length) - (a.salida.length + a.entrada.length));
  const total = empresas.length;
  empresas = empresas.slice(0, MAX_EMPRESAS);
  if (!empresas.length) {
    lienzo.append(el('p', { class: 'vacio' }, 'Cuando visites páginas, aquí aparecerán los sitios que viste y las empresas que recibieron datos tuyos desde cada uno.'));
    $('leyenda').replaceChildren();
    $('nota-mapa').textContent = '';
    return;
  }
  const claves = new Set(empresas.map(e => e.clave));
  let sitios = [...modelo.sitios.values()]
    .map(s => ({ s, conectadas: [...s.empresas].filter(c => claves.has(c)) }))
    .filter(x => x.conectadas.length)
    .sort((a, b) => b.conectadas.length - a.conectadas.length);
  const totalSitios = sitios.length;
  sitios = sitios.slice(0, MAX_SITIOS);

  $('nota-mapa').textContent = [
    total > MAX_EMPRESAS ? `Se muestran las ${MAX_EMPRESAS} empresas que te vieron en más sitios (de ${total}).` : '',
    totalSitios > MAX_SITIOS ? `Se muestran ${MAX_SITIOS} de ${totalSitios} sitios.` : '',
    'Pasa el mouse sobre un punto para ver sus conexiones; haz clic para ver el detalle.',
  ].filter(Boolean).join(' ');

  // Orden: empresas agrupadas por tipo, luego se acomodan cerca de sus sitios.
  const ordenTipos = Object.keys(TIPOS);
  empresas.sort((a, b) => ordenTipos.indexOf(a.tipo) - ordenTipos.indexOf(b.tipo) || b.sitios.size - a.sitios.size);
  repartir(empresas);
  const nodosEmp = new Map(empresas.map(e => [e.clave, e]));
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    for (const x of sitios) x.deseado = mediaCircular(x.conectadas.map(c => nodosEmp.get(c).angulo));
    ordenarPorDeseado(sitios);
    const angSitio = new Map(sitios.map(x => [x.s.s, x.angulo]));
    for (const e of empresas) {
      const angs = [...e.sitios.keys()].filter(s => angSitio.has(s)).map(s => angSitio.get(s));
      e.deseado = mediaCircular(angs);
    }
    ordenarPorDeseado(empresas);
  }
  for (const e of empresas) delete e.deseado;

  // Tamaños en píxeles reales: 1 unidad del dibujo = 1 px.
  const ancho = Math.max(560, Math.min(lienzo.clientWidth || 900, 1100));
  const R2 = ancho * 0.31;
  const R1 = R2 * 0.5;
  const margen = 170;
  const lado = 2 * (R2 + margen);
  const maxSitios = Math.max(...empresas.map(e => e.sitios.size), 1);
  const radio = e => 5 + 13 * Math.sqrt(e.sitios.size / maxSitios);

  const svg = nodoSvg('svg', {
    viewBox: `${f(-lado / 2)} ${f(-lado / 2)} ${f(lado)} ${f(lado)}`,
    role: 'img',
    'aria-label': `Mapa: ${empresas.length} empresas y ${sitios.length} sitios`,
  });
  svg.append(nodoSvg('defs', {}, nodoSvg('marker', {
    id: 'flecha', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
  }, nodoSvg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--rojo)' }))));
  svg.append(nodoSvg('circle', { class: 'anillo', r: f(R1) }), nodoSvg('circle', { class: 'anillo', r: f(R2) }));

  const capaAristas = nodoSvg('g');
  const capaComparte = nodoSvg('g');
  const capaNodos = nodoSvg('g');
  svg.append(capaAristas, capaComparte, capaNodos);

  const relacion = new Map();   // nodo → elementos que se iluminan con él
  const rel = (clave, ...elementos) => {
    const l = relacion.get(clave) || [];
    l.push(...elementos);
    relacion.set(clave, l);
  };

  // Sitio → empresa
  const angSitio = new Map(sitios.map(x => [x.s.s, x.angulo]));
  const rMedio = (R1 + R2) / 2;
  for (const x of sitios) {
    for (const c of x.conectadas) {
      const e = nodosEmp.get(c);
      const [x0, y0] = punto(R1, x.angulo);
      const [x1, y1] = punto(rMedio, x.angulo);
      const [x2, y2] = punto(rMedio, e.angulo);
      const [x3, y3] = punto(R2 - radio(e), e.angulo);
      const p = nodoSvg('path', { class: 'arista', d: `M${f(x0)},${f(y0)} C${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x3)},${f(y3)}` });
      p.style.stroke = TIPOS[e.tipo].color;
      capaAristas.append(p);
      rel('s:' + x.s.s, p, e);
      rel('e:' + c, p, x);
    }
  }

  // Empresa → empresa (lo que se pasan entre ellas)
  for (const enl of modelo.enlaces) {
    const a = nodosEmp.get(enl.desde.clave);
    const b = nodosEmp.get(enl.hacia.clave);
    if (!a || !b) continue;
    let d = Math.abs(a.angulo - b.angulo);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const rc = R2 - 30 - (R2 - R1 - 50) * (d / Math.PI);
    const [x0, y0] = punto(R2 - radio(a) - 2, a.angulo);
    const [x1, y1] = punto(rc, a.angulo);
    const [x2, y2] = punto(rc, b.angulo);
    const [x3, y3] = punto(R2 - radio(b) - 2, b.angulo);
    const p = nodoSvg('path', {
      class: 'comparte' + (FUERTES.has(enl.tipo) ? '' : ' debil'),
      d: `M${f(x0)},${f(y0)} C${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x3)},${f(y3)}`,
      'marker-end': 'url(#flecha)',
    });
    p.style.strokeWidth = f(1.4 + Math.min(3, Math.log2(enl.n + 1) * 0.6));
    p.append(nodoSvg('title', {}, document.createTextNode(`${enl.desde.nombre} → ${enl.hacia.nombre}: ${ENLACES[enl.tipo].nombre.toLowerCase()} (${plural(enl.n, 'vez', 'veces')})`)));
    capaComparte.append(p);
    rel('e:' + a.clave, p, b);
    rel('e:' + b.clave, p, a);
  }

  // Centro
  capaNodos.append(nodoSvg('g', { class: 'centro' },
    nodoSvg('circle', { r: 30 }),
    nodoSvg('text', { 'text-anchor': 'middle', dy: '0.35em' }, document.createTextNode('Tú'))));

  const etiqueta = (r, angulo, texto, haciaAfuera) => {
    const [x, y] = punto(r, angulo);
    let grados = (angulo * 180) / Math.PI;
    const izquierda = Math.cos(angulo) < 0;
    if (izquierda) grados += 180;
    const ancla = haciaAfuera ? (izquierda ? 'end' : 'start') : (izquierda ? 'start' : 'end');
    return nodoSvg('text', { x: f(x), y: f(y), dy: '0.35em', 'text-anchor': ancla, transform: `rotate(${f(grados)} ${f(x)} ${f(y)})` },
      document.createTextNode(texto));
  };

  // Con pocas empresas, sus nombres van horizontales (se leen mejor); con muchas, en radio para que no choquen.
  const horizontal = empresas.length <= 24;
  const etiquetaHorizontal = (r, angulo, texto) => {
    const [x, y] = punto(r, angulo);
    const c = Math.cos(angulo), s = Math.sin(angulo);
    const ancla = c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle';
    const dy = s < -0.25 ? (ancla === 'middle' ? '-0.4em' : '0') : s > 0.25 ? (ancla === 'middle' ? '1.1em' : '0.7em') : '0.35em';
    return nodoSvg('text', { x: f(x), y: f(y), dy, 'text-anchor': ancla }, document.createTextNode(texto));
  };

  const nodos = new Map();
  for (const x of sitios) {
    const [cx, cy] = punto(R1, x.angulo);
    const r = 3 + Math.min(4, Math.sqrt(x.s.visitas || 1));
    const nombre = x.s.s.length > 24 ? x.s.s.slice(0, 23) + '…' : x.s.s;
    const g = nodoSvg('g', { class: 'nodo sitio', tabindex: 0, role: 'button', 'aria-label': `Sitio ${x.s.s}` },
      nodoSvg('circle', { cx: f(cx), cy: f(cy), r: f(r), fill: 'var(--grafito)' }),
      sitios.length <= 70 ? etiqueta(R1 - r - 6, x.angulo, nombre, false) : null,
      nodoSvg('title', {}, document.createTextNode(`${x.s.s}: envió datos a ${plural(x.conectadas.length, 'empresa', 'empresas')}`)));
    activar(g, { tipo: 'sitio', clave: x.s.s });
    capaNodos.append(g);
    nodos.set('s:' + x.s.s, g);
    rel('s:' + x.s.s, x);
  }
  for (const e of empresas) {
    const [cx, cy] = punto(R2, e.angulo);
    const r = radio(e);
    const g = nodoSvg('g', { class: 'nodo empresa', tabindex: 0, role: 'button', 'aria-label': `Empresa ${e.nombre}` },
      nodoSvg('circle', { cx: f(cx), cy: f(cy), r: f(r), fill: TIPOS[e.tipo].color }),
      (horizontal ? etiquetaHorizontal(R2 + r + 6, e.angulo, e.nombre.length > 26 ? e.nombre.slice(0, 25) + '…' : e.nombre)
        : etiqueta(R2 + r + 6, e.angulo, e.nombre.length > 26 ? e.nombre.slice(0, 25) + '…' : e.nombre, true)),
      nodoSvg('title', {}, document.createTextNode(`${e.nombre} (${TIPOS[e.tipo].nombre}): te vio en ${plural(e.sitios.size, 'sitio', 'sitios')}`)));
    activar(g, { tipo: 'empresa', clave: e.clave });
    capaNodos.append(g);
    nodos.set('e:' + e.clave, g);
    rel('e:' + e.clave, e);
  }

  // Iluminar conexiones al pasar el mouse o al seleccionar.
  function enfocar(clave) {
    svg.classList.toggle('enfoque', !!clave);
    for (const x of svg.querySelectorAll('.activo')) x.classList.remove('activo');
    if (!clave) return;
    for (const r of relacion.get(clave) || []) {
      if (r instanceof Element) r.classList.add('activo');
      else nodos.get(r.s ? 's:' + r.s.s : 'e:' + r.clave)?.classList.add('activo');
    }
  }
  const claveSel = () => seleccion && (seleccion.tipo === 'sitio' ? 's:' : 'e:') + seleccion.clave;
  function activar(g, sel) {
    const clave = (sel.tipo === 'sitio' ? 's:' : 'e:') + sel.clave;
    g.addEventListener('mouseenter', () => enfocar(clave));
    g.addEventListener('mouseleave', () => enfocar(claveSel()));
    g.addEventListener('focus', () => enfocar(clave));
    g.addEventListener('blur', () => enfocar(claveSel()));
    const abrir = ev => { ev.stopPropagation(); abrirDetalle(sel); enfocar(clave); };
    g.addEventListener('click', abrir);
    g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(ev); } });
  }
  svg.addEventListener('click', () => { cerrarDetalle(); enfocar(null); });

  lienzo.append(svg);
  enfocar(claveSel());
  dibujarLeyenda([...new Set(empresas.map(e => e.tipo))].sort((a, b) => ordenTipos.indexOf(a) - ordenTipos.indexOf(b)));
}

// ------------------------------------------------------------ listas

$('buscar-empresa').addEventListener('input', () => dibujarEmpresas());
$('incluir-otros-lista').addEventListener('change', () => dibujarEmpresas());
$('buscar-sitio').addEventListener('input', () => dibujarSitios());

function dibujarEmpresas() {
  const filtro = $('buscar-empresa').value.trim().toLowerCase();
  const lista = empresasVisibles($('incluir-otros-lista').checked)
    .filter(e => !filtro || e.nombre.toLowerCase().includes(filtro) || e.dominios.some(d => d.s.includes(filtro)))
    .sort((a, b) => b.sitios.size - a.sitios.size || b.n - a.n);
  const ol = $('lista-empresas');
  ol.replaceChildren();
  if (!lista.length) {
    ol.append(el('li', { class: 'apagado', style: { padding: '14px 0', border: 0 } },
      filtro ? 'Ninguna empresa coincide con la búsqueda.' : 'Todavía no hay empresas registradas.'));
    return;
  }
  for (const e of lista) {
    const socios = new Set([...e.salida, ...e.entrada].filter(x => FUERTES.has(x.tipo)).map(x => (x.desde === e ? x.hacia : x.desde).clave));
    ol.append(el('li', {}, el('button', { class: 'fila', type: 'button', onclick: () => abrirDetalle({ tipo: 'empresa', clave: e.clave }) },
      el('span', {},
        el('span', { class: 'titulo' }, e.nombre),
        el('span', { class: 'sub', style: { display: 'block' } }, puntoTipo(e.tipo), TIPOS[e.tipo].nombre)),
      el('span', {},
        el('span', { class: 'sub' },
          e.sitios.size ? `Te vio en ${plural(e.sitios.size, 'sitio', 'sitios')}` : 'Solo aparece pasando datos a otra empresa',
          socios.size ? el('span', { class: 'rojo' }, `. Se pasó identificadores con ${plural(socios.size, 'empresa', 'empresas')}`) : '',
          '.'),
        etiquetasDatos(e.datos)))));
  }
}

function dibujarSitios() {
  const filtro = $('buscar-sitio').value.trim().toLowerCase();
  const lista = [...modelo.sitios.values()]
    .filter(s => !filtro || s.s.includes(filtro))
    .sort((a, b) => b.empresas.size - a.empresas.size || (b.visitas || 0) - (a.visitas || 0));
  const ol = $('lista-sitios');
  ol.replaceChildren();
  if (!lista.length) {
    ol.append(el('li', { class: 'apagado', style: { padding: '14px 0', border: 0 } },
      filtro ? 'Ningún sitio coincide con la búsqueda.' : 'Todavía no hay sitios registrados.'));
    return;
  }
  for (const s of lista) {
    const emps = [...s.empresas].map(c => modelo.empresas.get(c)).filter(e => e?.rastrea).sort((a, b) => b.sitios.size - a.sitios.size);
    const nombres = emps.slice(0, 5).map(e => e.nombre).join(', ') + (emps.length > 5 ? ` y ${emps.length - 5} más` : '');
    ol.append(el('li', {}, el('button', { class: 'fila', type: 'button', onclick: () => abrirDetalle({ tipo: 'sitio', clave: s.s }) },
      el('span', {},
        el('span', { class: 'titulo' }, s.s),
        el('span', { class: 'sub', style: { display: 'block' } }, s.visitas ? `Lo visitaste ${plural(s.visitas, 'vez', 'veces')}` : '')),
      el('span', {},
        el('span', { class: 'sub' }, emps.length ? `Envió datos a ${plural(emps.length, 'empresa que rastrea', 'empresas que rastrean')}: ` : 'No envió datos a empresas de rastreo.'),
        emps.length ? el('span', {}, nombres) : ''))));
  }
}

// ------------------------------------------------------------ detalle

function cerrarDetalle() {
  seleccion = null;
  $('detalle').hidden = true;
  $('detalle').replaceChildren();
  document.querySelector('.cuerpo').classList.remove('con-detalle');
}

function abrirDetalle(sel) {
  seleccion = sel;
  const panel = $('detalle');
  panel.replaceChildren(el('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar detalle', onclick: () => { cerrarDetalle(); if (vistaActual() === 'mapa') dibujarMapa(); } }, '×'));
  const contenido = sel.tipo === 'empresa' ? detalleEmpresa(modelo.empresas.get(sel.clave)) : detalleSitio(modelo.sitios.get(sel.clave));
  if (!contenido) { cerrarDetalle(); return; }
  panel.append(...contenido);
  panel.hidden = false;
  document.querySelector('.cuerpo').classList.add('con-detalle');
  panel.scrollTop = 0;
  if (window.innerWidth <= 900) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const irA = sel => el('button', { class: 'enlace-empresa', type: 'button', onclick: () => abrirDetalleYMapa(sel) },
  sel.tipo === 'empresa' ? modelo.empresas.get(sel.clave)?.nombre || sel.clave : sel.clave);

function abrirDetalleYMapa(sel) {
  abrirDetalle(sel);
  if (vistaActual() === 'mapa') dibujarMapa();
}

function chipsSitios(lista) {
  return el('ul', { class: 'chips' }, lista.map(s => el('li', {},
    el('button', { type: 'button', onclick: () => abrirDetalleYMapa({ tipo: 'sitio', clave: s }) }, s))));
}

function detalleEmpresa(e) {
  if (!e) return null;
  $('detalle').style.setProperty('--tipo', TIPOS[e.tipo].color);
  const totalSitios = [...modelo.sitios.values()].filter(s => s.visitas).length;
  const partes = [
    el('h2', {}, e.nombre),
    el('p', { class: 'tipo-linea' }, puntoTipo(e.tipo), TIPOS[e.tipo].nombre, e.conocida ? '' : ' (no aparece en la lista de empresas conocidas)'),
    el('p', { class: 'apagado pequeno' }, TIPOS[e.tipo].texto),
  ];
  if (e.sitios.size) {
    partes.push(el('p', {}, totalSitios <= 1 || e.sitios.size > totalSitios
      ? `Te vio en ${plural(e.sitios.size, 'sitio', 'sitios')}.`
      : `Te vio en ${e.sitios.size.toLocaleString('es-CL')} de los ${totalSitios.toLocaleString('es-CL')} sitios que visitaste.`));
  }
  if (e.disfrazado) {
    partes.push(el('p', {}, el('mark', {}, 'Se disfrazó de sitio propio:'),
      ' algunas peticiones fueron a una dirección del mismo sitio que en realidad pertenece a esta empresa. Es una forma de evitar los bloqueadores de rastreo.'));
  }

  // Qué observó dentro de la página
  const lecturas = Object.entries(e.obs).filter(([q]) => q.startsWith('lectura:'));
  const escuchas = Object.keys(OBSERVA).filter(q => e.obs[q]);
  const lineasTiempo = [];
  if (e.tiempoMs >= 1000) lineasTiempo.push(`que estuviste ${duracion(e.tiempoMs)} activo en sus sitios`);
  if (e.scrollMax) lineasTiempo.push(`hasta dónde bajaste en cada página (hasta el ${e.scrollMax}%)`);
  if (lecturas.length || escuchas.length || lineasTiempo.length) {
    partes.push(el('h3', {}, 'Qué observa de ti en la página'));
    const lista = el('ul', { class: 'recibido' });
    for (const [q, n] of lecturas) {
      const campo = CAMPOS[q.slice(8)] || CAMPOS.otro;
      lista.append(el('li', {},
        el('div', {}, el('span', { class: 'que rojo' }, `Leyó lo que escribiste en ${campo}`), el('span', { class: 'cuanto' }, ` en ${plural(n, 'visita', 'visitas')}`)),
        el('p', { class: 'explica' }, DATOS.escritura.texto, ' Huella no guarda lo que escribiste, solo que fue leído.'),
        e.obsSitios[q]?.length ? chipsSitios(e.obsSitios[q]) : null));
    }
    for (const q of escuchas) {
      lista.append(el('li', {},
        el('div', {}, el('span', { class: 'que' }, OBSERVA[q].nombre), el('span', { class: 'cuanto' }, ` en ${plural(e.obs[q], 'visita', 'visitas')}`)),
        el('p', { class: 'explica' }, OBSERVA[q].texto)));
    }
    if (lineasTiempo.length) {
      lista.append(el('li', {}, el('div', {}, el('span', { class: 'que' }, 'Tiempo en la página')),
        el('p', { class: 'explica' }, `Le informaron ${unir(lineasTiempo)}.`)));
    }
    partes.push(lista);
    if (escuchas.length) {
      partes.push(el('p', { class: 'apagado pequeno' }, 'Escuchar no siempre significa enviar: Huella ve que su script recibe estos eventos, pero no puede ver qué hace con ellos si los envía comprimidos.'));
    }
  }
  if (e.bytes) partes.push(el('p', { class: 'apagado pequeno' }, `En total le enviaste ${peso(e.bytes)} en ${plural(e.n, 'envío', 'envíos')}.`));

  // Qué recibió
  const cats = ORDEN_DATOS.filter(c => e.datos[c] && !OBSERVADO.has(c));
  if (cats.length) {
    partes.push(el('h3', {}, 'Qué recibió'));
    partes.push(el('ul', { class: 'recibido' }, cats.map(c => el('li', {},
      el('div', {}, el('span', { class: 'que' }, DATOS[c].nombre), el('span', { class: 'cuanto' }, ` en ${plural(e.datos[c], 'envío', 'envíos')}`)),
      el('p', { class: 'explica' }, DATOS[c].texto),
      (e.ej[c] || []).slice(0, 3).map(m => el('div', { class: 'muestra' },
        el('code', {}, m.campo), ' ', el('mark', {}, m.valor),
        el('div', { class: 'apagado' }, `${m.nota ? m.nota + ', e' : 'E'}nviado desde ${m.sitio}`)))))));
  } else if (e.sitios.size) {
    partes.push(el('p', { class: 'apagado' }, 'No se vio ningún dato tuyo en lo que recibió, aparte de lo que recibe cualquier servidor (tu IP, navegador y el sitio).'));
  }

  // Cookies
  const cookies = Object.keys(e.cookies);
  const duraciones = Object.values(e.duracion);
  if (cookies.length || duraciones.length) {
    partes.push(el('h3', {}, 'Sus cookies en tu navegador'));
    if (cookies.length) partes.push(el('p', {}, 'Le llegaron estas cookies con identificadores: ', cookies.slice(0, 12).map((c, i) => [i ? ', ' : '', el('code', {}, c)]), '.'));
    const max = Math.max(0, ...duraciones);
    if (max) partes.push(el('p', {}, 'Las que guarda duran hasta ', el('mark', {}, plural(max, 'día', 'días')), max >= 365 ? ` (más de ${plural(Math.floor(max / 365), 'año', 'años')}).` : '.'));
    const zona = el('div', {});
    partes.push(el('button', { type: 'button', onclick: ev => verCookies(e, zona, ev.currentTarget) }, 'Ver las que tiene guardadas ahora'), zona);
  }

  // Huella digital
  const tecnicas = Object.keys(e.tecnicas);
  if (tecnicas.length || e.huellaDDG >= 2) {
    partes.push(el('h3', {}, 'Huella digital'));
    if (tecnicas.length) {
      partes.push(el('ul', {}, tecnicas.map(t => el('li', {}, el('strong', {}, TECNICAS[t]?.nombre || t), ': ', TECNICAS[t]?.texto || ''))));
    }
    if (e.huellaDDG >= 2) {
      partes.push(el('p', { class: 'apagado pequeno' }, `DuckDuckGo la califica con uso ${e.huellaDDG === 3 ? 'alto' : 'medio'} de técnicas de huella digital (${e.huellaDDG} de 3).`));
    }
  }

  // Con quién comparte
  if (e.salida.length || e.entrada.length) {
    partes.push(el('h3', {}, 'Con quién se pasa datos'));
    const ordenar = l => [...l].sort((a, b) => FUERTES.has(b.tipo) - FUERTES.has(a.tipo) || b.n - a.n);
    const lineas = [];
    for (const x of ordenar(e.salida)) {
      lineas.push(el('li', {}, el('span', { class: FUERTES.has(x.tipo) ? 'rojo' : '' }, frase(x, 'salida')), ' ', irA({ tipo: 'empresa', clave: x.hacia.clave }),
        el('span', { class: 'apagado pequeno' }, ` (${plural(x.n, 'vez', 'veces')}, en ${plural(x.sitios.size, 'sitio', 'sitios')})`),
        el('div', { class: 'apagado pequeno' }, ENLACES[x.tipo].texto)));
    }
    for (const x of ordenar(e.entrada)) {
      lineas.push(el('li', {}, el('span', { class: FUERTES.has(x.tipo) ? 'rojo' : '' }, frase(x, 'entrada')), ' ', irA({ tipo: 'empresa', clave: x.desde.clave }),
        el('span', { class: 'apagado pequeno' }, ` (${plural(x.n, 'vez', 'veces')}, en ${plural(x.sitios.size, 'sitio', 'sitios')})`)));
    }
    partes.push(el('ul', { class: 'compartio' }, lineas));
  }

  if (e.sitios.size) {
    partes.push(el('h3', {}, 'Dónde te vio'));
    partes.push(chipsSitios([...e.sitios.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 60)));
  }

  partes.push(el('h3', {}, 'Sus dominios'));
  partes.push(el('p', { class: 'pequeno' }, e.dominios.map((d, i) => [i ? ', ' : '', el('code', {}, d.s), d.n ? el('span', { class: 'apagado' }, ` (${d.n})`) : ''])));
  if (e.politica) {
    partes.push(el('p', {}, el('a', { href: e.politica, target: '_blank', rel: 'noopener noreferrer' }, `Política de privacidad de ${e.nombre}`)));
  }
  return partes;
}

function frase(x, sentido) {
  const t = {
    'id-universal': ['Le entregó tu identificador a', 'Recibió tu identificador de'],
    sincronizacion: ['Sincronizó identificadores con', 'Sincronizó identificadores con'],
    'mismo-id': ['Recibió el mismo identificador que', 'Recibió el mismo identificador que'],
    redireccion: ['Te redirigió a', 'Recibió una redirección de'],
    llamada: ['Llamó desde su espacio a', 'Fue llamada desde el espacio de'],
  }[x.tipo] || ['Se conectó con', 'Se conectó con'];
  return sentido === 'salida' ? t[0] : t[1];
}

async function verCookies(e, zona, boton) {
  boton.disabled = true;
  const cookies = [];
  for (const d of e.dominios) {
    try { cookies.push(...await chrome.cookies.getAll({ domain: d.s })); } catch { /* sin permiso para ese dominio */ }
  }
  zona.replaceChildren();
  if (!cookies.length) {
    zona.append(el('p', { class: 'apagado' }, 'Ahora no tiene cookies guardadas en tu navegador.'));
    return;
  }
  cookies.sort((a, b) => (b.expirationDate || 0) - (a.expirationDate || 0));
  zona.append(el('p', { class: 'pequeno apagado' }, `${plural(cookies.length, 'cookie guardada', 'cookies guardadas')}. El valor se oculta.`),
    el('ul', { class: 'pequeno' }, cookies.slice(0, 40).map(c => el('li', {}, el('code', {}, c.name), ` en ${c.domain.replace(/^\./, '')}, `,
      c.expirationDate ? `dura hasta el ${new Date(c.expirationDate * 1000).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'se borra al cerrar el navegador'))));
}

function detalleSitio(s) {
  if (!s) return null;
  $('detalle').style.setProperty('--tipo', 'var(--grafito)');
  const partes = [el('h2', {}, s.s)];
  if (s.visitas) partes.push(el('p', { class: 'tipo-linea' }, `Lo visitaste ${plural(s.visitas, 'vez', 'veces')}; la última, el ${fecha(s.ultimo)}.`));

  const filas = [];
  for (const [tercero, x] of Object.entries(s.terc || {})) {
    const emp = [...modelo.empresas.values()].find(e => e.dominios.some(d => d.s === tercero));
    filas.push({ emp, tercero, datos: x.d, n: x.n });
  }
  const porEmpresa = new Map();
  for (const f of filas) {
    const clave = f.emp ? f.emp.clave : f.tercero;
    const acc = porEmpresa.get(clave) || { emp: f.emp, datos: {}, n: 0 };
    for (const [c, n] of Object.entries(f.datos)) acc.datos[c] = (acc.datos[c] || 0) + n;
    acc.n += f.n;
    porEmpresa.set(clave, acc);
  }
  const lista = [...porEmpresa.values()].filter(x => x.emp?.rastrea).sort((a, b) => Object.keys(b.datos).length - Object.keys(a.datos).length || b.n - a.n);
  const otras = [...porEmpresa.values()].filter(x => !x.emp?.rastrea);

  partes.push(el('h3', {}, lista.length ? `Le envió datos a ${plural(lista.length, 'empresa que rastrea', 'empresas que rastrean')}` : 'No le envió datos a empresas de rastreo'));
  partes.push(el('ul', { class: 'recibido' }, lista.map(x => el('li', {},
    el('div', {}, puntoTipo(x.emp.tipo), irA({ tipo: 'empresa', clave: x.emp.clave }), el('span', { class: 'cuanto' }, ` ${TIPOS[x.emp.tipo].nombre.toLowerCase()}`)),
    etiquetasDatos(x.datos)))));
  if (otras.length) {
    partes.push(el('p', { class: 'apagado pequeno' }, 'También pidió archivos a: ', otras.map(x => x.emp ? x.emp.nombre : '').filter(Boolean).concat(
      [...porEmpresa.entries()].filter(([, x]) => !x.emp).map(([k]) => k)).join(', '), '.'));
  }

  const propia = Object.keys(s.propia || {});
  if (propia.length) {
    partes.push(el('h3', {}, 'Huella digital del propio sitio'));
    partes.push(el('ul', {}, propia.map(t => el('li', {}, el('strong', {}, TECNICAS[t]?.nombre || t), ': ', TECNICAS[t]?.texto || ''))));
  }

  const aqui = modelo.enlaces.filter(x => x.sitios.has(s.s));
  if (aqui.length) {
    partes.push(el('h3', {}, 'Lo que se pasaron aquí'));
    partes.push(el('ul', { class: 'compartio' }, aqui.sort((a, b) => FUERTES.has(b.tipo) - FUERTES.has(a.tipo)).slice(0, 30).map(x => el('li', {},
      irA({ tipo: 'empresa', clave: x.desde.clave }), ' ', el('span', { class: FUERTES.has(x.tipo) ? 'rojo' : '' }, frase(x, 'salida').replace(/^./, c => c.toLowerCase())), ' ',
      irA({ tipo: 'empresa', clave: x.hacia.clave })))));
  }
  return partes;
}

// ------------------------------------------------------------ textos y ajustes

function dibujarLimites() {
  $('siempre').replaceChildren(...SIEMPRE.flatMap(([a, b]) => [el('dt', {}, a), el('dd', {}, b)]));
  $('fuente-lista').replaceChildren(
    'Las empresas y sus dominios vienen de la lista pública de rastreadores de DuckDuckGo (actualizada el ', FECHA_LISTA, '), ',
    'con licencia Creative Commons BY-NC-SA 4.0, más ajustes propios de Huella. Si un dominio no está en la lista, aparece con su nombre y como "desconocida".');
}

function dibujarAjustes() {
  const a = { pausa: false, dias: 30, ...modelo.ajustes };
  $('estado-registro').textContent = a.pausa
    ? 'En pausa: no se está anotando nada nuevo.'
    : 'Activo: se anota a quién le envían datos las páginas que visitas.';
  $('alternar-pausa').textContent = a.pausa ? 'Reanudar el registro' : 'Pausar el registro';
  $('dias').value = String(a.dias);
}

async function cambiarAjustes(cambios) {
  await chrome.runtime.sendMessage({ tipo: 'ajustes', ajustes: cambios });
  modelo.ajustes = { ...modelo.ajustes, ...cambios };
  dibujarAjustes();
}

$('alternar-pausa').addEventListener('click', () => cambiarAjustes({ pausa: !modelo.ajustes.pausa }));
$('dias').addEventListener('change', () => cambiarAjustes({ dias: Number($('dias').value) }));

$('exportar').addEventListener('click', async () => {
  const todo = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(todo, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `huella-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  $('confirmacion').textContent = 'Archivo descargado.';
});

$('borrar').addEventListener('click', async () => {
  if (!confirm('¿Borrar todo lo registrado? No se puede deshacer.')) return;
  await chrome.runtime.sendMessage({ tipo: 'borrar' });
  $('confirmacion').textContent = 'Se borró todo lo registrado.';
  await cargar();
});

cargar();
