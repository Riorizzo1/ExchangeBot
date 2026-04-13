import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProc;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('http://127.0.0.1:4312');
}

app.whenReady().then(() => {
  serverProc = spawn('node', [path.join(__dirname, 'server.mjs')], {
    cwd: __dirname,
    stdio: 'ignore',
    detached: false,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '4312' },
  });

  setTimeout(() => {
    createWindow();
  }, 1200);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc) serverProc.kill();
});
