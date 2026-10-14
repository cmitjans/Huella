// Se ejecuta dentro de cada página, antes que sus propios scripts.
// Detecta cuándo un script usa técnicas de huella digital (canvas, WebGL, audio, fuentes…)
// y avisa a la extensión qué técnica fue y qué script la usó. No lee ni guarda lo que se dibuja
// o mide: solo deja pasar la llamada original sin cambios y anota que ocurrió.
(() => {
  const EVENTO = 'huella-extension-aviso';
  const avisadas = new Set();

  /** Dirección del script que hizo la llamada, sacada de la pila de llamadas. */
  function quienLlama() {
    const pila = String(new Error().stack || '').split('\n');
    for (const linea of pila.slice(3)) {
      const m = linea.match(/(https?:\/\/[^\s()]+?)(?::\d+){1,2}\)?\s*$/);
      if (m) return m[1];
    }
    return location.href;   // script escrito dentro de la misma página
  }

  function avisar(tecnica) {
    let script;
    try { script = quienLlama(); } catch { return; }
    const clave = tecnica + ' ' + script;
    if (avisadas.has(clave)) return;
    avisadas.add(clave);
    try {
      document.dispatchEvent(new CustomEvent(EVENTO, { detail: JSON.stringify({ tecnica, script }) }));
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
})();
