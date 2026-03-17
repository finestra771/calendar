const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ytLoad:        (videoId) => ipcRenderer.send('yt-load', videoId),
  ytHide:        ()        => ipcRenderer.send('yt-hide'),
  ytPanelToggle: (visible) => ipcRenderer.send('yt-panel-toggle', visible),
  openLocalPath:  (path) => ipcRenderer.send('open-local-path', path),
  openExternal:    (url)  => ipcRenderer.send('open-external', url),
  selectMediaFiles: ()     => ipcRenderer.invoke('select-media-files'),
});