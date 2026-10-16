// Pruebas de src/seguridad.js y src/preload.js con una página hostil local.
// Uso (desde la raíz): ./tools/electron-v11.5.0/electron scripts/pruebas-seguridad
const path = require('path');
const { app, BrowserWindow, session } = require('electron');
const { harden } = require('../../src/seguridad');

app.commandLine.appendSwitch('no-sandbox');
// Cámara y micrófono simulados: así la prueba ejercita el permiso aunque el equipo no tenga dispositivos.
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.setPath('userData', path.join(__dirname, 'perfil'));
const logs = [];

app.whenReady().then(async () => {
  const ses = session.fromPartition('pruebas');
  if (!process.env.SIN_SEGURIDAD) harden(ses, (...a) => logs.push(a.join(' '))); // control: SIN_SEGURIDAD=1
  const w = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: 'pruebas', preload: path.join(__dirname, '../../src/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false, nodeIntegrationInSubFrames: true,
    },
  });
  await w.loadFile(path.join(__dirname, 'pagina.html'));
  await new Promise((res) => setTimeout(res, 4000));
  const r = await w.webContents.executeJavaScript('window.resultados');
  const has = (txt) => logs.some((l) => l.includes(txt));
  const checks = [
    ['window.external no existe en páginas ajenas', r.external !== 'function'],
    ['ubicación denegada (código 1 = PERMISSION_DENIED)', r.ubicacion === 'denegada:1'],
    ['notificaciones denegadas', r.notificaciones === 'denied'],
    ['cámara/micrófono denegados', r.camara_microfono === 'denegado:NotAllowedError'],
    ['portapapeles denegado', String(r.portapapeles).startsWith('denegado')],
    ['iframe de Facebook bloqueado', has('iframe de terceros bloqueado: www.facebook.com')],
    ['iframe de otro dominio bloqueado', has('iframe de terceros bloqueado: example.com')],
    ['descarga bloqueada', has('descarga bloqueada')],
  ];
  let fallos = 0;
  for (const [desc, ok] of checks) { if (!ok) fallos++; console.log(`  ${ok ? 'OK   ' : 'FALLO'}  ${desc}`); }
  console.log('\nResultados de la página:', JSON.stringify(r));
  console.log('Registro:', logs.join(' | '));
  console.log(fallos ? `\n${fallos} pruebas fallidas.` : '\nTodo correcto.');
  app.exit(fallos ? 1 : 0);
});
