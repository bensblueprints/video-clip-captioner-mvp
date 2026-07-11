# Product Hunt launch — Captionly

**Name:** Captionly

**Tagline (60 chars):** Karaoke captions with local Whisper — pay once, no Submagic

**Description (260 chars):**
Drop a video, transcribe locally with Whisper (word-level timestamps), pick a karaoke/bold/classic caption style, fix words inline with auto re-sync, and burn a ready-to-post MP4 with ffmpeg. 100% offline after setup. $34 once instead of $18–39/month.

**Full description:**
Captionly is a desktop auto-captioning studio for short-form video:

- Local Whisper (whisper.cpp) transcription with word-level timestamps — engine and model download once, then it's fully offline
- Karaoke word-highlight captions using real ASS \k timing tags — the word lights up exactly when it's spoken, previewed live over your video
- 3 style presets + font size / position / highlight color controls
- Click any caption line to fix misheard words — timings redistribute across the cue automatically, no re-transcribing
- Optional keyword → emoji decoration (money → 💰)
- Burn-in export via ffmpeg (H.264 MP4, audio untouched) with live progress, plus .srt/.ass export
- Plain-JSON .captionly project files
- No upload limits, no watermarks, no cloud — your footage never leaves your machine

MIT source on GitHub; $34 gets the packaged Windows installer.

**Maker first comment:**
Hi PH 👋 Ben here. I make short-form clips for my own products, and the captioning-SaaS math finally broke me: $39/month to upload MY video to THEIR server so it can run… Whisper and ffmpeg. Tools my laptop runs fine.

So Captionly is exactly that pipeline, local: whisper.cpp with word-level timestamps → an editable transcript → ASS subtitles with real karaoke timing tags → ffmpeg burn-in. The preview is the export; there's no render farm and no upload queue, because there's no upload.

Being upfront: no AI b-roll, no auto-zooms, no stock library — Submagic genuinely does more if you use those. This is for people whose actual workflow is "captions on, export, post." That workflow should not be a subscription.

Source is MIT; the $34 buys the 1-click installer. Ask me anything about the ASS \k tag rabbit hole, I have stories.

**Gallery shots (5):**
1. Editor — vertical video with karaoke captions mid-highlight, transcript list on the right
2. Style panel — the 3 presets with live preview differences visible
3. Inline edit — a caption being corrected with the "timing re-synced" toast
4. Burn-in progress — export bar at 64% with ffmpeg stats
5. Before/after split: raw clip vs captioned MP4 in a phone frame
