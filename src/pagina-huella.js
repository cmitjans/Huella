// Se ejecuta dentro de cada página, antes que sus propios scripts. Detecta tres cosas y avisa a la
// extensión qué script las hizo:
//   1. Huella digital: canvas, WebGL, audio, fuentes, detalles del sistema, WebRTC.
//   2. Escuchas en toda la página: mouse, clics, teclas, texto, desplazamiento, cambios de pestaña…
//   3. Lectura de lo que escribiste en un campo de formulario.
// Nunca lee ni guarda lo que dibujan, miden o leen esos scripts, ni lo que escribes: solo deja pasar
// cada llamada original sin cambios y anota qué tipo de cosa ocurrió.
(() => {
  const EVENTO = 'huella-extension-aviso';
  const avisadas = new Set();
  const principal = (() => { try { return window.top === window; } catch { return false; } })();
  let presupuesto = 4000;   // límite de revisiones por página, para no hacerla más lenta

  /** Direcciones de los scripts en la pila de llamadas, del más cercano al más lejano. */
  function scriptsEnPila() {
    let pila = '';
    const limite = Error.stackTraceLimit;
    try {
      Error.stackTraceLimit = 25;
      pila = String(new Error().stack || '');
    } finally {
      Error.stackTraceLimit = limite;
    }
    const urls = [];
    for (const linea of pila.split('\n')) {
      const m = linea.match(/(https?:\/\/[^\s()]+?)(?::\d+){1,2}\)?\s*$/);
      if (m && !urls.includes(m[1])) urls.push(m[1]);
      if (urls.length >= 8) break;
    }
    return urls;
  }

  function avisar(tecnica, extra = '') {
    if (presupuesto <= 0) return;
    presupuesto--;
    let scripts;
    try { scripts = scriptsEnPila(); } catch { return; }
    if (!scripts.length) scripts = [location.href];   // script escrito dentro de la misma página
    const clave = tecnica + ' ' + extra + ' ' + scripts.join(' ');
    if (avisadas.has(clave)) return;
    avisadas.add(clave);
    try {
      document.dispatchEvent(new CustomEvent(EVENTO, { detail: JSON.stringify({ tecnica, extra, scripts }) }));
    } catch { /* la página no está lista; se ignora */ }
  }

  function envolver(objeto, metodo, tecnica, condicion) {
    if (!objeto) return;
    const desc = Object.getOwnPropertyDescriptor(objeto, metodo);
    if (!desc || typeof desc.value !== 'function') return;
    const original = desc.value;
    const nuevo = {
      [metodo](...args) {
        try { if (!condicion || condicion.call(this, args)) avisar(tecnica); } catch { /* nunca romper la página */ }
        return Reflect.apply(original, this, args);
      },
    }[metodo];
    try { Object.defineProperty(objeto, metodo, { ...desc, value: nuevo }); } catch { /* propiedad bloqueada */ }
  }

  const w = window;

  // ---------------------------------------------------------------- 1. huella digital

  const fueraDeVista = function () { return !this.isConnected; };

  // Dibujo invisible: leer la imagen de un canvas que no está en la página.
  envolver(w.HTMLCanvasElement?.prototype, 'toDataURL', 'canvas', fueraDeVista);
  envolver(w.HTMLCanvasElement?.prototype, 'toBlob', 'canvas', fueraDeVista);
  envolver(w.CanvasRenderingContext2D?.prototype, 'getImageData', 'canvas', function () { return !this.canvas?.isConnected; });

  // Modelo de la tarjeta gráfica.
  const pideGrafica = ([p]) => p === 37445 || p === 37446;
  envolver(w.WebGLRenderingContext?.prototype, 'getParameter', 'webgl', pideGrafica);
  envolver(w.WebGL2RenderingContext?.prototype, 'getParameter', 'webgl', pideGrafica);

  // Fuentes instaladas: muchas mediciones de texto seguidas.
  let mediciones = 0;
  let desde = 0;
  envolver(w.CanvasRenderingContext2D?.prototype, 'measureText', 'fuentes', () => {
    const ahora = Date.now();
    if (ahora - desde > 1000) { desde = ahora; mediciones = 0; }
    return ++mediciones === 60;
  });
  let chequeos = 0;
  envolver(w.FontFaceSet?.prototype, 'check', 'fuentes', () => ++chequeos === 25);

  // Detalles exactos del sistema.
  envolver(w.NavigatorUAData?.prototype, 'getHighEntropyValues', 'sistema', ([pistas]) =>
    Array.isArray(pistas) && pistas.some(p => ['fullVersionList', 'platformVersion', 'model', 'architecture', 'bitness'].includes(p)));

  // Audio procesado sin reproducirlo, y conexiones WebRTC.
  function envolverConstructor(nombre, tecnica) {
    const C = w[nombre];
    if (typeof C !== 'function') return;
    const proxy = new Proxy(C, {
      construct(objetivo, args, nuevoObjetivo) {
        try { avisar(tecnica); } catch { /* nada */ }
        return Reflect.construct(objetivo, args, nuevoObjetivo === proxy ? objetivo : nuevoObjetivo);
      },
    });
    try { Object.defineProperty(w, nombre, { value: proxy, writable: true, configurable: true }); } catch { /* nada */ }
  }
  envolverConstructor('OfflineAudioContext', 'audio');
  envolverConstructor('RTCPeerConnection', 'webrtc');

  // ---------------------------------------------------------------- 2. escuchas en toda la página

  const GRUPOS = {
    mousemove: 'mouse', pointermove: 'mouse', mouseover: 'mouse', mouseout: 'mouse', pointerover: 'mouse', pointerout: 'mouse',
    click: 'clics', mousedown: 'clics', mouseup: 'clics', pointerdown: 'clics', pointerup: 'clics', dblclick: 'clics',
    contextmenu: 'clics', touchstart: 'clics', touchend: 'clics',
    keydown: 'teclas', keyup: 'teclas', keypress: 'teclas',
    input: 'texto', change: 'texto', beforeinput: 'texto',
    scroll: 'desplazamiento', wheel: 'desplazamiento', touchmove: 'desplazamiento', scrollend: 'desplazamiento',
    visibilitychange: 'atencion', focus: 'atencion', blur: 'atencion', pagehide: 'atencion', beforeunload: 'atencion',
    copy: 'portapapeles', cut: 'portapapeles', paste: 'portapapeles',
    selectionchange: 'seleccion',
  };
  const DE_CAMPO = new Set(['teclas', 'texto', 'portapapeles']);
  const IGNORAR_TIPOS = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'range', 'color', 'file']);

  /** Escuchar en la ventana o el documento es escuchar todo lo que haces en la página. */
  function esGlobal(t) {
    return t === w || t === document || t === document.documentElement || t === document.body;
  }

  function esCampo(t) {
    if (t instanceof HTMLInputElement) return !IGNORAR_TIPOS.has((t.type || '').toLowerCase());
    return t instanceof HTMLTextAreaElement || t instanceof HTMLFormElement || (t instanceof HTMLElement && t.isContentEditable);
  }

  const ET = w.EventTarget?.prototype;
  const descAgregar = ET && Object.getOwnPropertyDescriptor(ET, 'addEventListener');
  const agregarOriginal = descAgregar?.value;
  if (typeof agregarOriginal === 'function') {
    const nuevo = {
      addEventListener(tipo, oyente) {
        try {
          const grupo = oyente && typeof tipo === 'string' ? GRUPOS[tipo] : undefined;
          if (grupo) {
            // En un recuadro (por ejemplo un anuncio) solo se ve lo que pasa dentro de él: no cuenta como toda la página.
            if (principal && esGlobal(this)) avisar('escucha', grupo);
            else if (DE_CAMPO.has(grupo) && esCampo(this)) avisar('escucha', grupo);
          }
        } catch { /* nunca romper la página */ }
        return Reflect.apply(agregarOriginal, this, arguments);
      },
    }.addEventListener;
    try { Object.defineProperty(ET, 'addEventListener', { ...descAgregar, value: nuevo }); } catch { /* nada */ }
  }

  // ---------------------------------------------------------------- 3. lectura de lo que escribiste

  // Campos donde la persona escribió de verdad (eventos generados por el teclado, no por scripts).
  // Solo se guarda una referencia al campo, nunca su contenido.
  const escritos = new WeakSet();
  if (typeof agregarOriginal === 'function') {
    Reflect.apply(agregarOriginal, document, ['input', ev => {
      if (ev.isTrusted && ev.target) escritos.add(ev.target);
    }, true]);
  }

  function tipoCampo(el) {
    const t = (el.type || '').toLowerCase();
    if (IGNORAR_TIPOS.has(t)) return '';
    const pistas = [el.name, el.id, el.autocomplete, el.placeholder, el.getAttribute?.('aria-label')]
      .filter(Boolean).join(' ').toLowerCase();
    if (t === 'password' || /contrase|password|clave/.test(pistas)) return 'contrasena';
    if (/cc-|card|tarjeta|cvv|cvc/.test(pistas)) return 'tarjeta';
    if (t === 'email' || /e-?mail|correo/.test(pistas)) return 'correo';
    if (t === 'tel' || /phone|tel[eé]fono|celular|m[oó]vil/.test(pistas)) return 'telefono';
    if (/\brut\b|dni|documento|passport|pasaporte/.test(pistas)) return 'documento';
    if (t === 'search' || /search|buscar|b[uú]squeda|query/.test(pistas)) return 'busqueda';
    if (/name|nombre|apellido/.test(pistas)) return 'nombre';
    if (/address|direcci|calle|street|ciudad|city|postal/.test(pistas)) return 'direccion';
    if (el instanceof HTMLTextAreaElement) return 'texto';
    return 'otro';
  }

  let presupuestoLectura = 3000;
  function vigilarValor(proto) {
    const d = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (!d || typeof d.get !== 'function') return;
    const leer = d.get;
    const nuevo = Object.getOwnPropertyDescriptor({
      get value() {
        const v = Reflect.apply(leer, this, []);
        try {
          if (v && presupuestoLectura > 0 && escritos.has(this)) {
            presupuestoLectura--;
            const tipo = tipoCampo(this);
            if (tipo) avisar('lectura', tipo);
          }
        } catch { /* nunca romper la página */ }
        return v;
      },
    }, 'value').get;
    try { Object.defineProperty(proto, 'value', { ...d, get: nuevo }); } catch { /* nada */ }
  }
  vigilarValor(w.HTMLInputElement?.prototype);
  vigilarValor(w.HTMLTextAreaElement?.prototype);
})();
