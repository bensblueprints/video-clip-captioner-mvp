# Launch strategy — Captionly

## Target communities

- **r/NewTubers + r/SmallYTChannel** — caption workflow threads are constant; share a genuine "my local captioning setup" write-up (both subs ban naked self-promo; use feedback-Friday style threads)
- **r/VideoEditing** — angle: "ASS karaoke tags explained + a free MIT tool that generates them"; craft-first content performs here
- **r/TikTokCreators / r/InstagramReels** — cost-comparison angle for people paying per-minute caption SaaS
- **r/selfhosted + r/LocalLLaMA** — "local Whisper with word-level timestamps for captions" is exactly their interest; lead with the whisper.cpp integration details
- **Indie Hackers** — build-in-public: "I replaced a $468/yr caption subscription with a one-time desktop app"

## Show HN draft

**Title:** Show HN: Captionly – local karaoke captions with whisper.cpp and ffmpeg (pay once)

**Body:**
Short-form caption SaaS (Submagic, Captions) charges $18–39/month to run what is essentially Whisper + ffmpeg with nice styling. I built the local version.

Pipeline: ffmpeg extracts 16kHz WAV → whisper.cpp with `--max-len 1 --split-on-word` gives word-level timestamps → words group into cues (line length / gap / punctuation rules) → ASS subtitles with real `\k` karaoke tags → ffmpeg `ass` filter burns the MP4. The preview overlay and the export share the same cue data, so WYSIWYG is literal.

Bits HN might enjoy:
- Editing a misheard word doesn't re-transcribe: new words get the cue's original time window redistributed proportionally to word length
- `\k` durations are centiseconds and gap time has to attach to the preceding word or highlights drift
- Windows ffmpeg filter path escaping is hopeless, so burn-in runs with cwd = the .ass directory and a bare filename
- The smoke test synthesizes its video with lavfi testsrc+sine — `npm test` never downloads media

Everything is local after a one-time whisper.cpp engine+model download. MIT source; $34 buys the packaged installer. Honest gap vs the SaaS: no AI b-roll or auto-zoom.

## SEO keywords (10)

1. submagic alternative free
2. auto captions video local
3. karaoke caption generator
4. whisper video captions desktop app
5. captions app alternative one time
6. burn in subtitles ffmpeg gui
7. word by word captions tiktok
8. offline video caption software
9. srt generator from video local
10. caption videos without subscription

## AppSumo / PitchGround pitch

Captionly turns the most-used caption-SaaS workflow — transcribe, style, burn-in — into a pay-once desktop app. Local Whisper AI produces word-level timestamps; creators get TikTok-style karaoke highlights, inline word fixes with automatic re-sync, and unlimited watermark-free MP4 exports with zero upload limits, because nothing uploads. Lifetime-deal buyers get the strongest possible pitch: the subscription it replaces costs more per month than this deal costs forever.

## Pricing math

- Captionly: **$34 one-time**
- Submagic Pro: $39/mo → **pays for itself in under 1 month**
- Captions app: ~$25/mo → pays for itself in ~6 weeks
- Suggested launch pricing: $24 early-bird week → $34 standard
