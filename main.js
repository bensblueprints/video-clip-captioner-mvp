'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('./src/lib/ffmpeg');
const dl = require('./src/lib/download');
const { transcribeWords } = require('./src/lib/whisper');
const captions = require('./src/lib/captions');
const project = require('./src/lib/project');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#0a0c12',
    autoHideMenuBar: true,
    title: 'Captionly',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for file:// video preview of user media
      webSecurity: false // allow <video src="file://..."> preview of local files
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Boot verification hook: CAPTIONLY_SMOKE=1 npm start prints a UI snapshot and exits.
  if (process.env.CAPTIONLY_SMOKE) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const snap = await win.webContents.executeJavaScript(`({
            bridge: typeof window.captionly,
            dropzone: !!document.getElementById('dropzone'),
            presets: document.querySelectorAll('.preset-card').length,
            title: document.title
          })`);
          console.log('SMOKE:' + JSON.stringify(snap));
        } catch (err) {
          console.log('SMOKE-ERROR:' + err.message);
        }
        app.exit(0);
      }, 1500);
    });
  }
}

const dataDir = () => app.getPath('userData');
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

/* ── file pickers ── */
ipcMain.handle('pick:video', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open a video',
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  return probeVideo(filePaths[0]);
});

async function probeVideo(p) {
  const [duration, size] = await Promise.all([ffmpeg.probeDuration(p), ffmpeg.probeSize(p)]);
  return { path: p, duration, size };
}
ipcMain.handle('video:probe', (_e, p) => probeVideo(p));

/* ── whisper setup + transcription ── */
ipcMain.handle('whisper:status', () => {
  const bin = dl.whisperBinaryPath(dataDir());
  const models = {};
  for (const name of Object.keys(dl.MODELS)) models[name] = !!dl.modelPath(dataDir(), name);
  return { binReady: !!bin, models, modelList: dl.MODELS };
});

ipcMain.handle('whisper:setup', async (_e, modelName) => {
  const onProgress = (p) => send('setup:progress', p);
  const bin = await dl.ensureWhisperBinary(dataDir(), onProgress);
  const model = await dl.ensureModel(dataDir(), modelName || 'base', onProgress);
  return { bin, model };
});

ipcMain.handle('whisper:transcribe', async (_e, { videoPath, modelName, language }) => {
  const bin = dl.whisperBinaryPath(dataDir());
  const model = dl.modelPath(dataDir(), modelName || 'base');
  if (!bin || !model) throw new Error('Whisper not set up yet — download the engine + model first.');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'captionly-'));
  try {
    send('transcribe:stage', { stage: 'audio' });
    const wav = path.join(workDir, 'audio.wav');
    await ffmpeg.extractWav(videoPath, wav);

    send('transcribe:stage', { stage: 'whisper' });
    const { words } = await transcribeWords({
      binPath: bin, modelPath: model, wavPath: wav, outDir: workDir,
      language: language || 'auto',
      onProgress: (pct) => send('transcribe:progress', pct)
    });
    const cues = captions.groupWords(words);
    return { words, cues };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

/* ── caption ops (pure, but kept in main so renderer stays dumb) ── */
ipcMain.handle('cues:regroup', (_e, { words, opts }) => captions.groupWords(words, opts));
ipcMain.handle('cues:editText', (_e, { cue, text }) => captions.editCueText(cue, text));
ipcMain.handle('cues:applyEmoji', (_e, cues) => captions.applyEmoji(cues));
ipcMain.handle('captions:presets', () => captions.STYLE_PRESETS);

/* ── project save/load ── */
ipcMain.handle('project:save', async (_e, proj) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Captionly project',
    defaultPath: path.basename(proj.video_path || 'project', path.extname(proj.video_path || '')) + '.captionly',
    filters: [{ name: 'Captionly project', extensions: ['captionly'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  project.saveProject(filePath, proj);
  return { canceled: false, path: filePath };
});

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open Captionly project',
    filters: [{ name: 'Captionly project', extensions: ['captionly'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  const data = project.loadProject(filePaths[0]);
  const video = fs.existsSync(data.video_path) ? await probeVideo(data.video_path) : null;
  return { ...data, project_path: filePaths[0], video };
});

/* ── exports ── */
ipcMain.handle('export:srt', async (_e, { cues, suggestedName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export SRT subtitles',
    defaultPath: (suggestedName || 'captions') + '.srt',
    filters: [{ name: 'SubRip', extensions: ['srt'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  fs.writeFileSync(filePath, captions.toSrt(cues), 'utf8');
  return { canceled: false, path: filePath };
});

ipcMain.handle('export:ass', async (_e, { cues, styleId, overrides, playRes, suggestedName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export ASS subtitles',
    defaultPath: (suggestedName || 'captions') + '.ass',
    filters: [{ name: 'Advanced SubStation', extensions: ['ass'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  fs.writeFileSync(filePath, captions.toAss(cues, styleId, { ...playResOpts(playRes), overrides }), 'utf8');
  return { canceled: false, path: filePath };
});

function playResOpts(playRes) {
  return playRes && playRes.width && playRes.height
    ? { playResX: playRes.width, playResY: playRes.height }
    : {};
}

ipcMain.handle('export:burn', async (_e, { videoPath, cues, styleId, overrides, playRes }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export captioned MP4',
    defaultPath: path.basename(videoPath, path.extname(videoPath)) + '-captioned.mp4',
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
  });
  if (canceled || !filePath) return { canceled: true };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'captionly-burn-'));
  try {
    const assPath = path.join(workDir, 'captions.ass');
    fs.writeFileSync(assPath, captions.toAss(cues, styleId, { ...playResOpts(playRes), overrides }), 'utf8');
    await ffmpeg.burnIn(videoPath, assPath, filePath, {
      onProgress: (pct) => send('burn:progress', pct)
    });
    return { canceled: false, path: filePath };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.bensblueprints.captionly');
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
