// Prueba: ¿Flash (noscale) escala con el zoom de página de Chromium? Captura a zoom 1 y 2.
const path = require('path');
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname, '../../tools/flash/libpepflashplayer.so'));
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(__dirname, 'perfil'));
const zoom = Number(process.env.T_ZOOM || 1);
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 1300, height: 700, useContentSize: true, webPreferences: { plugins: true, zoomFactor: zoom } });
  w.loadFile(path.join(__dirname, 'zoom.html'));
  setTimeout(() => w.webContents.capturePage().then((img) => {
    require('fs').writeFileSync(path.join(__dirname, `zoom${zoom}.png`), img.toPNG()); app.quit();
  }), 5000);
});
