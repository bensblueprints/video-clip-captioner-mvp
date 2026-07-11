'use strict';
/**
 * Word-level transcription via whisper.cpp (whisper-cli.exe).
 * We run with `--max-len 1 --split-on-word` so every SRT entry is a single
 * word with its own timestamps, then parse that into [{word,start,end}] —
 * exactly what the caption engine consumes.
 * (Same local-model pipeline as our Whisper Transcriber product.)
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseSrtTime(t) {
  const m = String(t).trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

/** Parse an SRT string into entries [{start, end, text}]. */
function parseSrt(srt) {
  const entries = [];
  const blocks = String(srt).replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const text = lines.slice(timeIdx + 1).join(' ').trim();
    if (!text) continue;
    entries.push({ start: parseSrtTime(a), end: parseSrtTime(b), text });
  }
  return entries;
}

/** SRT entries (one word each, from --max-len 1) → word list. */
function srtToWords(srt) {
  return parseSrt(srt)
    .map((e) => ({ word: e.text.trim(), start: e.start, end: e.end }))
    .filter((w) => w.word !== '');
}

/**
 * @param {object} opts { binPath, modelPath, wavPath, outDir, language, threads, onProgress }
 * @returns {Promise<{ words: Array<{word,start,end}>, srtRaw: string }>}
 */
function transcribeWords(opts) {
  const { binPath, modelPath, wavPath, outDir, language = 'auto', threads, onProgress } = opts;
  fs.mkdirSync(outDir, { recursive: true });
  const outBase = path.join(outDir, 'words');
  const args = [
    '-m', modelPath,
    '-f', wavPath,
    '-l', language,
    '--max-len', '1',
    '--split-on-word',
    '-osrt',
    '-of', outBase,
    '--print-progress'
  ];
  if (threads) args.push('-t', String(threads));

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { windowsHide: true, cwd: path.dirname(binPath) });
    let stderr = '';
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (onProgress) {
        const matches = s.match(/progress\s*=\s*(\d+)%/g);
        if (matches) {
          const last = matches[matches.length - 1].match(/(\d+)%/);
          if (last) onProgress(Number(last[1]));
        }
      }
    });
    child.stdout.resume(); // drain
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`whisper-cli exited with code ${code}:\n${stderr.slice(-3000)}`));
      }
      try {
        const srtFile = outBase + '.srt';
        if (!fs.existsSync(srtFile)) throw new Error('Expected output file missing: ' + srtFile);
        const srtRaw = fs.readFileSync(srtFile, 'utf8');
        if (onProgress) onProgress(100);
        resolve({ words: srtToWords(srtRaw), srtRaw });
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { transcribeWords, parseSrt, srtToWords, parseSrtTime };
