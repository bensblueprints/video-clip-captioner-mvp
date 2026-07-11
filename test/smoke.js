'use strict';
/**
 * Captionly smoke test — deterministic and network-free by default.
 * ALL test media is synthesized locally with ffmpeg (testsrc + sine);
 * nothing is ever downloaded, so no copyrighted content is touched.
 *
 *   1. ffmpeg-static resolves and runs -version
 *   2. Synthesize an 8s fixture video; probe duration + size; extract 16kHz WAV
 *   3. Caption engine: group words → cues (line length / gap / punctuation rules)
 *   4. Inline edit + re-sync: replacing a cue's text redistributes word timings
 *   5. Emoji keyword decoration
 *   6. SRT generation (timestamps, ordering, text)
 *   7. ASS generation for all 3 presets — karaoke \k tags, style header, overrides
 *   8. REAL burn-in: render the ASS onto the synthesized fixture with ffmpeg,
 *      assert the output MP4 exists, is valid, and matches the input duration
 *   9. Project file round-trip (.captionly JSON, BOM-free)
 *  10. Whisper SRT→words parser on captured whisper.cpp-style output
 *  11. Optional REAL whisper.cpp transcription behind SMOKE_WHISPER=1
 *      (downloads engine+model on first run — off by default).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ffmpeg = require('../src/lib/ffmpeg');
const captions = require('../src/lib/captions');
const project = require('../src/lib/project');
const { srtToWords, parseSrt } = require('../src/lib/whisper');

const WORK = path.join(__dirname, '.work');

function log(msg) {
  console.log('[smoke] ' + msg);
}

/* Realistic word-level transcript fixture (what whisper --max-len 1 yields). */
const WORDS = [
  ['Stop', 0.00, 0.28], ['scrolling.', 0.28, 0.90], ['This', 1.10, 1.30], ['one', 1.30, 1.48],
  ['trick', 1.48, 1.80], ['saved', 1.80, 2.14], ['me', 2.14, 2.26], ['money', 2.26, 2.70],
  ['every', 2.85, 3.10], ['single', 3.10, 3.42], ['month.', 3.42, 3.90],
  ['First,', 4.40, 4.75], ['cancel', 4.75, 5.10], ['the', 5.10, 5.20], ['subscriptions', 5.20, 5.95],
  ['you', 5.95, 6.05], ['forgot', 6.05, 6.40], ['about.', 6.40, 6.85],
  ['Then', 7.05, 7.25], ['watch', 7.25, 7.55], ['this.', 7.55, 7.95]
].map(([word, start, end]) => ({ word, start, end }));

async function step1_ffmpeg() {
  log('checking ffmpeg-static resolves and runs -version...');
  const bin = ffmpeg.ffmpegPath();
  assert.ok(fs.existsSync(bin), 'ffmpeg-static binary exists: ' + bin);
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true });
  assert.strictEqual(res.status, 0, 'ffmpeg -version exited 0');
  assert.ok(/ffmpeg version/i.test(res.stdout), 'ffmpeg printed a version banner');
  log('ffmpeg: ' + bin);
}

async function step2_fixture() {
  log('synthesizing 8s local fixture (testsrc + sine — no downloads, no real media)...');
  const fixture = path.join(WORK, 'fixture.mp4');
  await ffmpeg.makeTestFixture(fixture, 8);
  assert.ok(fs.existsSync(fixture) && fs.statSync(fixture).size > 1000, 'fixture mp4 exists with content');
  const dur = await ffmpeg.probeDuration(fixture);
  assert.ok(dur !== null && Math.abs(dur - 8) <= 0.5, 'fixture duration ~8s, got ' + dur);
  const size = await ffmpeg.probeSize(fixture);
  assert.deepStrictEqual(size, { width: 640, height: 360 }, 'fixture size probed as 640x360');

  log('extracting 16kHz mono WAV (whisper input format)...');
  const wav = path.join(WORK, 'audio.wav');
  await ffmpeg.extractWav(fixture, wav);
  assert.ok(fs.existsSync(wav), 'wav exists');
  const buf = fs.readFileSync(wav);
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF', 'wav has RIFF header');
  assert.strictEqual(buf.readUInt32LE(24), 16000, 'wav sample rate is 16000Hz');
  assert.strictEqual(buf.readUInt16LE(22), 1, 'wav is mono');
  return fixture;
}

function step3_groupingImpl() {
  log('grouping word-level transcript into caption cues...');
  const cues = captions.groupWords(WORDS, { maxChars: 22, maxWords: 5, maxGapS: 0.6 });
  assert.ok(cues.length >= 4, `grouped into ${cues.length} cues (>= 4)`);
  for (const c of cues) {
    assert.ok(captions.cueText(c).length <= 28, 'cue line length bounded: "' + captions.cueText(c) + '"');
    assert.ok(c.words.length <= 5, 'cue word count bounded');
    assert.ok(c.end > c.start, 'cue has positive duration');
  }
  // punctuation forces a break: "scrolling." ends cue 1
  assert.strictEqual(captions.cueText(cues[0]), 'Stop scrolling.', 'sentence end breaks the cue');
  // cues are in order and non-overlapping
  for (let i = 1; i < cues.length; i++) {
    assert.ok(cues[i].start >= cues[i - 1].end - 0.01, 'cues are sequential');
  }
  log('cues: ' + cues.map((c) => JSON.stringify(captions.cueText(c))).join(' '));
  return cues;
}

function step4_editResync(cues) {
  log('editing a cue and re-syncing word timings...');
  const cue = cues[1];
  const edited = captions.editCueText(cue, 'This one WEIRD trick rescued me');
  assert.strictEqual(edited.words.length, 6, 'edited cue has 6 words');
  assert.strictEqual(edited.start, cue.start, 'cue start preserved');
  assert.strictEqual(edited.words[0].start, cue.start, 'first word starts at cue start');
  assert.strictEqual(edited.words[5].end, cue.end, 'last word ends exactly at cue end');
  for (let i = 1; i < edited.words.length; i++) {
    assert.ok(edited.words[i].start >= edited.words[i - 1].start, 'word starts are monotonic');
  }
  const longer = edited.words.find((w) => w.word === 'rescued');
  const shorter = edited.words.find((w) => w.word === 'me');
  assert.ok((longer.end - longer.start) > (shorter.end - shorter.start),
    'longer words get proportionally more time');
}

function step5_emoji(cues) {
  log('applying keyword→emoji decoration...');
  const decorated = captions.applyEmoji(cues);
  const flat = decorated.flatMap((c) => c.words.map((w) => w.word)).join(' ');
  assert.ok(flat.includes('money 💰'), '"money" got 💰');
  assert.ok(flat.includes('watch 👀'), '"watch" got 👀');
  const again = captions.applyEmoji(decorated);
  const flat2 = again.flatMap((c) => c.words.map((w) => w.word)).join(' ');
  assert.strictEqual(flat, flat2, 'emoji application is idempotent');
  assert.strictEqual(cues.flatMap((c) => c.words.map((w) => w.word)).join(' ').includes('💰'), false,
    'original cues untouched (pure function)');
  return decorated;
}

function step6_srt(cues) {
  log('generating SRT...');
  const srt = captions.toSrt(cues);
  fs.writeFileSync(path.join(WORK, 'captions.srt'), srt, 'utf8');
  assert.ok(srt.startsWith('1\n'), 'srt starts at index 1');
  assert.ok(srt.includes('00:00:00,000 --> 00:00:00,900'), 'first cue timestamps formatted');
  assert.ok(srt.includes('Stop scrolling.'), 'srt contains cue text');
  const reparsed = parseSrt(srt);
  assert.strictEqual(reparsed.length, cues.length, 'generated SRT re-parses to the same cue count');
}

function step7_ass(cues) {
  log('generating ASS for all presets...');
  const presetIds = Object.keys(captions.STYLE_PRESETS);
  assert.ok(presetIds.length >= 3, `>= 3 style presets (${presetIds.join(', ')})`);
  for (const id of presetIds) {
    const ass = captions.toAss(cues, id, { playResX: 640, playResY: 360 });
    assert.ok(ass.includes('[Script Info]') && ass.includes('[V4+ Styles]') && ass.includes('[Events]'),
      id + ': valid ASS structure');
    assert.ok(ass.includes('PlayResX: 640'), id + ': PlayRes matches video');
    assert.ok(ass.split('\n').filter((l) => l.startsWith('Dialogue:')).length === cues.length,
      id + ': one Dialogue line per cue');
  }
  const karaoke = captions.toAss(cues, 'karaoke');
  assert.ok(/\{\\k\d+\}/.test(karaoke), 'karaoke preset emits \\k word-timing tags');
  assert.ok(karaoke.includes('STOP'), 'karaoke preset upper-cases words');
  const plain = captions.toAss(cues, 'subtitle-bar');
  assert.ok(!/\{\\k\d+\}/.test(plain), 'subtitle-bar preset has no karaoke tags');
  const custom = captions.toAss(cues, 'karaoke', { overrides: { fontSize: 99 } });
  assert.ok(custom.includes(',99,'), 'style overrides land in the ASS header');
  const assPath = path.join(WORK, 'captions.ass');
  fs.writeFileSync(assPath, captions.toAss(cues, 'karaoke', { playResX: 640, playResY: 360 }), 'utf8');
  return assPath;
}

async function step8_burnIn(fixture, assPath) {
  log('REAL burn-in: rendering ASS captions onto the synthesized fixture...');
  const out = path.join(WORK, 'captioned.mp4');
  let lastPct = 0;
  await ffmpeg.burnIn(fixture, assPath, out, { onProgress: (p) => { lastPct = p; } });
  assert.ok(fs.existsSync(out), 'captioned mp4 exists');
  assert.ok(fs.statSync(out).size > 10000, 'captioned mp4 has real content');
  assert.strictEqual(lastPct, 100, 'burn-in progress reached 100');
  const inDur = await ffmpeg.probeDuration(fixture);
  const outDur = await ffmpeg.probeDuration(out);
  assert.ok(Math.abs(inDur - outDur) <= 0.5, `output duration ${outDur}s ~ input ${inDur}s`);
  // burned video should be larger-entropy than a plain re-encode of colour bars…
  // …but that's flaky to assert; existence + duration + successful ass filter is the contract.
  log(`burned: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${outDur.toFixed(2)}s)`);
}

function step9_project(cues) {
  log('project file round-trip...');
  const p = path.join(WORK, 'fixture.captionly');
  project.saveProject(p, {
    video_path: path.join(WORK, 'fixture.mp4'),
    style_id: 'karaoke',
    style_overrides: { fontSize: 64 },
    emoji_enabled: true,
    cues
  });
  const raw = fs.readFileSync(p, 'utf8');
  assert.ok(raw.charCodeAt(0) !== 0xFEFF, 'project file is BOM-free');
  const loaded = project.loadProject(p);
  assert.strictEqual(loaded.cues.length, cues.length, 'cues survive round-trip');
  assert.strictEqual(loaded.style_id, 'karaoke', 'style survives round-trip');
  assert.strictEqual(loaded.style_overrides.fontSize, 64, 'overrides survive round-trip');
  assert.throws(() => project.loadProject(path.join(WORK, 'captions.srt')), 'non-project file rejected');
}

function step10_whisperParser() {
  log('parsing whisper.cpp-style word-level SRT output...');
  const sample = `1
00:00:00,000 --> 00:00:00,320
 Hello

2
00:00:00,320 --> 00:00:00,700
 world.

3
00:00:01,150 --> 00:00:01,600
 Testing
`;
  const words = srtToWords(sample);
  assert.strictEqual(words.length, 3, 'parsed 3 words');
  assert.deepStrictEqual(words[0], { word: 'Hello', start: 0, end: 0.32 }, 'word 1 parsed with timestamps');
  assert.strictEqual(words[1].word, 'world.', 'word text trimmed');
  assert.ok(Math.abs(words[2].start - 1.15) < 0.001, 'timestamps parse to seconds');
}

async function step11_optionalWhisper(fixture) {
  if (process.env.SMOKE_WHISPER !== '1') {
    log('SMOKE_WHISPER not set — skipping real whisper.cpp run (default deterministic path).');
    return;
  }
  log('SMOKE_WHISPER=1 — downloading whisper engine + tiny model and transcribing the sine fixture...');
  const dl = require('../src/lib/download');
  const { transcribeWords } = require('../src/lib/whisper');
  const cache = path.join(__dirname, '.cache');
  const bin = await dl.ensureWhisperBinary(cache);
  const model = await dl.ensureModel(cache, 'tiny');
  const wav = path.join(WORK, 'audio.wav');
  const r = await transcribeWords({ binPath: bin, modelPath: model, wavPath: wav, outDir: path.join(WORK, 'whisper-out') });
  // a pure sine tone has no speech; the contract is: pipeline runs, output parses
  assert.ok(Array.isArray(r.words), 'whisper pipeline produced a (possibly empty) word list');
  log('whisper ran; words=' + r.words.length);
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  await step1_ffmpeg();
  const fixture = await step2_fixture();
  const cues = step3_groupingImpl();
  step4_editResync(cues);
  const decorated = step5_emoji(cues);
  step6_srt(cues);
  const assPath = step7_ass(decorated);
  await step8_burnIn(fixture, assPath);
  step9_project(cues);
  step10_whisperParser();
  await step11_optionalWhisper(fixture);

  log('ALL SMOKE TESTS PASSED');
})().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
