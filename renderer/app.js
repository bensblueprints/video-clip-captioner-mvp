'use strict';
/* Captionly renderer — drop video → transcribe → edit cues → style → export. */

const $ = (s, el = document) => el.querySelector(s);

const state = {
  video: null,          // { path, duration, size }
  words: [],
  cues: [],
  styleId: 'karaoke',
  overrides: {},        // fontSize / alignment / highlight
  emoji: false,
  currentCue: -1
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${m}:${sec}`;
}

/* ── setup card ─────────────────────────────────────────────────────── */

async function refreshSetup() {
  const st = await window.captionly.whisperStatus();
  const card = $('#setupCard');
  card.hidden = false;
  const model = $('#modelSelect').value;
  const ready = st.binReady && st.models[model];
  $('#setupStatus').textContent = ready
    ? `Ready — engine + "${model}" model installed ✓`
    : st.binReady
      ? `Engine installed — "${model}" model not downloaded yet`
      : 'Not installed yet — one-time download required';
  $('#setupBtn').textContent = ready ? 'Re-check' : 'Download';
  return ready;
}

$('#modelSelect').addEventListener('change', refreshSetup);
$('#setupBtn').addEventListener('click', async () => {
  const bar = $('#setupProgressBar');
  $('#setupProgress').hidden = false;
  $('#setupBtn').disabled = true;
  try {
    window.captionly.onSetupProgress((p) => {
      if (p.total) bar.style.width = Math.round((p.received / p.total) * 100) + '%';
    });
    await window.captionly.whisperSetup($('#modelSelect').value);
    toast('Whisper ready ✓');
  } catch (err) {
    toast('Download failed: ' + err.message);
  } finally {
    $('#setupBtn').disabled = false;
    $('#setupProgress').hidden = true;
    refreshSetup();
  }
});

/* ── open video ─────────────────────────────────────────────────────── */

const dz = $('#dropzone');
dz.addEventListener('click', async () => {
  const v = await window.captionly.pickVideo();
  if (v) loadVideo(v);
});
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', async (e) => {
  e.preventDefault();
  dz.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f && f.path) loadVideo(await window.captionly.probeVideo(f.path));
});

function loadVideo(v) {
  state.video = v;
  $('#startView').hidden = true;
  $('#editorView').hidden = false;
  const vid = $('#videoPreview');
  vid.src = 'file:///' + v.path.replace(/\\/g, '/');
  $('#saveProjectBtn').disabled = false;
  toast(`Loaded ${v.path.split(/[\\/]/).pop()} (${v.duration ? v.duration.toFixed(1) + 's' : '?'})`);
}

/* ── transcription ──────────────────────────────────────────────────── */

$('#transcribeBtn').addEventListener('click', async () => {
  if (!state.video) return;
  const st = await window.captionly.whisperStatus();
  const model = 'base';
  if (!st.binReady || !st.models[model]) {
    // fall back to whichever model IS installed
    const installed = Object.keys(st.models).find((m) => st.models[m]);
    if (!st.binReady || !installed) {
      toast('Set up the Whisper engine first (start screen)');
      $('#editorView').hidden = true;
      $('#startView').hidden = false;
      refreshSetup();
      return;
    }
  }

  const btn = $('#transcribeBtn');
  btn.disabled = true;
  $('#transcribeProgress').hidden = false;
  const bar = $('#transcribeProgressBar');
  window.captionly.onTranscribeStage(({ stage }) => {
    $('#transcribeStatus').textContent = stage === 'audio' ? 'Extracting audio…' : 'Running Whisper locally…';
  });
  window.captionly.onTranscribeProgress((pct) => { bar.style.width = pct + '%'; });

  try {
    const installedModel = Object.keys(st.models).find((m) => st.models[m]) || model;
    const r = await window.captionly.transcribe({ videoPath: state.video.path, modelName: installedModel });
    state.words = r.words;
    state.cues = r.cues;
    renderCues();
    updateExportButtons();
    toast(`Transcribed: ${r.words.length} words → ${r.cues.length} captions`);
    $('#transcribeStatus').textContent = `${r.cues.length} captions`;
  } catch (err) {
    toast('Transcription failed: ' + err.message);
    $('#transcribeStatus').textContent = '';
  } finally {
    btn.disabled = false;
    $('#transcribeProgress').hidden = true;
    bar.style.width = '0%';
  }
});

/* ── cue list + inline editing ──────────────────────────────────────── */

function renderCues() {
  const list = $('#cueList');
  $('#cueCount').textContent = state.cues.length ? `(${state.cues.length})` : '';
  if (!state.cues.length) {
    list.innerHTML = '<div class="empty">Transcribe to see your captions here.</div>';
    return;
  }
  list.innerHTML = state.cues.map((c, i) => `
    <div class="cue" data-i="${i}">
      <span class="time">${fmtTime(c.start)}</span>
      <span class="text" spellcheck="false">${c.words.map((w) => escapeHtml(w.word)).join(' ')}</span>
      <button class="del" title="Delete caption">✕</button>
    </div>`).join('');

  list.querySelectorAll('.cue').forEach((el) => {
    const i = Number(el.dataset.i);
    el.querySelector('.time').addEventListener('click', () => {
      $('#videoPreview').currentTime = state.cues[i].start + 0.01;
      $('#videoPreview').play();
    });
    el.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      state.cues.splice(i, 1);
      renderCues();
      updateExportButtons();
    });
    const textEl = el.querySelector('.text');
    textEl.addEventListener('click', () => {
      textEl.contentEditable = 'true';
      textEl.focus();
    });
    textEl.addEventListener('blur', async () => {
      textEl.contentEditable = 'false';
      const newText = textEl.innerText.trim();
      const oldText = state.cues[i].words.map((w) => w.word).join(' ');
      if (newText === oldText) return;
      if (!newText) { state.cues.splice(i, 1); renderCues(); return; }
      state.cues[i] = await window.captionly.editCueText(state.cues[i], newText);
      renderCues();
      toast('Caption edited — timing re-synced');
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* live overlay preview synced to the <video> */
$('#videoPreview').addEventListener('timeupdate', () => {
  const t = $('#videoPreview').currentTime;
  const i = state.cues.findIndex((c) => t >= c.start && t <= c.end);
  const overlay = $('#captionOverlay');
  const vid = $('#videoPreview');
  overlay.style.top = (vid.offsetTop + vid.offsetHeight * ($('#alignment').value === '8' ? 0.08 : $('#alignment').value === '5' ? 0.42 : 0.75)) + 'px';
  overlay.style.fontSize = Math.max(14, Number($('#fontSize').value) * (vid.offsetWidth / 1080)) + 'px';
  if (i === -1) { overlay.textContent = ''; return; }
  const cue = state.cues[i];
  if (state.styleId === 'karaoke') {
    overlay.innerHTML = cue.words
      .map((w) => (t >= w.start ? `<span class="hl">${escapeHtml(w.word.toUpperCase())}</span>` : escapeHtml(w.word.toUpperCase())))
      .join(' ');
  } else if (state.styleId === 'bold-center') {
    overlay.textContent = cue.words.map((w) => w.word.toUpperCase()).join(' ');
  } else {
    overlay.textContent = cue.words.map((w) => w.word).join(' ');
  }
  if (i !== state.currentCue) {
    state.currentCue = i;
    document.querySelectorAll('.cue').forEach((el) => el.classList.toggle('current', Number(el.dataset.i) === i));
  }
});

/* ── style presets ──────────────────────────────────────────────────── */

async function renderPresets() {
  const presets = await window.captionly.presets();
  $('#presetRow').innerHTML = Object.entries(presets).map(([id, p]) => `
    <div class="preset-card ${id === state.styleId ? 'active' : ''}" data-preset="${id}">
      <div class="demo">${id === 'karaoke' ? 'WORD <em>BY</em> WORD' : id === 'bold-center' ? 'BIG BOLD' : 'Classic subtitle'}</div>
      <div>${p.name}</div>
    </div>`).join('');
  document.querySelectorAll('.preset-card').forEach((el) =>
    el.addEventListener('click', () => {
      state.styleId = el.dataset.preset;
      document.querySelectorAll('.preset-card').forEach((x) => x.classList.toggle('active', x === el));
    }));
}

$('#fontSize').addEventListener('input', (e) => {
  $('#fontSizeVal').textContent = e.target.value;
  state.overrides.fontSize = Number(e.target.value);
});
$('#alignment').addEventListener('change', (e) => { state.overrides.alignment = Number(e.target.value); });
$('#highlightColor').addEventListener('input', (e) => {
  // #RRGGBB → ASS &H00BBGGRR
  const hex = e.target.value.replace('#', '');
  const r = hex.slice(0, 2), g = hex.slice(2, 4), b = hex.slice(4, 6);
  state.overrides.highlight = `&H00${b}${g}${r}`.toUpperCase();
});
$('#emojiToggle').addEventListener('change', async (e) => {
  state.emoji = e.target.checked;
  if (state.emoji && state.cues.length) {
    state.cues = await window.captionly.applyEmoji(state.cues);
    renderCues();
    toast('Keyword emoji applied ✨');
  }
});

/* ── exports ────────────────────────────────────────────────────────── */

function updateExportButtons() {
  const has = state.cues.length > 0;
  $('#burnBtn').disabled = !has;
  $('#srtBtn').disabled = !has;
  $('#assBtn').disabled = !has;
}

function baseName() {
  return state.video ? state.video.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') : 'captions';
}

$('#srtBtn').addEventListener('click', async () => {
  const r = await window.captionly.exportSrt({ cues: state.cues, suggestedName: baseName() });
  if (!r.canceled) { toast('SRT exported ✓'); window.captionly.showItem(r.path); }
});

$('#assBtn').addEventListener('click', async () => {
  const r = await window.captionly.exportAss({
    cues: state.cues, styleId: state.styleId, overrides: state.overrides,
    playRes: state.video && state.video.size, suggestedName: baseName()
  });
  if (!r.canceled) { toast('ASS exported ✓'); window.captionly.showItem(r.path); }
});

$('#burnBtn').addEventListener('click', async () => {
  $('#burnBtn').disabled = true;
  $('#burnProgress').hidden = false;
  window.captionly.onBurnProgress((pct) => { $('#burnProgressBar').style.width = pct + '%'; });
  try {
    const r = await window.captionly.exportBurn({
      videoPath: state.video.path, cues: state.cues,
      styleId: state.styleId, overrides: state.overrides,
      playRes: state.video && state.video.size
    });
    if (!r.canceled) {
      $('#exportResult').textContent = 'Exported: ' + r.path;
      toast('Captioned MP4 exported 🔥');
      window.captionly.showItem(r.path);
    }
  } catch (err) {
    toast('Burn-in failed: ' + err.message);
  } finally {
    $('#burnBtn').disabled = false;
    $('#burnProgress').hidden = true;
    $('#burnProgressBar').style.width = '0%';
  }
});

/* ── project save/open ──────────────────────────────────────────────── */

$('#saveProjectBtn').addEventListener('click', async () => {
  const r = await window.captionly.saveProject({
    video_path: state.video ? state.video.path : '',
    style_id: state.styleId,
    style_overrides: state.overrides,
    emoji_enabled: state.emoji,
    cues: state.cues
  });
  if (!r.canceled) toast('Project saved ✓');
});

$('#openProjectBtn').addEventListener('click', async () => {
  const p = await window.captionly.openProject();
  if (!p) return;
  state.cues = p.cues;
  state.styleId = p.style_id;
  state.overrides = p.style_overrides || {};
  state.emoji = p.emoji_enabled;
  if (p.video) loadVideo(p.video);
  else toast('Video file not found — captions loaded, re-link the video');
  renderCues();
  renderPresets();
  updateExportButtons();
});

/* boot */
refreshSetup();
renderPresets();
