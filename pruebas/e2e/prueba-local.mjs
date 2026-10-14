// Prueba completa de Huella en un Chromium real, SIN internet y SIN datos de nadie.
//
// - Todos los dominios (incluidos los de empresas reales) se redirigen a este computador
//   con --host-resolver-rules, así que ninguna petición sale a internet.
// - Un servidor local hace de sitio y de "rastreadores" falsos.
// - Todos los valores son inventados (ID-DE-PRUEBA…). No se simulan correos ni teléfonos.
//
// Uso: npm install && npx playwright install chromium && node pruebas/e2e/prueba-local.mjs
import { chromium } from 'playwright';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// EXTENSION=<carpeta> permite probar otra copia, por ejemplo una recién clonada.
const EXTENSION = resolve(process.env.EXTENSION || new URL('../..', import.meta.url).pathname);
const CAPTURAS = process.env.CAPTURAS || join(tmpdir(), 'huella-capturas');
mkdirSync(CAPTURAS, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'huella-prueba-'));

// Certificado propio para HTTPS local (las cookies de terceros necesitan HTTPS).
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=prueba',
  '-keyout', join(tmp, 'clave.pem'), '-out', join(tmp, 'cert.pem')], { stdio: 'ignore' });

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const UID_PRUEBA = 'PRUEBA9x8y7z6';
const COOKIE_PRUEBA = '8473625172635482736';

let PUERTO = 0;
const u = (host, ruta) => `https://${host}:${PUERTO}${ruta}`;

function pagina() {
  return `<!doctype html><meta charset="utf-8"><title>Página de prueba</title>
<h1>Página de prueba de Huella</h1>
<p>Esta página es local y falsa. Simula un sitio con rastreadores, con valores inventados.</p>
<form onsubmit="return false"><input type="email" name="correo" id="correo" placeholder="Correo"></form>
<div style="height: 2000px"></div>
<script>
// El propio sitio escucha sus clics y lee su formulario: eso es normal y no debe aparecer.
document.addEventListener('click', () => {});
document.getElementById('correo').addEventListener('input', e => { document.body.dataset.largo = e.target.value.length; });
const cargar = src => new Promise(ok => { const i = new Image(); i.onload = i.onerror = ok; i.src = src; });
(async () => {
  const aqui = encodeURIComponent(location.href);
  // Google Analytics: página, título, pantalla, evento e identificadores.
  await cargar('${u('www.google-analytics.com', '/g/collect')}?v=2&tid=G-PRUEBA&cid=1234567890.1700000000&uid=${UID_PRUEBA}&dl=' + aqui + '&dt=P%C3%A1gina%20de%20prueba&sr=1366x768&ul=es-cl&en=page_view');
  // Meta: evento y el mismo identificador inventado (para probar "recibieron el mismo identificador").
  await cargar('${u('www.facebook.com', '/tr')}?id=000000&ev=PageView&dl=' + aqui + '&external_id=${UID_PRUEBA}');
  // Microsoft (Xandr) guarda una cookie, luego la recibe y la sincroniza con The Trade Desk.
  await cargar('${u('ib.adnxs.com', '/setuid')}');
  await cargar('${u('ib.adnxs.com', '/px')}?pagina=1');
  await cargar('${u('ib.adnxs.com', '/getuid')}');
  // Una subasta que entrega un identificador universal de ID5.
  await fetch('${u('prebid.adnxs.com', '/pbs')}', { method: 'POST', headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ user: { ext: { eids: [{ source: 'id5-sync.com', uids: [{ id: 'ID5-ID-DE-PRUEBA-123abc' }] }] } } }) }).catch(() => {});
  // Un anuncio de Google que dentro de su recuadro llama a Microsoft.
  const f = document.createElement('iframe');
  f.src = '${u('securepubads.g.doubleclick.net', '/marco')}';
  document.body.append(f);
  // Google Analytics 4: tiempo activo (100 s + 33 s) y hasta dónde bajaste.
  await fetch('${u('region1.google-analytics.com', '/g/collect')}?v=2&cid=1234567890.1700000000', { method: 'POST',
    body: 'en=user_engagement&_et=100000\\nen=scroll&epn.percent_scrolled=90&_et=33000' }).catch(() => {});
  // Grabación de sesión y huella digital.
  for (const src of ['${u('static.hotjar.com', '/c.js')}', '${u('api.fpjs.io', '/fp.js')}']) {
    const s = document.createElement('script'); s.src = src; document.body.append(s);
  }
  setTimeout(() => { document.title = 'listo'; }, 1500);
})();
</script>`;
}

// Una "grabación de sesión" falsa: escucha mouse, teclas, desplazamiento y cambios de pestaña,
// lee el campo de correo cuando lo dejas (sin enviarlo a ningún lado) y manda paquetes de relleno.
const grabacionJs = () => `
(() => {
  const nada = () => {};
  document.addEventListener('mousemove', nada);
  document.addEventListener('keydown', nada);
  window.addEventListener('scroll', nada);
  document.addEventListener('visibilitychange', nada);
  const campo = document.getElementById('correo');
  if (campo) campo.addEventListener('change', () => { const leido = campo.value; void leido; });
  let n = 0;
  const t = setInterval(() => {
    fetch('${u('in.hotjar.com', '/api/v2/client/ws')}', { method: 'POST', body: 'x'.repeat(6000) }).catch(nada);
    if (++n >= 4) clearInterval(t);
  }, 300);
})();`;

const FP_JS = `
(() => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 40;
  const x = c.getContext('2d'); x.font = '16px Arial'; x.fillText('prueba', 2, 20); c.toDataURL();
  const g = document.createElement('canvas').getContext('webgl');
  if (g) g.getParameter(37446);
  try { new OfflineAudioContext(1, 44100, 44100); } catch (e) {}
})();`;

const servidor = https.createServer({ key: readFileSync(join(tmp, 'clave.pem')), cert: readFileSync(join(tmp, 'cert.pem')) }, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const ruta = req.url.split('?')[0];
  const gif = (extra = {}) => { res.writeHead(200, { 'content-type': 'image/gif', ...extra }); res.end(GIF); };
  res.setHeader('access-control-allow-origin', '*');
  if (host === 'sitio-prueba.test') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(pagina()); }
  if (host === 'otro-sitio.test') {
    // Un segundo sitio con los mismos rastreadores: así se ve que te siguen de un sitio a otro.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><title>Otro sitio</title><p>Otro sitio falso.</p>
<img src="${u('ib.adnxs.com', '/px')}?otro=1"><img src="${u('www.google-analytics.com', '/g/collect')}?v=2&cid=1234567890.1700000000&en=page_view">`);
  }
  if (host === 'ib.adnxs.com' && ruta === '/setuid') {
    return gif({ 'set-cookie': `uuid2=${COOKIE_PRUEBA}; Max-Age=7776000; Path=/; SameSite=None; Secure` });
  }
  if (host === 'ib.adnxs.com' && ruta === '/getuid') {
    res.writeHead(302, { location: u('match.adsrvr.org', `/track/cmf/generic?ttd_pid=appnexus&ttd_puid=${COOKIE_PRUEBA}`) });
    return res.end();
  }
  if (host === 'securepubads.g.doubleclick.net' && ruta === '/marco') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(`<!doctype html><p>anuncio falso</p><img src="${u('ib.adnxs.com', '/px')}?desde=anuncio">`);
  }
  if (ruta.endsWith('.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(host === 'api.fpjs.io' ? FP_JS : grabacionJs());
  }
  if (req.method === 'POST' || req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  return gif();
});

await new Promise(ok => servidor.listen(0, '127.0.0.1', ok));
PUERTO = servidor.address().port;

const perfil = join(tmp, 'perfil');
const contexto = await chromium.launchPersistentContext(perfil, {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1360, height: 1000 },
  ignoreHTTPSErrors: true,
  args: [
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
    '--host-resolver-rules=MAP * 127.0.0.1',   // nada sale a internet
    '--ignore-certificate-errors',
    '--no-proxy-server',
  ],
});

let fallos = 0;
const revisar = (nombre, fn) => {
  try { fn(); console.log('ok   ', nombre); } catch (e) { fallos++; console.log('FALLA', nombre, '\n      ', e.message.split('\n')[0]); }
};

try {
  let [sw] = contexto.serviceWorkers();
  if (!sw) sw = await contexto.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  // Recién instalada, la extensión tarda un momento en empezar a escuchar.
  await sw.evaluate(() => true);
  await new Promise(ok => setTimeout(ok, 1500));

  const pag = await contexto.newPage();
  await pag.goto(u('sitio-prueba.test', '/'));
  await pag.waitForFunction(() => document.title === 'listo', null, { timeout: 15000 });
  // Lo que haría una persona: mover el mouse, escribir un texto inventado, salir del campo y bajar.
  const interactuar = async () => {
    await pag.mouse.move(80, 80);
    await pag.mouse.move(420, 260, { steps: 8 });
    await pag.click('#correo');
    await pag.keyboard.type('texto-de-prueba');
    await pag.keyboard.press('Tab');
    await pag.mouse.wheel(0, 500);
    await pag.waitForTimeout(1500);
  };
  await interactuar();
  const largo = await pag.evaluate(() => document.body.dataset.largo);
  await pag.goto(u('otro-sitio.test', '/'));
  await pag.waitForTimeout(2500);   // el registro se guarda cada segundo

  const datos = await sw.evaluate(() => chrome.storage.local.get(null));
  const t = s => datos['t:' + s] || {};
  const enlace = (a, b, tipo) => datos[`e:${a}>${b}>${tipo}`];

  revisar('se anotaron las visitas', () => {
    assert.equal(datos['p:sitio-prueba.test']?.visitas, 1);
    assert.equal(datos['p:otro-sitio.test']?.visitas, 1);
  });
  revisar('Google Analytics: página, título, equipo, acciones e identificador', () => {
    for (const c of ['pagina', 'titulo', 'dispositivo', 'acciones', 'identificador']) assert.ok(t('google-analytics.com').datos?.[c], c);
  });
  revisar('los identificadores se guardan recortados', () => {
    const ej = t('google-analytics.com').ej.identificador.map(x => x.valor).join(' ');
    assert.ok(!ej.includes('1234567890.1700000000') && !ej.includes(UID_PRUEBA), ej);
  });
  revisar('Microsoft recibió su cookie y se anotó cuánto dura (90 días)', () => {
    assert.ok(t('adnxs.com').datos?.cookie, 'sin cookie');
    assert.equal(t('adnxs.com').duracion?.uuid2, 90);
  });
  revisar('sincronización de cookies Microsoft → The Trade Desk', () => assert.ok(enlace('adnxs.com', 'adsrvr.org', 'sincronizacion')));
  revisar('la sincronización no se cuenta dos veces', () => assert.ok(!enlace('adnxs.com', 'adsrvr.org', 'mismo-id')));
  revisar('Microsoft te reconoce en los dos sitios con su cookie', () => {
    assert.deepEqual(Object.keys(t('adnxs.com').sitios).sort(), ['otro-sitio.test', 'sitio-prueba.test']);
  });
  revisar('identificador universal ID5 → Microsoft', () => assert.ok(enlace('id5-sync.com', 'adnxs.com', 'id-universal')));
  revisar('llamada desde el recuadro de Google a Microsoft', () => assert.ok(enlace('doubleclick.net', 'adnxs.com', 'llamada')));
  revisar('Google y Meta recibieron el mismo identificador', () => assert.ok(enlace('google-analytics.com', 'facebook.com', 'mismo-id')));
  revisar('grabación de sesión (Hotjar)', () => assert.ok(t('hotjar.com').datos?.grabacion));
  revisar('la página sigue funcionando (leyó su propio campo)', () => assert.equal(largo, '15'));
  revisar('la grabación escucha mouse, teclas, desplazamiento y cambios de pestaña', () => {
    for (const q of ['mouse', 'teclas', 'desplazamiento', 'atencion']) assert.ok(t('hotjar.com').obs?.[q], q);
  });
  revisar('la grabación leyó el campo de correo', () => assert.ok(t('hotjar.com').obs?.['lectura:correo']));
  revisar('lo que hace el propio sitio no se cuenta', () => {
    assert.ok(!datos['t:sitio-prueba.test']);
    assert.ok(!datos['p:sitio-prueba.test'].propia);
  });
  revisar('se midió lo que envió la grabación', () => assert.ok(t('hotjar.com').bytes > 20000, String(t('hotjar.com').bytes)));
  revisar('tiempo activo y desplazamiento informados a Google', () => {
    assert.equal(t('google-analytics.com').tiempoMs, 133000);
    assert.equal(t('google-analytics.com').scrollMax, 90);
  });
  const sesion = await sw.evaluate(() => chrome.storage.session.get(null));
  revisar('lo que escribiste nunca se guarda', () => {
    const todo = JSON.stringify(datos) + JSON.stringify(sesion);
    assert.ok(!todo.includes('texto-de-prueba'));
    assert.ok(!todo.includes('xxxxxxxx'));
  });
  revisar('huella digital: dibujo, tarjeta gráfica y audio', () => {
    for (const x of ['canvas', 'webgl', 'audio']) assert.ok(t('fpjs.io').tecnicas?.[x], x);
  });

  // La extensión no puede conectarse a internet: su política lo prohíbe.
  const conexion = await sw.evaluate(async url => {
    try { await fetch(url); return 'conectó'; } catch (e) { return 'bloqueada'; }
  }, u('sitio-prueba.test', '/'));
  revisar('la extensión no puede abrir conexiones', () => assert.equal(conexion, 'bloqueada'));

  // Capturas de las pantallas.
  await pag.goto(u('sitio-prueba.test', '/'));
  await pag.waitForFunction(() => document.title === 'listo', null, { timeout: 15000 });
  await interactuar();
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: '*://sitio-prueba.test/*' }))[0]?.id);
  const ventana = await contexto.newPage();
  await ventana.setViewportSize({ width: 380, height: 640 });
  await ventana.goto(`chrome-extension://${id}/ui/ventana.html?tab=${tabId}`);
  await ventana.waitForTimeout(600);
  const textoVentana = await ventana.textContent('body');
  revisar('la ventana muestra las empresas', () => assert.ok(/Google/.test(textoVentana) && /Microsoft/.test(textoVentana), textoVentana.slice(0, 200)));
  revisar('la ventana cuenta lo que observan', () => {
    assert.ok(textoVentana.includes('Leyó lo que escribiste en un campo de correo'), textoVentana.slice(0, 400));
    assert.ok(textoVentana.includes('movimientos del mouse'));
    assert.ok(textoVentana.includes('2 min 13 s'));
  });
  await ventana.screenshot({ path: join(CAPTURAS, 'ventana.png'), fullPage: true });

  // Panel lateral en vivo: debe actualizarse solo cuando llegan datos nuevos.
  const panel = await contexto.newPage();
  await panel.setViewportSize({ width: 400, height: 1000 });
  await panel.goto(`chrome-extension://${id}/ui/panel.html?tab=${tabId}`);
  await panel.waitForSelector('.vivo li');
  await pag.evaluate(src => fetch(src, { method: 'POST', body: 'en=user_engagement&_et=5000' }), u('region1.google-analytics.com', '/g/collect?v=2'));
  let enVivo = true;
  try { await panel.waitForFunction(() => document.body.textContent.includes('2 min 18 s'), null, { timeout: 5000 }); } catch { enVivo = false; }
  revisar('el panel se actualiza en vivo', () => assert.ok(enVivo));
  await panel.screenshot({ path: join(CAPTURAS, 'panel.png'), fullPage: true });

  const mapa = await contexto.newPage();
  const errores = [];
  mapa.on('pageerror', e => errores.push(e.message));
  await mapa.goto(`chrome-extension://${id}/ui/mapa.html#mapa`);
  await mapa.waitForSelector('#lienzo svg');
  await mapa.screenshot({ path: join(CAPTURAS, 'mapa.png'), fullPage: true });
  await mapa.click('.nodo.empresa[aria-label="Empresa Hotjar"] circle');
  await mapa.waitForTimeout(300);
  const detalleHotjar = await mapa.textContent('#detalle');
  revisar('el mapa explica lo que observa la grabación', () => {
    assert.ok(detalleHotjar.includes('Qué observa de ti en la página'));
    assert.ok(detalleHotjar.includes('Teclas que presionas'));
  });
  await mapa.screenshot({ path: join(CAPTURAS, 'mapa-hotjar.png'), fullPage: true });
  await mapa.click('.nodo.empresa[aria-label="Empresa Microsoft"] circle');
  await mapa.waitForTimeout(300);
  await mapa.screenshot({ path: join(CAPTURAS, 'mapa-microsoft.png'), fullPage: true });
  await mapa.click('#detalle button:has-text("Ver las que tiene guardadas ahora")');
  await mapa.waitForTimeout(300);
  const detalle = await mapa.textContent('#detalle');
  revisar('el detalle muestra la cookie guardada', () => assert.ok(detalle.includes('uuid2'), detalle.slice(0, 300)));
  await mapa.goto(`chrome-extension://${id}/ui/mapa.html#empresas`);
  await mapa.waitForTimeout(300);
  await mapa.screenshot({ path: join(CAPTURAS, 'empresas.png'), fullPage: true });
  await mapa.goto(`chrome-extension://${id}/ui/mapa.html#sitios`);
  await mapa.click('#lista-sitios .fila');
  await mapa.waitForTimeout(300);
  await mapa.screenshot({ path: join(CAPTURAS, 'sitio.png'), fullPage: true });
  for (const vista of ['limites', 'ajustes']) {
    await mapa.goto(`chrome-extension://${id}/ui/mapa.html#${vista}`);
    await mapa.waitForTimeout(300);
    await mapa.screenshot({ path: join(CAPTURAS, `${vista}.png`), fullPage: true });
  }
  await mapa.emulateMedia({ colorScheme: 'dark' });
  await mapa.goto(`chrome-extension://${id}/ui/mapa.html#mapa`);
  await mapa.waitForSelector('#lienzo svg');
  await mapa.click('.nodo.empresa[aria-label="Empresa Google"] circle');
  await mapa.waitForTimeout(300);
  await mapa.screenshot({ path: join(CAPTURAS, 'mapa-oscuro.png'), fullPage: true });
  revisar('las pantallas no tienen errores', () => assert.deepEqual(errores, []));

  if (process.env.MOSTRAR) console.log(JSON.stringify(datos, null, 2));
} finally {
  await contexto.close();
  servidor.close();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(fallos ? `\n${fallos} prueba(s) fallaron.` : '\nTodo bien.', `Capturas en ${CAPTURAS}`);
process.exit(fallos ? 1 : 0);
