# College Timetable & Absence

A complete, **local-first** college timetable platform: generation, absence cover,
substitution planning, curriculum management, attendance, analytics, publishing
and a shareable timetable pack. No backend, no build step — open `index.html`
(or serve the folder) and everything runs in the browser with `localStorage`.

## Quick start

- **Simplest:** open `index.html` in Chrome/Edge.
- **Recommended (enables install + offline):** serve the folder over http(s), e.g.
  ```
  npx serve .        # or: python -m http.server 8080
  ```
  Then use your browser's *Install app* option. The service worker (`sw.js`)
  caches the app shell, and `vendor/xlsx.full.min.js` is bundled locally so
  imports work offline too.

## What's inside

| Area | Highlights |
| --- | --- |
| **Dashboard** | KPIs, risk panel, activity feed, live utilisation, quick actions |
| **Timetable Studio** | Click-to-edit slots, drag to move/swap, pin sessions, regenerate unlocked, safe suggestions for free faculty/rooms |
| **Generator** | Backtracking solver with capacity/holiday/room rules, progress overlay, conflict + unscheduled reporting |
| **Sections & Curriculum** | Sections CRUD, per-section curriculum, timetables, L-T-P-C view |
| **Rooms & Facilities** | Room CRUD, utilisation, week view, maintenance state |
| **Staff & Subjects** | Filtering, paging, bulk actions, expertise mapping, anomalies |
| **Attendance & Substitution** | Daily/absence marking, **priority-ranked cover planner** (same subject → same department → other), auto or manual assignment, locked cover, substitution history, workload balancing |
| **Calendar & Regulations** | Month/week calendar, holidays, compliance rules, conflict audit **with one-click repair** |
| **Reports** | Load/utilisation reports, exports (CSV/Excel/iCal), printable master report |
| **Analytics & Insights** | Utilisation heatmap, faculty workload fairness, attendance trend, room occupancy, curriculum coverage (pure SVG, no chart library) |
| **Administration** | Institution profile, users & role matrix, period timings, data health checks, storage report, **term archives & rollover** |
| **Registers** | Audit log with filters/pagination/export |

### Cross-cutting features

- **Themes** – light / dark / system, six accent colours, compact density.
- **Undo & trash** – every destructive action is undoable (`Ctrl+Z` / `Ctrl+Shift+Z`).
  Deleted sections, staff, subjects, rooms, users and removed sessions land in a
  restoreable trash (`Ctrl+Shift+K`).
- **Publishing & diff** – publish a read-only reference of the timetable and see
  exactly what changed since (added / removed / changed sessions).
- **Import wizard** – Excel/CSV/JSON files are previewed (sheets, rows, detected
  entity, warnings) before applying, with an automatic backup point.
- **Share pack** – one click produces a standalone, printable HTML pack with all
  section, faculty and room timetables plus the conflict summary.
- **Role-aware UI** – Administrator / HOD / Faculty / Viewer. Read-only roles get
  a banner and disabled mutation controls, and the guards are enforced in code.
- **PIN lock** – optional local PIN (`Ctrl+Shift+L` to lock). Hash stored in
  `localStorage`; it is browser-local convenience, not server-grade security.
- **Notifications** – unread badges, actions that deep-link into the right panel.
- **Substitution preference & locking** – the cover planner ranks candidates in
  explicit tiers: **1 · same subject** first, then **2 · same department**, then
  **3 · other staff**. Each affected slot shows the recommended substitute with an
  **Accept auto** button plus a filterable list of alternates (same subject / same
  department / free at that time). Choosing an option **locks** the session: the
  confirmed cover is protected from later auto-planning, shows a 🔒 badge and the
  substitute's name on **both** the section and faculty timetables, and can be
  reassigned by an administrator at any time. Auto-substitute records the tier it
  used, so the history shows *why* each person was picked.
- **Accessibility** – skip link, semantic nav, dialog roles, focus trap, focus
  outlines, labelled controls, live regions, reduced-motion support.
- **Mobile shell** – off-canvas drawer, bottom navigation, swipe-to-close,
  safe-area padding, overflow-safe tables.
- **Onboarding** – first-run welcome offering three paths: the guided demo tour,
  a 60-second quick-highlights tour, or importing your own data.
- **Guided demo tour** – a 20-stop walkthrough that visits every useful tab in
  order (dashboard, Studio, insights, attendance, cover planner, sections, rooms,
  faculty, subjects, calendar, generator, rules, reports, audit, admin) and
  invites you to actually try things. Interactive steps drop the dimmer so the
  app stays usable: click a Studio slot to open its editor, review a cover
  planner, and the coach card ticks "done ✓" once you complete the prompt. It
  first seeds a realistic demo campus – full timetable, absences with a genuine
  mix of **covered, uncovered and critical** slots, approved leaves, a 10-day
  attendance log, notifications and a published reference – so every screen has
  meaningful content. Relaunch from the profile menu, the command palette
  ("Guided demo tour"), or the welcome card. Use Next/Back, `→`/`←`, or `Esc`.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ + K` | Command palette |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` (or `Ctrl/⌘ + Y`) | Redo |
| `Ctrl/⌘ + Shift + K` | Undo history & trash |
| `Ctrl/⌘ + Shift + L` | Lock workspace |
| `Ctrl/⌘ + P` | Print master report |
| `Ctrl/⌘ + S` | Download backup |
| `Alt + 1…9` | Jump to the first nine panels |
| `?` | Shortcut guide |
| `Esc` | Close palette / modal / drawer, or exit the demo tour |
| `→` / `←` | Next / previous step while the demo tour is running |

## Data model & files

All state lives under `tt_*` keys in `localStorage`:

- `tt_config` – institution, term, roles, theme/accent/density, period times, PIN flag
- `tt_staff`, `tt_subjects`, `tt_rooms`, `tt_sections`, `tt_departments`
- `tt_schedule` – every section/day/period row (teaching or `FREE`), with `pinned` flag
- `tt_attendance_log`, `tt_substitutions`, `tt_leaves`, `tt_holidays`
- `tt_timetable_versions`, `tt_published_schedule`, `tt_term_archives`, `tt_trash`
- `tt_audit_logs`, `tt_notifications`

### Project layout

```
index.html          markup, panels, nav, modals
styles.css          base design system
awesome.css         theme, studio, insights, mobile, a11y additions
app.js              core state, solver, attendance, substitutions, reports, backups
enterprise.js       panels & enterprise features (sections, rooms, admin, palette)
awesome.js          themes, undo/trash, studio, analytics, PWA, archives, publishing
vendor/xlsx.full.min.js   bundled spreadsheet reader (offline imports)
sw.js               service worker (offline app shell)
manifest.webmanifest, icon.svg, icon-192.png, icon-512.png   PWA assets
```

## Notes on data safety

- Data never leaves the browser. **Download a backup regularly** (Settings →
  Backup) — clearing site data also clears the app data.
- Local storage is limited (~5 MB). The Administration panel shows a storage
  meter and warns as you approach the budget; use **term archives** and delete
  old snapshots to stay healthy.
- Legacy modules (`extensions.js`, `timetable-tools.js`, `absence*.js`,
  `report-pdf.js`, `version-compare.js`, `backup-restore.js`, `regulations.js`,
  `chatbot.js`, `rag.js`, `speech.js`, `directory-plus.js`, `audit-plus.js`) are
  intentionally **not loaded** — their functionality has been reimplemented in
  `app.js`, `enterprise.js` and `awesome.js`. They are kept for reference only.
