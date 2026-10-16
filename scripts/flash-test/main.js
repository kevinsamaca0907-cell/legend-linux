// Prueba aislada de Flash PPAPI en Electron 11 (mismos switches que src/main.js).
// Uso: ../../tools/electron-v11.5.0/electron .  → guarda captura.png (rectángulo rojo = Flash OK).
// T_SW="switch1 switch2" añade switches de Chromium para experimentar.
const path = require('path');
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname, '../../tools/flash/libpepflashplayer.so'));
app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.453');
if (process.env.T_SW) for (const s of process.env.T_SW.split(' ')) app.commandLine.appendSwitch(s);
app.commandLine.appendSwitch('no-sandbox'); // sin esto: "Couldn't load plugin" (seccomp de Chromium 87)
app.setPath('userData', path.join(__dirname, 'perfil'));
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 400, height: 250, webPreferences: { plugins: true, contextIsolation: true } });
  w.webContents.on('plugin-crashed', (e, name, ver) => console.log('[plugin-crashed]', name, ver));
  w.loadFile(path.join(__dirname, 'index.html'));
  setTimeout(() => w.webContents.capturePage().then((img) => {
    require('fs').writeFileSync(path.join(__dirname, 'captura.png'), img.toPNG()); app.quit();
  }), 6000);
});
