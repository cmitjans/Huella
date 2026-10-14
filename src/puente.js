// Pasa los avisos de pagina-huella.js (que corre dentro de la página) al servicio de fondo.
document.addEventListener('huella-extension-aviso', ev => {
  let aviso;
  try { aviso = JSON.parse(ev.detail); } catch { return; }
  if (!aviso || typeof aviso.tecnica !== 'string') return;
  try {
    chrome.runtime.sendMessage({ tipo: 'huella', tecnica: aviso.tecnica, script: String(aviso.script || '') }).catch(() => {});
  } catch { /* la extensión se actualizó y esta página quedó con la versión anterior */ }
});
