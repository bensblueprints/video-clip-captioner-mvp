'use strict';
/**
 * First-run asset downloads: whisper.cpp Windows binary + ggml models.
 * Everything is stored under the app data dir passed by the caller
 * (Electron userData in the app, a local cache dir in tests).
 */
const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');

const WHISPER_VERSION = 'v1.9.1';
const WHISPER_ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;

const MODELS = {
  'tiny':      { file: 'ggml-tiny.bin',      sizeMB: 78 },
  'tiny.en':   { file: 'ggml-tiny.en.bin',   sizeMB: 78 },
  'base':      { file: 'ggml-base.bin',      sizeMB: 148 },
  'base.en':   { file: 'ggml-base.en.bin',   sizeMB: 148 },
  'small':     { file: 'ggml-small.bin',     sizeMB: 488 },
  'small.en':  { file: 'ggml-small.en.bin',  sizeMB: 488 },
  'medium':    { file: 'ggml-medium.bin',    sizeMB: 1530 },
  'medium.en': { file: 'ggml-medium.en.bin', sizeMB: 1530 }
};

function modelUrl(name) {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODELS[name].file}`;
}

/** Stream a URL to disk with progress callbacks. Follows redirects (fetch does). */
async function downloadFile(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) {
        await new Promise((r) => out.once('drain', r));
      }
      if (onProgress) onProgress({ received, total });
    }
    await new Promise((resolve, reject) => {
      out.end(() => resolve());
      out.on('error', reject);
    });
    fs.renameSync(tmp, dest);
  } catch (err) {
    out.destroy();
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    throw err;
  }
}

function findFileRecursive(dir, fileName) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, fileName);
      if (found) return found;
    } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function binDir(dataDir) {
  return path.join(dataDir, 'whisper-bin', WHISPER_VERSION);
}

/** Returns path to whisper-cli.exe if installed, else null. */
function whisperBinaryPath(dataDir) {
  const dir = binDir(dataDir);
  if (!fs.existsSync(dir)) return null;
  return findFileRecursive(dir, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
}

/** Download + extract the whisper.cpp prebuilt binary if missing. */
async function ensureWhisperBinary(dataDir, onProgress) {
  const existing = whisperBinaryPath(dataDir);
  if (existing) return existing;
  if (process.platform !== 'win32') {
    throw new Error('Automatic binary download is Windows-only. Build whisper.cpp and place whisper-cli in ' + binDir(dataDir));
  }
  const dir = binDir(dataDir);
  const zipPath = path.join(dataDir, 'whisper-bin.zip.download');
  await downloadFile(WHISPER_ZIP_URL, zipPath, (p) => onProgress && onProgress({ stage: 'binary', ...p }));
  fs.mkdirSync(dir, { recursive: true });
  await extractZip(zipPath, { dir });
  fs.unlinkSync(zipPath);
  const bin = whisperBinaryPath(dataDir);
  if (!bin) throw new Error('whisper-cli.exe not found inside downloaded archive');
  return bin;
}

function modelsDir(dataDir) {
  return path.join(dataDir, 'models');
}

/** Returns path to a model file if downloaded, else null. */
function modelPath(dataDir, name) {
  if (!MODELS[name]) throw new Error('Unknown model: ' + name);
  const p = path.join(modelsDir(dataDir), MODELS[name].file);
  return fs.existsSync(p) ? p : null;
}

/** Download a ggml model from Hugging Face if missing. */
async function ensureModel(dataDir, name, onProgress) {
  const existing = modelPath(dataDir, name);
  if (existing) return existing;
  const dest = path.join(modelsDir(dataDir), MODELS[name].file);
  await downloadFile(modelUrl(name), dest, (p) => onProgress && onProgress({ stage: 'model', model: name, ...p }));
  return dest;
}

module.exports = {
  MODELS,
  WHISPER_VERSION,
  downloadFile,
  whisperBinaryPath,
  ensureWhisperBinary,
  modelPath,
  ensureModel
};
