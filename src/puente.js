// Pasa los avisos de pagina-huella.js (que corre dentro de la página) al servicio de fondo.
// Solo pasa qué tipo de cosa ocurrió y qué scripts la hicieron; nunca contenido de la página.
document.addEventListener('huella-extension-aviso', ev => {
  let aviso;
  try { aviso = JSON.parse(ev.detail); } catch { return; }
  if (!aviso || typeof aviso.tecnica !== 'string') return;
  const scripts = Array.isArray(aviso.scripts) ? aviso.scripts.slice(0, 8).map(s => String(s).slice(0, 500)) : [];
  try {
    chrome.runtime.sendMessage({
      tipo: 'huella', tecnica: aviso.tecnica.slice(0, 20), extra: String(aviso.extra || '').slice(0, 20), scripts,
    }).catch(() => {});
  } catch { /* la extensión se actualizó y esta página quedó con la versión anterior */ }
});
