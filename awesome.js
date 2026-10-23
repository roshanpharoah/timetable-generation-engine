/* ==========================================================================
   Awesome layer for College Timetable & Absence
   --------------------------------------------------------------------------
   Adds: theme controls, undo/redo + trash, role-aware UI, PIN lock,
   notifications, mobile shell, accessibility, onboarding, import preview,
   term archives, PWA install/offline, timetable studio, analytics, conflict
   repair, publish/diff and a standalone share pack.

   This file is additive: it wraps the existing app rather than replacing it.
   ========================================================================== */
(function () {
  'use strict';

  let App = null;
  const $ = (id) => document.getElementById(id);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v));
  const escAttr = (v) => (typeof escapeAttr === 'function' ? escapeAttr(v) : esc(v));
  const say = (m, t) => { try { toast(m, t); } catch (e) { console.log(m); } };
  const uidSafe = () => (typeof uid === 'function' ? uid() : 'ID_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const today = () => (typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10));
  const fmtDate = (d) => { try { return new Date(d).toLocaleString(); } catch (e) { return String(d || ''); } };
  const readJSON = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  };
  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('Storage write failed', key, e); return false; }
  };
  const num = (v) => Number(v) || 0;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const isTyping = (el) => {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  };
  const storageBytes = () => {
    let n = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('tt_')) n += (localStorage.getItem(k) || '').length * 2;
      }
    } catch (e) {}
    return n;
  };
  const fmtBytes = (b) => (b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB');

  /* ======================================================================
     Defaults
     ====================================================================== */
  function ensureDefaults() {
    const c = App.config;
    if (!['light', 'dark', 'system'].includes(c.theme)) c.theme = 'system';
    if (!['blue', 'violet', 'emerald', 'rose', 'amber', 'cyan'].includes(c.accent)) c.accent = 'blue';
    if (!['comfortable', 'compact'].includes(c.density)) c.density = 'comfortable';
    if (c.pinEnabled == null) c.pinEnabled = false;
    if (typeof c.pinHash !== 'string') c.pinHash = '';
    if (c.lockOnLoad == null) c.lockOnLoad = true;
    if (!App._undo) App._undo = [];
    if (!App._redo) App._redo = [];
    (App.data.schedule || []).forEach((s) => { if (s.pinned == null) s.pinned = false; });
    if (!document.documentElement.dataset.theme) applyTheme();
  }

  /* ======================================================================
     Theme
     ====================================================================== */
  function resolveTheme() {
    const t = App.config.theme || 'system';
    if (t !== 'system') return t;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function applyTheme() {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme();
    root.dataset.accent = App.config.accent || 'blue';
    root.dataset.density = App.config.density || 'comfortable';
    updateThemeButton();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', root.dataset.theme === 'dark' ? '#0f172a' : (getComputedStyle(root).getPropertyValue('--primary').trim() || '#2563eb'));
  }
  function updateThemeButton() {
    const b = $('btnTheme');
    if (!b) return;
    const dark = resolveTheme() === 'dark';
    b.textContent = dark ? '☀️' : '🌙';
    b.title = 'Switch theme (currently ' + (App.config.theme || 'system') + ')';
    b.setAttribute('aria-label', b.title);
  }
  function setTheme(theme) {
    App.config.theme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
    writeJSON('tt_config', App.config);
    applyTheme();
    say('Theme: ' + App.config.theme, 'success');
  }
  function cycleTheme() { setTheme(App.config.theme === 'light' ? 'dark' : App.config.theme === 'dark' ? 'system' : 'light'); }
  function setAccent(accent) {
    App.config.accent = accent;
    writeJSON('tt_config', App.config);
    applyTheme();
    say('Accent updated', 'success');
  }
  function setDensity(density) {
    App.config.density = density;
    writeJSON('tt_config', App.config);
    applyTheme();
    say('Layout density: ' + density, 'success');
  }

  /* ======================================================================
     Undo / redo / history
     ====================================================================== */
  function captureState() {
    return { data: clone(App.data), config: clone(App.config), at: Date.now() };
  }
  function signature(state) {
    try { return JSON.stringify(state.data) + '|' + JSON.stringify(state.config); } catch (e) { return String(Date.now()); }
  }
  function pushUndoState(snap, label) {
    if (!snap || App._awRestoring) return;
    snap.label = label || 'Change';
    App._undo.push(snap);
    if (App._undo.length > 40) App._undo.shift();
    App._redo = [];
    updateUndoUI();
  }
  function updateUndoUI() {
    const u = $('btnUndo');
    const r = $('btnRedo');
    if (u) {
      const n = (App._undo || []).length;
      u.disabled = !n;
      u.title = n ? 'Undo: ' + App._undo[n - 1].label + ' (Ctrl+Z)' : 'Nothing to undo';
      u.setAttribute('aria-label', u.title);
    }
    if (r) {
      const n = (App._redo || []).length;
      r.disabled = !n;
      r.title = n ? 'Redo: ' + App._redo[n - 1].label + ' (Ctrl+Shift+Z)' : 'Nothing to redo';
      r.setAttribute('aria-label', r.title);
    }
  }
  function restoreSnapshot(snap) {
    if (!snap || !snap.data || !snap.config) return;
    App._awRestoring = true;
    try {
      App.data = clone(snap.data);
      App.config = clone(snap.config);
      if (App.ensureEnterprise) App.ensureEnterprise();
      ensureDefaults();
      writeJSON('tt_config', App.config);
      App.saveAll();
      applyTheme();
      App.render();
      updateUndoUI();
    } finally {
      App._awRestoring = false;
    }
  }
  function undo() {
    if (!App._undo || !App._undo.length) { say('Nothing to undo', 'info'); return; }
    const snap = App._undo.pop();
    const current = captureState();
    current.label = snap.label;
    App._redo.push(current);
    restoreSnapshot(snap);
    say('Undid: ' + snap.label, 'success');
  }
  function redo() {
    if (!App._redo || !App._redo.length) { say('Nothing to redo', 'info'); return; }
    const snap = App._redo.pop();
    const current = captureState();
    current.label = snap.label;
    App._undo.push(current);
    restoreSnapshot(snap);
    say('Redid: ' + snap.label, 'success');
  }
  function restoreHistory(index) {
    const snap = App._undo[index];
    if (!snap) return;
    const current = captureState();
    current.label = 'Current state';
    App._redo.push(current);
    App._undo = App._undo.slice(0, index);
    restoreSnapshot(snap);
    say('Restored: ' + snap.label, 'success');
  }

  /* ======================================================================
     Trash (soft-delete snapshots for common entity deletes)
     ====================================================================== */
  function trashEntries() { return readJSON('tt_trash', []) || []; }
  function saveTrash(list) { writeJSON('tt_trash', list.slice(0, 30)); }
  function addTrash(entry) {
    if (!entry) return;
    const list = trashEntries();
    entry.id = entry.id || uidSafe();
    entry.at = entry.at || new Date().toISOString();
    list.unshift(entry);
    saveTrash(list);
  }
  function captureDelete(name, args, before) {
    if (!before || !before.data) return;
    const id = args && args[0];
    let entry = null;
    if (name === 'deleteStaff') {
      const rec = (before.data.staff || []).find((s) => s.id === id);
      if (!rec) return;
      entry = { type: 'staff', label: 'Staff · ' + rec.name, record: clone(rec), extras: {
        slots: (before.data.schedule || []).filter((s) => [s.teacherId, s.currentTeacherId, s.originalTeacherId, s.backupTeacherId].includes(id))
          .map((s) => ({ id: s.id, currentTeacherId: s.currentTeacherId, originalTeacherId: s.originalTeacherId, backupTeacherId: s.backupTeacherId, isSubstituted: s.isSubstituted }))
      } };
    } else if (name === 'deleteSection') {
      const rec = (before.data.sections || []).find((s) => s.id === id);
      if (!rec) return;
      entry = { type: 'section', label: 'Section · ' + rec.name, record: clone(rec), extras: { slots: clone((before.data.schedule || []).filter((s) => s.sectionId === id)) } };
    } else if (name === 'deleteRoom') {
      const rec = (before.data.rooms || []).find((r) => r.name === id);
      if (!rec) return;
      entry = { type: 'room', label: 'Room · ' + rec.name, record: clone(rec), extras: { slots: (before.data.schedule || []).filter((s) => s.roomName === id).map((s) => ({ id: s.id, roomName: s.roomName })) } };
    } else if (name === 'deleteSubject') {
      const rec = (before.data.subjects || []).find((s) => s.code === id);
      if (!rec) return;
      entry = { type: 'subject', label: 'Subject · ' + rec.code, record: clone(rec) };
    } else if (name === 'deleteUser') {
      const rec = (before.config.roles || []).find((r) => r.id === id);
      if (!rec) return;
      entry = { type: 'user', label: 'User · ' + rec.name, record: clone(rec) };
    }
    if (entry) addTrash(entry);
  }
  function restoreTrash(id) {
    const list = trashEntries();
    const e = list.find((x) => x.id === id);
    if (!e) return;
    if (e.type === 'staff') {
      if (!App.data.staff.some((s) => s.id === e.record.id)) App.data.staff.push(clone(e.record));
      (e.extras && e.extras.slots || []).forEach((st) => {
        const sl = App.data.schedule.find((s) => s.id === st.id);
        if (sl) { sl.currentTeacherId = st.currentTeacherId; sl.originalTeacherId = st.originalTeacherId; sl.backupTeacherId = st.backupTeacherId; sl.isSubstituted = st.isSubstituted; }
      });
    } else if (e.type === 'section') {
      if (!App.data.sections.some((s) => s.id === e.record.id)) App.data.sections.push(clone(e.record));
      (e.extras && e.extras.slots || []).forEach((sl) => {
        if (!App.data.schedule.some((x) => x.id === sl.id || (x.sectionId === sl.sectionId && x.day === sl.day && x.period === sl.period))) App.data.schedule.push(clone(sl));
      });
    } else if (e.type === 'room') {
      if (!App.data.rooms.some((r) => r.name === e.record.name)) App.data.rooms.push(clone(e.record));
      (e.extras && e.extras.slots || []).forEach((st) => { const sl = App.data.schedule.find((s) => s.id === st.id); if (sl) sl.roomName = st.roomName; });
    } else if (e.type === 'subject') {
      if (!App.data.subjects.some((s) => s.code === e.record.code)) App.data.subjects.push(clone(e.record));
    } else if (e.type === 'user') {
      if (!App.config.roles.some((r) => r.id === e.record.id)) App.config.roles.push(clone(e.record));
    } else if (e.type === 'slot') {
      const sl = e.record;
      const row = App.data.schedule.find((x) => x.sectionId === sl.sectionId && x.day === sl.day && x.period === sl.period);
      if (!row) App.data.schedule.push(clone(sl));
      else if (row.subjectCode === 'FREE') { Object.assign(row, clone(sl)); }
      else { say('That slot is occupied by ' + row.subjectCode + ' — clear it in Studio first', 'warn'); return; }
    }
    saveTrash(list.filter((x) => x.id !== id));
    writeJSON('tt_config', App.config);
    App.saveAll();
    App.audit('Trash restored', e.label);
    say('Restored ' + e.label, 'success');
    const conflicts = App.validateSchedule().length;
    if (conflicts) say(conflicts + ' conflict(s) now exist — open Regulations → Conflict Audit', 'warn');
    App.render();
  }
  function deleteTrash(id) {
    saveTrash(trashEntries().filter((x) => x.id !== id));
    say('Removed from trash', 'success');
    openHistory();
  }
  function clearTrash() {
    saveTrash([]);
    say('Trash emptied', 'success');
    openHistory();
  }
  function addSlotToTrash(slot, label) {
    addTrash({ type: 'slot', label: label || ('Session · ' + (slot.subjectCode || '')), record: clone(slot) });
  }
  function openHistory() {
    const undoList = (App._undo || []).slice().reverse();
    const redoList = (App._redo || []).slice().reverse();
    const trash = trashEntries();
    const rows = (arr, kind) => arr.map((s, i) => {
      const index = kind === 'undo' ? (App._undo.length - 1 - i) : (App._redo.length - 1 - i);
      return '<div class="history-row"><span class="badge badge-' + (kind === 'undo' ? 'info' : 'neutral') + '">' + kind + '</span>' +
        '<span class="h-main"><b>' + esc(s.label) + '</b><small>' + fmtDate(s.at) + '</small></span>' +
        '<span class="h-actions">' + (kind === 'undo' ? '<button class="btn btn-sm" onclick="TT.restoreHistory(' + index + ')">Restore</button>' : '') + '</span></div>';
    }).join('');
    const trashRows = trash.map((t) => '<div class="history-row"><span class="badge badge-warning">trash</span>' +
      '<span class="h-main"><b>' + esc(t.label) + '</b><small>' + fmtDate(t.at) + '</small></span>' +
      '<span class="h-actions"><button class="btn btn-sm primary" onclick="TT.restoreTrash(\'' + escAttr(t.id) + '\')">Restore</button>' +
      '<button class="btn btn-sm" onclick="TT.deleteTrash(\'' + escAttr(t.id) + '\')">Delete</button></span></div>').join('');
    $('modalTitle').textContent = 'History, Undo & Trash';
    $('modalBody').innerHTML =
      '<div class="ent-subhead">Undo stack (' + (App._undo || []).length + ')</div>' +
      '<div class="history-list">' + (rows(undoList, 'undo') || '<div class="text-muted" style="font-size:.84rem">No undo history in this session.</div>') + '</div>' +
      ((App._redo || []).length ? '<div class="ent-subhead mt-16">Redo stack</div><div class="history-list">' + rows(redoList, 'redo') + '</div>' : '') +
      '<div class="ent-subhead mt-16">Trash (' + trash.length + ')</div>' +
      '<div class="trash-list">' + (trashRows || '<div class="text-muted" style="font-size:.84rem">Deleted sections, staff, subjects, rooms, users and removed sessions appear here.</div>') + '</div>' +
      '<div class="mt-16" style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" onclick="TT.undo()">↶ Undo</button>' +
      '<button class="btn" onclick="TT.redo()">↷ Redo</button>' +
      '<button class="btn danger" onclick="TT.clearTrash()">Empty trash</button>' +
      '<button class="btn" style="margin-left:auto" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    App.openModal('modalGeneric');
  }

  /* ======================================================================
     Mutation wrappers (undo + trash)
     ====================================================================== */
  function wrapMutations() {
    const list = [
      ['saveStaff', 'Staff saved'], ['deleteStaff', 'Staff deleted'], ['clearAllStaff', 'Staff cleared'],
      ['saveSubject', 'Subject saved'], ['deleteSubject', 'Subject deleted'],
      ['addDept', 'Department added'], ['saveDept', 'Department saved'], ['deleteDept', 'Department deleted'],
      ['saveDeptRules', 'Department rules saved'], ['bulkApplySubjects', 'Curriculum applied'],
      ['setAttendance', 'Attendance updated'], ['markAllAttendance', 'Attendance updated'],
      ['markAbsentStaff', 'Absence recorded'], ['markPresentStaff', 'Attendance restored'],
      ['autoProcessAbsences', 'Absences processed'], ['applySubstitution', 'Substitution applied'],
      ['revertSubstitution', 'Substitution reverted'], ['applySubstitutionPlan', 'Substitution plan applied'],
      ['addHoliday', 'Holiday added'], ['removeHoliday', 'Holiday removed'],
      ['addCompDay', 'Compensatory day added'], ['removeCompDay', 'Compensatory day removed'],
      ['saveSemester', 'Semester saved'], ['setWorkingDays', 'Working days saved'], ['saveRules', 'Rules saved'],
      ['restoreVersion', 'Version restored'], ['saveSection', 'Section saved'], ['deleteSection', 'Section deleted'],
      ['saveCurriculum', 'Curriculum saved'], ['saveRoom', 'Room saved'], ['deleteRoom', 'Room deleted'],
      ['duplicateRoom', 'Room duplicated'], ['saveOrgProfile', 'Profile saved'], ['saveUser', 'User saved'],
      ['deleteUser', 'User deleted'], ['savePeriodTimes', 'Period times saved'], ['savePrefs', 'Preferences saved'],
      ['saveRegulationRules', 'Regulation rules saved'], ['runHealthFix', 'Health fix applied'],
      ['autofixAll', 'Auto-fixes applied'], ['clearAuditLogs', 'Audit log cleared']
    ];
    list.forEach(([name, label]) => {
      const orig = App[name];
      if (typeof orig !== 'function' || orig._awUndoWrapped) return;
      const wrapped = function () {
        if (this._awRestoring) return orig.apply(this, arguments);
        if (this._awDepth) return orig.apply(this, arguments);
        const before = captureState();
        const sig = signature(before);
        this._awDepth = 1;
        let res;
        try { res = orig.apply(this, arguments); }
        finally {
          this._awDepth = 0;
          if (signature(captureState()) !== sig) {
            pushUndoState(before, label);
            if (/^delete/.test(name)) captureDelete(name, arguments, before);
          }
        }
        return res;
      };
      wrapped._awUndoWrapped = true;
      wrapped._awOriginal = orig;
      App[name] = wrapped;
    });

    // Async starters: capture before the deferred work begins.
    [
      ['generateTimetable', 'Timetable generated'],
      ['loadSampleData', 'Sample data loaded']
    ].forEach(([name, label]) => {
      const orig = App[name];
      if (typeof orig !== 'function' || orig._awUndoWrapped) return;
      const wrapped = function () {
        if (!this._awRestoring) pushUndoState(captureState(), label);
        return orig.apply(this, arguments);
      };
      wrapped._awUndoWrapped = true;
      App[name] = wrapped;
    });

    // Expose
    App.captureState = captureState;
    App.pushUndo = function (label) { pushUndoState(captureState(), label); };
    App.undo = undo;
    App.redo = redo;
    App.openHistory = openHistory;
    App.restoreHistory = restoreHistory;
    App.restoreTrash = restoreTrash;
    App.deleteTrash = deleteTrash;
    App.clearTrash = clearTrash;
    App.addSlotToTrash = addSlotToTrash;
    App.trashEntries = trashEntries;
  }

  /* ======================================================================
     Role-aware UI
     ====================================================================== */
  function applyRoleUI() {
    if (!App.userCaps) return;
    const caps = App.userCaps();
    document.body.classList.toggle('role-readonly', !caps.write);
    document.querySelectorAll('.nav-item[data-panel="admin"]').forEach((n) => { n.style.display = caps.admin ? '' : 'none'; });
    const writeRe = /(save|delete|remove|add|create|generate|import|apply|assign|mark|clear|reset|restore|publish|archive|rollover|fix|bulk|duplicate|submit|setAttendance|toggleAvailability|switchUser|confirmAbsence|confirmAuto|plannerMark|applySubstitution)/i;
    const safeRe = /(export|print|download|search|openProfile|openCommand|showPanel|showShortcuts|showPermissions|showPanel|theme|tour|help|lock|undo|redo|history|filter|openNotifications|closeModal|runHealthCheck|demo)/i;
    document.querySelectorAll('button[onclick]').forEach((btn) => {
      if (btn.closest('#lockScreen, .tour-card, .aw-overlay')) return;
      const oc = btn.getAttribute('onclick') || '';
      const shouldDisable = !caps.write && oc && !safeRe.test(oc) && writeRe.test(oc);
      if (shouldDisable) {
        if (btn.dataset.awRoleDisabled === '1') return;
        btn.dataset.awRoleDisabled = '1';
        btn.dataset.awOriginalTitle = btn.title || '';
        btn.disabled = true;
        btn.classList.add('role-disabled');
        btn.title = 'Read-only role — editing is disabled';
      } else if (btn.dataset.awRoleDisabled === '1') {
        btn.disabled = false;
        btn.classList.remove('role-disabled');
        btn.title = btn.dataset.awOriginalTitle || '';
        delete btn.dataset.awRoleDisabled;
      }
    });
  }

  /* ======================================================================
     Mobile shell
     ====================================================================== */
  function openNav() {
    document.body.classList.add('nav-open');
    const b = $('btnMenu');
    if (b) b.setAttribute('aria-expanded', 'true');
  }
  function closeNav() {
    document.body.classList.remove('nav-open');
    const b = $('btnMenu');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function toggleNav() { document.body.classList.contains('nav-open') ? closeNav() : openNav(); }

  function injectShell() {
    if (!$('awNavBackdrop')) {
      const bd = document.createElement('div');
      bd.id = 'awNavBackdrop';
      bd.className = 'nav-backdrop';
      bd.onclick = closeNav;
      document.body.appendChild(bd);
    }
    if (!$('awBottomNav')) {
      const nav = document.createElement('div');
      nav.id = 'awBottomNav';
      nav.className = 'bottom-nav';
      nav.innerHTML =
        '<button data-panel="dashboard" onclick="TT.showPanel(\'dashboard\')"><span class="b-ico">🏠</span>Home</button>' +
        '<button data-panel="studio" onclick="TT.showPanel(\'studio\')"><span class="b-ico">🛠️</span>Studio</button>' +
        '<button data-panel="generator" onclick="TT.showPanel(\'generator\')"><span class="b-ico">⚡</span>Generate</button>' +
        '<button data-panel="insights" onclick="TT.showPanel(\'insights\')"><span class="b-ico">📊</span>Insights</button>' +
        '<button data-panel="search" onclick="TT.openCommandPalette()"><span class="b-ico">🔎</span>Search</button>';
      document.body.appendChild(nav);
    }
    if (!$('btnMenu')) {
      const left = document.querySelector('.topbar-left');
      if (left) left.insertAdjacentHTML('afterbegin', '<button class="icon-btn mobile-menu-btn" id="btnMenu" title="Open navigation" aria-label="Open navigation" aria-expanded="false">☰</button>');
    }
    const menu = $('btnMenu');
    if (menu && !menu._awBound) { menu._awBound = true; menu.onclick = toggleNav; }
    const nav = document.querySelector('.nav');
    if (nav && !nav._awBound) {
      nav._awBound = true;
      nav.addEventListener('click', (e) => { if (e.target.closest('.nav-item')) setTimeout(closeNav, 0); });
    }
    const sb = document.querySelector('.sidebar');
    if (sb && !sb._awSwipe) {
      sb._awSwipe = true;
      let sx = null;
      sb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
      sb.addEventListener('touchend', (e) => {
        if (sx == null) return;
        const dx = e.changedTouches[0].clientX - sx;
        if (dx < -45) closeNav();
        sx = null;
      }, { passive: true });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
  }

  /* ======================================================================
     Accessibility
     ====================================================================== */
  function enhanceA11y() {
    const content = document.querySelector('.content');
    if (content) { content.id = content.id || 'mainContent'; content.setAttribute('tabindex', '-1'); }
    if (!$('awSkipLink')) {
      const a = document.createElement('a');
      a.id = 'awSkipLink';
      a.className = 'skip-link';
      a.href = '#mainContent';
      a.textContent = 'Skip to main content';
      document.body.insertBefore(a, document.body.firstChild);
    }
    const toastHost = $('toastContainer');
    if (toastHost) { toastHost.setAttribute('role', 'status'); toastHost.setAttribute('aria-live', 'polite'); }

    document.querySelectorAll('.nav-item').forEach((el) => {
      const label = (el.textContent || '').trim();
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
      if (!el._awNavKey) {
        el._awNavKey = true;
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
        });
      }
    });
    document.querySelectorAll('.nav-item.active').forEach((el) => el.setAttribute('aria-current', 'page'));
    document.querySelectorAll('.nav-item:not(.active)').forEach((el) => el.removeAttribute('aria-current'));

    document.querySelectorAll('button').forEach((btn) => {
      if (!btn.getAttribute('aria-label')) {
        const txt = (btn.textContent || '').trim();
        const title = btn.getAttribute('title') || '';
        if (!txt && title) btn.setAttribute('aria-label', title);
      }
    });
    document.querySelectorAll('.btn-notify').forEach((el) => {
      if (!el.getAttribute('role')) { el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); }
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.title || 'Notifications');
      if (!el._awBellKey) { el._awBellKey = true; el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }); }
    });

    document.querySelectorAll('input, select, textarea').forEach((inp) => {
      if (inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby') || inp.type === 'hidden') return;
      const id = inp.id;
      const lab = id ? document.querySelector('label[for="' + id + '"]') : null;
      const parentLabel = inp.closest('label');
      if (lab || parentLabel) return;
      const placeholder = inp.getAttribute('placeholder') || inp.getAttribute('title') || id || inp.tagName.toLowerCase();
      inp.setAttribute('aria-label', placeholder.replace(/[_-]+/g, ' ').trim());
    });

    document.querySelectorAll('.modal').forEach((m) => { if (!m.classList.contains('open')) m.setAttribute('aria-hidden', 'true'); });
  }

  function wrapModals() {
    const origOpen = App.openModal;
    if (origOpen && !origOpen._awA11y) {
      const wrappedOpen = function (id) {
        App._awLastFocus = document.activeElement;
        const res = origOpen.call(this, id);
        const m = $(id);
        if (m) {
          m.setAttribute('role', 'dialog');
          m.setAttribute('aria-modal', 'true');
          const title = m.querySelector('#modalTitle, h3, .modal-title');
          if (title) { title.id = title.id || 'awModalTitle'; m.setAttribute('aria-labelledby', title.id); }
          m.setAttribute('aria-hidden', 'false');
          setTimeout(() => {
            const focusable = m.querySelector('input:not([type="hidden"]), select, textarea, button.primary, button');
            if (focusable) try { focusable.focus(); } catch (e) {}
            document.querySelectorAll('.modal.open').forEach((x) => x.setAttribute('aria-hidden', 'false'));
          }, 40);
        }
        return res;
      };
      wrappedOpen._awA11y = true;
      App.openModal = wrappedOpen;
    }
    const origClose = App.closeModal;
    if (origClose && !origClose._awA11y) {
      const wrappedClose = function (id) {
        const m = $(id);
        if (m) m.setAttribute('aria-hidden', 'true');
        const res = origClose.call(this, id);
        try { if (App._awLastFocus && App._awLastFocus.focus) App._awLastFocus.focus(); } catch (e) {}
        return res;
      };
      wrappedClose._awA11y = true;
      App.closeModal = wrappedClose;
    }
    if (!document._awFocusTrap) {
      document._awFocusTrap = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const m = document.querySelector('.modal.open');
        if (!m) return;
        const nodes = Array.from(m.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
  }

  /* ======================================================================
     Notifications
     ====================================================================== */
  function notifications() {
    const list = readJSON('tt_notifications', []) || [];
    return list.map((n) => ({ read: false, ...n }));
  }
  function renderBell() {
    const badge = $('bellCount');
    if (!badge) return;
    const n = notifications().filter((x) => !x.read).length;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n ? 'block' : 'none';
    const bell = $('btnBell');
    if (bell) bell.setAttribute('aria-label', n + ' unread notification' + (n === 1 ? '' : 's'));
  }
  function notify(type, msg, action) {
    const list = notifyListRaw();
    list.unshift({ id: uidSafe(), type: type || 'info', msg: String(msg || ''), ts: new Date().toISOString(), read: false, action: action || null });
    if (list.length > 100) list.length = 100;
    writeJSON('tt_notifications', list);
    renderBell();
  }
  function notifyListRaw() { return readJSON('tt_notifications', []) || []; }
  function markNotification(id, read) {
    const list = notifyListRaw();
    const n = list.find((x) => x.id === id);
    if (n) { n.read = read !== false; writeJSON('tt_notifications', list); renderBell(); }
  }
  function markAllRead() {
    const list = notifyListRaw().map((n) => ({ ...n, read: true }));
    writeJSON('tt_notifications', list);
    renderBell();
    openNotifications();
  }
  function dismissNotification(id) {
    writeJSON('tt_notifications', notifyListRaw().filter((x) => x.id !== id));
    renderBell();
    openNotifications();
  }
  function setNotifFilter(f) { App._notifFilter = f; openNotifications(); }
  function runNotificationAction(id) {
    const list = notifyListRaw();
    const n = list.find((x) => x.id === id);
    if (!n) return;
    n.read = true;
    writeJSON('tt_notifications', list);
    renderBell();
    App.closeModal('modalGeneric');
    const a = n.action;
    const panel = typeof a === 'string' ? a : (a && a.panel);
    if (!panel) return;
    App.showPanel(panel);
    if (a && a.tab) { App._regTab = a.tab; if (App.renderRegulations) App.renderRegulations(); }
    if (a && a.slot) { setTimeout(() => { try { App.openSlotEditor(a.slot); } catch (e) {} }, 180); }
  }
  function openNotifications() {
    const filter = App._notifFilter || 'all';
    const list = notifications().filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.read));
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '🚨' };
    $('modalTitle').textContent = 'Notifications';
    $('modalBody').innerHTML =
      '<div class="notif-filters">' +
      '<button class="btn btn-sm ' + (filter === 'all' ? 'primary' : '') + '" onclick="TT.setNotifFilter(\'all\')">All</button>' +
      '<button class="btn btn-sm ' + (filter === 'unread' ? 'primary' : '') + '" onclick="TT.setNotifFilter(\'unread\')">Unread</button>' +
      '<button class="btn btn-sm ' + (filter === 'read' ? 'primary' : '') + '" onclick="TT.setNotifFilter(\'read\')">Read</button>' +
      '<span style="flex:1"></span><button class="btn btn-sm" onclick="TT.markAllRead()">Mark all read</button></div>' +
      '<div style="max-height:52vh;overflow:auto">' +
      (list.map((n) => '<div class="notif-item ' + (!n.read ? 'unread' : '') + '">' +
        (!n.read ? '<span class="notif-dot"></span>' : '<span style="width:7px"></span>') +
        '<span style="font-size:1.1rem">' + (icons[n.type] || 'ℹ️') + '</span>' +
        '<div class="n-main"><div class="n-msg">' + esc(n.msg) + '</div><div class="n-meta">' + fmtDate(n.ts) + '</div></div>' +
        '<div class="n-actions">' +
        (n.action ? '<button class="btn btn-sm primary" onclick="TT.runNotificationAction(\'' + escAttr(n.id) + '\')">Open</button>' : '') +
        (!n.read ? '<button class="btn btn-sm" onclick="TT.markNotification(\'' + escAttr(n.id) + '\',true)">Read</button>' : '') +
        '<button class="btn btn-sm" title="Dismiss" onclick="TT.dismissNotification(\'' + escAttr(n.id) + '\')">✕</button>' +
        '</div></div>').join('') || '<div class="empty-state" style="padding:20px">No notifications in this view.</div>') +
      '</div>' +
      '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn danger btn-sm" onclick="TT.clearNotifications()">Clear all</button>' +
      '<button class="btn" style="margin-left:auto" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    App.openModal('modalGeneric');
  }

  /* ======================================================================
     Onboarding
     ====================================================================== */
  const tourSteps = [
    { sel: '.brand', title: 'Welcome to your workspace', text: 'Everything is local-first: data stays in this browser, and the app installs like a desktop app when served over HTTP.' },
    { sel: '#globalSearchBtn', title: 'Jump anywhere with Ctrl+K', text: 'Search staff, subjects, sections, rooms and actions from one palette. Press ? for the full shortcut list.' },
    { sel: '#btnTheme', title: 'Make it yours', text: 'Switch light / dark / system, pick an accent and compact density. Preferences are remembered locally.' },
    { sel: '.nav-item[data-panel="studio"]', title: 'Timetable Studio', text: 'Click a slot to edit it, drag to move or swap, pin sessions, then regenerate everything unlocked.' },
    { sel: '.nav-item[data-panel="insights"]', title: 'Analytics & insights', text: 'Utilisation heatmaps, workload fairness, attendance trends and room occupancy — no chart library needed.' },
    { sel: '#assistantFab', title: 'The assistant is still here', text: 'Ask it to find a free room, explain a conflict, or propose a safe reassignment. It works against your local data.' }
  ];
  let tourIndex = 0;
  function showWelcome() {
    if ($('awWelcome')) return;
    const ov = document.createElement('div');
    ov.id = 'awWelcome';
    ov.className = 'aw-overlay';
    ov.innerHTML = '<div class="aw-card" role="dialog" aria-modal="true" aria-labelledby="awWelcomeTitle">' +
      '<div class="aw-kicker">College Timetable &amp; Absence</div>' +
      '<h2 id="awWelcomeTitle">A calm command centre for a busy timetable.</h2>' +
      '<p>This workspace is seeded with demo data so you can explore immediately. Choose how you want to begin — you can change everything later.</p>' +
      '<div class="aw-choice-grid">' +
      '<button class="aw-choice" onclick="TT.onboardChoice(\'demo\')"><span class="c-ico">🧭</span><b>Guided demo tour</b><small>Walks every tab and operates on realistic sample data.</small></button>' +
      '<button class="aw-choice" onclick="TT.onboardChoice(\'tour\')"><span class="c-ico">✨</span><b>Quick highlights</b><small>A short 6-step pointer tour of the key controls.</small></button>' +
      '<button class="aw-choice" onclick="TT.onboardChoice(\'import\')"><span class="c-ico">📥</span><b>Import my own data</b><small>Excel, CSV or JSON with a preview before applying.</small></button>' +
      '</div>' +
      '<div class="aw-actions"><button class="btn btn-sm" onclick="TT.endOnboarding()">Skip for now</button></div></div>';
    document.body.appendChild(ov);
    setTimeout(() => { const b = ov.querySelector('button'); if (b) b.focus(); }, 50);
  }
  function endOnboarding() {
    localStorage.setItem('tt_onboarded', '1');
    const ov = $('awWelcome');
    if (ov) ov.remove();
  }
  function onboardChoice(choice) {
    endOnboarding();
    if (choice === 'demo') startDemoTour();
    else if (choice === 'tour') startTour();
    else if (choice === 'import') {
      App.showPanel('generator');
      setTimeout(() => { const f = $('importFile'); if (f) f.click(); }, 250);
    } else {
      App.showPanel('studio');
      say('Demo data ready — try Timetable Studio', 'success');
    }
  }
  function clearTourSpot() {
    document.querySelectorAll('.tour-spot').forEach((el) => el.classList.remove('tour-spot'));
    const tip = $('awTourTip');
    if (tip) tip.remove();
  }
  function startTour() {
    endOnboarding();
    tourIndex = 0;
    closeNav();
    showTourStep(0);
  }
  function showTourStep(i) {
    clearTourSpot();
    if (i < 0 || i >= tourSteps.length) { clearTourSpot(); return; }
    tourIndex = i;
    const step = tourSteps[i];
    const target = document.querySelector(step.sel);
    if (target && (step.sel.indexOf('.nav-item') === 0)) openNav();
    if (target) {
      target.classList.add('tour-spot');
      try { target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } catch (e) {}
    }
    const tip = document.createElement('div');
    tip.id = 'awTourTip';
    tip.className = 'tour-tip';
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-modal', 'false');
    tip.innerHTML = '<div class="tour-top"><span class="badge badge-info">' + (i + 1) + ' / ' + tourSteps.length + '</span>' +
      '<span class="tour-dots">' + tourSteps.map((_, x) => '<i class="' + (x === i ? 'on' : '') + '"></i>').join('') + '</span></div>' +
      '<h3>' + esc(step.title) + '</h3><p>' + esc(step.text) + '</p>' +
      '<div class="tour-actions">' + (i > 0 ? '<button class="btn btn-sm" onclick="TT.tourPrev()">Back</button>' : '') +
      '<button class="btn btn-sm" onclick="TT.endTour()">Skip</button>' +
      '<button class="btn btn-sm primary" onclick="TT.tourNext()">' + (i === tourSteps.length - 1 ? 'Finish' : 'Next') + '</button></div>';
    document.body.appendChild(tip);
    const nb = tip.querySelector('.btn.primary');
    if (nb) setTimeout(() => nb.focus(), 50);
  }
  function tourNext() {
    if (tourIndex >= tourSteps.length - 1) { endTour(); return; }
    showTourStep(tourIndex + 1);
  }
  function tourPrev() { showTourStep(Math.max(0, tourIndex - 1)); }
  function endTour() { clearTourSpot(); closeNav(); localStorage.setItem('tt_onboarded', '1'); }

  /* ======================================================================
     Guided demo tour — navigates real tabs and operates on sample data
     ====================================================================== */
  const DEMO_FLAG = 'tt_demo_seeded';
  function ensureDemoData(force) {
    const hasCampus = (App.data.sections || []).length >= 4 && (App.data.staff || []).length >= 12;
    const hasSchedule = App.teachingSlots().length >= 20;
    // Seeding writes data, so temporarily elevate capabilities — the demo is a showcase.
    const origConfirm = window.confirm;
    const origCaps = App.userCaps;
    window.confirm = () => true;
    App.userCaps = () => ({ write: true, admin: true, owner: true, role: 'Administrator' });
    try {
      if (force || !hasCampus || !hasSchedule) App.loadSampleData();
      seedDemoActivity();
      localStorage.setItem(DEMO_FLAG, '1');
    } finally {
      window.confirm = origConfirm;
      App.userCaps = origCaps;
    }
    App.render();
  }
  /** Seed absences, substitutions (success + critical), leaves, attendance and notifications. */
  function seedDemoActivity() {
    if (localStorage.getItem(DEMO_FLAG) === '1' && (App.data.substitutions || []).length) return;
    const staff = App.data.staff || [];
    if (!staff.length) return;

    // Pick the demo "today": the nearest working day that actually has classes.
    const demoDate = pickDemoDate();
    const wd = weekdayOf(demoDate);
    if (!wd || !App.DAYS.includes(wd)) return;
    // Keep the substitution panel's date picker in sync with the seeded day.
    try {
      const sd = document.getElementById('subDate');
      if (sd) sd.value = demoDate;
      const ad = document.getElementById('attDate');
      if (ad) ad.value = demoDate;
    } catch (e) {}

    // Faculty who actually teach on the demo day — these make the planner interesting.
    const teachingToday = App.teachingSlots().filter((sl) => sl.day === wd);
    const ownerId = (sl) => sl.originalTeacherId || sl.teacherId;
    const byTeacher = new Map();
    teachingToday.forEach((sl) => {
      const id = ownerId(sl);
      if (!byTeacher.has(id)) byTeacher.set(id, []);
      byTeacher.get(id).push(sl);
    });
    const teacherIds = [...byTeacher.keys()].filter((id) => byTeacher.get(id).length >= 2);
    if (!teacherIds.length) return;

    // 1) Approved leaves for a few teaching faculty (drives the generator + due leaves).
    App.data.leaves = App.data.leaves || [];
    const leaveTypes = ['Medical', 'Conference', 'Duty'];
    teacherIds.slice(0, 3).forEach((id, i) => {
      if (App.data.leaves.some((l) => l.staffId === id)) return;
      App.data.leaves.push({ id: uidSafe(), staffId: id, start: demoDate, end: demoDate, type: leaveTypes[i % leaveTypes.length], reason: 'Demo ' + leaveTypes[i % leaveTypes.length].toLowerCase() + ' leave', status: 'approved', processed: {}, ts: new Date().toISOString() });
    });

    // 2) A spread of absences on the demo day. Three flavours so the panel shows real work:
    //    - fully covered   -> history shows green "Covered" rows
    //    - partly covered  -> some slots substituted, some still uncovered
    //    - left uncovered  -> staff absent with their own classes still unassigned
    App.data.substitutions = App.data.substitutions || [];
    const plan = [
      { id: teacherIds[0], mode: 'auto' },                              // auto-substitute everything
      { id: teacherIds[1], mode: 'auto' },                              // auto-substitute everything
      { id: teacherIds[2], mode: 'manual' },                            // absent, nothing covered yet
      { id: teacherIds[Math.min(3, teacherIds.length - 1)], mode: 'manual' }
    ];
    const seen = new Set();
    plan.forEach((p) => {
      if (!p.id || seen.has(p.id)) return;
      seen.add(p.id);
      const s = App.staffById(p.id);
      if (!s) return;
      s.attendanceStatus = 'Absent';
      App.logAttendance(demoDate, s.id, 'Absent', 'Demo seeded absence');
      if (p.mode === 'auto') {
        App.autoSubstitute(s, { date: demoDate, silent: true, reason: 'Demo: short-notice absence' });
      }
    });

    // 3) Record a CRITICAL event for any slot still needing cover (absent owner, no substitute).
    const needCover = App.slotsNeedingCover
      ? App.slotsNeedingCover(wd)
      : App.teachingSlots().filter((sl) => sl.day === wd && !App.effTeacher(sl));
    const criticalSlots = needCover.slice(0, 2);
    criticalSlots.forEach((sl) => {
      if (App.data.substitutions.some((r) => r.slotId === sl.id && r.status === 'critical')) return;
      App.data.substitutions.push({
        id: uidSafe(), ts: new Date().toISOString(), date: demoDate,
        slotId: sl.id, absentTeacher: sl.originalTeacherId || sl.teacherId, substitute: null,
        sectionId: sl.sectionId, subjectCode: sl.subjectCode, day: sl.day, period: sl.period,
        status: 'critical', mode: 'auto', reason: 'No qualified cover available'
      });
    });
    const criticalIds = new Set(criticalSlots.map((s) => s.id));

    // 4) Older illustrative history so the register is not all one date.
    const historySlots = teachingToday.slice(0, 6);
    historySlots.forEach((sl, i) => {
      if (criticalIds.has(sl.id)) return;
      if (App.data.substitutions.some((r) => r.slotId === sl.id)) return;
      App.data.substitutions.push({
        id: uidSafe(), ts: new Date(Date.now() - (i + 1) * 86400000).toISOString(), date: null,
        slotId: sl.id, absentTeacher: sl.originalTeacherId || sl.teacherId,
        substitute: App.data.staff[(i + 7) % App.data.staff.length].id,
        sectionId: sl.sectionId, subjectCode: sl.subjectCode, day: sl.day, period: sl.period,
        status: i === 4 ? 'critical' : 'success', mode: 'auto',
        reason: i === 4 ? 'No qualified cover available' : 'Demo: arranged cover'
      });
    });
    if (App.data.substitutions.length > 1000) App.data.substitutions.length = 1000;

    // 5) Attendance log spread over the last few days for the insights trend chart.
    const statuses = ['Present', 'Present', 'Present', 'Present', 'Absent', 'Leave'];
    for (let d = 0; d < 10; d++) {
      const day = new Date(Date.now() - d * 86400000);
      const iso = new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      staff.slice(0, 14).forEach((s, i) => {
        const st = statuses[(i + d) % statuses.length];
        App.logAttendance(iso, s.id, st, 'Demo attendance');
      });
    }

    // 6) Unread notifications with deep-link actions.
    const absentCount = App.data.staff.filter((s) => s.attendanceStatus === 'Absent').length;
    const needCoverCount = App.slotsNeedingCover ? App.slotsNeedingCover(wd).length : 0;
    const notifSeed = [
      ['warn', 'Demo: ' + needCoverCount + ' cover gap(s) still need cover for ' + wd + ' ' + demoDate, { panel: 'substitution' }],
      ['info', absentCount + ' faculty marked absent — open the cover planner to assign substitutes', { panel: 'substitution' }],
      ['info', 'Demo: timetable published for Semester ' + (App.config.semester || 1), { panel: 'studio' }],
      ['danger', 'Demo: 1 faculty member is over their weekly load', { panel: 'insights' }]
    ];
    notifSeed.forEach(([type, msg, action]) => App.notify(type, msg, action));

    // 7) A published reference so Publish/Diff has a baseline.
    if (!localStorage.getItem('tt_published_schedule')) {
      writeJSON('tt_published_schedule', { at: new Date().toISOString(), by: (App.currentUser && App.currentUser().name) || 'Administrator', term: (App.config.academicYear || '') + ' · Semester ' + (App.config.semester || 1), schedule: clone(App.data.schedule) });
    }

    App.saveAll();
    App.snapshotVersion('demo data seeded', true);
    App.audit('Demo activity seeded', (App.data.substitutions || []).length + ' substitutions, ' + (App.data.leaves || []).length + ' leaves, ' + absentCount + ' absent on ' + demoDate);
  }
  /** Nearest working day (from today forward) that has scheduled classes. */
  function pickDemoDate() {
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const wd = weekdayOf(iso);
      if (App.DAYS.includes(wd) && App.teachingSlots().some((sl) => sl.day === wd)) return iso;
    }
    return todayISO();
  }

  /* ---- Demo tour steps: each navigates to a real panel and operates on data ---- */
  const demoTourSteps = [
    {
      panel: 'dashboard', title: 'Welcome to your command centre', sel: '#dashStats',
      text: 'This is a fully seeded college. The cards above are live: sections, faculty, rooms, clashes and today\'s absences. Over the next steps we will actually use each screen together.',
      doThis: 'Just look around — press Next when ready.',
      before: () => { closeNav(); }
    },
    {
      panel: 'studio', title: '1 · Timetable Studio', sel: '#studioContent .studio-grid',
      text: 'Every coloured block is a real class. You can edit a session, drag it to another period to move or swap it, and pin the ones that must not move.',
      doThis: 'Try it: click any coloured block to open its editor.',
      waitFor: '.modal.open',
      before: () => { App.closeModal && App.closeModal('modalGeneric'); }
    },
    {
      panel: 'studio', title: '1 · The session editor', sel: '.modal.open',
      text: 'The editor shows the subject, teacher and room, and runs live safety checks — if your change would clash with a teacher, room or section it warns you before you commit.',
      doThis: 'Close it when you are done (✕ or Cancel).',
      waitForGone: '.modal.open',
      before: () => {}
    },
    {
      panel: 'studio', title: '1 · Pin & regenerate', sel: '#studioContent .studio-toolbar',
      text: 'Pin the sessions you must protect, then "Regenerate Unlocked" re-solves everything else around your fixes. We have pinned one session for you.',
      doThis: 'Notice the pin marker on one block.',
      before: () => { App.closeModal && App.closeModal('modalGeneric'); const s = App.data.schedule.find((x) => x.subjectCode !== 'FREE'); if (s && !s.pinned) App.toggleSlotPin(s.id); }
    },
    {
      panel: 'insights', title: '2 · Analytics & insights', sel: '#insightsContent .heat-table',
      text: 'See where the week is busiest, who is overloaded, how attendance is trending and how well rooms are used. Everything here is derived from the schedule you just saw.',
      doThis: 'Try it: change the department filter to slice the numbers.',
      waitFor: '#insightsContent',
      before: () => {}
    },
    {
      panel: 'attendance', title: '3 · Daily attendance', sel: '#attendanceTableBody',
      text: 'This is the roster for the demo day. Slide a switch to mark someone Present or Absent — absences feed straight into the cover planner.',
      doThis: 'Try it: slide one faculty member to Absent.',
      before: () => {}
    },
    {
      panel: 'substitution', title: '4 · Absence cover planner', sel: '#subStats',
      text: 'This is the heart of cover management. Faculty who teach on the demo day are marked absent — some classes are already covered, some still need cover, and there is a critical gap.',
      doThis: 'Look at the cards: Absent, Affected, Uncovered, Covered.',
      before: () => {}
    },
    {
      panel: 'substitution', title: '4 · Assign a substitute', sel: '#substitutionFacultyList',
      text: 'Open the planner for an absent teacher. Every affected class lists ranked substitutes — subject expertise, availability and current load are pre-checked, best option preselected.',
      doThis: 'Try it: click "Review / Reassign" on a teacher with uncovered slots.',
      waitFor: '.modal.open',
      before: () => {}
    },
    {
      panel: 'substitution', title: '4 · The cover history', sel: '#substitutionHistory',
      text: 'Green rows are cover successfully arranged; red rows are gaps that could not be filled automatically and need a human decision.',
      doThis: 'Notice the red critical row among the green ones.',
      waitForGone: '.modal.open',
      before: () => { App.closeModal && App.closeModal('modalGeneric'); }
    },
    {
      panel: 'sections', title: '5 · Sections & curriculum', sel: '#sectionsContent',
      text: 'Each section with its curriculum mapping, prescribed versus scheduled hours, and a printable timetable.',
      doThis: 'Scan the coverage column for any section behind its prescribed hours.',
      before: () => {}
    },
    {
      panel: 'rooms', title: '6 · Rooms & utilisation', sel: '#roomsContent',
      text: 'Room inventory with live utilisation. Classrooms, labs and a general hall show where booking pressure is highest.',
      doThis: 'Find the most heavily used room.',
      before: () => {}
    },
    {
      panel: 'staff', title: '7 · Faculty directory', sel: '#staffTableBody, .panel.active .table-wrap',
      text: 'Search, filter by department or expertise, and open a profile for load, availability and duties. Bulk actions work from the checkboxes.',
      doThis: 'Try it: type a name in the search box.',
      before: () => {}
    },
    {
      panel: 'subjects', title: '8 · Subject catalogue', sel: '#subjectTableBody, .panel.active .table-wrap',
      text: 'Theory and lab subjects with credits and weekly hours, grouped by department. This is what the generator schedules against.',
      doThis: 'Filter by type to see labs versus theory.',
      before: () => {}
    },
    {
      panel: 'calendar', title: '9 · Calendar & holidays', sel: '#calMonthGrid, #holidayList',
      text: 'Holidays and compensatory working days feed the generator, so classes never land on a non-working day.',
      doThis: 'Look at the term start and end dates.',
      before: () => {}
    },
    {
      panel: 'generator', title: '10 · The timetable generator', sel: '#genResults, .panel.active .card',
      text: 'Tune the constraints, then run the solver. It reports conflicts and unscheduled classes instead of failing silently, and respects pinned sessions.',
      doThis: 'Read the constraint panel — you do not need to run it now.',
      before: () => {}
    },
    {
      panel: 'regulations', title: '11 · Rules & conflict audit', sel: '#regulationsContent',
      text: 'Compliance rules plus a full clash audit for teacher, room and section double-bookings, with one-click Auto-repair.',
      doThis: 'Find the Auto-repair button.',
      before: () => {}
    },
    {
      panel: 'reports', title: '12 · Reports & exports', sel: '#reportsContent',
      text: 'Workload reports, utilisation summaries, CSV/Excel exports, a shareable timetable pack and a printable master report.',
      doThis: 'Try it: hover the export buttons.',
      before: () => {}
    },
    {
      panel: 'audit', title: '13 · Audit register', sel: '#auditContent',
      text: 'Every meaningful action is recorded locally for accountability — including the demo data seeding from the start of this tour.',
      doThis: 'Notice the seeded-activity entries at the top.',
      before: () => {}
    },
    {
      panel: 'admin', title: '14 · Administration', sel: '#adminContent',
      text: 'Institution profile, users and roles, period timings, data health checks, a storage meter and term archives/rollover.',
      doThis: 'We will run a data health check for you now.',
      before: () => { App.runHealthCheck && App.runHealthCheck(); }
    },
    {
      panel: 'dashboard', title: 'That\'s the whole workflow', sel: '#dashStats',
      text: 'Generate → staff it → cover absences → analyse → publish → export. The demo campus stays in your browser so you can keep exploring after the tour.',
      doThis: 'Press Ctrl+K anytime to jump between panels.',
      before: () => {}
    }
  ];
  let demoIndex = 0;
  let demoSeededThisRun = false;
  function isDemoRunning() { return document.body.classList.contains('demo-tour'); }  function demoSpot() {
    const card = document.querySelector('.demo-coach');
    return document.querySelectorAll('.demo-spot');
  }
  function clearDemoSpot() {
    document.querySelectorAll('.demo-spot').forEach((el) => el.classList.remove('demo-spot'));
    const coach = document.querySelector('.demo-coach'); if (coach) coach.remove();
    const dim = document.querySelector('.demo-dim'); if (dim) dim.remove();
    const bar = document.querySelector('.demo-progress'); if (bar) bar.remove();
    document.body.classList.remove('demo-interactive');
  }
  function startDemoTour(options) {
    options = options || {};
    endOnboarding();
    closeNav();
    App.closeModal && App.closeModal('modalGeneric');
    App._demoPrevPanel = null;
    demoIndex = 0;
    document.body.classList.add('demo-tour');
    clearDemoSpot();
    if (!demoSeededThisRun || options.reseed) {
      say('Preparing demo campus…', 'info');
      demoSeededThisRun = true;
      setTimeout(() => { ensureDemoData(options.reseed); showDemoStep(0); }, 120);
    } else {
      showDemoStep(0);
    }
    showDemoBanner();
  }
  function showDemoBanner() {
    if (document.getElementById('demoBanner')) return;
    const b = document.createElement('div');
    b.id = 'demoBanner';
    b.className = 'demo-banner';
    b.innerHTML = '<span class="db-ico">🧭</span><span><b>Guided demo</b> <small id="demoBannerStep"></small></span>' +
      '<button class="btn btn-sm primary" onclick="TT.demoNext()">Next</button>' +
      '<button class="btn btn-sm" onclick="TT.endDemoTour()">Exit</button>';
    document.body.appendChild(b);
  }
  function updateDemoBanner() {
    const el = document.getElementById('demoBannerStep');
    if (el) el.textContent = '· step ' + (demoIndex + 1) + ' of ' + demoTourSteps.length + ' · ' + demoTourSteps[demoIndex].title;
  }
  function positionCoach(coach, target) {
    if (!target) { coach.style.left = '50%'; coach.style.top = '50%'; coach.style.transform = 'translate(-50%, -50%)'; return; }
    coach.style.transform = 'none';
    coach.style.right = 'auto';
    const pad = 16, cw = coach.offsetWidth || 430, ch = coach.offsetHeight || 240;
    const r = target.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // Prefer below, then above, then side — never covering the highlighted region.
    let top = r.bottom + pad;
    let left = Math.min(Math.max(12, r.left), Math.max(12, vw - cw - 12));
    if (top + ch > vh - 12) {
      const above = r.top - ch - pad;
      if (above >= 12) { top = above; }
      else {
        // Not enough vertical room: dock to the side with most space.
        top = Math.min(Math.max(12, r.top), Math.max(12, vh - ch - 12));
        left = r.right + pad + cw <= vw - 12 ? r.right + pad : Math.max(12, r.left - cw - pad);
      }
    }
    if (top < 12) top = 12;
    coach.style.top = top + 'px';
    coach.style.left = left + 'px';
  }
  let demoTimer = null;
  function showDemoStep(i) {
    if (!isDemoRunning()) return;
    if (i < 0 || i >= demoTourSteps.length) { endDemoTour(); return; }
    demoIndex = i;
    const step = demoTourSteps[i];
    // Finish the previous step's cleanup, then run this step's setup.
    const prev = demoTourSteps[i - 1];
    if (prev && typeof prev.after === 'function') { try { prev.after(); } catch (e) {} }
    clearDemoSpot();
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    document.body.classList.add('demo-tour');
    if (typeof step.before === 'function') { try { step.before(); } catch (e) { console.warn('demo step', e); } }
    App.showPanel(step.panel);
    // Progress bar
    const bar = document.createElement('div');
    bar.className = 'demo-progress';
    bar.innerHTML = '<i style="width:' + Math.round(((i + 1) / demoTourSteps.length) * 100) + '%"></i>';
    document.body.appendChild(bar);
    const dim = document.createElement('div');
    dim.className = 'demo-dim';
    document.body.appendChild(dim);
    const target = step.sel ? document.querySelector(step.sel) : null;
    if (target) {
      target.classList.add('demo-spot');
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) {}
    }
    const coach = document.createElement('div');
    coach.className = 'demo-coach';
    coach.setAttribute('role', 'dialog');
    coach.setAttribute('aria-modal', 'true');
    coach.setAttribute('aria-label', 'Guided demo step ' + (i + 1) + ': ' + step.title);
    const taskId = 'demoTask' + i;
    const hasTask = !!(step.waitFor || step.waitForGone);
    coach.innerHTML =
      '<div class="dc-kicker"><span class="dc-step">Step ' + (i + 1) + ' / ' + demoTourSteps.length + '</span>' + esc(step.panel) + '</div>' +
      '<h3>' + esc(step.title) + '</h3><p>' + esc(step.text) + '</p>' +
      (step.doThis ? '<div class="dc-task' + (hasTask ? ' interactive' : '') + '" id="' + taskId + '"><span class="t-ico">' + (hasTask ? '🎯' : '👀') + '</span><span class="t-txt">' + esc(step.doThis) + '</span>' + (hasTask ? '<span class="t-state pending">waiting…</span>' : '') + '</div>' : '') +
      '<div class="dc-actions">' +
      (i > 0 ? '<button class="btn btn-sm" onclick="TT.demoPrev()">Back</button>' : '') +
      '<button class="btn btn-sm" onclick="TT.endDemoTour()">Skip tour</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm primary" onclick="TT.demoNext()">' + (i === demoTourSteps.length - 1 ? 'Finish' : 'Next →') + '</button>' +
      '</div><div class="dc-cursor" aria-hidden="true">👆</div>';
    document.body.appendChild(coach);
    positionCoach(coach, target);
    updateDemoBanner();
    // Watch for the user completing the suggested interaction.
    if (hasTask) {
      document.body.classList.add('demo-interactive');
      const state = coach.querySelector('#' + taskId + ' .t-state');
      const check = () => {
        if (!document.body.classList.contains('demo-tour') || demoIndex !== i) { return; }
        let done = false;
        try { done = step.waitFor ? !!document.querySelector(step.waitFor) : !document.querySelector(step.waitForGone); } catch (e) {}
        if (done) {
          if (state) { state.textContent = 'done ✓'; state.classList.add('done'); state.classList.remove('pending'); }
          const t = document.getElementById(taskId);
          if (t) t.classList.add('complete');
          if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
          const nb = coach.querySelector('.btn.primary');
          if (nb) nb.focus();
        }
      };
      demoTimer = setInterval(check, 350);
      setTimeout(check, 400);
    }
    const nb = coach.querySelector('.btn.primary');
    if (nb) setTimeout(() => nb.focus(), 60);
    window.addEventListener('resize', demoReposition);
  }
  function demoReposition() {
    const coach = document.querySelector('.demo-coach');
    const target = document.querySelector('.demo-spot');
    if (coach) positionCoach(coach, target);
  }
  function demoNext() { if (demoIndex >= demoTourSteps.length - 1) { endDemoTour(); return; } showDemoStep(demoIndex + 1); }
  function demoPrev() { showDemoStep(Math.max(0, demoIndex - 1)); }
  function endDemoTour() {
    document.body.classList.remove('demo-tour');
    document.body.classList.remove('demo-interactive');
    window.removeEventListener('resize', demoReposition);
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    const last = demoTourSteps[demoIndex];
    if (last && typeof last.after === 'function') { try { last.after(); } catch (e) {} }
    clearDemoSpot();
    const b = document.getElementById('demoBanner'); if (b) b.remove();
    App.closeModal && App.closeModal('modalGeneric');
    localStorage.setItem('tt_onboarded', '1');
    App.saveAll();
    say('Demo tour complete — explore freely. Press Ctrl+K to jump anywhere.', 'success');
  }
  /** Prepare demo data (with substitutions/attendance/notifications) without starting the tour. */
  function demoSeedOnly() { ensureDemoData(false); say('Demo campus ready — substitutions, attendance and notifications populated', 'success'); }


  /* ======================================================================
     PIN lock
     ====================================================================== */
  function fallbackHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fnv_' + (h >>> 0).toString(16);
  }
  async function hashPin(pin) {
    try {
      if (window.crypto && crypto.subtle && window.TextEncoder) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tt:' + pin));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) {}
    return fallbackHash('tt:' + pin);
  }
  function openSecurityModal() {
    const enabled = !!App.config.pinEnabled;
    $('modalTitle').textContent = 'Security & Session';
    $('modalBody').innerHTML =
      '<div class="two-col">' +
      '<div class="card"><div class="ent-card-head"><span>🔐 Local PIN</span>' + (enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-neutral">Off</span>') + '</div>' +
      '<p class="text-muted" style="font-size:.84rem">A PIN locks this browser session. It is stored as a hash in local storage and is <b>not</b> server-grade security — anyone with access to this browser profile can clear local data.</p>' +
      (enabled ? '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" onclick="TT.lockNow()">Lock now</button><button class="btn danger" onclick="TT.removePin()">Remove PIN</button></div>' :
        '<div class="form-row"><div class="form-group"><label>New PIN (4–12 digits)</label><input id="pinNew" type="password" inputmode="numeric" maxlength="12" placeholder="••••"/></div>' +
        '<div class="form-group"><label>Confirm PIN</label><input id="pinConfirm" type="password" inputmode="numeric" maxlength="12" placeholder="••••"/></div></div>' +
        '<button class="btn primary" style="margin-top:8px" onclick="TT.savePin()">Enable PIN lock</button>') +
      '</div>' +
      '<div class="card"><div class="ent-card-head"><span>👤 Signed-in role</span></div>' +
      '<div class="account-list">' + (App.config.roles || []).map((r) => '<div class="account-row ' + (r.id === App.config.currentUserId ? 'current' : '') + '">' +
        '<span class="account-avatar small">' + esc(initials(r.name)) + '</span><span style="flex:1"><b>' + esc(r.name) + '</b><small>' + esc(r.role + ' · ' + (r.dept || '')) + '</small></span>' +
        (r.id === App.config.currentUserId ? '<span class="badge badge-success">Active</span>' : '') + '</div>').join('') + '</div>' +
      '<p class="text-muted" style="font-size:.8rem;margin-top:10px">Use the profile menu to switch roles. Read-only roles get a banner and disabled mutation controls.</p></div></div>' +
      '<div class="mt-16" style="display:flex;gap:8px"><button class="btn" onclick="TT.openHistory()">↶ Undo &amp; trash</button><button class="btn" onclick="TT.startTour()">🧭 Take the tour</button><button class="btn" style="margin-left:auto" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    App.openModal('modalGeneric');
  }
  async function savePin() {
    const a = ($('pinNew') && $('pinNew').value || '').trim();
    const b = ($('pinConfirm') && $('pinConfirm').value || '').trim();
    if (!/^\d{4,12}$/.test(a)) { say('PIN must be 4–12 digits', 'error'); return; }
    if (a !== b) { say('PINs do not match', 'error'); return; }
    App.config.pinHash = await hashPin(a);
    App.config.pinEnabled = true;
    writeJSON('tt_config', App.config);
    sessionStorage.setItem('tt_unlocked', '1');
    say('PIN lock enabled', 'success');
    App.closeModal('modalGeneric');
  }
  function removePin() {
    if (!confirm('Remove the local PIN lock?')) return;
    App.config.pinEnabled = false;
    App.config.pinHash = '';
    writeJSON('tt_config', App.config);
    say('PIN lock removed', 'success');
    App.closeModal('modalGeneric');
  }
  function lockNow() {
    if (!App.config.pinEnabled) { say('Set a PIN first', 'warn'); return; }
    sessionStorage.removeItem('tt_unlocked');
    App.closeModal('modalGeneric');
    showLock();
  }
  function showLock() {
    if ($('lockScreen')) return;
    const el = document.createElement('div');
    el.id = 'lockScreen';
    el.className = 'lock-screen';
    el.innerHTML = '<div class="lock-card" role="dialog" aria-modal="true" aria-labelledby="lockTitle">' +
      '<div class="aw-kicker">College Timetable</div><h2 id="lockTitle">Workspace locked</h2>' +
      '<p>Enter your local PIN to continue. Data is still stored in this browser.</p>' +
      '<input id="lockPin" type="password" inputmode="numeric" maxlength="12" placeholder="••••" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')TT.tryUnlock()"/>' +
      '<div class="lock-error" id="lockError"></div>' +
      '<div class="lock-actions"><button class="btn primary" style="flex:1" onclick="TT.tryUnlock()">Unlock</button><button class="btn" onclick="TT.recoverPin()">Forgot?</button></div></div>';
    document.body.appendChild(el);
    setTimeout(() => { const i = $('lockPin'); if (i) i.focus(); }, 60);
  }
  async function tryUnlock() {
    const inp = $('lockPin');
    const pin = inp ? inp.value : '';
    const hash = await hashPin(pin);
    if (hash === App.config.pinHash) {
      sessionStorage.setItem('tt_unlocked', '1');
      const el = $('lockScreen');
      if (el) el.remove();
      say('Unlocked', 'success');
    } else {
      const err = $('lockError');
      const card = document.querySelector('.lock-card');
      if (err) err.textContent = 'Incorrect PIN. Try again.';
      if (card) { card.classList.remove('lock-shake'); void card.offsetWidth; card.classList.add('lock-shake'); }
      if (inp) { inp.value = ''; inp.focus(); }
    }
  }
  function recoverPin() {
    const v = prompt('Type RESET to remove the local PIN lock. Your timetable data will be kept.');
    if (v !== 'RESET') return;
    App.config.pinEnabled = false;
    App.config.pinHash = '';
    writeJSON('tt_config', App.config);
    sessionStorage.setItem('tt_unlocked', '1');
    const el = $('lockScreen');
    if (el) el.remove();
    say('PIN removed', 'success');
  }

  /* ======================================================================
     Term archives + rollover
     ====================================================================== */
  function archives() { return readJSON('tt_term_archives', []) || []; }
  function saveArchives(list) {
    try { writeJSON('tt_term_archives', list); return true; }
    catch (e) { return false; }
  }
  function archiveCurrentTerm(label) {
    const d = App.data;
    const c = App.config;
    const entry = {
      id: uidSafe(), at: new Date().toISOString(),
      label: label || (String(c.academicYear || '') + ' · Semester ' + (c.semester || 1)),
      term: c.semester || 1, year: c.academicYear || '',
      stats: { sections: (d.sections || []).length, staff: (d.staff || []).length, subjects: (d.subjects || []).length, rooms: (d.rooms || []).length, slots: (d.schedule || []).length },
      data: {
        departments: clone(d.departments || []), sections: clone(d.sections || []), subjects: clone(d.subjects || []),
        staff: clone(d.staff || []), rooms: clone(d.rooms || []), schedule: clone(d.schedule || []),
        holidays: clone(d.holidays || []), substitutions: clone(d.substitutions || []), leaves: clone(d.leaves || [])
      },
      config: { semester: c.semester, academicYear: c.academicYear, semStart: c.semStart, semEnd: c.semEnd, days: c.days, periods: c.periods, maxWeekly: c.maxWeekly, maxDaily: c.maxDaily, maxConsec: c.maxConsec, periodTimes: clone(c.periodTimes || []) }
    };
    const list = archives();
    list.unshift(entry);
    if (list.length > 6) list.length = 6;
    if (!saveArchives(list)) { say('Could not save archive — storage full. Download a backup and clear old archives.', 'error'); return false; }
    App.audit('Term archived', entry.label + ' (' + entry.stats.slots + ' slots)');
    say('Term archived: ' + entry.label, 'success');
    return true;
  }
  function archiveTerm() {
    if (!confirm('Archive the current term? This keeps a restore point and does not change your live data.')) return;
    if (archiveCurrentTerm()) { if (App.activePanel === 'admin') App.render(); }
  }
  function restoreArchive(id) {
    const list = archives();
    const a = list.find((x) => x.id === id);
    if (!a) return;
    if (!confirm('Restore "' + a.label + '"? Current data will be replaced. A safety snapshot is added to undo history.')) return;
    App.pushUndo('Archive restored: ' + a.label);
    App.data.departments = clone(a.data.departments || []);
    App.data.sections = clone(a.data.sections || []);
    App.data.subjects = clone(a.data.subjects || []);
    App.data.staff = clone(a.data.staff || []);
    App.data.rooms = clone(a.data.rooms || []);
    App.data.schedule = clone(a.data.schedule || []);
    App.data.holidays = clone(a.data.holidays || []);
    App.data.substitutions = clone(a.data.substitutions || []);
    App.data.leaves = clone(a.data.leaves || []);
    Object.assign(App.config, a.config || {});
    writeJSON('tt_config', App.config);
    App.ensureEnterprise && App.ensureEnterprise();
    ensureDefaults();
    App.saveAll();
    App.audit('Archive restored', a.label);
    say('Archive restored: ' + a.label, 'success');
    App.render();
  }
  function deleteArchive(id) {
    const list = archives().find((x) => x.id === id);
    if (!list || !confirm('Delete archive "' + list.label + '"? This cannot be undone.')) return;
    saveArchives(archives().filter((x) => x.id !== id));
    say('Archive deleted', 'success');
    if (App.activePanel === 'admin') App.render();
  }
  function downloadArchive(id) {
    const a = archives().find((x) => x.id === id);
    if (!a) return;
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'term_archive_' + (a.year || '') + '_sem' + (a.term || '') + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
  function rolloverTerm() {
    if (!confirm('Archive this term and roll over to the next one?\n\nKeeps departments, sections, subjects, staff and rooms. Clears the timetable, attendance, substitutions and leave records.')) return;
    if (!archiveCurrentTerm('Rollover · before ' + (App.config.academicYear || ''))) return;
    App.pushUndo('Term rolled over');
    App.data.schedule = [];
    App.data.substitutions = [];
    App.data.leaves = [];
    (App.data.staff || []).forEach((s) => { s.attendanceStatus = 'Present'; });
    localStorage.removeItem('tt_attendance_log');
    const sem = Number(App.config.semester) || 1;
    if (sem >= 2) {
      App.config.semester = 1;
      const y = String(App.config.academicYear || '2026-27');
      const m = y.match(/^(\d{4})\s*[-–]\s*(\d{2,4})$/);
      if (m) {
        const start = parseInt(m[1], 10) + 1;
        const end = (start + 1).toString().slice(-2);
        App.config.academicYear = start + '-' + end;
      }
    } else App.config.semester = sem + 1;
    writeJSON('tt_config', App.config);
    App.saveAll();
    App.audit('Term rolled over', 'Semester ' + App.config.semester + ' · ' + App.config.academicYear);
    say('Rolled over to Semester ' + App.config.semester + ' · ' + App.config.academicYear, 'success');
    App.render();
  }

  /* ======================================================================
     Admin extras
     ====================================================================== */
  function renderAdminExtras() {
    const host = $('adminContent');
    if (!host) return;
    if ($('awesomeAdminExtras')) $('awesomeAdminExtras').remove();
    const list = archives();
    const bytes = storageBytes();
    const quota = Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100));
    const box = document.createElement('div');
    box.id = 'awesomeAdminExtras';
    box.innerHTML =
      '<div class="two-col mt-24">' +
      '<div class="card"><div class="ent-card-head"><span>🗄 Term archives &amp; rollover</span><span class="badge badge-neutral">' + list.length + ' archived</span></div>' +
      '<p class="text-muted" style="font-size:.82rem">Archive keeps the full timetable and catalogue for this term. Rollover starts the next semester without losing the catalogue.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn primary btn-sm" onclick="TT.archiveTerm()">Archive current term</button>' +
      '<button class="btn btn-sm" onclick="TT.rolloverTerm()">Roll over term</button>' +
      '<button class="btn btn-sm" onclick="TT.downloadBackup()">Download full backup</button></div>' +
      '<div class="history-list">' + (list.map((a) => '<div class="archive-row"><span class="h-main"><b>' + esc(a.label) + '</b><small>' + fmtDate(a.at) + ' · ' + a.stats.slots + ' slots · ' + a.stats.sections + ' sections</small></span>' +
        '<span class="a-actions"><button class="btn btn-sm" onclick="TT.downloadArchive(\'' + escAttr(a.id) + '\')">Download</button>' +
        '<button class="btn btn-sm primary" onclick="TT.restoreArchive(\'' + escAttr(a.id) + '\')">Restore</button>' +
        '<button class="btn btn-sm danger" onclick="TT.deleteArchive(\'' + escAttr(a.id) + '\')">Delete</button></span></div>').join('') || '<div class="text-muted" style="font-size:.82rem">No archives yet. Archive before a rollover or at the end of term.</div>') + '</div></div>' +
      '<div class="card"><div class="ent-card-head"><span>💾 Storage &amp; safety</span><span class="badge badge-' + (quota > 85 ? 'danger' : quota > 65 ? 'warning' : 'success') + '">' + fmtBytes(bytes) + '</span></div>' +
      '<div class="text-muted" style="font-size:.82rem">Local storage used (rough allowance 5 MB).</div>' +
      '<div class="storage-meter ' + (quota > 85 ? 'bad' : quota > 65 ? 'warn' : '') + '"><i style="width:' + quota + '%"></i></div>' +
      '<div class="text-muted" style="font-size:.74rem;margin-bottom:10px">' + quota + '% of the safe local budget</div>' +
      '<div class="kv"><span>Undo history</span><b>' + (App._undo || []).length + ' action(s)</b></div>' +
      '<div class="kv"><span>Trash</span><b>' + trashEntries().length + ' item(s)</b></div>' +
      '<div class="kv"><span>Offline</span><b>' + (navigator.onLine ? 'Online' : 'Offline') + ' · ' + (location.protocol.indexOf('http') === 0 ? 'PWA ready' : 'file://') + '</b></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-sm" onclick="TT.openHistory()">Undo &amp; trash</button>' +
      '<button class="btn btn-sm" onclick="TT.openSecurityModal()">Security &amp; PIN</button><button class="btn btn-sm" onclick="TT.logStorageReport()">Log storage report</button></div></div></div>';
    host.appendChild(box);
    // Make the Admin "offline capability" claim accurate.
    host.innerHTML = host.innerHTML.replace(/Offline capability<\/span><b>Core features available<\/b>/, 'Offline capability</span><b>' + (location.protocol.indexOf('http') === 0 ? 'Installable PWA · cached assets' : 'Local data · serve over HTTP for install') + '</b>');
  }
  function logStorageReport() {
    const bytes = storageBytes();
    App.audit('Storage report', fmtBytes(bytes) + ' · ' + fmtBytes(5 * 1024 * 1024) + ' allowance · ' + App.data.sections.length + ' sections · ' + App.data.schedule.length + ' slots');
    say('Storage report added to audit log', 'success');
  }
  /** Duplicate schedule cells (same section/day/period) confuse moves and reports. */
  function duplicateCells() {
    const seen = new Map();
    const dups = [];
    (App.data.schedule || []).forEach((s) => {
      const k = s.sectionId + '|' + s.day + '|' + s.period;
      if (seen.has(k)) dups.push({ first: seen.get(k), extra: s, key: k });
      else seen.set(k, s);
    });
    return dups;
  }
  function dedupeSchedule() {
    const dups = duplicateCells();
    if (!dups.length) return 0;
    if (!(App.canWrite && App.canWrite())) { say('Read-only role', 'error'); return 0; }
    const removeIds = new Set(dups.map((d) => d.extra.id));
    App.data.schedule = App.data.schedule.filter((s) => !removeIds.has(s.id));
    App.saveAll();
    App.audit('Duplicate schedule cells removed', dups.length + ' duplicate row(s) deleted');
    say('Removed ' + dups.length + ' duplicate cell(s)', 'success');
    App.render();
    return dups.length;
  }
  function healthCheckEnhanced() {
    const orig = App._awOrigHealthCheck;
    if (typeof orig === 'function') orig.call(App);
    const dups = duplicateCells();
    if (dups.length) {
      App._health = App._health || [];
      App._health.unshift({ level: 'danger', area: 'Schedule', message: dups.length + ' duplicate section/day/period cell(s) found', fix: 'dedupe', fixLabel: 'Remove duplicates' });
      const el = document.getElementById('healthResults');
      if (el) el.innerHTML = App.healthHTML();
      App.notify('danger', dups.length + ' duplicate timetable cell(s) detected in the schedule', { panel: 'admin' });
    }
    return App._health;
  }

  /* ======================================================================
     Import preview
     ====================================================================== */
  function openImportPreview(file) {
    if (!file) return;
    if (!App.canWrite || !App.canWrite()) { say('Read-only role cannot import data', 'error'); return; }
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isCSV = name.endsWith('.csv');
    const isJSON = name.endsWith('.json');
    if (!isExcel && !isCSV && !isJSON) { say('Unsupported file type', 'error'); return; }
    if (file.size > 15 * 1024 * 1024) { say('File is larger than 15 MB — trim it before importing', 'error'); return; }
    const read = isExcel ? file.arrayBuffer().then((buf) => ({ kind: 'excel', workbook: XLSX.read(buf, { type: 'array' }) }))
      : file.text().then((text) => ({ kind: isCSV ? 'csv' : 'json', text }));
    read.then((data) => {
      if (isExcel && !window.XLSX) throw new Error('Excel reader not loaded');
      let summary = '';
      let warnings = [];
      if (data.kind === 'excel') {
        if (!window.XLSX) throw new Error('Excel reader not loaded');
        const wb = data.workbook;
        summary = '<div class="import-meta">' + wb.SheetNames.map((sn) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn]);
          const type = rows.length ? App.detectImportType(sn, rows) : 'unknown';
          if (type === 'unknown') warnings.push('Sheet "' + sn + '" is not a recognised entity and will be skipped.');
          return '<span class="badge badge-' + (type === 'unknown' ? 'warning' : 'info') + '">' + esc(sn) + ' · ' + rows.length + ' rows · ' + esc(type) + '</span>';
        }).join('') + '</div>';
        const first = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[first]).slice(0, 6);
        summary += previewTable(rows, 'First sheet preview · ' + first);
      } else if (data.kind === 'csv') {
        const rows = App.parseCSV(data.text);
        const type = rows.length ? App.detectImportType(file.name, rows) : 'unknown';
        summary = '<div class="import-meta"><span class="badge badge-info">' + rows.length + ' rows</span><span class="badge badge-neutral">Detected: ' + esc(type) + '</span><span class="badge badge-neutral">' + Object.keys(rows[0] || {}).length + ' columns</span></div>' + previewTable(rows.slice(0, 8), 'CSV preview');
        if (type === 'unknown') warnings.push('Could not auto-detect the entity from the filename or columns. Rename the file (staff.csv, subjects.csv, etc.).');
      } else {
        let parsed;
        try { parsed = JSON.parse(data.text); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
        const counts = ['departments', 'sections', 'subjects', 'staff', 'rooms', 'holidays', 'schedule'].filter((k) => Array.isArray(parsed[k]));
        summary = '<div class="import-meta">' + (counts.map((k) => '<span class="badge badge-info">' + k + ' · ' + parsed[k].length + '</span>').join('') || '<span class="badge badge-warning">No recognised arrays</span>') + '</div>';
        const sample = counts.length ? previewTable(parsed[counts[0]].slice(0, 5), 'JSON preview · ' + counts[0]) : '<div class="text-muted">No preview available.</div>';
        summary += sample;
        if (!counts.length) warnings.push('JSON does not contain departments, sections, subjects, staff, rooms, holidays or schedule arrays.');
      }
      const bytes = storageBytes();
      const quota = Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100));
      App._awPendingImport = { file, kind: data.kind };
      $('modalTitle').textContent = 'Import preview — ' + file.name;
      $('modalBody').innerHTML = summary +
        '<div class="mt-16">' + (warnings.length ? '<div class="slot-warning warn">' + warnings.map(esc).join('<br>') + '</div>' : '<div class="slot-warning ok">Ready to apply. A backup point is added to undo history first.</div>') + '</div>' +
        '<div class="mt-16 text-muted" style="font-size:.78rem">Current local storage: ' + fmtBytes(bytes) + ' (' + quota + '% of safe budget). File: ' + fmtBytes(file.size) + '.</div>' +
        '<div class="mt-16" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="TT.downloadBackup()">⬇ Download backup first</button>' +
        '<button class="btn" style="margin-left:auto" onclick="TT.closeModal(\'modalGeneric\')">Cancel</button>' +
        '<button class="btn primary" onclick="TT.applyPendingImport()">Apply import</button></div>';
      App.openModal('modalGeneric');
    }).catch((err) => { say('Could not read file: ' + err.message, 'error'); });
  }
  function previewTable(rows, title) {
    if (!rows || !rows.length) return '<div class="text-muted">No rows.</div>';
    const cols = Object.keys(rows[0]).slice(0, 9);
    return '<div class="text-muted" style="font-size:.75rem;margin:8px 0 4px">' + esc(title) + '</div><div class="import-preview"><table><thead><tr>' +
      cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr>' + cols.map((c) => '<td>' + esc(r[c] == null ? '' : r[c]) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }
  function applyPendingImport() {
    const p = App._awPendingImport;
    if (!p) return;
    if (!App.canWrite || !App.canWrite()) { say('Read-only role cannot import data', 'error'); return; }
    App.pushUndo('Import: ' + p.file.name);
    App._awPendingImport = null;
    App.closeModal('modalGeneric');
    const name = p.file.name.toLowerCase();
    say('Applying import…', 'info');
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) App.importExcelFile(p.file);
    else if (name.endsWith('.csv')) App.importCSVFile(p.file);
    else App.importJSONFile(p.file);
    setTimeout(() => {
      try {
        const conflicts = App.validateSchedule().length;
        App.audit('Import applied', p.file.name + (conflicts ? ' · ' + conflicts + ' conflicts' : ''));
        if (conflicts) say('Import applied — ' + conflicts + ' conflict(s) detected. Open Regulations → Conflict Audit.', 'warn');
        else say('Import applied successfully', 'success');
        App.render();
      } catch (e) {}
    }, 900);
  }

  /* ======================================================================
     PWA / offline
     ====================================================================== */
  function registerPWA() {
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      const b = $('btnInstall');
      if (b) b.hidden = false;
    });
    const b = $('btnInstall');
    if (b) {
      b.onclick = async () => {
        if (!deferred) { say('Use your browser menu → Install app', 'info'); return; }
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) {}
        deferred = null;
        b.hidden = true;
      };
    }
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        if (reg.waiting) say('App update ready — reload to use the new version', 'info');
      }).catch((e) => console.warn('Service worker registration failed', e));
    } else if (location.protocol.indexOf('http') !== 0) {
      // file:// — explain how to get install/offline support.
      console.info('Timetable runs from file://. Serve the folder over http(s) for PWA install and offline caching.');
    }
  }

  function updateOnlineStatus() {
    const el = document.querySelector('.system-status');
    if (!el) return;
    const on = navigator.onLine;
    el.innerHTML = '<div class="status-dot" style="' + (on ? '' : 'background:var(--danger)') + '"></div>' + (on ? 'System Online' : 'Offline · local data safe');
    el.classList.toggle('offline', !on);
  }

  /* ======================================================================
     Chrome + keyboard
     ====================================================================== */
  function injectChrome() {
    const right = document.querySelector('.topbar-right');
    if (right && !$('btnTheme')) {
      right.insertAdjacentHTML('afterbegin',
        '<button class="icon-btn" id="btnUndo" title="Undo (Ctrl+Z)" aria-label="Undo" onclick="TT.undo()">↶</button>' +
        '<button class="icon-btn" id="btnRedo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onclick="TT.redo()">↷</button>' +
        '<button class="icon-btn" id="btnTheme" title="Switch theme" aria-label="Switch theme" onclick="TT.cycleTheme()">🌙</button>' +
        '<button class="icon-btn" id="btnInstall" title="Install app" aria-label="Install app" onclick="TT.installApp()" hidden>⤓</button>');
    }
    if (!document._awKeys) {
      document._awKeys = true;
      document.addEventListener('keydown', (e) => {
        const typing = isTyping(e.target);
        // Guided demo tour: Esc exits, arrows navigate.
        if (document.body.classList.contains('demo-tour')) {
          if (e.key === 'Escape') { e.preventDefault(); endDemoTour(); return; }
          if (!typing && e.key === 'ArrowRight') { e.preventDefault(); demoNext(); return; }
          if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); demoPrev(); return; }
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !document.querySelector('.modal.open, .aw-overlay, .cmd-overlay.open')) { e.preventDefault(); undo(); }
        else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')) { if (!typing && !document.querySelector('.modal.open, .aw-overlay, .cmd-overlay.open')) { e.preventDefault(); redo(); } }
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openHistory(); }
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); lockNow(); }
      });
    }
    updateUndoUI();
    updateThemeButton();
  }
  function renderAwesomeChrome() {
    applyRoleUI();
    updateUndoUI();
    renderBell();
    updateOnlineStatus();
    updateThemeButton();
    enhanceA11y();
    document.querySelectorAll('.bottom-nav button').forEach((b) => {
      b.classList.toggle('active', b.dataset.panel === App.activePanel || (b.dataset.panel === 'search' && false));
    });
    const menu = $('btnMenu');
    if (menu) menu.setAttribute('aria-expanded', document.body.classList.contains('nav-open') ? 'true' : 'false');
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.panel === App.activePanel));
  }

  /* ======================================================================
     Small helpers exposed to the app
     ====================================================================== */
  function installApp() {
    const b = $('btnInstall');
    if (b) b.click();
  }
  function setAccentTheme(accent) { setAccent(accent); }
  function maybeQuotaWarning() {
    const bytes = storageBytes();
    if (bytes > 4.2 * 1024 * 1024) {
      notify('warn', 'Local storage is nearly full (' + fmtBytes(bytes) + '). Download a backup and archive or delete old data.', { panel: 'admin' });
      say('Local storage nearly full — download a backup', 'warn');
    }
  }

  /* ======================================================================
     Bind everything
     ====================================================================== */
  function bindAll() {
    injectShell();
    injectChrome();
    wrapModals();
    wrapMutations();
    enhanceA11y();

    // Navigation for the new panels (base app bound only the original items).
    document.querySelectorAll('.nav-item[data-panel="studio"], .nav-item[data-panel="insights"]').forEach((n) => {
      if (n._awBound) return;
      n._awBound = true;
      n.addEventListener('click', () => App.showPanel(n.dataset.panel));
    });

    // Render wrapper: base + enterprise + our panels + chrome.
    const baseRender = App.render;
    App.render = function () {
      baseRender.apply(this, arguments);
      try {
        if (this.activePanel === 'studio' && typeof this.renderStudio === 'function') this.renderStudio();
        if (this.activePanel === 'insights' && typeof this.renderInsights === 'function') this.renderInsights();
      } catch (e) { console.error('Awesome panel render', e); }
      try { renderAwesomeChrome(); } catch (e) { console.error('Awesome chrome render', e); }
    };

    const baseShow = App.showPanel;
    App.showPanel = function (name) {
      baseShow.call(this, name);
      const titles = { studio: 'Timetable Studio', insights: 'Analytics & Insights' };
      if (titles[name]) { const t = $('pageTitle'); if (t) t.textContent = titles[name]; }
      if (window.innerWidth <= 900) closeNav();
    };

    // Notification methods
    App.notifications = notifications;
    App.notify = notify;
    App.renderBell = renderBell;
    App.openNotifications = openNotifications;
    App.markNotification = markNotification;
    App.markAllRead = markAllRead;
    App.dismissNotification = dismissNotification;
    App.runNotificationAction = runNotificationAction;
    App.setNotifFilter = setNotifFilter;
    App.notifyAction = (type, msg, action) => notify(type, msg, action);

    // Theme / history / security / archives
    App.applyTheme = applyTheme;
    App.cycleTheme = cycleTheme;
    App.setTheme = setTheme;
    App.setAccent = setAccent;
    App.setDensity = setDensity;
    App.openSecurityModal = openSecurityModal;
    App.savePin = savePin;
    App.removePin = removePin;
    App.lockNow = lockNow;
    App.tryUnlock = tryUnlock;
    App.recoverPin = recoverPin;
    App.openHistory = openHistory;
    App.archiveTerm = archiveTerm;
    App.restoreArchive = restoreArchive;
    App.deleteArchive = deleteArchive;
    App.downloadArchive = downloadArchive;
    App.rolloverTerm = rolloverTerm;
    App.logStorageReport = logStorageReport;
    App.openImportPreview = openImportPreview;
    App.applyPendingImport = applyPendingImport;
    App.dedupeSchedule = dedupeSchedule;
    // Health check: add duplicate-cell detection on top of the enterprise check.
    if (typeof App.runHealthCheck === 'function' && !App.runHealthCheck._awDup) {
      App._awOrigHealthCheck = App.runHealthCheck;
      const wrappedHealth = function () { return healthCheckEnhanced(); };
      wrappedHealth._awDup = true;
      App.runHealthCheck = wrappedHealth;
    }
    if (typeof App.runHealthFix === 'function' && !App.runHealthFix._awDup) {
      const origFix = App.runHealthFix;
      const wrappedFix = function (fix) {
        if (fix === 'dedupe') return dedupeSchedule();
        return origFix.call(this, fix);
      };
      wrappedFix._awDup = true;
      App.runHealthFix = wrappedFix;
    }
    App.installApp = installApp;
    App.startTour = startTour;
    App.showTourStep = showTourStep;
    App.tourNext = tourNext;
    App.tourPrev = tourPrev;
    App.endTour = endTour;
    App.endOnboarding = endOnboarding;
    App.onboardChoice = onboardChoice;
    App.showWelcome = showWelcome;
    App.startDemoTour = startDemoTour;
    App.showDemoStep = showDemoStep;
    App.demoNext = demoNext;
    App.demoPrev = demoPrev;
    App.endDemoTour = endDemoTour;
    App.ensureDemoData = ensureDemoData;
    App.seedDemoData = demoSeedOnly;
    App._demoSteps = demoTourSteps;
    App.setAccentTheme = setAccentTheme;

    // Import: preview first, never import a file silently.
    const origHandleImport = App.handleImport;
    if (origHandleImport && !origHandleImport._awPreview) {
      const wrappedImport = function (event) {
        const file = event.target && event.target.files && event.target.files[0];
        if (!file) return;
        if (event.target) event.target.value = '';
        if (!this._awRestoring) openImportPreview(file);
        else return origHandleImport.call(this, event);
      };
      wrappedImport._awPreview = true;
      App.handleImport = wrappedImport;
    }

    // Command palette additions
    const origCmd = App._cmdItems;
    if (origCmd && !origCmd._aw) {
      const wrappedCmd = function () {
        const items = origCmd.call(this);
        items.unshift(
          { group: 'Demo', icon: '🧭', label: 'Guided demo tour', sub: 'Walks every tab on realistic sample data', run: () => this.startDemoTour() },
          { group: 'Demo', icon: '🌱', label: 'Load demo campus', sub: 'Sample data with cover, attendance and alerts', run: () => this.seedDemoData() },
          { group: 'Navigate', icon: '🛠️', label: 'Timetable Studio', sub: 'Click, drag, pin and publish', run: () => this.showPanel('studio') },
          { group: 'Navigate', icon: '📊', label: 'Analytics & Insights', sub: 'Utilisation, workload, attendance', run: () => this.showPanel('insights') }
        );
        items.push(
          { group: 'Actions', icon: '↶', label: 'Undo last change', sub: 'Ctrl+Z', run: () => this.undo() },
          { group: 'Actions', icon: '🗑', label: 'Undo history & trash', sub: 'Restore deleted records', run: () => this.openHistory() },
          { group: 'Actions', icon: '🌓', label: 'Switch theme', sub: 'Light / dark / system', run: () => this.cycleTheme() },
          { group: 'Actions', icon: '📦', label: 'Share pack', sub: 'Standalone HTML timetable pack', run: () => this.exportSharePack() },
          { group: 'Actions', icon: '🔐', label: 'Security & PIN', sub: 'Lock this workspace', run: () => this.openSecurityModal() }
        );
        return items;
      };
      wrappedCmd._aw = true;
      App._cmdItems = wrappedCmd;
    }

    // Profile menu: add tour / history / security.
    const origProfile = App.openProfileMenu;
    if (origProfile && !origProfile._aw) {
      const wrappedProfile = function () {
        const res = origProfile.call(this);
        const body = $('modalBody');
        if (body) {
          const actions = body.querySelector('.account-actions');
          if (actions) actions.insertAdjacentHTML('beforeend',
            '<button class="btn primary" onclick="TT.startDemoTour()">🧭 Guided demo tour</button>' +
            '<button class="btn" onclick="TT.seedDemoData()">🌱 Load demo campus</button>' +
            '<button class="btn" onclick="TT.startTour()">✨ Quick highlights</button>' +
            '<button class="btn" onclick="TT.openHistory()">↶ Undo &amp; trash</button>' +
            '<button class="btn" onclick="TT.openSecurityModal()">🔐 Security &amp; PIN</button>');
        }
        return res;
      };
      wrappedProfile._aw = true;
      App.openProfileMenu = wrappedProfile;
    }

    // Shortcuts: append the new ones.
    const origShortcuts = App.showShortcuts;
    if (origShortcuts && !origShortcuts._aw) {
      const wrappedShortcuts = function () {
        const res = origShortcuts.call(this);
        const body = $('modalBody');
        if (body) {
          const extra = [['Ctrl + Z', 'Undo the last change'], ['Ctrl + Shift + Z', 'Redo'], ['Ctrl + Shift + K', 'Undo history & trash'], ['Ctrl + Shift + L', 'Lock the workspace'], ['Drag a slot', 'Move or swap it in Timetable Studio'], ['Guided demo', 'Profile menu → Guided demo tour (or command palette)'], ['Esc / → / ←', 'Exit / next / previous step during the demo tour']];
          body.insertAdjacentHTML('beforeend', '<div class="shortcut-list mt-16">' + extra.map(([k, v]) => '<div class="shortcut-row"><span class="shortcut-key">' + esc(k) + '</span><span>' + esc(v) + '</span></div>').join('') + '</div>');
        }
        return res;
      };
      wrappedShortcuts._aw = true;
      App.showShortcuts = wrappedShortcuts;
    }

    // Admin extras (archives + storage).
    const origRenderAdmin = App.renderAdmin;
    if (origRenderAdmin && !origRenderAdmin._aw) {
      const wrappedAdmin = function () {
        const res = origRenderAdmin.call(this);
        try { renderAdminExtras(); } catch (e) { console.error('Admin extras', e); }
        return res;
      };
      wrappedAdmin._aw = true;
      App.renderAdmin = wrappedAdmin;
    }

    // Studio + insights methods
    installStudio();
    installInsights();

    // Freeze method hook
    App.installAwesome = function () { return true; };
    App._awInstalled = true;
    App._applyRoleUI = applyRoleUI;
    App.applyTheme();
    App.render();
    updateUndoUI();
    registerPWA();
    maybeQuotaWarning();

    const onboarded = localStorage.getItem('tt_onboarded');
    if (!onboarded) setTimeout(showWelcome, 650);
    if (App.config.pinEnabled && App.config.pinHash && App.config.lockOnLoad && sessionStorage.getItem('tt_unlocked') !== '1') {
      showLock();
    }
  }

  /* ======================================================================
     TIMETABLE STUDIO
     ====================================================================== */
  function dayList() { return (App.DAYS || []).slice(0, Math.min((App.DAYS || []).length, App.config.days || 5)); }
  function periodList() { return Array.from({ length: App.config.periods || 8 }, (_, i) => i + 1); }
  function slotKey(day, period) { return day + '|' + period; }
  function slotAt(sectionId, day, period) {
    return (App.data.schedule || []).find((s) => s.sectionId === sectionId && s.day === day && s.period === period);
  }
  function studioSection() {
    const list = App.data.sections || [];
    let sec = list.find((s) => s.id === App._studioSection);
    if (!sec) { sec = list[0]; App._studioSection = sec ? sec.id : ''; }
    return sec || null;
  }
  function setStudioSection(id) { App._studioSection = id; App.renderStudio(); }
  function sectionConflicts(sectionId) {
    const ids = new Set((App.data.schedule || []).filter((s) => s.sectionId === sectionId).map((s) => s.id));
    return App.validateSchedule().filter((c) => c.slot && c.slot.indexOf('slot:') === 0 && ids.has(c.slot.slice(5)));
  }
  function publishedSnapshot() { return readJSON('tt_published_schedule', null); }
  function diffSchedules(a, b) {
    const key = (s) => (s.sectionId || '') + '|' + (s.day || '') + '|' + (s.period || '');
    const ma = new Map((a || []).map((s) => [key(s), s]));
    const mb = new Map((b || []).map((s) => [key(s), s]));
    const added = [], removed = [], changed = [];
    mb.forEach((s, k) => {
      const old = ma.get(k);
      if (!old) added.push(s);
      else if ((old.subjectCode || '') !== (s.subjectCode || '') || (App.effTeacher(old) || '') !== (App.effTeacher(s) || '') || (old.roomName || '') !== (s.roomName || '') || !!old.pinned !== !!s.pinned) changed.push({ old, next: s });
    });
    ma.forEach((s, k) => { if (!mb.has(k)) removed.push(s); });
    return { added, removed, changed };
  }
  function publishedDelta() {
    const p = publishedSnapshot();
    if (!p) return null;
    return diffSchedules(p.schedule, App.data.schedule);
  }

  function renderStudio() {
    const host = $('studioContent');
    if (!host) return;
    if (!host._awStudioBound) bindStudioHost(host);
    const sections = App.data.sections || [];
    const canWrite = App.canWrite ? App.canWrite() : true;
    if (!sections.length) {
      host.innerHTML = '<div class="card studio-empty"><div style="font-size:2rem">🛠️</div><b>No sections yet</b><p class="text-muted">Create a section and curriculum before editing a timetable.</p><button class="btn primary" onclick="TT.showPanel(\'sections\')">Open Sections</button></div>';
      return;
    }
    const sec = studioSection();
    const slots = (App.data.schedule || []).filter((s) => s.sectionId === sec.id);
    const conflicts = sectionConflicts(sec.id);
    const conflictBySlot = new Map(conflicts.filter((c) => c.slot && c.slot.indexOf('slot:') === 0).map((c) => [c.slot.slice(5), c]));
    const teaching = slots.filter((s) => s.subjectCode !== 'FREE');
    const pinned = teaching.filter((s) => s.pinned).length;
    const free = (dayList().length * periodList().length) - teaching.length;
    const pub = publishedSnapshot();
    const delta = publishedDelta();
    const deltaCount = delta ? (delta.added.length + delta.removed.length + delta.changed.length) : 0;
    const allConflicts = App.validateSchedule();
    const badge = $('studioPublishBadge');
    if (badge) {
      if (!pub) { badge.className = 'badge badge-neutral'; badge.textContent = 'Never published'; }
      else if (deltaCount) { badge.className = 'badge badge-warning'; badge.textContent = 'Draft · ' + deltaCount + ' changes'; }
      else { badge.className = 'badge badge-success'; badge.textContent = 'Published'; }
    }
    const banner = !pub
      ? '<div class="publish-banner"><span class="publish-dot"></span><b>Unpublished draft</b><span class="text-muted">Publish when you are happy with this timetable. Publishing stores a read-only reference for change tracking.</span><span class="spacer"></span><button class="btn btn-sm primary" onclick="TT.publishSchedule()" ' + (canWrite ? '' : 'disabled') + '>Publish now</button></div>'
      : deltaCount
        ? '<div class="publish-banner dirty"><span class="publish-dot"></span><b>' + deltaCount + ' change' + (deltaCount === 1 ? '' : 's') + ' since publish</b><span class="text-muted">Published ' + fmtDate(pub.at) + ' by ' + esc(pub.by || 'Administrator') + '.</span><span class="spacer"></span><button class="btn btn-sm" onclick="TT.viewPublishedDiff()">View changes</button><button class="btn btn-sm primary" onclick="TT.publishSchedule()" ' + (canWrite ? '' : 'disabled') + '>Publish changes</button></div>'
        : '<div class="publish-banner live"><span class="publish-dot live"></span><b>Published and up to date</b><span class="text-muted">' + fmtDate(pub.at) + ' · ' + esc(pub.by || 'Administrator') + ' · ' + esc(pub.term || '') + '</span><span class="spacer"></span><button class="btn btn-sm" onclick="TT.viewPublishedDiff()">View published reference</button></div>';

    host.innerHTML = banner +
      '<div class="studio-toolbar">' +
      '<label class="sr-only" for="studioSectionSelect">Section</label><select id="studioSectionSelect" onchange="TT.setStudioSection(this.value)">' +
      sections.map((s) => '<option value="' + escAttr(s.id) + '"' + (s.id === sec.id ? ' selected' : '') + '>' + esc(s.name) + ' · ' + esc(s.dept) + '</option>').join('') + '</select>' +
      '<span class="badge badge-info">' + esc(sec.dept) + '</span><span class="badge badge-neutral">' + teaching.length + ' teaching</span>' +
      (pinned ? '<span class="badge badge-warning">📌 ' + pinned + ' pinned</span>' : '') +
      (conflicts.length ? '<span class="badge badge-danger">⚠ ' + conflicts.length + ' conflict' + (conflicts.length === 1 ? '' : 's') + '</span>' : '<span class="badge badge-success">✓ section clean</span>') +
      '<span class="spacer"></span>' +
      (conflicts.length && canWrite ? '<button class="btn btn-sm" onclick="TT.fixAllConflicts()">🔧 Auto-repair</button>' : '') +
      '<button class="btn btn-sm" onclick="TT.printStudio()">🖨 Print</button>' +
      '</div>' +
      '<div class="studio-kpis">' +
      '<div class="studio-kpi"><span class="k-ico">📚</span><div><b>' + teaching.length + '</b><small>teaching sessions</small></div></div>' +
      '<div class="studio-kpi"><span class="k-ico">🟦</span><div><b>' + free + '</b><small>free periods</small></div></div>' +
      '<div class="studio-kpi"><span class="k-ico">📌</span><div><b>' + pinned + '</b><small>pinned / protected</small></div></div>' +
      '<div class="studio-kpi"><span class="k-ico">' + (allConflicts.length ? '🚨' : '✅') + '</span><div><b>' + allConflicts.length + '</b><small>college-wide conflicts</small></div></div>' +
      '</div>' +
      '<div class="studio-grid-wrap"><table class="studio-grid"><thead><tr><th>Period</th>' +
      dayList().map((d) => '<th>' + esc(d) + '</th>').join('') + '</tr></thead><tbody>' +
      periodList().map((p) => {
        const time = App.periodTime ? App.periodTime(p) : null;
        return '<tr><th><b>P' + p + '</b>' + (time && time.start ? '<span>' + esc(time.start) + '–' + esc(time.end || '') + '</span>' : '') + '</th>' +
          dayList().map((d) => {
            const slot = slotAt(sec.id, d, p);
            const conflict = slot ? conflictBySlot.get(slot.id) : null;
            const cellAttrs = ' data-day="' + escAttr(d) + '" data-period="' + p + '" data-section="' + escAttr(sec.id) + '"';
            if (!slot || slot.subjectCode === 'FREE') {
              return '<td class="studio-cell is-free"' + cellAttrs + '>' +
                (canWrite ? '<div class="studio-free-hint">+ add session</div>' : '<div class="studio-free-hint">Free</div>') + '</td>';
            }
            const teacher = App.effTeacher(slot);
            return '<td class="studio-cell"' + cellAttrs + '>' +
              '<div class="studio-slot ' + (slot.isLab ? 'lab ' : '') + (conflict ? 'conflict ' : '') + (slot.pinned ? 'pinned' : '') + '"' +
              ' draggable="' + (canWrite ? 'true' : 'false') + '" data-slot-id="' + escAttr(slot.id) + '"' +
              ' title="' + escAttr(slot.subjectCode + ' · ' + App.subjectName(slot.subjectCode) + ' · ' + (teacher ? App.staffName(teacher) : 'Unassigned') + ' · ' + (slot.roomName || 'No room') + (conflict ? ' · ' + conflict.detail : '')) + '"' +
              ' role="button" tabindex="0" aria-label="Edit ' + escAttr(slot.subjectCode + ' ' + App.subjectName(slot.subjectCode)) + '">' +
              (slot.pinned ? '<span class="s-pin" title="Pinned">📌</span>' : '') +
              (conflict ? '<span class="s-pin" style="right:18px;color:var(--danger)" title="' + escAttr(conflict.detail) + '">⚠</span>' : '') +
              '<div class="s-subj">' + esc(slot.subjectCode) + (slot.isLab ? ' · LAB' : '') + '</div>' +
              '<div class="s-name">' + esc(App.subjectName(slot.subjectCode)) + '</div>' +
              '<div class="s-meta"><span title="' + escAttr(teacher ? App.staffName(teacher) : 'Unassigned') + '">' + esc(teacher ? App.staffName(teacher) : 'Unassigned') + '</span><span title="' + escAttr(slot.roomName || 'No room') + '">· ' + esc(slot.roomName || '—') + '</span></div>' +
              '</div></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="studio-legend"><span><i style="background:var(--primary-soft);border:1px solid var(--primary)"></i>Theory</span>' +
      '<span><i style="background:var(--info-soft);border:1px solid var(--info)"></i>Lab</span>' +
      '<span><i style="background:var(--warning)"></i>Pinned</span>' +
      '<span><i style="background:var(--danger)"></i>Conflict</span>' +
      '<span>Drag a session onto another period to move or swap it.</span></div>' +
      '<div class="studio-hint">Tip: pin the sessions that must not move, then use <b>Regenerate Unlocked</b> to let the solver repair everything else.</div>';
  }

  function bindStudioHost(host) {
    host._awStudioBound = true;
    host.addEventListener('click', (e) => {
      const slotEl = e.target.closest('[data-slot-id]');
      if (slotEl) { App.openSlotEditor(slotEl.dataset.slotId); return; }
      const cell = e.target.closest('.studio-cell');
      if (cell && App.canWrite && App.canWrite()) App.openSlotEditor(null, cell.dataset.day, Number(cell.dataset.period), cell.dataset.section);
    });
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const slotEl = e.target.closest('[data-slot-id]');
      if (slotEl) { e.preventDefault(); App.openSlotEditor(slotEl.dataset.slotId); }
    });
    host.addEventListener('dragstart', (e) => {
      const el = e.target.closest('[data-slot-id]');
      if (!el || !(App.canWrite && App.canWrite())) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', el.dataset.slotId);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    host.addEventListener('dragend', (e) => {
      const el = e.target.closest('[data-slot-id]');
      if (el) el.classList.remove('dragging');
      host.querySelectorAll('.drop-ok,.drop-bad').forEach((x) => x.classList.remove('drop-ok', 'drop-bad'));
    });
    host.addEventListener('dragover', (e) => {
      const cell = e.target.closest('.studio-cell');
      if (!cell || !(App.canWrite && App.canWrite())) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      host.querySelectorAll('.drop-ok,.drop-bad').forEach((x) => x.classList.remove('drop-ok', 'drop-bad'));
      cell.classList.add('drop-ok');
    });
    host.addEventListener('dragleave', (e) => {
      const cell = e.target.closest('.studio-cell');
      if (cell) cell.classList.remove('drop-ok', 'drop-bad');
    });
    host.addEventListener('drop', (e) => {
      const cell = e.target.closest('.studio-cell');
      if (!cell) return;
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      cell.classList.remove('drop-ok', 'drop-bad');
      if (id) App.moveSlot(id, cell.dataset.day, Number(cell.dataset.period));
    });
  }

  function openSlotEditor(slotId, day, period, sectionId) {
    const canWrite = App.canWrite ? App.canWrite() : true;
    const slot = slotId ? (App.data.schedule || []).find((s) => s.id === slotId) : null;
    const sec = slot ? App.sectionById(slot.sectionId) : App.sectionById(sectionId) || studioSection();
    if (!sec) { say('Choose a section first', 'error'); return; }
    const subjects = App.subjectsForSection ? App.subjectsForSection(sec) : (App.data.subjects || []).filter((s) => s.dept === sec.dept);
    const d = slot ? slot.day : (day || dayList()[0]);
    const p = slot ? slot.period : (period || 1);
    const firstSub = slot ? slot.subjectCode : (subjects[0] ? subjects[0].code : 'FREE');
    App._slotDraft = {
      slotId: slot ? slot.id : null, sectionId: sec.id, day: d, period: p,
      subjectCode: firstSub, teacherId: slot ? App.effTeacher(slot) : null,
      roomName: slot ? slot.roomName : null, pinned: !!(slot && slot.pinned), isNew: !slot
    };
    const draft = App._slotDraft;
    const subjectOptions = subjects.map((s) => '<option value="' + escAttr(s.code) + '"' + (s.code === draft.subjectCode ? ' selected' : '') + '>' + esc(s.code) + ' · ' + esc(s.name) + ' (' + esc(s.type) + ')</option>').join('') +
      '<option value="FREE"' + (draft.subjectCode === 'FREE' ? ' selected' : '') + '>FREE · clear this period</option>';
    $('modalTitle').textContent = (slot ? 'Edit session' : 'Add session') + ' · ' + sec.name;
    $('modalBody').innerHTML =
      '<div class="slot-editor-grid">' +
      '<div class="full"><label for="slotSubject">Subject</label><select id="slotSubject" onchange="TT.slotEditorChange()" ' + (canWrite ? '' : 'disabled') + '>' + subjectOptions + '</select></div>' +
      '<div><label for="slotDay">Day</label><select id="slotDay" onchange="TT.slotEditorChange()" ' + (canWrite ? '' : 'disabled') + '>' + dayList().map((x) => '<option' + (x === d ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></div>' +
      '<div><label for="slotPeriod">Period</label><select id="slotPeriod" onchange="TT.slotEditorChange()" ' + (canWrite ? '' : 'disabled') + '>' + periodList().map((x) => '<option value="' + x + '"' + (x === p ? ' selected' : '') + '>P' + x + (App.periodTime && App.periodTime(x).start ? ' · ' + esc(App.periodTime(x).start) : '') + '</option>').join('') + '</select></div>' +
      '<div><label for="slotTeacher">Faculty</label><select id="slotTeacher" onchange="TT.slotEditorChange()" ' + (canWrite ? '' : 'disabled') + '>' + teacherOptions(draft) + '</select>' +
      '<button class="btn btn-sm" style="margin-top:6px" onclick="TT.slotEditorAutoTeacher()" ' + (canWrite ? '' : 'disabled') + '>✨ Auto-pick free teacher</button></div>' +
      '<div><label for="slotRoom">Room</label><select id="slotRoom" onchange="TT.slotEditorChange()" ' + (canWrite ? '' : 'disabled') + '>' + roomOptions(draft) + '</select>' +
      '<button class="btn btn-sm" style="margin-top:6px" onclick="TT.slotEditorFindRoom()" ' + (canWrite ? '' : 'disabled') + '>🔎 Find free room</button></div>' +
      '<div class="full"><label class="slot-pin-toggle"><input type="checkbox" id="slotPinned" ' + (draft.pinned ? 'checked' : '') + ' ' + (canWrite ? '' : 'disabled') + '/> 📌 Pin this session — keep it when regenerating unlocked slots</label></div>' +
      '<div class="full"><div id="slotCheck"></div></div>' +
      '</div>' +
      '<div class="slot-editor-actions">' +
      (canWrite ? '<button class="btn primary" onclick="TT.saveSlot()">💾 Save session</button>' + (slot ? '<button class="btn" onclick="TT.toggleSlotPin(\'' + escAttr(slot.id) + '\')">' + (slot.pinned ? 'Unpin' : 'Pin') + '</button>' : '') : '<span class="badge badge-warning">Read-only role — viewing only</span>') +
      (slot && canWrite ? '<button class="btn danger danger-zone" onclick="TT.removeSlot(\'' + escAttr(slot.id) + '\')">Remove session</button>' : '') +
      '<button class="btn" style="margin-left:auto" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    App.openModal('modalGeneric');
    setTimeout(() => { try { App.slotEditorCheck(); } catch (e) {} }, 60);
  }

  function teacherOptions(draft) {
    const subject = App.subjectByCode(draft.subjectCode);
    const staff = (App.data.staff || []).slice().sort((a, b) => {
      const qa = (a.subjects || []).includes(draft.subjectCode) ? 0 : 1;
      const qb = (b.subjects || []).includes(draft.subjectCode) ? 0 : 1;
      if (qa !== qb) return qa - qb;
      return App.slotLoad(a.id) - App.slotLoad(b.id);
    });
    return '<option value="">— Unassigned —</option>' + staff.map((s) => {
      const qualified = (s.subjects || []).includes(draft.subjectCode);
      const busy = App.teachingSlots().some((x) => x.id !== draft.slotId && x.day === draft.day && x.period === draft.period && App.effTeacher(x) === s.id);
      const load = App.slotLoad(s.id);
      const max = s.maxHoursPerWeek || App.config.maxWeekly || 18;
      return '<option value="' + escAttr(s.id) + '"' + (s.id === draft.teacherId ? ' selected' : '') + '>' +
        esc(s.name) + ' · ' + esc(s.dept) + (qualified ? ' · qualified' : '') + (busy ? ' · BUSY' : '') + ' · ' + load + '/' + max + 'h</option>';
    }).join('');
  }
  function roomOptions(draft) {
    const sec = App.sectionById(draft.sectionId);
    const subject = App.subjectByCode(draft.subjectCode);
    const isLab = subject && subject.type === 'Lab';
    const strength = Number(sec && sec.strength) || 0;
    const rooms = (App.data.rooms || []).filter((r) => r.status !== 'Maintenance').slice().sort((a, b) => {
      const ta = (isLab ? (a.type === 'Lab' ? 0 : 1) : (a.type === 'Lab' ? 1 : 0));
      const tb = (isLab ? (b.type === 'Lab' ? 0 : 1) : (b.type === 'Lab' ? 1 : 0));
      if (ta !== tb) return ta - tb;
      return (Number(b.capacity) || 0) - (Number(a.capacity) || 0);
    });
    return '<option value="">— No room —</option>' + rooms.map((r) => {
      const busy = App.teachingSlots().some((x) => x.id !== draft.slotId && x.day === draft.day && x.period === draft.period && x.roomName === r.name);
      const tooSmall = strength && Number(r.capacity) && Number(r.capacity) < strength;
      return '<option value="' + escAttr(r.name) + '"' + (r.name === draft.roomName ? ' selected' : '') + '>' +
        esc(r.name) + ' · ' + esc(r.type) + ' · ' + (r.capacity || '?') + ' seats' + (busy ? ' · BUSY' : '') + (tooSmall ? ' · too small' : '') + '</option>';
    }).join('');
  }
  function readSlotDraft() {
    const d = App._slotDraft || {};
    const val = (id) => { const el = $(id); return el ? el.value : ''; };
    d.subjectCode = val('slotSubject') || d.subjectCode;
    d.day = val('slotDay') || d.day;
    d.period = Number(val('slotPeriod')) || d.period;
    d.teacherId = val('slotTeacher') || null;
    d.roomName = val('slotRoom') || null;
    d.pinned = !!($('slotPinned') && $('slotPinned').checked);
    App._slotDraft = d;
    return d;
  }
  function slotEditorChange() { readSlotDraft(); slotEditorCheck(); }
  function slotEditorCheck() {
    const host = $('slotCheck');
    if (!host) return;
    const d = App._slotDraft || readSlotDraft();
    const issues = [];
    if (d.subjectCode === 'FREE') {
      host.innerHTML = '<div class="slot-warning ok">This period will be cleared to FREE.</div>';
      return;
    }
    const occupied = slotAt(d.sectionId, d.day, d.period);
    if (occupied && occupied.id !== d.slotId && occupied.subjectCode !== 'FREE') issues.push({ t: 'bad', m: 'Section is already booked: ' + occupied.subjectCode + ' at ' + d.day + ' P' + d.period });
    if (d.teacherId) {
      const busy = App.teachingSlots().filter((s) => s.id !== d.slotId && s.id !== (occupied && occupied.id) && s.day === d.day && s.period === d.period && App.effTeacher(s) === d.teacherId);
      if (busy.length) issues.push({ t: 'bad', m: App.staffName(d.teacherId) + ' is already teaching ' + busy[0].subjectCode + ' (' + App.sectionName(busy[0].sectionId) + ')' });
    }
    if (d.roomName) {
      const busy = App.teachingSlots().filter((s) => s.id !== d.slotId && s.id !== (occupied && occupied.id) && s.day === d.day && s.period === d.period && s.roomName === d.roomName);
      if (busy.length) issues.push({ t: 'bad', m: 'Room ' + d.roomName + ' is already used by ' + App.sectionName(busy[0].sectionId) });
    }
    const sec = App.sectionById(d.sectionId);
    const room = (App.data.rooms || []).find((r) => r.name === d.roomName);
    if (room && sec && Number(sec.strength) && Number(room.capacity) && Number(room.capacity) < Number(sec.strength)) issues.push({ t: 'warn', m: 'Room capacity ' + room.capacity + ' is below section strength ' + sec.strength });
    const sub = App.subjectByCode(d.subjectCode);
    if (sub && sub.type === 'Lab' && room && room.type !== 'Lab') issues.push({ t: 'warn', m: 'This is a lab subject but the selected room is a ' + room.type });
    if (!issues.length) host.innerHTML = '<div class="slot-warning ok">✓ No teacher, room or section conflict detected for ' + esc(d.day) + ' P' + d.period + '.</div>';
    else host.innerHTML = issues.map((i) => '<div class="slot-warning ' + i.t + '">' + (i.t === 'bad' ? '⛔ ' : '⚠️ ') + esc(i.m) + '</div>').join('');
  }
  function slotEditorAutoTeacher() {
    const d = readSlotDraft();
    const staff = (App.data.staff || []).slice().sort((a, b) => {
      const qa = (a.subjects || []).includes(d.subjectCode) ? 0 : 1;
      const qb = (b.subjects || []).includes(d.subjectCode) ? 0 : 1;
      return qa - qb || App.slotLoad(a.id) - App.slotLoad(b.id);
    });
    const pick = staff.find((s) => {
      const busy = App.teachingSlots().some((x) => x.id !== d.slotId && x.day === d.day && x.period === d.period && App.effTeacher(x) === s.id);
      const max = s.maxHoursPerWeek || App.config.maxWeekly || 18;
      return !busy && App.slotLoad(s.id) < max;
    });
    if (!pick) { say('No free faculty found for this period', 'warn'); return; }
    d.teacherId = pick.id; App._slotDraft = d;
    const sel = $('slotTeacher'); if (sel) sel.value = pick.id;
    slotEditorCheck();
    say('Suggested ' + pick.name, 'success');
  }
  function slotEditorFindRoom() {
    const d = readSlotDraft();
    const sec = App.sectionById(d.sectionId);
    const sub = App.subjectByCode(d.subjectCode);
    const isLab = sub && sub.type === 'Lab';
    const strength = Number(sec && sec.strength) || 0;
    const pick = (App.data.rooms || []).filter((r) => r.status !== 'Maintenance')
      .filter((r) => !isLab || r.type === 'Lab')
      .filter((r) => !strength || !Number(r.capacity) || Number(r.capacity) >= strength)
      .filter((r) => !App.teachingSlots().some((x) => x.id !== d.slotId && x.day === d.day && x.period === d.period && x.roomName === r.name))
      .sort((a, b) => Number(b.capacity || 0) - Number(a.capacity || 0))[0];
    if (!pick) { say('No free matching room found', 'warn'); return; }
    d.roomName = pick.name; App._slotDraft = d;
    const sel = $('slotRoom'); if (sel) sel.value = pick.name;
    slotEditorCheck();
    say('Suggested ' + pick.name, 'success');
  }
  function saveSlot() {
    if (!(App.canWrite && App.canWrite())) { say('Read-only role', 'error'); return; }
    const d = readSlotDraft();
    const occupied = slotAt(d.sectionId, d.day, d.period);
    const targetId = d.slotId || (occupied ? occupied.id : null);
    if (d.subjectCode !== 'FREE') {
      if (occupied && occupied.id !== d.slotId && occupied.subjectCode !== 'FREE') { say('That period is already occupied', 'error'); return; }
      if (d.teacherId) {
        const busy = App.teachingSlots().filter((s) => s.id !== targetId && s.id !== (occupied && occupied.id) && s.day === d.day && s.period === d.period && App.effTeacher(s) === d.teacherId);
        if (busy.length) { say(App.staffName(d.teacherId) + ' is already teaching then', 'error'); return; }
      }
      if (d.roomName) {
        const busy = App.teachingSlots().filter((s) => s.id !== targetId && s.id !== (occupied && occupied.id) && s.day === d.day && s.period === d.period && s.roomName === d.roomName);
        if (busy.length) { say('Room is already in use at that time', 'error'); return; }
      }
    }
    App.pushUndo(d.isNew ? 'Session added' : 'Session edited');
    let slot = targetId ? (App.data.schedule || []).find((s) => s.id === targetId) : null;
    if (!slot) {
      slot = { id: uidSafe(), day: d.day, period: d.period, sectionId: d.sectionId, subjectCode: 'FREE', teacherId: null, roomName: null, isLab: false, isSubstituted: false, originalTeacherId: null, currentTeacherId: null, backupTeacherId: null, pinned: false };
      App.data.schedule.push(slot);
    }
    const sub = App.subjectByCode(d.subjectCode);
    if (d.subjectCode === 'FREE') {
      slot.subjectCode = 'FREE'; slot.teacherId = null; slot.currentTeacherId = null; slot.originalTeacherId = null; slot.backupTeacherId = null; slot.roomName = null; slot.isLab = false; slot.isSubstituted = false; slot.pinned = false;
    } else {
      slot.day = d.day; slot.period = d.period; slot.sectionId = d.sectionId;
      slot.subjectCode = d.subjectCode; slot.isLab = !!(sub && sub.type === 'Lab');
      slot.teacherId = d.teacherId || null;
      slot.currentTeacherId = d.teacherId || null;
      slot.originalTeacherId = d.teacherId || null;
      slot.backupTeacherId = null;
      slot.isSubstituted = false;
      slot.roomName = d.roomName || null;
      slot.pinned = !!d.pinned;
    }
    App.saveAll();
    App.audit('Studio session saved', App.sectionName(d.sectionId) + ' ' + d.day + ' P' + d.period + ' · ' + d.subjectCode);
    App.closeModal('modalGeneric');
    say('Session saved', 'success');
    App.render();
  }
  function toggleSlotPin(slotId) {
    if (!(App.canWrite && App.canWrite())) return;
    const slot = (App.data.schedule || []).find((s) => s.id === slotId);
    if (!slot) return;
    App.pushUndo(slot.pinned ? 'Session unpinned' : 'Session pinned');
    slot.pinned = !slot.pinned;
    App.saveAll();
    App.audit(slot.pinned ? 'Session pinned' : 'Session unpinned', App.sectionName(slot.sectionId) + ' ' + slot.day + ' P' + slot.period);
    say(slot.pinned ? 'Pinned' : 'Unpinned', 'success');
    App.closeModal('modalGeneric');
    App.render();
  }
  function removeSlot(slotId) {
    if (!(App.canWrite && App.canWrite())) return;
    const slot = (App.data.schedule || []).find((s) => s.id === slotId);
    if (!slot) return;
    if (!confirm('Remove this session? It will be moved to the trash and the period cleared.')) return;
    App.pushUndo('Session removed');
    App.addSlotToTrash(clone(slot), 'Removed · ' + App.sectionName(slot.sectionId) + ' ' + slot.day + ' P' + slot.period + ' · ' + slot.subjectCode);
    slot.subjectCode = 'FREE'; slot.teacherId = null; slot.currentTeacherId = null; slot.originalTeacherId = null; slot.backupTeacherId = null; slot.roomName = null; slot.isLab = false; slot.isSubstituted = false; slot.pinned = false;
    App.saveAll();
    App.audit('Session removed', App.sectionName(slot.sectionId) + ' ' + slot.day + ' P' + slot.period);
    App.closeModal('modalGeneric');
    say('Session removed — restore from Undo & trash', 'success');
    App.render();
  }
  function moveSlot(slotId, day, period) {
    if (!(App.canWrite && App.canWrite())) return;
    const src = (App.data.schedule || []).find((s) => s.id === slotId);
    if (!src) return;
    if (src.day === day && src.period === period) return;
    // Defensive: if a duplicate cell exists for the target, prefer a FREE row as the swap partner.
    let target = (App.data.schedule || []).find((s) => s.sectionId === src.sectionId && s.day === day && s.period === period && s.id !== src.id);
    if (target) {
      const freeDup = (App.data.schedule || []).find((s) => s.sectionId === src.sectionId && s.day === day && s.period === period && s.id !== src.id && s.subjectCode === 'FREE');
      if (freeDup) target = freeDup;
    }
    if (target && target.id === src.id) return;
    const teacher = App.effTeacher(src);
    const others = (App.data.schedule || []).filter((s) => s.id !== src.id && (!target || s.id !== target.id));
    if (teacher && others.some((s) => s.subjectCode !== 'FREE' && s.day === day && s.period === period && App.effTeacher(s) === teacher)) { say('Teacher is already booked at that time', 'error'); return; }
    if (src.roomName && others.some((s) => s.subjectCode !== 'FREE' && s.day === day && s.period === period && s.roomName === src.roomName)) { say('Room is already booked at that time', 'error'); return; }
    if (target && target.subjectCode !== 'FREE') {
      const tTeacher = App.effTeacher(target);
      const others2 = (App.data.schedule || []).filter((s) => s.id !== src.id && s.id !== target.id);
      if (tTeacher && others2.some((s) => s.subjectCode !== 'FREE' && s.day === src.day && s.period === src.period && App.effTeacher(s) === tTeacher)) { say('Swap blocked: ' + App.staffName(tTeacher) + ' is busy in the source period', 'error'); return; }
      if (target.roomName && others2.some((s) => s.subjectCode !== 'FREE' && s.day === src.day && s.period === src.period && s.roomName === target.roomName)) { say('Swap blocked: room is busy in the source period', 'error'); return; }
    }
    App.pushUndo('Session moved');
    const oldDay = src.day, oldPeriod = src.period;
    if (target) { target.day = oldDay; target.period = oldPeriod; }
    src.day = day; src.period = period;
    App.saveAll();
    App.audit('Studio session moved', App.sectionName(src.sectionId) + ' ' + oldDay + ' P' + oldPeriod + ' → ' + day + ' P' + period);
    say('Moved to ' + day + ' P' + period, 'success');
    App.render();
  }
  function regenerateUnlocked() {
    if (!(App.canWrite && App.canWrite())) { say('Read-only role', 'error'); return; }
    if (!(App.data.sections || []).length) { say('Add sections first', 'error'); return; }
    const pinned = (App.data.schedule || []).filter((s) => s.pinned && s.subjectCode !== 'FREE');
    if (!pinned.length && !confirm('No pinned sessions found. Regenerate the entire timetable?')) return;
    App.pushUndo('Regenerated unlocked sessions');
    if (App.showGenProgress) App.showGenProgress(true, 12, 'Solving with ' + pinned.length + ' pinned session(s)…');
    setTimeout(() => {
      try {
        const result = App.solveTimetable(dayList(), periodList());
        let merged = result.schedule.slice();
        let dropped = 0;
        pinned.forEach((p) => {
          const before = merged.length;
          merged = merged.filter((s) => {
            if (s.sectionId === p.sectionId && s.day === p.day && s.period === p.period) return false;
            if (s.subjectCode !== 'FREE' && s.day === p.day && s.period === p.period && ((App.effTeacher(p) && App.effTeacher(s) === App.effTeacher(p)) || (p.roomName && s.roomName === p.roomName))) return false;
            return true;
          });
          dropped += before - merged.length;
          merged.push(clone(p));
        });
        for (const sec of App.data.sections) {
          for (const day of dayList()) {
            for (const period of periodList()) {
              if (!merged.some((s) => s.sectionId === sec.id && s.day === day && s.period === period)) {
                merged.push({ id: uidSafe(), day, period, sectionId: sec.id, subjectCode: 'FREE', teacherId: null, roomName: null, isLab: false, isSubstituted: false, originalTeacherId: null, currentTeacherId: null, backupTeacherId: null, pinned: false });
              }
            }
          }
        }
        App.data.schedule = merged;
        App.assignBackups();
        App.saveAll();
        if (App.showGenProgress) App.showGenProgress(false);
        const conflicts = App.validateSchedule().length;
        App.audit('Unlocked sessions regenerated', 'pinned=' + pinned.length + ' dropped=' + dropped + ' conflicts=' + conflicts);
        App.notify(conflicts ? 'warn' : 'success', 'Regenerated with ' + pinned.length + ' pinned session(s) — ' + conflicts + ' conflict(s).', { panel: 'studio' });
        say('Regenerated · ' + conflicts + ' conflict(s)' + (dropped ? ' · ' + dropped + ' session(s) replaced' : ''), conflicts ? 'warn' : 'success');
        App.render();
      } catch (e) {
        if (App.showGenProgress) App.showGenProgress(false);
        console.error(e);
        say('Regeneration failed: ' + e.message, 'error');
      }
    }, 80);
  }

  /* ---------- Publish / diff ---------- */
  function publishSchedule() {
    if (!(App.canWrite && App.canWrite())) { say('Read-only role', 'error'); return; }
    if (!(App.teachingSlots() || []).length) { say('There is no timetable to publish', 'error'); return; }
    App.pushUndo('Timetable published');
    const u = App.currentUser ? App.currentUser() : { name: 'Administrator' };
    const snap = {
      at: new Date().toISOString(), by: u.name || 'Administrator',
      term: (App.config.academicYear || '') + ' · Semester ' + (App.config.semester || 1),
      schedule: clone(App.data.schedule)
    };
    writeJSON('tt_published_schedule', snap);
    App.audit('Timetable published', snap.term + ' · ' + snap.schedule.length + ' slots');
    App.notify('success', 'Timetable published for ' + snap.term, { panel: 'studio' });
    say('Timetable published', 'success');
    App.render();
  }
  function unpublishSchedule() {
    if (!(App.canWrite && App.canWrite())) return;
    if (!confirm('Remove the published reference? The live timetable will not change.')) return;
    localStorage.removeItem('tt_published_schedule');
    App.audit('Published timetable removed', '');
    say('Published reference removed', 'success');
    App.render();
  }
  function viewPublishedDiff() {
    const p = publishedSnapshot();
    if (!p) { say('No published reference yet', 'info'); return; }
    const d = diffSchedules(p.schedule, App.data.schedule);
    const line = (kind, s) => '<div class="history-row"><span class="badge badge-' + (kind === 'Added' ? 'success' : kind === 'Removed' ? 'danger' : 'warning') + '">' + kind + '</span>' +
      '<span class="h-main"><b>' + esc(App.sectionName(s.sectionId)) + ' · ' + esc(s.day) + ' P' + s.period + '</b>' +
      '<small>' + esc(s.subjectCode || 'FREE') + ' · ' + esc(s.subjectCode === 'FREE' ? 'Free' : App.subjectName(s.subjectCode)) + ' · ' + esc(App.effTeacher(s) ? App.staffName(App.effTeacher(s)) : 'Unassigned') + ' · ' + esc(s.roomName || 'No room') + '</small></span></div>';
    const rows = [
      ...d.added.map((s) => line('Added', s)),
      ...d.removed.map((s) => line('Removed', s)),
      ...d.changed.map((x) => line('Changed', x.next))
    ];
    $('modalTitle').textContent = 'Changes since publish';
    $('modalBody').innerHTML =
      '<div class="publish-banner live"><span class="publish-dot live"></span><b>Published ' + fmtDate(p.at) + '</b><span class="text-muted">by ' + esc(p.by || 'Administrator') + ' · ' + esc(p.term || '') + '</span></div>' +
      '<div class="insight-kpis">' +
      '<div class="insight-kpi"><span class="k-ico">➕</span><div><b>' + d.added.length + '</b><small>added</small></div></div>' +
      '<div class="insight-kpi"><span class="k-ico">➖</span><div><b>' + d.removed.length + '</b><small>removed</small></div></div>' +
      '<div class="insight-kpi"><span class="k-ico">✏️</span><div><b>' + d.changed.length + '</b><small>changed</small></div></div></div>' +
      '<div class="history-list">' + (rows.join('') || '<div class="text-muted" style="padding:12px">No differences — the live timetable matches the published reference.</div>') + '</div>' +
      '<div class="mt-16" style="display:flex;gap:8px"><button class="btn" onclick="TT.closeModal(\'modalGeneric\')">Close</button>' +
      (App.canWrite && App.canWrite() ? '<button class="btn primary" style="margin-left:auto" onclick="TT.publishSchedule()">Publish current version</button>' : '') + '</div>';
    App.openModal('modalGeneric');
  }

  /* ---------- Share pack ---------- */
  function shareGrid(slots, days, periods) {
    const map = new Map(slots.map((s) => [slotKey(s.day, s.period), s]));
    return '<table class="pack-grid"><thead><tr><th>Period</th>' + days.map((d) => '<th>' + esc(d) + '</th>').join('') + '</tr></thead><tbody>' +
      periods.map((p) => '<tr><th>P' + p + '</th>' + days.map((d) => {
        const s = map.get(slotKey(d, p));
        if (!s || s.subjectCode === 'FREE') return '<td class="free">—</td>';
        return '<td><b>' + esc(s.subjectCode) + '</b><span>' + esc(s.subjectName || App.subjectName(s.subjectCode)) + '</span><em>' + esc(App.effTeacher(s) ? App.staffName(App.effTeacher(s)) : 'Unassigned') + ' · ' + esc(s.roomName || 'No room') + '</em></td>';
      }).join('') + '</tr>').join('') + '</tbody></table>';
  }
  function buildSharePackHTML() {
    const days = dayList(), periods = periodList();
    const conflicts = App.validateSchedule();
    const sections = App.data.sections || [];
    const staff = App.data.staff || [];
    const rooms = App.data.rooms || [];
    const now = new Date().toLocaleString();
    const sectionPart = sections.map((sec) => {
      const slots = (App.data.schedule || []).filter((s) => s.sectionId === sec.id);
      return '<section class="pack-section"><h2>' + esc(sec.name) + ' <small>' + esc(sec.dept) + ' · Semester ' + esc(String(sec.semester || App.config.semester || 1)) + '</small></h2>' + shareGrid(slots, days, periods) + '</section>';
    }).join('');
    const facultyPart = staff.map((st) => {
      const slots = App.teachingSlots().filter((s) => App.effTeacher(s) === st.id);
      if (!slots.length) return '';
      return '<section class="pack-section"><h2>' + esc(st.name) + ' <small>' + esc(st.dept) + ' · ' + slots.length + ' sessions/week</small></h2>' + shareGrid(slots, days, periods) + '</section>';
    }).join('');
    const roomPart = rooms.map((r) => {
      const slots = App.teachingSlots().filter((s) => s.roomName === r.name);
      return '<section class="pack-section"><h2>' + esc(r.name) + ' <small>' + esc(r.type) + ' · ' + (r.capacity || '?') + ' seats · ' + slots.length + ' sessions/week</small></h2>' + shareGrid(slots, days, periods) + '</section>';
    }).join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Timetable Pack · ' + esc(App.config.academicYear || '') + '</title><style>' +
      ':root{--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--brand:#2563eb;--soft:#eff6ff;--bad:#dc2626}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Arial,sans-serif;margin:0;color:var(--ink);background:#f3f4f6;line-height:1.4}' +
      '.wrap{max-width:1200px;margin:0 auto;padding:34px 28px}.hero{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:18px;padding:32px;margin-bottom:22px}' +
      '.hero .k{font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.8}.hero h1{margin:6px 0 4px;font-size:30px}.hero p{margin:0;opacity:.85;font-size:13px}' +
      '.meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.meta span{background:rgba(255,255,255,.14);padding:6px 10px;border-radius:999px;font-size:12px}' +
      '.pack-section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 18px;break-inside:avoid}' +
      '.pack-section h2{margin:0 0 10px;font-size:17px}.pack-section h2 small{font-weight:500;color:var(--muted);font-size:12px;margin-left:8px}' +
      '.pack-grid{width:100%;border-collapse:collapse;table-layout:fixed}.pack-grid th,.pack-grid td{border:1px solid var(--line);padding:6px;font-size:10px;vertical-align:top}' +
      '.pack-grid thead th{background:var(--soft);color:#1e40af;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.pack-grid tbody th{width:54px;background:#fafafa;font-size:10px}' +
      '.pack-grid td{height:50px;word-wrap:break-word}.pack-grid td b{display:block;font-size:10px}.pack-grid td span{display:block;color:var(--muted);font-size:9px;margin-top:1px}.pack-grid td em{display:block;color:#374151;font-style:normal;font-size:9px;margin-top:2px}' +
      '.pack-grid td.free{color:#cbd5e1;text-align:center;background:#fcfcfd}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}' +
      '.s-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.s-card b{display:block;font-size:22px}.s-card small{color:var(--muted);font-size:11px}' +
      '.conflicts{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:18px}.conflicts li{font-size:12px;color:#991b1b;margin:4px 0}' +
      '.foot{color:var(--muted);font-size:11px;text-align:center;margin-top:18px}@media print{body{background:#fff}.wrap{padding:0}.hero{border-radius:0}.pack-section{box-shadow:none}.pack-section{page-break-inside:avoid}}' +
      '</style></head><body><div class="wrap"><div class="hero"><div class="k">College Timetable &amp; Absence · Shareable pack</div><h1>' + esc((App.config.orgName || 'College') + ' · Timetable') + '</h1>' +
      '<p>Generated ' + esc(now) + '</p><div class="meta"><span>' + esc(App.config.academicYear || '') + '</span><span>Semester ' + esc(String(App.config.semester || 1)) + '</span><span>' + sections.length + ' sections</span><span>' + App.teachingSlots().length + ' sessions</span><span>' + conflicts.length + ' conflicts</span></div></div>' +
      '<div class="summary"><div class="s-card"><b>' + sections.length + '</b><small>Sections</small></div><div class="s-card"><b>' + staff.length + '</b><small>Faculty</small></div><div class="s-card"><b>' + rooms.length + '</b><small>Rooms</small></div><div class="s-card"><b>' + App.teachingSlots().length + '</b><small>Scheduled sessions</small></div></div>' +
      (conflicts.length ? '<div class="conflicts"><b>Open conflicts (' + conflicts.length + ')</b><ul>' + conflicts.slice(0, 20).map((c) => '<li>' + esc(c.type) + ' · ' + esc(c.detail || '') + '</li>').join('') + '</ul></div>' : '') +
      '<h2 style="font-size:18px;margin:0 0 12px">Section timetables</h2>' + sectionPart +
      '<h2 style="font-size:18px;margin:24px 0 12px">Faculty timetables</h2>' + (facultyPart || '<p>No faculty assignments.</p>') +
      '<h2 style="font-size:18px;margin:24px 0 12px">Room usage</h2>' + (roomPart || '<p>No rooms.</p>') +
      '<div class="foot">Local-first timetable pack · data belongs to ' + esc(App.config.orgName || 'the institution') + ' · generated by College Timetable &amp; Absence</div>' +
      '</div></body></html>';
  }
  function exportSharePack() {
    if (!(App.data.sections || []).length) { say('Add sections before exporting a share pack', 'error'); return; }
    const html = buildSharePackHTML();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'timetable_pack_' + today() + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    App.audit('Share pack exported', (App.data.sections || []).length + ' sections');
    say('Share pack downloaded — open it in any browser to print or share', 'success');
  }
  function printStudio() {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('print-target'));
    const p = $('panel-studio'); if (p) p.classList.add('print-target');
    window.print();
  }

  /* ---------- Conflict repair ---------- */
  function conflictSlot(c) {
    if (!c || !c.slot || c.slot.indexOf('slot:') !== 0) return null;
    return (App.data.schedule || []).find((s) => s.id === c.slot.slice(5)) || null;
  }
  function freeTeacherFor(slot, day, period) {
    const subject = App.subjectByCode(slot.subjectCode);
    const pool = (App.data.staff || []).filter((s) => (s.subjects || []).includes(slot.subjectCode));
    const source = pool.length ? pool : (App.data.staff || []);
    return source.slice().sort((a, b) => App.slotLoad(a.id) - App.slotLoad(b.id)).find((s) => {
      const busy = App.teachingSlots().some((x) => x.id !== slot.id && x.subjectCode !== 'FREE' && x.day === day && x.period === period && App.effTeacher(x) === s.id);
      const max = s.maxHoursPerWeek || App.config.maxWeekly || 18;
      const dailyMax = s.maxHoursPerDay || App.config.maxDaily || 5;
      const daily = App.teachingSlots().filter((x) => x.id !== slot.id && x.day === day && App.effTeacher(x) === s.id).length;
      return !busy && App.slotLoad(s.id) <= max && daily < dailyMax;
    }) || null;
  }
  function freeRoomFor(slot, day, period) {
    const sec = App.sectionById(slot.sectionId);
    const strength = Number(sec && sec.strength) || 0;
    const isLab = !!slot.isLab;
    return (App.data.rooms || []).filter((r) => r.status !== 'Maintenance')
      .filter((r) => r.name !== slot.roomName)
      .filter((r) => !isLab || r.type === 'Lab')
      .filter((r) => !strength || !Number(r.capacity) || Number(r.capacity) >= strength)
      .filter((r) => !App.teachingSlots().some((x) => x.id !== slot.id && x.subjectCode !== 'FREE' && x.day === day && x.period === period && x.roomName === r.name))
      .sort((a, b) => Number(a.capacity || 0) - Number(b.capacity || 0))[0] || null;
  }
  function freeCellFor(slot) {
    const teacher = App.effTeacher(slot);
    const days = dayList();
    const periods = periodList();
    const candidates = [];
    days.forEach((day) => periods.forEach((period) => {
      if (day === slot.day && period === slot.period) return;
      const row = slotAt(slot.sectionId, day, period);
      if (row && row.id !== slot.id && row.subjectCode !== 'FREE') return;
      if (teacher && App.teachingSlots().some((x) => x.id !== slot.id && x.subjectCode !== 'FREE' && x.day === day && x.period === period && App.effTeacher(x) === teacher)) return;
      if (slot.roomName && App.teachingSlots().some((x) => x.id !== slot.id && x.subjectCode !== 'FREE' && x.day === day && x.period === period && x.roomName === slot.roomName)) return;
      candidates.push({ day, period, row, score: (day === slot.day ? 0 : 3) + Math.abs(period - slot.period) });
    }));
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0] || null;
  }
  function moveSlotToFreeCell(slot, cell) {
    if (!slot || !cell) return false;
    if (cell.row) { cell.row.day = slot.day; cell.row.period = slot.period; }
    slot.day = cell.day; slot.period = cell.period;
    return true;
  }
  function reassignSlot(slot, teacher) {
    if (!slot || !teacher) return false;
    slot.teacherId = teacher.id;
    slot.originalTeacherId = teacher.id;
    slot.currentTeacherId = teacher.id;
    slot.backupTeacherId = null;
    slot.isSubstituted = false;
    return true;
  }
  function fixConflictInternal(c) {
    const slot = conflictSlot(c);
    if (c.type === 'overload' || c.type === 'daily-overload') {
      const staffId = String(c.slot || '').replace('staff_', '');
      const candidates = App.teachingSlots().filter((s) => App.effTeacher(s) === staffId && (!c.day || s.day === c.day));
      for (const s of candidates) {
        const t = freeTeacherFor(s, s.day, s.period);
        if (t && t.id !== staffId) return reassignSlot(s, t);
      }
      return false;
    }
    if (!slot) return false;
    if (c.type === 'uncovered') {
      const t = freeTeacherFor(slot, slot.day, slot.period);
      return !!t && reassignSlot(slot, t);
    }
    if (c.type === 'room') {
      const room = freeRoomFor(slot, slot.day, slot.period);
      if (room) { slot.roomName = room.name; return true; }
      const cell = freeCellFor(slot);
      return moveSlotToFreeCell(slot, cell);
    }
    if (c.type === 'teacher') {
      const t = freeTeacherFor(slot, slot.day, slot.period);
      if (t) return reassignSlot(slot, t);
      const cell = freeCellFor(slot);
      return moveSlotToFreeCell(slot, cell);
    }
    if (c.type === 'section') {
      const cell = freeCellFor(slot);
      return moveSlotToFreeCell(slot, cell);
    }
    return false;
  }
  function fixConflict(index) {
    if (!(App.canWrite && App.canWrite())) { say('Read-only role', 'error'); return; }
    const conflicts = App.validateSchedule();
    const c = conflicts[index];
    if (!c) { say('That conflict no longer exists', 'info'); App.render(); return; }
    App.pushUndo('Conflict repaired');
    const ok = fixConflictInternal(c);
    if (!ok) { App._undo.pop(); updateUndoUI(); say('No automatic fix found — open the session in Studio to resolve it manually', 'warn'); return; }
    App.saveAll();
    App.audit('Conflict repaired', c.type + ' · ' + (c.detail || ''));
    say('Conflict repaired', 'success');
    App.render();
  }
  function fixAllConflicts() {
    if (!(App.canWrite && App.canWrite())) { say('Read-only role', 'error'); return; }
    const before = captureState();
    let fixed = 0;
    for (let pass = 0; pass < 60; pass++) {
      const conflicts = App.validateSchedule();
      if (!conflicts.length) break;
      let progressed = false;
      for (let i = 0; i < conflicts.length; i++) {
        if (fixConflictInternal(conflicts[i])) { fixed++; progressed = true; break; }
      }
      if (!progressed) break;
    }
    App.saveAll();
    const left = App.validateSchedule().length;
    App.audit('Conflict auto-repair', 'fixed=' + fixed + ' remaining=' + left);
    if (fixed && signature(captureState()) !== signature(before)) pushUndoState(before, 'Auto-repair conflicts');
    if (fixed) App.notify(left ? 'warn' : 'success', 'Auto-repair fixed ' + fixed + ' conflict(s)' + (left ? ' — ' + left + ' remain' : ''), { panel: 'regulations', tab: 'conflicts' });
    say(fixed ? 'Fixed ' + fixed + ' conflict(s)' + (left ? ' · ' + left + ' remaining' : '') : 'No automatic fixes available', fixed ? (left ? 'warn' : 'success') : 'warn');
    App.render();
  }
  function regConflictsHTMLEnhanced() {
    const conflicts = App.validateSchedule();
    const canWrite = App.canWrite ? App.canWrite() : true;
    return '<div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Full constraint audit: teacher / room / section double-bookings, uncovered slots and load violations.</div>' +
      '<div class="conflict-toolbar"><span class="badge badge-' + (conflicts.length ? 'danger' : 'success') + '">' + (conflicts.length ? conflicts.length + ' open conflict(s)' : '✓ No conflicts detected') + '</span>' +
      (conflicts.length && canWrite ? '<button class="btn btn-sm primary" onclick="TT.fixAllConflicts()">🔧 Auto-repair all</button><button class="btn btn-sm" onclick="TT.showPanel(\'studio\')">Open Studio</button>' : '') +
      (conflicts.length && !canWrite ? '<span class="text-muted" style="font-size:.8rem">Read-only role — switch account to repair</span>' : '') + '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Type</th><th>Detail</th><th>Day</th><th>Period</th><th>Action</th></tr></thead><tbody>' +
      (conflicts.map((c, i) => '<tr><td><span class="badge badge-danger">' + esc(c.type) + '</span></td><td>' + esc(c.detail || '') + '</td><td>' + esc(c.day || '') + '</td><td>' + esc(c.period || '') + '</td>' +
        '<td class="conflict-actions">' + (conflictSlot(c) && canWrite ? '<button class="btn btn-sm" onclick="TT.fixConflict(' + i + ')">Fix</button><button class="btn btn-sm" onclick="TT.showPanel(\'studio\');setTimeout(()=>TT.openSlotEditor(\'' + escAttr(conflictSlot(c).id) + '\'),120)">Edit</button>' : '<span class="text-muted">—</span>') + '</td></tr>').join('') ||
        '<tr><td colspan="5" class="empty-state conflict-clean" style="padding:26px">✓ No conflicts. The timetable satisfies the current rules.</td></tr>') +
      '</tbody></table></div>';
  }

  function installStudio() {
    App.renderStudio = renderStudio;
    App.setStudioSection = setStudioSection;
    App.openSlotEditor = openSlotEditor;
    App.slotEditorChange = slotEditorChange;
    App.slotEditorCheck = slotEditorCheck;
    App.slotEditorAutoTeacher = slotEditorAutoTeacher;
    App.slotEditorFindRoom = slotEditorFindRoom;
    App.saveSlot = saveSlot;
    App.toggleSlotPin = toggleSlotPin;
    App.removeSlot = removeSlot;
    App.moveSlot = moveSlot;
    App.regenerateUnlocked = regenerateUnlocked;
    App.publishSchedule = publishSchedule;
    App.unpublishSchedule = unpublishSchedule;
    App.viewPublishedDiff = viewPublishedDiff;
    App.exportSharePack = exportSharePack;
    App.printStudio = printStudio;
    App.fixConflict = fixConflict;
    App.fixAllConflicts = fixAllConflicts;
    App.regConflictsHTML = regConflictsHTMLEnhanced;
  }

  /* ======================================================================
     ANALYTICS & INSIGHTS
     ====================================================================== */
  function staffLoadIn(slots, id) { return slots.filter((s) => s.subjectCode !== 'FREE' && App.effTeacher(s) === id).length; }
  function lineChart(points) {
    if (!points.length) return '<div class="chart-empty">No attendance logs yet. Mark attendance to see the trend.</div>';
    const W = 620, H = 210, L = 38, R = 12, T = 14, B = 30;
    const iw = W - L - R, ih = H - T - B;
    const x = (i) => L + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v) => T + ih - (clamp(v, 0, 100) / 100) * ih;
    const path = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.pct).toFixed(1)).join(' ');
    const grid = [0, 25, 50, 75, 100].map((v) => '<line class="chart-grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="chart-axis" x="4" y="' + (y(v) + 3) + '">' + v + '%</text>').join('');
    const dots = points.map((p, i) => '<circle class="chart-dot" cx="' + x(i) + '" cy="' + y(p.pct) + '" r="3.4"><title>' + esc(p.label + ' · ' + p.pct + '% present (' + p.present + '/' + (p.present + p.absent) + ')') + '</title></circle>').join('');
    const labels = points.map((p, i) => (i % 2 === 0 || points.length < 8 ? '<text class="chart-axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(p.label) + '</text>' : '')).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Attendance trend">' + grid + '<path class="chart-line" d="' + path + '"/>' + dots + labels + '</svg>';
  }
  function hbars(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="chart-empty">No data for this view.</div>';
    return '<div class="hbar-list">' + rows.map((r) => {
      const cls = r.warn ? 'warn' : r.bad ? 'bad' : '';
      const w = clamp(r.pct == null ? 0 : r.pct, 0, 100);
      return '<div class="hbar-row"><span class="hbar-label" title="' + escAttr(r.label) + '">' + esc(r.label) + '</span>' +
        '<span class="hbar-track"><span class="hbar-fill ' + cls + '" style="width:' + w + '%"></span></span>' +
        '<span class="hbar-val">' + esc(r.value == null ? '' : r.value) + '</span></div>';
    }).join('') + '</div>' + (opts.legend || '');
  }
  function renderInsights() {
    const host = $('insightsContent');
    if (!host) return;
    const allSections = App.data.sections || [];
    if (!allSections.length) {
      host.innerHTML = '<div class="card chart-empty">Add sections and generate a timetable to unlock analytics.</div>';
      return;
    }
    const depts = [...new Set(allSections.map((s) => s.dept).filter(Boolean))];
    if (App._insightDept && App._insightDept !== 'ALL' && !depts.includes(App._insightDept)) App._insightDept = 'ALL';
    const dept = App._insightDept || 'ALL';
    const sections = dept === 'ALL' ? allSections : allSections.filter((s) => s.dept === dept);
    const sectionIds = new Set(sections.map((s) => s.id));
    const slots = App.teachingSlots().filter((s) => sectionIds.has(s.sectionId));
    const staff = (App.data.staff || []).filter((s) => dept === 'ALL' || s.dept === dept);
    const staffIds = new Set(staff.map((s) => s.id));
    const days = dayList(), periods = periodList();
    const capacity = Math.max(1, sections.length * days.length * periods.length);
    const util = pct(slots.length, capacity);
    const loads = staff.map((s) => ({ s, load: staffLoadIn(slots, s.id), max: s.maxHoursPerWeek || App.config.maxWeekly || 18 }));
    const overload = loads.filter((x) => x.load > x.max).length;
    const avgLoad = staff.length ? Math.round(loads.reduce((n, x) => n + x.load, 0) / staff.length * 10) / 10 : 0;
    const conflicts = App.validateSchedule().filter((c) => !c.slot || c.slot.indexOf('slot:') !== 0 || sectionIds.has((conflictSlot(c) || {}).sectionId));
    const logs = (App.attendanceLog ? App.attendanceLog() : []).filter((l) => dept === 'ALL' || staffIds.has(l.staffId));
    const byDate = new Map();
    logs.forEach((l) => {
      if (!l.date) return;
      const o = byDate.get(l.date) || { present: 0, absent: 0 };
      if (String(l.status).toLowerCase() === 'absent') o.absent++; else o.present++;
      byDate.set(l.date, o);
    });
    const trend = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([date, o]) => ({ date, label: date.slice(5), present: o.present, absent: o.absent, pct: pct(o.present, o.present + o.absent) }));
    const attendancePct = trend.length ? Math.round(trend.reduce((n, x) => n + x.pct, 0) / trend.length) : 0;

    const heat = [];
    days.forEach((d) => periods.forEach((p) => {
      const count = slots.filter((s) => s.day === d && s.period === p).length;
      heat.push({ day: d, period: p, count });
    }));
    const heatMax = Math.max(1, ...heat.map((h) => h.count));

    const deptRows = (dept === 'ALL' ? depts : [dept]).map((d) => {
      const secs = allSections.filter((s) => s.dept === d);
      const prescribed = secs.reduce((n, sec) => n + (App.sectionStats ? App.sectionStats(sec).prescribed : 0), 0);
      const scheduled = (App.data.schedule || []).filter((s) => secs.some((x) => x.id === s.sectionId) && s.subjectCode !== 'FREE').length;
      return { d, prescribed, scheduled, pct: pct(scheduled, prescribed) };
    }).sort((a, b) => a.pct - b.pct);

    const roomRows = (App.data.rooms || []).filter((r) => dept === 'ALL' || r.dept === dept || r.dept === 'GENERAL').map((r) => {
      const u = App.roomUtil ? App.roomUtil(r) : { pct: 0, bookings: 0 };
      return { label: r.name, pct: u.pct, value: u.bookings + ' sess', warn: u.pct >= 85, bad: u.pct >= 100 };
    }).sort((a, b) => b.pct - a.pct).slice(0, 10);

    const workloadRows = loads.slice().sort((a, b) => b.load - a.load).slice(0, 12).map((x) => ({
      label: x.s.name + ' · ' + x.s.dept, pct: pct(x.load, x.max), value: x.load + '/' + x.max,
      warn: x.load > x.max * 0.85 && x.load <= x.max, bad: x.load > x.max
    }));

    const filter = '<div class="insight-filter"><label for="insightDept" class="text-muted" style="font-size:.8rem">Department</label><select id="insightDept" onchange="TT.setInsightDept(this.value)"><option value="ALL">All departments</option>' +
      depts.map((d) => '<option value="' + escAttr(d) + '"' + (d === dept ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>' +
      '<span class="badge badge-info">' + slots.length + ' sessions</span><span class="badge badge-neutral">' + sections.length + ' sections</span>' +
      '<span class="spacer" style="flex:1"></span><button class="btn btn-sm" onclick="TT.exportInsightsCSV()">Export analysis</button></div>';

    host.innerHTML = filter +
      '<div class="insight-kpis">' +
      '<div class="insight-kpi"><span class="k-ico">📊</span><div><b>' + util + '%</b><small>timetable utilisation</small></div></div>' +
      '<div class="insight-kpi"><span class="k-ico">👩‍🏫</span><div><b>' + avgLoad + 'h</b><small>average faculty load</small></div></div>' +
      '<div class="insight-kpi"><span class="k-ico">' + (overload ? '⚠️' : '✅') + '</span><div><b>' + overload + '</b><small>overloaded faculty</small></div></div>' +
      '<div class="insight-kpi"><span class="k-ico">' + (conflicts.length ? '🚨' : '✅') + '</span><div><b>' + conflicts.length + '</b><small>open conflicts</small></div></div>' +
      '<div class="insight-kpi"><span class="k-ico">📋</span><div><b>' + (trend.length ? attendancePct + '%' : '—') + '</b><small>average attendance</small></div></div></div>' +
      '<div class="insight-grid">' +
      '<div class="chart-card wide"><div class="chart-head"><div><div class="chart-title">Where the week is busiest</div><div class="chart-sub">Teaching sessions per day and period across ' + (dept === 'ALL' ? 'the college' : dept) + '</div></div><span class="badge badge-neutral">' + slots.length + ' sessions</span></div>' +
      '<div class="heat-wrap"><table class="heat-table"><thead><tr><th></th>' + days.map((d) => '<th>' + esc(d) + '</th>').join('') + '</tr></thead><tbody>' +
      periods.map((p) => '<tr><th>P' + p + '</th>' + days.map((d) => { const h = heat.find((x) => x.day === d && x.period === p); const i = h ? h.count / heatMax : 0; return '<td class="' + (h && h.count ? '' : 'zero') + '" style="--i:' + i.toFixed(2) + '" title="' + esc(d + ' P' + p + ' · ' + (h ? h.count : 0) + ' sessions') + '">' + (h ? h.count : 0) + '</td>'; }).join('') + '</tr>').join('') +
      '</tbody></table></div><div class="chart-legend"><span><i style="background:var(--primary)"></i>Higher intensity = more concurrent sessions</span><span>Capacity per cell: ' + sections.length + ' sections</span></div></div>' +

      '<div class="chart-card"><div class="chart-head"><div><div class="chart-title">Faculty workload fairness</div><div class="chart-sub">Top 12 loads vs contractual maximum</div></div></div>' +
      hbars(workloadRows, { legend: '<div class="chart-legend"><span><i style="background:var(--primary)"></i>Within limit</span><span><i style="background:var(--warning)"></i>Near limit</span><span><i style="background:var(--danger)"></i>Over limit</span></div>' }) + '</div>' +

      '<div class="chart-card"><div class="chart-head"><div><div class="chart-title">Attendance trend</div><div class="chart-sub">Last ' + (trend.length || 14) + ' recorded day(s)</div></div><span class="badge badge-' + (attendancePct >= 90 ? 'success' : attendancePct >= 75 ? 'warning' : 'danger') + '">' + (trend.length ? attendancePct + '%' : 'No logs') + '</span></div>' + lineChart(trend) + '</div>' +

      '<div class="chart-card"><div class="chart-head"><div><div class="chart-title">Room utilisation</div><div class="chart-sub">Booked sessions against available periods</div></div></div>' + hbars(roomRows) + '</div>' +

      '<div class="chart-card"><div class="chart-head"><div><div class="chart-title">Curriculum coverage</div><div class="chart-sub">Scheduled hours vs prescribed hours</div></div></div>' +
      '<div class="hbar-list">' + deptRows.map((r) => '<div class="hbar-row"><span class="hbar-label">' + esc(r.d) + '</span><span class="hbar-track"><span class="hbar-fill ' + (r.pct >= 95 ? '' : r.pct >= 80 ? 'warn' : 'bad') + '" style="width:' + clamp(r.pct, 0, 100) + '%"></span></span><span class="hbar-val">' + r.scheduled + '/' + r.prescribed + '</span></div>').join('') + '</div>' +
      '<div class="chart-legend"><span>Coverage below 80% is highlighted for review.</span></div></div>' +
      '</div>';
  }
  function setInsightDept(d) { App._insightDept = d; App.renderInsights(); }
  function insightsCSV() {
    const dept = App._insightDept || 'ALL';
    const sections = dept === 'ALL' ? (App.data.sections || []) : (App.data.sections || []).filter((s) => s.dept === dept);
    const ids = new Set(sections.map((s) => s.id));
    const slots = App.teachingSlots().filter((s) => ids.has(s.sectionId));
    const staff = (App.data.staff || []).filter((s) => dept === 'ALL' || s.dept === dept);
    const lines = [['metric', 'label', 'value', 'detail']];
    lines.push(['summary', 'department', dept, '']);
    lines.push(['summary', 'sessions', slots.length, '']);
    lines.push(['summary', 'utilisation_pct', pct(slots.length, sections.length * dayList().length * periodList().length), '']);
    staff.forEach((s) => lines.push(['faculty_load', s.name, staffLoadIn(slots, s.id), s.maxHoursPerWeek || App.config.maxWeekly || 18]));
    (App.data.rooms || []).forEach((r) => { const u = App.roomUtil ? App.roomUtil(r) : { pct: 0, bookings: 0 }; lines.push(['room_utilisation', r.name, u.pct, u.bookings]); });
    dayList().forEach((d) => periodList().forEach((p) => lines.push(['heatmap', d + ' P' + p, slots.filter((s) => s.day === d && s.period === p).length, ''])));
    const csv = lines.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'analytics_' + today() + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    App.audit('Analytics exported', 'dept=' + dept);
    say('Analytics CSV downloaded', 'success');
  }
  function printInsights() {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('print-target'));
    const p = $('panel-insights'); if (p) p.classList.add('print-target');
    window.print();
  }
  function installInsights() {
    App.renderInsights = renderInsights;
    App.setInsightDept = setInsightDept;
    App.exportInsightsCSV = insightsCSV;
    App.printInsights = printInsights;
  }

  function boot() {
    if (!window.TT || !window.TT._entInstalled) { setTimeout(boot, 60); return; }
    if (window.TT._awInstalled) return;
    App = window.TT;
    ensureDefaults();
    bindAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 40));
  else setTimeout(boot, 40);
})();
