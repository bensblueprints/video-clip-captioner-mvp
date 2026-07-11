'use strict';
/**
 * ffmpeg-static wrapper: probing, 16kHz WAV extraction for Whisper,
 * ASS burn-in rendering, and a synthetic test-fixture generator
 * (testsrc + sine) so `npm test` NEVER downloads real video content.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpegPath() {
  // ffmpeg-static resolves to the platform binary inside node_modules.
  // In a packaged app the module lives in app.asar.unpacked (see build config).
  const p = require('ffmpeg-static');
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

function run(args, { cwd, onStderrLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true, cwd });
    let stderr = '';
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (onStderrLine) s.split(/\r|\n/).filter(Boolean).forEach(onStderrLine);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.slice(-2000)}`));
    });
  });
}

/** Generate a synthetic N-second MP4 fixture (video testsrc + sine tone). */
async function makeTestFixture(outPath, durationSec = 10, { size = '640x360' } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await run([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc=duration=${durationSec}:size=${size}:rate=24`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '24',
    '-c:a', 'aac', '-shortest',
    outPath
  ]);
  return outPath;
}

/** Duration of a media file in seconds (parsed from ffmpeg -i stderr), or null. */
function probeDuration(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-i', inputPath], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}

/** Video dimensions {width, height} parsed from ffmpeg -i stderr, or null. */
function probeSize(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-i', inputPath], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const m = stderr.match(/Video:.* (\d{2,5})x(\d{2,5})/);
      if (!m) return resolve(null);
      resolve({ width: Number(m[1]), height: Number(m[2]) });
    });
  });
}

/** Extract 16kHz mono WAV (what whisper.cpp expects). */
async function extractWav(inputPath, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await run([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
    outPath
  ]);
  return outPath;
}

/**
 * Burn an .ass subtitle file into a video → MP4.
 * Filter-path escaping on Windows is a minefield, so we run ffmpeg with
 * cwd = the .ass file's directory and reference it by bare filename.
 * onProgress receives 0-100 (parsed from time= against total duration).
 */
async function burnIn(inputPath, assPath, outPath, { crf = 20, onProgress } = {}) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const total = await probeDuration(inputPath);
  const assDir = path.dirname(assPath);
  const assFile = path.basename(assPath);
  // filename needs quoting inside the filter; a bare basename has no drive colon.
  const vf = `ass='${assFile.replace(/(['\\])/g, '\\$1')}'`;
  await run(
    [
      '-y', '-hide_banner', '-loglevel', 'info', '-stats',
      '-i', path.resolve(inputPath),
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-c:a', 'copy',
      path.resolve(outPath)
    ],
    {
      cwd: assDir,
      onStderrLine: (line) => {
        if (!onProgress || !total) return;
        const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m) {
          const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
          onProgress(Math.max(0, Math.min(100, Math.round((t / total) * 100))));
        }
      }
    }
  );
  if (onProgress) onProgress(100);
  return outPath;
}

module.exports = { ffmpegPath, run, makeTestFixture, probeDuration, probeSize, extractWav, burnIn };
