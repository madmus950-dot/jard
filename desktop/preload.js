/* الجسر بين الواجهة وويندوز: نفس واجهة JardApp الموجودة في تطبيق أندرويد، مع ما يخص الكمبيوتر */
const { contextBridge, ipcRenderer } = require('electron');

let ver = '';
try { ver = ipcRenderer.sendSync('version'); } catch (e) {}

contextBridge.exposeInMainWorld('JardApp', {
  desktop: true,
  version: () => ver,
  saveFile: (name, mime, b64) => ipcRenderer.invoke('save-file', name, mime, b64),
  shareText: text => ipcRenderer.invoke('share-text', text),
  copyText: text => ipcRenderer.invoke('copy-text', text),
  print: (title, kind) => ipcRenderer.invoke('print', title, kind),
  printers: () => ipcRenderer.invoke('printers'),
  getPrinter: () => ipcRenderer.invoke('get-printer'),
  setPrinter: name => ipcRenderer.invoke('set-printer', name)
});
