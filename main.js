const { app, BrowserWindow, Menu, shell, Tray, nativeImage, protocol, net, ipcMain, dialog } = require('electron');
const path = require('path');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); process.exit(0); }

let mainWindow, tray;

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true }
}]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 860, minWidth: 900, minHeight: 600,
    title: '나만의 캘린더',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,  // 로컬 file:// 동영상/음악 로드 허용
      // webview 태그 활성화 — 유튜브 독립 렌더러
      webviewTag: true,
    },
    frame: true, backgroundColor: '#f5f0ff', show: false,
  });

  mainWindow.loadURL('app://./index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 외부 링크 → 기본 브라우저
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) { event.preventDefault(); shell.openExternal(url); }
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
}

// ytHide IPC는 webview 방식에선 사용 안 하지만 에러 방지용으로 유지
ipcMain.on('yt-load', () => {});
ipcMain.on('open-external', (_e, url) => { shell.openExternal(url); });

// 동영상/음악 파일 선택 다이얼로그 — 실제 경로 반환
ipcMain.handle('select-media-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '동영상 / 음악 파일 선택',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '미디어 파일', extensions: ['mp4','mkv','avi','mov','webm','mp3','wav','flac','ogg','m4a','aac'] },
      { name: '동영상', extensions: ['mp4','mkv','avi','mov','webm'] },
      { name: '음악',   extensions: ['mp3','wav','flac','ogg','m4a','aac'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;  // 실제 절대경로 배열
});
ipcMain.on('yt-hide', () => {});
ipcMain.on('yt-panel-toggle', () => {});

// 로컬 경로 열기 — shell.openPath로 파일 탐색기에서 폴더/파일 열기
ipcMain.on('open-local-path', (_event, pathStr) => {
  shell.openPath(pathStr).then(err => {
    if (err) {
      // openPath 실패 시 openExternal 폴백
      shell.openExternal('file:///' + pathStr.replace(/\\/g, '/'));
    }
  });
});

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '파일', submenu: [
      { label: '새로고침', accelerator: 'F5',     click: () => mainWindow.reload() },
      { type: 'separator' },
      { label: '종료',     accelerator: 'Alt+F4', click: () => { app.isQuitting=true; app.quit(); } },
    ]},
    { label: '편집', submenu: [
      { label: '실행 취소', role: 'undo' }, { label: '다시 실행', role: 'redo' },
      { type: 'separator' },
      { label: '잘라내기', role: 'cut' }, { label: '복사', role: 'copy' }, { label: '붙여넣기', role: 'paste' },
    ]},
    { label: '보기', submenu: [
      { label: '확대',        accelerator: 'CmdOrCtrl+=', click: () => { const z=mainWindow.webContents.getZoomFactor(); mainWindow.webContents.setZoomFactor(Math.min(z+0.1,2.0)); }},
      { label: '축소',        accelerator: 'CmdOrCtrl+-', click: () => { const z=mainWindow.webContents.getZoomFactor(); mainWindow.webContents.setZoomFactor(Math.max(z-0.1,0.5)); }},
      { label: '기본 크기',   accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.setZoomFactor(1.0) },
      { type: 'separator' },
      { label: '전체화면',    accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      { type: 'separator' },
      { label: '개발자 도구', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
    ]},
    { label: '도움말', submenu: [{ label: '나만의 캘린더 v1.0', enabled: false }] },
  ]));
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  } catch { tray = new Tray(nativeImage.createEmpty()); }
  tray.setToolTip('나만의 캘린더');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting=true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// ── User-Agent 전역 변경 ──────────────────────────────
// Electron 문자열을 제거해야 유튜브 오류 153 우회 가능
// app.ready 전에 설정해야 모든 세션에 적용됨
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

app.whenReady().then(() => {
  // 기본 세션 UA 변경 (webview 포함 모든 요청에 적용)
  const { session } = require('electron');
  // 기본 세션 + youtube 전용 파티션 모두 UA 적용
  const sessions = [
    session.defaultSession,
    session.fromPartition('persist:youtube'),
  ];
  sessions.forEach(ses => {
    ses.setUserAgent(CHROME_UA);
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = CHROME_UA;
      delete details.requestHeaders['X-Electron'];
      callback({ requestHeaders: details.requestHeaders });
    });
  });
  protocol.handle('app', (request) => {
    const url  = request.url.replace('app://./', '');
    const file = path.join(__dirname, decodeURIComponent(url.split('?')[0]));
    return net.fetch('file://' + file);
  });
  createWindow();
  createMenu();
  createTray();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { app.isQuitting = true; });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length===0) createWindow(); });