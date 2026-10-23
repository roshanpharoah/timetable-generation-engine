# Changelog

## 3.0 — "Awesome" release

### Added

- **Timetable Studio** panel: click-to-edit sessions, drag to move/swap with
  conflict pre-checks, pin/lock sessions, regenerate everything unlocked while
  keeping pinned sessions, contextual free-faculty and free-room suggestions.
- **Publishing & visual diff**: publish a read-only reference and review
  added / removed / changed sessions since.
- **Analytics & Insights** panel: utilisation heatmap, faculty workload
  fairness, attendance trend, room occupancy and curriculum coverage (pure SVG).
- **Undo / redo / trash**: 40-step session undo, `Ctrl+Z`/`Ctrl+Shift+Z`,
  restoreable trash for deleted sections, staff, subjects, rooms, users and
  removed sessions.
- **Themes**: light / dark / system, six accent colours, compact density.
- **Substitution preference tiers & cover locking**: the absence-cover planner now
  ranks candidates into explicit tiers — **same subject** first, then **same
  department**, then **other staff** — and shows each affected session with a
  recommended substitute (**Accept auto**) plus a filterable alternates list.
  Selecting anyone **locks** the session: the confirmed substitute appears on both
  the section and faculty timetables with a 🔒 badge, is skipped by later
  auto-planning, and records the tier used in the substitution history. Admins can
  still reassign a locked session from the same planner.
- **Mobile shell**: off-canvas navigation drawer, bottom tab bar, swipe to
  close, safe-area padding.
- **Accessibility**: skip link, semantic navigation, dialog roles and focus
  trap, focus-visible outlines, control labelling, live regions, reduced motion.
- **Onboarding**: first-run welcome card with three entry paths — guided demo
  tour, quick highlights, or import.
- **Guided demo tour**: a 20-stop walkthrough that navigates every useful tab and
  invites you to try each one. Interactive steps drop the dimmer so the app stays
  usable, and the coach card ticks "done ✓" when you complete the prompt (click a
  Studio slot, review the cover planner, and more). It seeds a realistic demo
  campus first — full timetable, absences with a genuine mix of covered, uncovered
  and critical slots, approved leaves, a 10-day attendance log, notifications and a
  published reference — so every screen shows meaningful data. Relaunchable from
  the profile menu or command palette; `→`/`←`/`Esc` to drive it.
- **Conflict repair**: one-click repairs for teacher/room/section clashes,
  uncovered slots and overloads, plus "auto-repair all".
- **Import wizard**: preview sheets/rows/detected entity before applying, with
  storage budget awareness and an automatic backup point.
- **Term archives & rollover**: snapshot full terms, restore or download them,
  and roll over to the next semester without losing the catalogue.
- **PWA**: manifest, icons, service worker and install button; bundled local
  spreadsheet reader for offline imports.
- **Share pack**: standalone printable HTML export with section, faculty and
  room timetables plus the conflict summary.
- **PIN lock** with lock-now and recovery, and a rebuilt notification centre
  with unread badges and deep-link actions.
- **Administration extras**: storage meter, storage report, archive management.

### Improved

- Command palette now includes Studio, Analytics, undo, history, theme,
  share pack and security actions.
- Shortcut guide extended with the new bindings.
- Profile menu adds tour, undo/trash and security entries.
- Admin "offline capability" copy now reflects PWA/file:// reality.
- Notifications track read state and support filtering.
- Dragging, editing and deleting are blocked for read-only roles at the UI
  level as well as in the guards.
- Print styles now print the current panel (or the chosen report/studio view).

### Changed

- Google Fonts are no longer fetched; the app uses a system font stack.
- The spreadsheet library is served from `vendor/` instead of a CDN, so imports
  work offline.

### Fixed

- Attendance toggle switches rendered as a squashed 44×24 blurred blob with two
  overlapping knobs (a stale duplicate `.toggle` rule collided with the real
  switch). The active attendance switch is now a clean, animated track + thumb
  that works in light and dark mode and shows a focus ring.
- Absence cover planner could report "not affected" even when faculty were
  absent, because it counted only slots with no effective teacher. It now
  correctly reports slots that **need cover** (owner absent, no substitute
  assigned) and shows covered vs uncovered per person.
- Demo data now marks faculty who actually teach on the seeded day, leaving a real
  mix of covered, uncovered and critical slots, so the substitution planner and
  history are meaningful instead of empty.
- Section timetable header/menu ordering edge cases in export and print.
- PDF export dependent on a CDN library (removed in favour of print + pack).
