// Expone window.external con los métodos WINIE_* (nombres exactos) en el mundo de la página.
// El aislamiento de contexto sigue activo: la página solo ve una función que reenvía al proceso principal.
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const { isAllowedUrl } = require('./seguridad');

// Solo los frames del juego (https en los dominios permitidos) reciben window.external;
// un iframe de terceros no puede llamar a los WINIE_*.
if (isAllowedUrl(location.href)) {
  contextBridge.exposeInMainWorld('__loBridge', {
    call: (name, arg) => ipcRenderer.send('winie', String(name), arg === undefined ? null : String(arg)),
  });

  // Proxy: cualquier WINIE_* desconocido se registra en la consola del proceso principal.
  webFrame.executeJavaScript(`(() => {
    const bridge = window.__loBridge;
    const ext = new Proxy({}, {
      get: (_, name) => typeof name === 'string' && name.startsWith('WINIE_')
        ? (arg) => bridge.call(name, arg)
        : undefined,
    });
    try { window.external = ext; } catch (e) {}
    if (window.external !== ext) Object.defineProperty(window, 'external', { value: ext, configurable: true });
  })();`);
}

// Diagnóstico (solo lectura, con LO_DIAG=1): tamaño de cada frame y de los <embed>/<object>/<iframe>.
// Se omiten flashvars (pueden llevar el token).
function describe(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const attrs = {};
  for (const a of el.attributes) if (!/flashvars/i.test(a.name)) attrs[a.name] = a.value.slice(0, 200);
  const params = {};
  for (const p of el.querySelectorAll('param')) if (!/flashvars/i.test(p.name)) params[p.name] = p.value.slice(0, 200);
  return {
    tag: el.tagName, attrs, params,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    css: { position: cs.position, width: cs.width, height: cs.height, margin: cs.margin },
  };
}
if (process.env.LO_DIAG) window.addEventListener('load', () => setTimeout(() => {
  const els = document.querySelectorAll('embed, object, iframe');
  if (!els.length && window !== window.top) return;
  ipcRenderer.send('diag', {
    url: location.href,
    top: window === window.top,
    viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
    body: { bg: getComputedStyle(document.body).backgroundColor, overflow: getComputedStyle(document.body).overflow },
    elements: Array.from(els).map(describe),
  });
}, 8000));

// Calidad de Flash en game.jsp: el juego se inserta con quality=high (solo suaviza bitmaps
// escalados en escenas estáticas); con el zoom conviene "best" (siempre suavizados).
// Se cambia el <param> antes de que el plugin se instancie. LO_CALIDAD=high lo desactiva.
const quality = process.env.LO_CALIDAD || 'best';
if (/^s\d+sqsa\.creaction-network\.com$/.test(location.hostname) && location.pathname.endsWith('/game.jsp')) {
  let reported = false;
  const fix = (obj) => {
    // El parser añade los <param> después del <object>: se revisa en cada mutación.
    for (const p of obj.querySelectorAll('param[name="quality" i]')) {
      if (p.value === quality) continue;
      p.value = quality;
      if (!reported) { reported = true; console.log('[legend-linux] calidad de Flash:', quality); }
    }
  };
  const observer = new MutationObserver(() => {
    const obj = document.getElementById('GameSwf');
    if (obj) fix(obj);
  });
  observer.observe(document, { childList: true, subtree: true });
  // Con la página cargada el plugin ya está instanciado: no hace falta seguir observando.
  window.addEventListener('load', () => observer.disconnect());
}
