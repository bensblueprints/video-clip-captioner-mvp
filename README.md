# 💬 Captionly

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Auto-captions you buy once and own forever.** Drop a video, run Whisper locally for word-level timestamps, pick a caption style (karaoke word-highlight, bold center, classic subtitle), fix any misheard words inline, and burn a ready-to-post MP4 with ffmpeg — 100% on your machine.

Submagic charges **$18–39/month** to run Whisper and ffmpeg on your clips. Captionly is **$34 once**. Same pipeline, your hardware, zero subscription.

![Captionly screenshot](docs/screenshot.png)

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? Grab the packaged Windows installer (and support development):

**→ [Get Captionly on Whop](https://whop.com/benjisaiempire/captionly)** — pay once, own it forever.

## Features

- 🎙 **Local Whisper transcription** — whisper.cpp with word-level timestamps (`--max-len 1 --split-on-word`); engine + model downloaded once on first run (clearly surfaced in the UI), then fully offline
- 🎤 **Karaoke word-highlight captions** — real ASS `\k` timing tags per word, the TikTok/Reels look, rendered by ffmpeg exactly as previewed
- 🎨 **3 style presets** (Karaoke Highlight, Bold Center, Classic Subtitle) + font size, position, and highlight color controls
- ✏️ **Inline transcript editing with auto re-sync** — click a caption, fix the words, and timings redistribute proportionally across the cue; no re-transcribing
- ✨ **Keyword → emoji decoration** (optional) — "money" → 💰, "watch" → 👀, 50+ built-in mappings
- 🔥 **Burn-in export** — ffmpeg `ass` filter → MP4 (H.264, audio stream-copied), with live progress
- 📄 **SRT + ASS export** for YouTube uploads or further editing
- 🖥 **Live overlay preview** synced to the video player, karaoke highlighting included
- 💾 **`.captionly` project files** — plain JSON (transcript + style) you can commit, share, and reopen
- 🔒 **100% local** — your footage never leaves your machine; no accounts, no telemetry

## Quick start

```bash
git clone https://github.com/bensblueprints/captionly
cd captionly
npm i
npm start
```

First run: click **Download** on the start screen to fetch the whisper.cpp engine (~large, one-time) and a model (tiny 78 MB / base 148 MB / small 488 MB). Everything after is offline.

Run the tests — every media fixture is synthesized locally with ffmpeg (testsrc + sine), nothing is downloaded:

```bash
npm test              # caption engine + SRT/ASS + REAL ffmpeg burn-in on a generated fixture
SMOKE_WHISPER=1 npm test   # optionally also exercises the real whisper.cpp pipeline
```

## Tech stack

Electron · vanilla JS renderer · whisper.cpp (local) · ffmpeg-static · ASS subtitle rendering

## Captionly vs Submagic / Captions

| | **Captionly** | Submagic | Captions app |
|---|---|---|---|
| Price | **$34 once** | $18–39/mo | $10–25/mo |
| Yearly cost | **$0 after purchase** | $216–468 | $120–300 |
| Word-level auto captions | ✅ (local Whisper) | ✅ (cloud) | ✅ (cloud) |
| Karaoke word-highlight styles | ✅ | ✅ | ✅ |
| Edit transcript + re-sync | ✅ | ✅ | ✅ |
| AI b-roll / zooms / sound effects | ❌ | ✅ | ✅ |
| Works offline | ✅ | ❌ | ❌ |
| Footage stays on your machine | ✅ | ❌ | ❌ |
| Upload limits | **none** | plan-based | plan-based |

Honest positioning: Submagic's AI b-roll, auto-zoom, and template marketplace are real value if you use them. If what you actually use is "transcribe + pretty word captions + export," Captionly does that pipeline locally for the price of one month.

## License

MIT © 2026 Ben (bensblueprints)
