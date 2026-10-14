// Pruebas del análisis. Todos los valores son inventados: no hay datos de ninguna persona real
// y nada se envía a ningún lado. Se ejecutan con: node --test pruebas/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  sitioDe, palabras, pareceIdentificador, esHash, clasificarCampo, analizarPeticion,
  camposDe, partesId, idsDeCookie, duracionCookie, llevaIdentificador, mostrar, resumen,
} from '../src/analisis.js';
import { empresaDe } from '../src/empresas.js';

test('sitio de un host o URL', () => {
  assert.equal(sitioDe('noticias.ejemplo.cl'), 'ejemplo.cl');
  assert.equal(sitioDe('https://www.ejemplo.co.uk/a?b=1'), 'ejemplo.co.uk');
  assert.equal(sitioDe('stats.g.doubleclick.net'), 'doubleclick.net');
  assert.equal(sitioDe('alguien.github.io'), 'alguien.github.io');
  assert.equal(sitioDe('127.0.0.1'), '127.0.0.1');
});

test('palabras de un nombre de campo', () => {
  assert.deepEqual(palabras('udff[em]'), ['udff', 'em']);
  assert.deepEqual(palabras('userId'), ['user', 'id']);
  assert.deepEqual(palabras('ep.page_type'), ['ep', 'page', 'type']);
});

test('qué parece identificador y qué no', () => {
  for (const si of ['GA1.1.1234567890.1700000000', '3f2a9c1e-77b0-4c1d-9e21-0a6b5c4d3e2f', 'AbCdEfGhIjKlMnOpQr', 'x9k2m4p7q1']) {
    assert.ok(pareceIdentificador(si), si);
  }
  for (const no of ['true', '1920x1080', '120.0.6099', '2026-10-14', '1760000000', '12345', 'homepage_banner', 'https://ejemplo.cl/x', 'hola mundo 12345']) {
    assert.ok(!pareceIdentificador(no), no);
  }
});

test('partes de un identificador de Google Analytics', () => {
  assert.ok(partesId('GA1.1.1234567890.1700000000').includes('1234567890.1700000000'));
});

test('cookies con varios campos: solo los que terminan en id', () => {
  assert.deepEqual(idsDeCookie('isGpcEnabled=0&datestamp=hoy&consentId=a1b2c3d4e5f6&groups=C0001:1'), ['a1b2c3d4e5f6']);
  assert.deepEqual(idsDeCookie('QWxndW5WYWxvcjEyMw=='), ['QWxndW5WYWxvcjEyMw==']);
});

test('campos conocidos de Google Analytics', () => {
  const ctx = { sitioPagina: 'ejemplo.cl' };
  assert.equal(clasificarCampo('dl', 'https://www.ejemplo.cl/articulo', ctx).categoria, 'pagina');
  assert.equal(clasificarCampo('dt', 'Un título', ctx).categoria, 'titulo');
  assert.equal(clasificarCampo('cid', '1234567890.1700000000', ctx).categoria, 'identificador');
  assert.equal(clasificarCampo('sr', '1920x1080', ctx).categoria, 'dispositivo');
  assert.equal(clasificarCampo('en', 'page_view', ctx).categoria, 'acciones');
  assert.equal(clasificarCampo('tid', 'G-PRUEBA123', ctx), null, 'la cuenta del sitio no es un dato tuyo');
});

test('URLs: la página actual cuenta, el sitio a secas no', () => {
  const ctx = { sitioPagina: 'ejemplo.cl' };
  assert.equal(clasificarCampo('url', 'https://ejemplo.cl/', ctx), null);
  assert.equal(clasificarCampo('u', 'https://ejemplo.cl/producto/42', ctx).categoria, 'pagina');
  assert.equal(clasificarCampo('ref', 'https://otro-sitio.cl/de-donde', ctx).categoria, 'origen');
  assert.equal(clasificarCampo('img', 'https://cdn.otro.cl/a.png', ctx), null);
});

test('datos personales cifrados se reconocen por forma, sin usar datos reales', () => {
  // Hash de la palabra "prueba": tiene la misma forma que un correo cifrado, sin serlo.
  const hash = createHash('sha256').update('prueba').digest('hex');
  assert.ok(esHash(hash));
  assert.equal(clasificarCampo('udff[em]', hash).categoria, 'contacto');
  assert.equal(clasificarCampo('ud[ph]', hash).categoria, 'contacto');
  assert.equal(clasificarCampo('email_optin', 'true'), null);
  assert.equal(mostrar(hash, 'contacto'), 'código de 64 caracteres');
});

test('subastas y consentimiento no cuentan como datos tuyos', () => {
  assert.equal(clasificarCampo('auctionId', '3f2a9c1e-77b0-4c1d-9e21-0a6b5c4d3e2f'), null);
  assert.equal(clasificarCampo('gdpr_consent', 'CPabcdEFGHijkLMNOPqrstUVWXyz0123'), null);
  // …salvo que el valor sea un identificador tuyo ya visto en otra empresa.
  const conocido = v => v === 'x9k2m4p7q1';
  assert.equal(clasificarCampo('bidder_uid', 'x9k2m4p7q1', { idConocido: conocido }).categoria, 'identificador');
});

test('cuerpo de Google Analytics 4: varios eventos, uno por línea', () => {
  const campos = camposDe('https://region1.google-analytics.com/g/collect?v=2&cid=111.222', { texto: 'en=scroll&epn.percent=90\nen=click' });
  assert.deepEqual(campos.filter(([k]) => k === 'en').map(([, v]) => v), ['scroll', 'click']);
});

test('valores JSON dentro de un parámetro se abren', () => {
  const campos = camposDe('https://rastreador.test/c?data=' + encodeURIComponent('{"user":{"visitor_id":"vX7k2p9QmZ"}}'));
  assert.ok(campos.some(([k, v]) => k === 'data.user.visitor_id' && v === 'vX7k2p9QmZ'));
});

test('analizar una petición completa con valores inventados', () => {
  const r = analizarPeticion({
    url: 'https://www.google-analytics.com/g/collect?v=2&tid=G-PRUEBA&cid=1234567890.1700000000&dl=' +
      encodeURIComponent('https://ejemplo.cl/noticias/una-nota') + '&dt=Una%20nota&sr=1366x768&ul=es-cl&en=page_view',
    cabeceras: [
      { name: 'Cookie', value: 'IDE=AbCdEf123456GhIjKl; consent=si; OptanonConsent=groups=C0001:1' },
      { name: 'Referer', value: 'https://ejemplo.cl/' },
    ],
    sitioPagina: 'ejemplo.cl',
  });
  assert.deepEqual(Object.keys(r.datos).sort(), ['acciones', 'cookie', 'dispositivo', 'identificador', 'pagina', 'titulo']);
  assert.deepEqual(r.cookies, ['IDE']);
  assert.ok(r.ids.includes('1234567890.1700000000'));
  assert.ok(r.ids.includes('AbCdEf123456GhIjKl'));
});

test('identificadores universales en una subasta (OpenRTB)', () => {
  const cuerpo = JSON.stringify({ user: { ext: { eids: [{ source: 'id5-sync.com', uids: [{ id: 'ID5-PRUEBA-123abc' }] }] } } });
  const r = analizarPeticion({ url: 'https://ssp.test/subasta', cuerpo: { texto: cuerpo }, sitioPagina: 'ejemplo.cl' });
  assert.deepEqual(r.eids, ['id5-sync.com']);
  assert.ok(r.datos.identificador);
});

test('duración de una cookie', () => {
  assert.equal(duracionCookie('a=b; Max-Age=31536000; Path=/'), 365);
  assert.equal(duracionCookie('a=b; Path=/'), 0);
  assert.equal(duracionCookie('a=b; expires=Thu, 14 Oct 2027 00:00:00 GMT', Date.parse('2026-10-14T00:00:00Z')), 365);
});

test('sincronización: la URL lleva un identificador', () => {
  assert.ok(llevaIdentificador('https://b.test/sync?partner_uid=AbC123xyz789'));
  assert.ok(!llevaIdentificador('https://b.test/pixel?w=1&h=1'));
});

test('resumen estable y distinto', () => {
  assert.equal(resumen('abc12345'), resumen('abc12345'));
  assert.notEqual(resumen('abc12345'), resumen('abc12346'));
});

test('empresas conocidas', () => {
  assert.equal(empresaDe('stats.g.doubleclick.net').nombre, 'Google');
  assert.equal(empresaDe('stats.g.doubleclick.net').categoria, 'publicidad');
  assert.equal(empresaDe('connect.facebook.net').nombre, 'Meta');
  assert.equal(empresaDe('ib.adnxs.com').nombre, 'Microsoft');
  assert.equal(empresaDe('www.clarity.ms').categoria, 'grabacion');
  assert.equal(empresaDe('static.hotjar.com').categoria, 'grabacion');
  assert.equal(empresaDe('id5-sync.com').categoria, 'identidad');
  assert.equal(empresaDe('fonts.gstatic.com').categoria, 'infraestructura');
  assert.equal(empresaDe('www.google.com', '/recaptcha/api.js').categoria, 'antifraude');
  assert.equal(empresaDe('www.google.com', '/pagead/1p-conversion').categoria, 'publicidad');
  assert.equal(empresaDe('sitio-que-no-existe.test'), null);
});

test('rastreadores disfrazados de subdominio propio', () => {
  // Uno de los registros CNAME de la lista: un subdominio del sitio que apunta a otra empresa.
  const e = empresaDe('s2.flylax.com');
  assert.ok(e && e.disfrazado, 'debería detectarlo como disfrazado');
});

test('tiempo activo y desplazamiento (Google Analytics 4)', async () => {
  const { duracion } = await import('../src/analisis.js');
  const r = analizarPeticion({
    url: 'https://region1.google-analytics.com/g/collect?v=2&cid=1234567890.1700000000',
    cuerpo: { texto: 'en=user_engagement&_et=100000\nen=scroll&epn.percent_scrolled=90&_et=33000' },
    sitioPagina: 'ejemplo.cl',
  });
  assert.equal(r.tiempoMs, 133000);
  assert.equal(r.scrollPct, 90);
  assert.equal(duracion(r.tiempoMs), '2 min 13 s');
  assert.ok(r.datos.atencion.some(x => x.valor === '1 min 40 s'));
  assert.ok(r.datos.atencion.some(x => x.valor === '90%'));
});

test('quién es responsable de una llamada', async () => {
  const { elegirScript } = await import('../src/empresas.js');
  // Un rastreador conocido en cualquier lugar de la pila gana.
  assert.equal(elegirScript(['https://ejemplo.cl/jquery.js', 'https://static.hotjar.com/c/hotjar.js'], 'ejemplo.cl').sitio, 'hotjar.com');
  // Una biblioteca en un CDN llamada por el propio sitio: es el sitio.
  assert.equal(elegirScript(['https://cdnjs.cloudflare.com/ajax/libs/jquery.js', 'https://ejemplo.cl/app.js'], 'ejemplo.cl').sitio, 'ejemplo.cl');
  // Un script desconocido que llama a la biblioteca del sitio: es el script desconocido (el más externo).
  assert.equal(elegirScript(['https://ejemplo.cl/jquery.js', 'https://desconocido.test/x.js'], 'ejemplo.cl').sitio, 'desconocido.test');
  // Una biblioteca de un CDN sola en la pila actúa por cuenta del sitio, no del CDN.
  assert.equal(elegirScript(['https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'], 'ejemplo.cl').sitio, 'ejemplo.cl');
  // El script de verificación de robots de Cloudflare sí es de Cloudflare.
  assert.equal(elegirScript(['https://challenges.cloudflare.com/turnstile/v0/api.js'], 'ejemplo.cl').sitio, 'cloudflare.com');
  assert.equal(elegirScript([], 'ejemplo.cl'), null);
});

test('la lista de archivos del instalador está al día', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const raiz = new URL('..', import.meta.url).pathname;
  const reales = execFileSync('git', ['ls-files', 'manifest.json', 'actualizar-huella.cmd', 'src', 'ui', 'iconos'], { cwd: raiz, encoding: 'utf8' }).trim().split('\n');
  const lista = readFileSync(new URL('../herramientas/archivos.txt', import.meta.url), 'utf8').trim().split('\n');
  assert.deepEqual(lista, reales, 'Ejecuta: git ls-files manifest.json actualizar-huella.cmd src ui iconos > herramientas/archivos.txt');
});
