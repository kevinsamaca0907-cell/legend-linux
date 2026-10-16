// Cliente nativo de Legend Online para Linux: replica el "envoltorio" del launcher oficial
// (WinForms + CefSharp) con Electron 11 + Flash PPAPI. No toca tráfico ni protocolo.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const cfg = require('./config');
const { harden, isAllowedUrl: isAllowed } = require('./seguridad');

// --- Flash PPAPI -----------------------------------------------------------------------
const flashPath = process.env.LO_FLASH_PATH ||
  path.join(__dirname, '..', 'tools', 'flash', 'libpepflashplayer.so');
if (!fs.existsSync(flashPath)) console.error(`[flash] no existe ${flashPath} (define LO_FLASH_PATH)`);
app.commandLine.appendSwitch('ppapi-flash-path', flashPath);
// El launcher anuncia 32.0.0.453 aunque su .dll es 21.0.0.213; se replica por si la web lo mira.
app.commandLine.appendSwitch('ppapi-flash-version', cfg.flashVersion);
// El seccomp de Chromium 87 mata el proceso de Flash con la glibc actual ("Couldn't load plugin");
// desactivar solo seccomp no basta. Compensación: run.sh encierra todo en bubblewrap.
app.commandLine.appendSwitch('no-sandbox');

// Perfil aislado dentro del proyecto (no mezclar con otros navegadores).
app.setPath('userData', path.join(__dirname, '..', 'perfil'));

const PARTITION = 'persist:legend';
// Icono de la ventana (barra de tareas, Alt+Tab): recorte de la pluma, legible a 24-48 px.
// El del menú lo pone instalar-escritorio.sh (≤64 px el mismo recorte, ≥128 el emblema completo).
const ICON = path.join(__dirname, '..', 'iconos', 'ventana.png');
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(String(s), 'base64').toString('utf8') : '');
const log = (...a) => console.log('[bridge]', ...a);
// LO_DIAG=1: registros de depuración ([swf], [diag]).
const DIAG = Boolean(process.env.LO_DIAG);
// Oculta token, usuario y clave de sesión de las URLs antes de escribirlas en la terminal.
const redact = (url) => String(url).replace(/([?&](?:token|name|key|user)=)[^&"]*/g, '$1<oculto>');

// webContents de ventanas que se están cerrando: sus popups (unload/beforeunload) se descartan.
const closing = new WeakSet();

// Dentro de bubblewrap el navegador del sistema no ve el home: run.sh abre las URLs fuera,
// leyendo la FIFO LO_OPEN_FIFO.
function openExternal(url, wc) {
  if (!/^https?:\/\//.test(url)) return;
  if (wc && closing.has(wc)) return log('popup al cerrar descartado:', redact(url));
  const fifo = process.env.LO_OPEN_FIFO;
  if (!fifo) return shell.openExternal(url);
  fs.writeFile(fifo, url.replace(/[\r\n]/g, '') + '\n', (err) => err && log('no se pudo abrir', url, err.message));
}

// Ejecuta callback('<arg>') en la página, como hace el launcher con ExecuteJavaScriptAsync.
function respond(wc, callback, arg) {
  if (!/^[A-Za-z_$][\w$.]*$/.test(callback || '')) return log('callback inválido:', callback);
  const lit = JSON.stringify(String(arg)); // escapado seguro en lugar de '{0}'
  wc.executeJavaScript(`${callback}(${lit})`).catch((e) => log('error en callback', e.message));
}

function createWindow(url, { partition = PARTITION, ...opts }) {
  const win = new BrowserWindow({
    ...opts,
    title: 'Legend Online',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // los plugins PPAPI no cargan con sandbox del renderer en Electron 11
      plugins: true,
      // El juego vive en iframes: el preload (window.external + diagnóstico) debe correr en todos.
      nodeIntegrationInSubFrames: true,
    },
  });
  const wc = win.webContents;
  // 'close' se emite antes de beforeunload/unload de la página: al cerrar el juego, su unload
  // abría el login en el navegador del sistema.
  win.on('close', () => closing.add(wc));
  wc.on('will-navigate', (e, target) => {
    if (!isAllowed(target)) { e.preventDefault(); log('navegación bloqueada -> navegador del sistema:', redact(target)); openExternal(target, wc); }
  });
  wc.setWindowOpenHandler
    ? wc.setWindowOpenHandler(({ url: u }) => { openPopup(u, wc); return { action: 'deny' }; })
    : wc.on('new-window', (e, u) => { e.preventDefault(); openPopup(u, wc); });
  wc.on('did-finish-load', () => {
    wc.executeJavaScript('[Array.from(navigator.plugins).map((p) => p.name).join(", "), typeof window.external.WINIE_LoginOK]')
      .then(([plugins, ext]) => console.log('[carga]', redact(wc.getURL()), '| plugins:', plugins || '(ninguno)', '| external:', ext));
  });
  wc.on('did-fail-load', (e, code, desc, u) => console.log('[error de carga]', code, desc, redact(u)));
  // Las páginas del juego usan beforeunload; Electron cancela el cierre en silencio
  // (Super+Q de Hyprland no cerraba). Se ignora y la ventana se cierra.
  wc.on('will-prevent-unload', (e) => e.preventDefault());
  wc.on('plugin-crashed', (e, name, ver) => console.log('[plugin-crashed]', name, ver));
  if (process.env.LO_DEVTOOLS) wc.openDevTools({ mode: 'detach' });
  win.loadURL(url);
  return win;
}

// Popups (target=_blank, window.open). Como FormBrowersLifeSpanHandler del launcher, que los abre
// en una pestaña nueva del juego: los del juego (dominios permitidos) se abren en otra ventana del
// cliente. Así funciona el botón de cambiar de servidor y se pueden tener varios servidores abiertos
// a la vez. El resto (y los del login) van al navegador del sistema.
const MAX_GAME_WINDOWS = 8; // tope por si una página abre ventanas sin parar
const gameWindows = new Set();
let openingWindows = 0;
function openPopup(url, wc) {
  if (closing.has(wc)) return log('popup al cerrar descartado:', redact(url));
  if (isAllowed(url) && !(loginWin && wc === loginWin.webContents)) {
    if (gameWindows.size + openingWindows >= MAX_GAME_WINDOWS) return log('demasiadas ventanas de juego; popup descartado:', redact(url));
    log('popup -> ventana del juego:', redact(url));
    return openGameWindow(url, wc.session).catch((e) => log('no se pudo abrir la ventana:', e.message));
  }
  log('popup -> navegador del sistema:', redact(url));
  openExternal(url, wc);
}

// Chromium guarda el zoom por host y por partición: con una sola partición todas las ventanas del
// juego (mismo host loes.creaction-network.com) compartían zoom. Cada ventana extra usa su propia
// partición en memoria (ranura reutilizable) con las cookies del juego copiadas de la ventana que la
// abrió, como CookieOpration.copyCookies del launcher. Contra: no comparte la caché de recursos.
const freeSlots = [];
let nextSlot = 1;
async function openGameWindow(url, fromSession) {
  let partition = PARTITION;
  let slot = 0;
  if (fromSession) {
    openingWindows++;
    try {
      slot = freeSlots.pop() || nextSlot++;
      partition = `legend-ventana-${slot}`; // sin "persist:": vive solo en memoria
      const ses = session.fromPartition(partition);
      await ses.clearStorageData(); // la ranura pudo usarla una ventana anterior
      prepareSession(ses);
      await copyGameCookies(fromSession, ses);
    } finally {
      openingWindows--;
    }
  }
  const win = createWindow(url, { width: 1280, height: 800, partition });
  gameWindows.add(win);
  win.on('closed', () => { gameWindows.delete(win); if (slot) freeSlots.push(slot); });
  win.maximize();
  setupZoom(win);
  return win;
}

// Solo las cookies de los dominios del juego (no las de Facebook u otros terceros).
async function copyGameCookies(from, to) {
  for (const c of await from.cookies.get({})) {
    const host = c.domain.replace(/^\./, '');
    if (!isAllowed(`https://${host}/`)) continue;
    const details = {
      url: `https://${host}${c.path || '/'}`, name: c.name, value: c.value, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
    };
    if (!c.hostOnly) details.domain = c.domain;
    if (!c.session && c.expirationDate) details.expirationDate = c.expirationDate;
    await to.cookies.set(details).catch((e) => log('cookie no copiada:', c.name, e.message));
  }
}

// Seguridad, UA y diagnóstico de cada sesión (la principal y las de ventanas extra).
const preparedSessions = new WeakSet();
function prepareSession(ses) {
  if (preparedSessions.has(ses)) return;
  preparedSessions.add(ses);
  harden(ses);
  // UA de Chrome sin "Electron/x" por si la web filtra.
  ses.setUserAgent(ses.getUserAgent().replace(/\s*(Electron|legend-linux)\/\S+/g, ''));
  // Diagnóstico: qué .swf carga el juego (solo observa, no modifica nada).
  if (DIAG) {
    ses.webRequest.onCompleted({ urls: ['*://*/*.swf*'] }, (d) => {
      console.log('[swf]', d.statusCode, redact(d.url));
    });
  }
}

// --- Zoom del juego (bordes negros) --------------------------------------------------
// game.jsp fija el <object> del juego en 1495x895 px CSS (+35 px de la barra de serverlist) y el resto
// es fondo negro. Flash escala con el zoom de página (browserzoom=scale, comprobado en
// scripts/flash-test/zoom-test.js), así que se amplía la página para llenar la ventana.
// Ctrl + '+'/'-': zoom manual; Ctrl+0: volver al ajuste automático.
const GAME_AREA = { width: 1495, height: 895 + 35 };
const settingsPath = () => path.join(app.getPath('userData'), 'ajustes.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) { return {}; }
}
function saveSettings(st) {
  fs.writeFile(settingsPath(), JSON.stringify(st, null, 2), (err) => err && console.log('[ajustes]', err.message));
}

function setupZoom(win) {
  const wc = win.webContents;
  const st = loadSettings();
  const fitZoom = () => {
    const [w, h] = win.getContentSize();
    return Math.min(3, Math.max(1, Math.min(w / GAME_AREA.width, h / GAME_AREA.height)));
  };
  const apply = () => {
    if (win.isDestroyed()) return;
    const z = st.zoom || fitZoom();
    wc.setZoomFactor(z);
    console.log('[zoom]', st.zoom ? 'manual' : 'auto', z.toFixed(2), win.getContentSize().join('x'));
  };
  // Electron 11 bajo XWayland/Hyprland no siempre emite 'resize' (mosaico, pantalla completa):
  // se vigila el tamaño cada 500 ms.
  let lastSize = '';
  const timer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(timer);
    const size = win.getContentSize().join('x');
    if (size !== lastSize && !st.zoom) apply();
    lastSize = size;
  }, 500);
  win.on('closed', () => clearInterval(timer));
  wc.on('did-navigate', apply);
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    const k = input.key;
    if (k === '+' || k === '=') st.zoom = Math.min(3, (st.zoom || wc.getZoomFactor()) + 0.05);
    else if (k === '-') st.zoom = Math.max(0.5, (st.zoom || wc.getZoomFactor()) - 0.05);
    else if (k === '0') delete st.zoom;
    else return;
    e.preventDefault();
    saveSettings(st);
    apply();
  });
  apply();
}

// --- Cookies (CookieOpration.cs): logintype=4 y new_gamebox=1 en el dominio del juego ------
async function prepareGameCookies(ses) {
  for (const [name, value] of [['logintype', '4'], ['new_gamebox', '1']]) {
    await ses.cookies.set({ url: cfg.playHost, name, value, domain: '.' + cfg.gameDomain, path: '/' });
  }
}

// --- Usuarios recordados (LoginUser.cs y WINIE_InitUserData del launcher) --------------
// Lista con los campos en base64 tal como los manda la página: {type, username, pwd (solo con
// "recordar" marcado), remember, automatic}; el más reciente primero. El launcher la cifraba con AES
// y una clave fija en el .exe (es decir, sin protección real); aquí va en perfil/usuarios.json con
// permisos 600, junto a las cookies de sesión, que ya dan acceso a la cuenta.
const usersPath = () => path.join(app.getPath('userData'), 'usuarios.json');
function loadUsers() {
  try {
    const list = JSON.parse(fs.readFileSync(usersPath(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}
function saveUsers(list) {
  const tmp = usersPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  fs.renameSync(tmp, usersPath());
}
function rememberUser(d) {
  if (unb64(d.type) !== 'oas') return; // como el launcher: solo cuentas de usuario y contraseña
  const entry = { type: d.type, username: d.username, remember: d.remember || '', automatic: d.automatic || '' };
  if (unb64(d.remember) === 'true') entry.pwd = d.pwd;
  const name = unb64(d.username);
  saveUsers([entry, ...loadUsers().filter((u) => unb64(u.username) !== name)]);
}

// --- Puentes ---------------------------------------------------------------------------
let loginWin = null;
let gameWin = null;

const loginBridge = {
  async WINIE_LoginOK(wc, json) {
    // Doble clic en "Entrar": una sola ventana de juego.
    if (gameWin && !gameWin.isDestroyed()) return gameWin.focus();
    const d = JSON.parse(json);
    const token = unb64(d.token);
    const username = unb64(d.username);
    log('login OK (tipo', unb64(d.type) + ')'); // sin el usuario: los logs se pegan en issues
    respond(wc, d.callback, JSON.stringify({ code: b64('1'), token, name: b64(username) }));
    try { rememberUser(d); } catch (e) { log('no se pudo guardar el usuario:', e.message); }
    await prepareGameCookies(wc.session);
    gameWin = await openGameWindow(cfg.playUrl(token, username));
    // El juego comparte host con el login: ocultarlo ya para que no se vea ampliado esos 500 ms.
    if (loginWin && !loginWin.isDestroyed()) loginWin.hide();
    setTimeout(() => loginWin && !loginWin.isDestroyed() && loginWin.close(), 500);
  },
  WINIE_InitUserData(wc, json) {
    respond(wc, JSON.parse(json).callback, JSON.stringify(loadUsers()));
  },
  WINIE_DelMainUser(wc, json) {
    const d = JSON.parse(json);
    const users = loadUsers();
    const rest = users.filter((u) => u.username !== d.username);
    if (rest.length !== users.length) saveUsers(rest);
    respond(wc, d.callback, '1');
  },
  WINIE_ShowMsgBox(wc, json) {
    const msg = unb64(JSON.parse(json).message);
    if (msg) dialog.showMessageBox(BrowserWindow.fromWebContents(wc), { message: msg });
  },
  WINIE_LoginFacebook(wc, url) {
    log('login con Facebook aún no soportado:', url);
    dialog.showMessageBox(BrowserWindow.fromWebContents(wc), { message: 'Login con Facebook aún no soportado. Usa usuario y contraseña.' });
  },
  WINIE_Localstorage() {},
  WINIE_InitBoxType() {},
};

const gameBridge = {
  WINIE_Localstorage(wc, json) {
    const d = JSON.parse(json);
    log('localstorage', unb64(d.action), unb64(d.key));
    const data = b64(JSON.stringify(cfg.localStorageData()));
    respond(wc, d.callback, JSON.stringify({ data }));
  },
  WINIE_OpenWithSystemBrowser(wc, url) {
    openExternal(url, wc);
  },
  // El launcher solo los escribe en consola.
  WINIE_SetGameMsg() {},
  WINIE_GetXiaoUrl() {},
};

// Diagnóstico de maquetación (bordes negros): cómo se inserta el Flash en cada frame.
ipcMain.on('diag', (e, info) => DIAG && console.log('[diag]', redact(JSON.stringify(info))));

ipcMain.on('winie', (e, name, arg) => {
  const wc = e.sender;
  const bridge = loginWin && wc === loginWin.webContents ? loginBridge : gameBridge;
  const fn = bridge[name];
  if (!fn) return log('sin implementar:', name, redact(String(arg).slice(0, 200)));
  log('llamada:', name);
  Promise.resolve()
    .then(() => fn(wc, arg))
    .catch((err) => log(`error en ${name}:`, err.message));
});

app.whenReady().then(() => {
  prepareSession(session.fromPartition(PARTITION));
  // Sin ignore-certificate-errors: los errores de certificado se respetan.
  // 609x364 es el área de contenido del navegador de login del launcher (sin marcos de ventana).
  loginWin = createWindow(cfg.loginUrl(), { width: 609, height: 364, useContentSize: true, resizable: false });
  loginWin.on('closed', () => { loginWin = null; });
  // Chromium guarda el zoom por host en el perfil y login.php comparte host (gamebox3) con game.php:
  // sin esto, el login de la siguiente sesión hereda el zoom del juego y no cabe en 609x364.
  loginWin.webContents.on('did-navigate', () => loginWin && loginWin.webContents.setZoomFactor(1));
});

app.on('window-all-closed', () => app.quit());
