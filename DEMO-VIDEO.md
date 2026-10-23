# Timetable Demo Showcase

`Timetable-Demo-Showcase.mp4` — a polished, cut-down demo video built from the
reference screen recording `College Timetable & Absence - Google Chrome 2026-10-23 03-42-18.mp4`.

## How it was made

1. **Analysed the reference** (3:52, 1920×1020, silent) frame-by-frame with ffmpeg:
   - Extracted 1 frame/sec and computed pixel differences to find *static / waiting* runs.
   - OCR'd the app region of full-res frames to map the content timeline.
   - Result: long idle stretches at 43–55s, 88–105s, 114–127s, 131–138s and 193–215s.

2. **Cropped out the browser chrome** — the top 152 px of Chrome tab strip / bookmarks /
   omnibox is removed, so the video shows only the application viewport (1920×868).

3. **Cut the dead time** and kept only the meaningful, moving parts, trimmed to a
   ~1 s settle at each end so no motion is clipped. Idle was dropped, content kept.

4. **Assembled** with smooth 0.5 s cross-dissolves between chapters, a fade from black
   at the start and to black at the end.

5. **Added branding** in the app's own palette (primary `#2563eb`, accent `#059669`):
   - An intro title card (logo tile, product name, feature chips).
   - A chapter lower-third at the start of each section.
   - An outro card with headline stats.

6. **Added a voiceover narration** explaining each chapter (see below).

## Narration / voiceover

The showcase has a full spoken narration that walks through the product chapter by
chapter — what each panel does and why it matters. It was generated with a neural
text-to-speech voice (`en-US-AndrewNeural` via `edge-tts`), timed so each line lands
just after its chapter appears, then loudness-normalised to broadcast level
(`I=-16 LUFS`, `TP=-1.5 dB`).

The reference recording itself was **silent** (measured audio level `-inf`), so the
narration is newly authored to match what is on screen — it is not lifted from the
original.

Narration segments:

| Chapter | Spoken line (summary) |
|---------|-----------------------|
| Intro | What the platform is: enterprise academic operations, local-first, no server |
| Guided tour | The 20-step tour; Studio drag/pin/publish, change history; analytics; absence cover ranking; sections/rooms/faculty/calendar; generator, rules, reports, admin |
| Dashboard | The operating picture at a glance |
| Departments | Structure: create department, assign HOD, map faculty |
| Sections | Class groups and curriculum per section, per semester |
| Sections & Rooms | Under-used vs. tight capacity |
| Attendance & Calendar | One-toggle daily attendance; term dates and holidays |
| Timetable Studio | Click-to-edit scheduling |
| Cover & Reports | Substitution ranking, accept/reassign, cover locking |
| Regulations & Admin | Compliance, audit register, users, roles |
| Outro | Generate, plan cover, analyse, publish, report |

## Runtime

3:52 reference → **2:50** polished showcase (170 s), 1920×868, 30 fps, H.264,
with narration audio (AAC, 48 kHz mono).

## Chapter order

| # | Chapter | What it shows |
|---|---------|---------------|
| 1 | Guided tour | All 20 in-app tour steps: Studio, pin & regenerate, analytics, absence cover, sections, rooms, faculty, subjects, calendar, generator, regulations, reports, audit, admin, finish |
| 2 | Dashboard | Live academic overview |
| 3 | Departments | Structure, HODs & faculty mapping |
| 4 | Sections | Class groups & curriculum |
| 5 | Sections & Rooms | Coverage, capacity & utilisation |
| 6 | Attendance & Calendar | Daily marking and term dates |
| 7 | Timetable Studio | Click-to-edit scheduling |
| 8 | Cover & Reports | Absence substitution and exports |
| 9 | Regulations & Admin | Compliance, users & roles |

## Reproducing

Working files (ffmpeg binary, scripts, frames) live in the temp work folder
`%TEMP%\tt-video`. ffmpeg is provided by the Python `imageio-ffmpeg` package.
