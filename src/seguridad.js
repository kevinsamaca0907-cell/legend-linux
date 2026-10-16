// Endurecimiento de la sesión de Electron. Electron 11 (Chromium 87) ya no recibe parches,
// así que se reduce lo que una página (o un iframe de terceros) puede pedir o cargar.
// Probado con scripts/pruebas-seguridad/.
const cfg = require('./config');

// Electron concede por defecto TODOS los permisos (cámara, micrófono, ubicación, notificaciones...).
// El juego solo necesita pantalla completa.
const ALLOWED_PERMISSIONS = new Set(['fullscreen']);

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' &&
      cfg.allowedDomains.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return String(url).slice(0, 60); }
}

function harden(ses, log = (...a) => console.log('[seguridad]', ...a)) {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const ok = ALLOWED_PERMISSIONS.has(permission);
    if (!ok) log('permiso denegado:', permission, hostOf(details.requestingUrl || ''));
    callback(ok);
  });
  ses.setPermissionCheckHandler((wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  // El juego no descarga archivos.
  ses.on('will-download', (e, item) => {
    log('descarga bloqueada:', hostOf(item.getURL()));
    e.preventDefault();
  });

  // iframes de terceros (widget de Facebook, rastreadores): fuera. Es código ajeno ejecutándose
  // en un Chromium sin parches y no hace falta para jugar. El resto de recursos de terceros
  // (scripts, imágenes) se registran una vez por dominio para poder endurecer más adelante.
  const seen = new Set();
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, callback) => {
    if (/^(devtools|chrome|data|blob|file):/.test(d.url) || isAllowedUrl(d.url)) return callback({});
    if (d.resourceType === 'subFrame') {
      log('iframe de terceros bloqueado:', hostOf(d.url));
      return callback({ cancel: true });
    }
    const host = hostOf(d.url);
    if (!seen.has(host)) { seen.add(host); log('recurso de terceros:', d.resourceType, host); }
    callback({});
  });
}

module.exports = { harden, isAllowedUrl, ALLOWED_PERMISSIONS };
