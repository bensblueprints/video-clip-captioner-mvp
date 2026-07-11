'use strict';
/**
 * Caption engine — the heart of Captionly.
 *
 * Input: word-level transcript [{ word, start, end }] (seconds).
 * - groupWords()      → caption cues [{ start, end, words: [...] }]
 * - editCueText()     → replace a cue's words from edited text, re-syncing
 *                       word timings proportionally across the cue's window
 * - applyEmoji()      → keyword → emoji decoration (optional)
 * - toSrt() / toAss() → subtitle file generation; ASS supports styling
 *                       presets incl. karaoke word-highlight via \k tags.
 */

const STYLE_PRESETS = {
  'bold-center': {
    name: 'Bold Center',
    fontName: 'Arial Black',
    fontSize: 64,
    primary: '&H00FFFFFF',   // white (AABBGGRR)
    highlight: '&H0000D7FF', // amber-gold
    outline: '&H00000000',
    outlineWidth: 4,
    alignment: 5,            // middle-center
    marginV: 40,
    karaoke: false,
    allCaps: true
  },
  karaoke: {
    name: 'Karaoke Highlight',
    fontName: 'Arial Black',
    fontSize: 58,
    primary: '&H00FFFFFF',
    highlight: '&H0000D7FF',
    outline: '&H00000000',
    outlineWidth: 4,
    alignment: 2,            // bottom-center
    marginV: 90,
    karaoke: true,
    allCaps: true
  },
  'subtitle-bar': {
    name: 'Classic Subtitle',
    fontName: 'Arial',
    fontSize: 40,
    primary: '&H00FFFFFF',
    highlight: '&H00FFFFFF',
    outline: '&H96000000',   // translucent black box
    outlineWidth: 0,
    alignment: 2,
    marginV: 40,
    karaoke: false,
    allCaps: false,
    boxed: true
  }
};

const EMOJI_MAP = {
  money: '💰', cash: '💰', rich: '💰', paid: '💰', dollars: '💰', profit: '💰',
  fire: '🔥', hot: '🔥', insane: '🔥', crazy: '🤯', mind: '🤯',
  love: '❤️', heart: '❤️', like: '👍', win: '🏆', winner: '🏆', won: '🏆',
  fast: '⚡', quick: '⚡', speed: '⚡', rocket: '🚀', launch: '🚀', grow: '📈', growth: '📈',
  warning: '⚠️', stop: '🛑', wrong: '❌', never: '❌', free: '🎁', gift: '🎁',
  idea: '💡', think: '💡', brain: '🧠', smart: '🧠', secret: '🤫', listen: '👂',
  look: '👀', watch: '👀', time: '⏰', today: '📅', new: '✨', magic: '✨',
  world: '🌍', star: '⭐', best: '⭐', goal: '🎯', target: '🎯', work: '💼',
  video: '🎬', camera: '📸', music: '🎵', food: '🍔', coffee: '☕'
};

/** Group word-level entries into caption cues. */
function groupWords(words, { maxChars = 22, maxWords = 5, maxGapS = 0.6 } = {}) {
  const cues = [];
  let cur = null;
  for (const w of words) {
    const word = String(w.word || '').trim();
    if (!word) continue;
    const start = Number(w.start) || 0;
    const end = Math.max(Number(w.end) || start, start);
    const text = cur ? cur.words.map((x) => x.word).join(' ') : '';
    const wouldOverflow =
      cur &&
      (cur.words.length >= maxWords ||
        text.length + 1 + word.length > maxChars ||
        start - cur.end > maxGapS ||
        /[.!?]$/.test(cur.words[cur.words.length - 1].word));
    if (!cur || wouldOverflow) {
      cur = { start, end, words: [] };
      cues.push(cur);
    }
    cur.words.push({ word, start, end });
    cur.end = end;
  }
  return cues.filter((c) => c.words.length > 0);
}

function cueText(cue) {
  return cue.words.map((w) => w.word).join(' ');
}

/**
 * Replace a cue's text with edited words; timings are redistributed across
 * the cue's original [start, end] window proportionally to word length, so
 * fixing a misheard word keeps everything in sync without re-transcribing.
 */
function editCueText(cue, newText) {
  const tokens = String(newText).trim().split(/\s+/).filter(Boolean);
  const span = Math.max(cue.end - cue.start, 0.05);
  if (tokens.length === 0) return { ...cue, words: [] };
  const totalLen = tokens.reduce((s, t) => s + t.length, 0) || 1;
  let t = cue.start;
  const words = tokens.map((tok) => {
    const dur = span * (tok.length / totalLen);
    const w = { word: tok, start: round3(t), end: round3(Math.min(t + dur, cue.end)) };
    t += dur;
    return w;
  });
  words[words.length - 1].end = cue.end; // no rounding drift at the boundary
  return { ...cue, words };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** Decorate cues with keyword emoji (appended to the matching word). */
function applyEmoji(cues, map = EMOJI_MAP) {
  return cues.map((cue) => ({
    ...cue,
    words: cue.words.map((w) => {
      const key = w.word.toLowerCase().replace(/[^a-z']/g, '');
      const emoji = map[key];
      return emoji && !w.word.includes(emoji) ? { ...w, word: w.word + ' ' + emoji } : w;
    })
  }));
}

/* ── SRT ────────────────────────────────────────────────────────────── */

function srtTime(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(sec)},${p(rem, 3)}`;
}

function toSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${cueText(c)}\n`)
    .join('\n') + '\n';
}

/* ── ASS ────────────────────────────────────────────────────────────── */

function assTime(s) {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  const rem = cs % 100;
  const p = (n) => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(sec)}.${p(rem)}`;
}

function escapeAss(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, '\\N');
}

/**
 * Build an .ass file from cues + a style preset (or preset id).
 * Karaoke presets emit \k tags per word (duration in centiseconds) with a
 * secondary colour, producing the word-by-word highlight look.
 */
function toAss(cues, styleOrId = 'karaoke', { playResX = 1080, playResY = 1920, overrides = {} } = {}) {
  const base = typeof styleOrId === 'string' ? STYLE_PRESETS[styleOrId] : styleOrId;
  if (!base) throw new Error('Unknown style preset: ' + styleOrId);
  const st = { ...base, ...overrides };

  const boxStyle = st.boxed ? 3 : 1; // 3 = opaque box
  const header = `[Script Info]
; Generated by Captionly
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Captionly,${st.fontName},${st.fontSize},${st.karaoke ? st.highlight : st.primary},${st.primary},${st.outline},${st.outline},-1,0,0,0,100,100,0,0,${boxStyle},${st.outlineWidth},0,${st.alignment},60,60,${st.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = cues.map((cue) => {
    let text;
    if (st.karaoke) {
      // \k durations are centiseconds per word (gap time attaches to the word)
      text = cue.words
        .map((w, i) => {
          const next = cue.words[i + 1];
          const end = next ? next.start : cue.end;
          const durCs = Math.max(1, Math.round((end - w.start) * 100));
          return `{\\k${durCs}}${escapeAss(st.allCaps ? w.word.toUpperCase() : w.word)}`;
        })
        .join(' ');
    } else {
      const t = cueText(cue);
      text = escapeAss(st.allCaps ? t.toUpperCase() : t);
    }
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Captionly,,0,0,0,,${text}`;
  });

  return header + lines.join('\n') + '\n';
}

module.exports = {
  STYLE_PRESETS, EMOJI_MAP,
  groupWords, cueText, editCueText, applyEmoji,
  toSrt, toAss, srtTime, assTime
};
