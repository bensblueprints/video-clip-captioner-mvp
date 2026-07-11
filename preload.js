'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('captionly', {
  pickVideo: () => ipcRenderer.invoke('pick:video'),
  probeVideo: (p) => ipcRenderer.invoke('video:probe', p),

  whisperStatus: () => ipcRenderer.invoke('whisper:status'),
  whisperSetup: (model) => ipcRenderer.invoke('whisper:setup', model),
  transcribe: (payload) => ipcRenderer.invoke('whisper:transcribe', payload),

  regroup: (words, opts) => ipcRenderer.invoke('cues:regroup', { words, opts }),
  editCueText: (cue, text) => ipcRenderer.invoke('cues:editText', { cue, text }),
  applyEmoji: (cues) => ipcRenderer.invoke('cues:applyEmoji', cues),
  presets: () => ipcRenderer.invoke('captions:presets'),

  saveProject: (proj) => ipcRenderer.invoke('project:save', proj),
  openProject: () => ipcRenderer.invoke('project:open'),

  exportSrt: (payload) => ipcRenderer.invoke('export:srt', payload),
  exportAss: (payload) => ipcRenderer.invoke('export:ass', payload),
  exportBurn: (payload) => ipcRenderer.invoke('export:burn', payload),
  showItem: (p) => ipcRenderer.invoke('shell:showItem', p),

  onSetupProgress: (cb) => ipcRenderer.on('setup:progress', (_e, p) => cb(p)),
  onTranscribeStage: (cb) => ipcRenderer.on('transcribe:stage', (_e, p) => cb(p)),
  onTranscribeProgress: (cb) => ipcRenderer.on('transcribe:progress', (_e, p) => cb(p)),
  onBurnProgress: (cb) => ipcRenderer.on('burn:progress', (_e, p) => cb(p))
});
