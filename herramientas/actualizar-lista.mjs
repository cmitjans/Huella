// Genera src/datos/rastreadores.js a partir de la lista pública de rastreadores de DuckDuckGo
// (https://github.com/duckduckgo/tracker-blocklists, licencia CC BY-NC-SA 4.0).
//
// Uso:
//   node herramientas/actualizar-lista.mjs                 descarga la lista y la convierte
//   node herramientas/actualizar-lista.mjs archivo.json    convierte un archivo ya descargado
//
// Solo se guarda lo que la extensión necesita: a qué empresa pertenece cada dominio, qué hace
// (publicidad, análisis…), qué tanto usa técnicas de huella digital y su política de privacidad.

import { readFile, writeFile } from 'node:fs/promises';

const URL_LISTA = 'https://raw.githubusercontent.com/duckduckgo/tracker-blocklists/main/web/v6/extension-tds.json';
const SALIDA = new URL('../src/datos/rastreadores.js', import.meta.url);

// Categorías de DuckDuckGo → categorías de Huella. Gana la primera que aparezca en esta lista.
const PRIORIDAD = [
  ['Session Replay', 'grabacion'],
  ['Advertising', 'publicidad'],
  ['Ad Motivated Tracking', 'publicidad'],
  ['Action Pixels', 'publicidad'],
  ['Social Network', 'redes'],
  ['Social - Share', 'redes'],
  ['Social - Comment', 'redes'],
  ['Federated Login', 'redes'],
  ['SSO', 'redes'],
  ['Badge', 'redes'],
  ['Analytics', 'analitica'],
  ['Audience Measurement', 'analitica'],
  ['Third-Party Analytics Marketing', 'analitica'],
  ['Tag Manager', 'analitica'],
  ['Ad Fraud', 'antifraude'],
  ['Support Chat Widget', 'atencion'],
  ['Online Payment', 'pagos'],
  ['Content Delivery', 'infraestructura'],
  ['Embedded Content', 'contenido'],
  ['Malware', 'riesgo'],
  ['Unknown High Risk Behavior', 'riesgo'],
  ['Obscure Ownership', 'desconocida'],
];

function categoria(cats, porDefecto) {
  for (const [ddg, propia] of PRIORIDAD) if (cats.includes(ddg)) return propia;
  // Sin categoría: si DuckDuckGo lo bloquea es rastreo; si no, no sabemos para qué es.
  return porDefecto === 'block' ? 'rastreo' : 'otros';
}

async function cargar() {
  const archivo = process.argv[2];
  if (archivo) return JSON.parse(await readFile(archivo, 'utf8'));
  const r = await fetch(URL_LISTA);
  if (!r.ok) throw new Error(`No se pudo descargar la lista (${r.status})`);
  return r.json();
}

const tds = await cargar();
const entidades = tds.entities || {};

// Algunas filiales aparecen por separado (Instagram, YouTube…); se agrupan bajo su dueña.
const filiales = {};
for (const t of Object.values(tds.trackers || {})) {
  if (t.owner?.ownedBy) filiales[t.owner.name] = t.owner.ownedBy;
}

const empresas = [];          // [nombre, política]
const indice = new Map();     // nombre de la entidad dueña → posición en empresas
function empresa(nombreEntidad, politica) {
  nombreEntidad = filiales[nombreEntidad] || nombreEntidad;
  if (!indice.has(nombreEntidad)) {
    const nombre = entidades[nombreEntidad]?.displayName || nombreEntidad;
    indice.set(nombreEntidad, empresas.length);
    empresas.push([nombre, politica || '']);
  }
  const i = indice.get(nombreEntidad);
  if (politica && !empresas[i][1]) empresas[i][1] = politica;
  return i;
}

const rastreadores = {};
for (const [dominio, t] of Object.entries(tds.trackers || {})) {
  const o = t.owner || {};
  const duena = o.ownedBy || o.name;
  if (!duena) continue;
  // La política de una filial vale para la dueña solo si es la misma entidad.
  const i = empresa(duena, o.ownedBy ? '' : o.privacyPolicy);
  rastreadores[dominio] = [i, categoria(t.categories || [], t.default), t.fingerprinting || 0];
}

const dominios = {};
for (const [dominio, entidad] of Object.entries(tds.domains || {})) {
  if (rastreadores[dominio]) continue;
  dominios[dominio] = empresa(entidad);
}

const cnames = {};
for (const [host, destino] of Object.entries(tds.cnames || {})) cnames[host] = destino;

const fecha = new Date().toISOString().slice(0, 10);
const texto = `// Generado por herramientas/actualizar-lista.mjs el ${fecha}. No editar a mano.
// Fuente: DuckDuckGo Tracker Blocklists (https://github.com/duckduckgo/tracker-blocklists),
// licencia Creative Commons BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/).
// Este archivo es una versión reducida de esos datos y se comparte bajo la misma licencia.
export default ${JSON.stringify({ fecha, empresas, rastreadores, dominios, cnames })};
`;
await writeFile(SALIDA, texto);
console.log(`Listo: ${Object.keys(rastreadores).length} rastreadores, ${Object.keys(dominios).length} dominios más, ` +
  `${Object.keys(cnames).length} disfrazados (CNAME), ${empresas.length} empresas.`);
