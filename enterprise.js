/* ==========================================================================
   Enterprise Suite — extends the self-contained TT core (app.js)
   --------------------------------------------------------------------------
   Adds the missing operational layer expected from an institutional system:
     - Command palette (Ctrl/Cmd+K) with global entity search
     - Administration: institution profile, users & roles with read-only
       enforcement, period timings, preferences, data-health checks
     - Sections & Curriculum: full CRUD + per-section subject prescription
     - Rooms & Facilities: full CRUD, equipment, utilisation, week view
     - Upgraded Staff / Subjects / Attendance / Calendar / Reports /
       Regulations / Audit surfaces (filters, exports, pagination, KPIs)
     - Cross-tab live sync, multi-format exports, keyboard shortcuts
   No build step, no server: everything persists in localStorage.
   ========================================================================== */
(function () {
  'use strict';

  const App = window.TT;
  if (!App) { console.error('Enterprise: TT core not found'); return; }

  const PAGE = 12;
  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ROLE_MATRIX = {
    Administrator: { write: true, admin: true, owner: true, desc: 'Full control of data, configuration and users' },
    'Academic Coordinator': { write: true, admin: true, owner: false, desc: 'Day-to-day scheduling and configuration' },
    HOD: { write: true, admin: false, owner: false, desc: 'Department-level scheduling and attendance' },
    Faculty: { write: false, admin: false, owner: false, desc: 'Read-only access to timetables and reports' },
    Viewer: { write: false, admin: false, owner: false, desc: 'Read-only access' }
  };

  /* ---------------- tiny helpers ---------------- */
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const parseISO = (s) => new Date((s || todayISO()) + 'T00:00:00');
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const num = (v) => Number(v) || 0;
  const badge = (txt, kind) => '<span class="badge badge-' + (kind || 'neutral') + '">' + escapeHtml(txt) + '</span>';
  const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const fmtTime = (mins) => String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  const emptyRow = (cols, msg) => '<tr><td colspan="' + cols + '" class="empty-state" style="padding:26px">' + escapeHtml(msg) + '</td></tr>';
  const deptOf = (d) => (typeof d === 'string' ? d : (d && (d.code || d.id)) || '');

  App.roleCapabilities = ROLE_MATRIX;

  /* ======================================================================
     Enterprise defaults / data normalisation
     ====================================================================== */
  App.defaultPeriodTimes = function (count) {
    const n = count || this.config.periods || 8;
    const out = [];
    let m = 9 * 60;
    for (let p = 1; p <= n; p++) {
      if (p === 5) m = 13 * 60 + 30;                 // lunch break before P5
      const end = m + 55;
      out.push({ period: p, start: fmtTime(m), end: fmtTime(end) });
      m = end;
    }
    return out;
  };

  App.entDefaults = function () {
    const firstDept = deptOf((this.data.departments || [])[0]) || 'CSE';
    return {
      orgShort: this.config.orgShort || this.config.institution || 'College of Engineering',
      orgCode: this.config.orgCode || 'COE',
      orgAddress: this.config.orgAddress || 'University Campus, Chennai 600 001',
      orgEmail: this.config.orgEmail || 'academic@college.edu',
      orgPhone: this.config.orgPhone || '+91 44 0000 0000',
      periodTimes: this.defaultPeriodTimes(),
      roles: [
        { id: 'U-ADMIN', name: 'System Administrator', role: 'Administrator', dept: 'Academic Cell', email: 'admin@college.edu', active: true },
        { id: 'U-COORD', name: 'Academic Coordinator', role: 'Academic Coordinator', dept: 'Academic Cell', email: 'coordinator@college.edu', active: true },
        { id: 'U-HOD', name: 'Head of Department', role: 'HOD', dept: firstDept, email: 'hod.' + firstDept.toLowerCase() + '@college.edu', active: true },
        { id: 'U-FAC', name: 'Faculty Member', role: 'Faculty', dept: firstDept, email: 'faculty@college.edu', active: true },
        { id: 'U-VIEW', name: 'Read-only Auditor', role: 'Viewer', dept: 'Academic Cell', email: 'auditor@college.edu', active: true }
      ],
      currentUserId: 'U-ADMIN',
      notifyPrefs: { attendance: true, conflicts: true, leaves: true, substitution: true, weeklyDigest: false },
      autoProcess: true,
      autoSnapshot: true,
      auditRetention: 5000,
      requireAbsenceReason: false
    };
  };

  App.ensureEnterprise = function () {
    const d = this.entDefaults();
    Object.keys(d).forEach((k) => { if (this.config[k] === undefined) this.config[k] = d[k]; });
    if (!Array.isArray(this.config.periodTimes) || !this.config.periodTimes.length) this.config.periodTimes = d.periodTimes;
    if (!Array.isArray(this.config.roles) || !this.config.roles.length) this.config.roles = d.roles;
    if (!this.config.roles.some((r) => r.id === this.config.currentUserId)) this.config.currentUserId = this.config.roles[0].id;
    this.config.notifyPrefs = Object.assign({}, d.notifyPrefs, this.config.notifyPrefs || {});

    (this.data.sections || []).forEach((s) => {
      if (!Array.isArray(s.subjects)) s.subjects = [];
      if (s.strength == null) s.strength = 60;
      if (s.semester == null) s.semester = 3;
      if (s.year == null) s.year = 2026;
    });
    (this.data.rooms || []).forEach((r) => {
      if (!Array.isArray(r.facilities)) r.facilities = r.type === 'Lab' ? ['Computers'] : ['Projector'];
      if (!r.building) r.building = (r.dept && r.dept !== 'GENERAL') ? r.dept + ' Block' : 'Main Block';
      if (!r.status) r.status = 'Active';
    });
    LS('tt_config', this.config);
    LS('tt_sections', this.data.sections);
    LS('tt_rooms', this.data.rooms);
  };

  /* ---------------- lookups ---------------- */
  App.deptCodes = function () {
    return [...new Set((this.data.departments || []).map(deptOf).filter(Boolean))];
  };

  /** Explicit curriculum if mapped, otherwise the department's catalogue. */
  App.subjectsForSection = function (sec) {
    if (!sec) return [];
    const all = this.data.subjects || [];
    if (Array.isArray(sec.subjects) && sec.subjects.length) {
      const map = new Map(all.map((s) => [s.code, s]));
      return sec.subjects.map((c) => map.get(c)).filter(Boolean);
    }
    return all.filter((s) => s.dept === sec.dept);
  };

  App.sectionStats = function (sec) {
    const subs = this.subjectsForSection(sec);
    const prescribed = subs.reduce((n, s) => n + num(s.hoursPerWeek), 0);
    const scheduled = (this.data.schedule || []).filter((s) => s.sectionId === sec.id && s.subjectCode !== 'FREE').length;
    const capacity = (this.config.days || 5) * (this.config.periods || 8);
    return {
      subjects: subs, prescribed, scheduled, capacity,
      fill: pct(scheduled, capacity),
      coverage: pct(scheduled, prescribed),
      over: prescribed > capacity
    };
  };

  App.periodTime = function (p) {
    const rec = (this.config.periodTimes || []).find((x) => num(x.period) === p);
    if (rec) return rec;
    return this.defaultPeriodTimes()[p - 1] || { period: p, start: '', end: '' };
  };
  App.periodLabel = function (p) {
    const t = this.periodTime(p);
    return t && t.start ? 'P' + p + ' · ' + t.start : 'P' + p;
  };

  /* ======================================================================
     Users & roles
     ====================================================================== */
  App.currentUser = function () {
    const roles = this.config.roles || [];
    return roles.find((r) => r.id === this.config.currentUserId) || roles[0] ||
      { id: 'U-ADMIN', name: 'System Administrator', role: 'Administrator', dept: 'Academic Cell', email: 'admin@college.edu', active: true };
  };
  App.userCaps = function () {
    return ROLE_MATRIX[this.currentUser().role] || ROLE_MATRIX.Viewer;
  };
  App.canWrite = function () { return !!this.userCaps().write; };
  App.canAdmin = function () { return !!this.userCaps().admin; };
  App.canOwner = function () { return !!this.userCaps().owner; };

  App.switchUser = function (id) {
    const u = (this.config.roles || []).find((r) => r.id === id);
    if (!u || u.active === false) { toast('This account is inactive', 'error'); return; }
    this.config.currentUserId = u.id;
    LS('tt_config', this.config);
    this.audit('Active user changed', u.name + ' (' + u.role + ')');
    this.closeModal('modalGeneric');
    this.render();
    toast('Signed in as ' + u.name + ' — ' + u.role, 'success');
  };

  /* ======================================================================
     Render plumbing
     ====================================================================== */
  const baseRender = App.render;
  App.render = function () {
    if (!this._entReady) { this.ensureEnterprise(); this._entReady = true; }
    baseRender.apply(this, arguments);
    try { this.renderEnterprisePanel(); } catch (e) { console.error('Enterprise panel render', e); }
    try { this.renderChrome(); } catch (e) { console.error('Enterprise chrome render', e); }
  };

  const baseShowPanel = App.showPanel;
  App.showPanel = function (name) {
    baseShowPanel.call(this, name);
    const titles = {
      sections: 'Sections & Curriculum', rooms: 'Rooms & Facilities', admin: 'Administration',
      generator: 'Timetable Generator', settings: 'Settings', regulations: 'Regulations'
    };
    if (titles[name]) { const t = document.getElementById('pageTitle'); if (t) t.textContent = titles[name]; }
  };

  App.renderEnterprisePanel = function () {
    if (this.activePanel === 'sections') this.renderSections();
    else if (this.activePanel === 'rooms') this.renderRooms();
    else if (this.activePanel === 'admin') this.renderAdmin();
  };

  App.renderChrome = function () {
    const u = this.currentUser();
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const avEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = u.name;
    if (roleEl) roleEl.textContent = u.dept + ' · ' + u.role;
    if (avEl) avEl.textContent = initials(u.name);
    const term = document.getElementById('termChip');
    if (term) term.textContent = 'Sem ' + (this.config.semester || 1) + ' · ' + (this.config.academicYear || '') + ' · ' + (this.config.orgShort || this.config.institution || '');
    const brand = document.querySelector('.brand-text');
    if (brand) brand.textContent = this.config.orgShort || this.config.institution || 'College Timetable';

    const content = document.querySelector('.content');
    let banner = document.getElementById('readOnlyBanner');
    if (!this.canWrite()) {
      if (!banner && content) {
        banner = document.createElement('div');
        banner.id = 'readOnlyBanner';
        banner.className = 'readonly-banner';
        content.insertBefore(banner, content.firstChild);
      }
      if (banner) {
        banner.innerHTML = '<span>🔒 <b>Read-only mode</b> — you are signed in as ' + escapeHtml(u.name) +
          ' (' + escapeHtml(u.role) + '). Editing actions are disabled.</span>' +
          '<button class="btn btn-sm" onclick="TT.openProfileMenu()">Switch account</button>';
      }
    } else if (banner) {
      banner.remove();
    }
  };

  /* ======================================================================
     Dashboard extras
     ====================================================================== */
  const baseDashboard = App.renderDashboard;
  App.renderDashboard = function () {
    baseDashboard.call(this);
    try { this.renderDashboardEnterprise(); } catch (e) { console.error('Dashboard extras', e); }
  };

  App.qualityScore = function () {
    const conflicts = this.validateSchedule();
    const teaching = this.teachingSlots();
    if (!teaching.length) return 0;
    const uncovered = teaching.filter((s) => !this.effTeacher(s)).length;
    const overloaded = this.data.staff.filter((s) => this.slotLoad(s.id) > (s.maxHoursPerWeek || this.config.maxWeekly)).length;
    const noBackup = teaching.filter((s) => !s.backupTeacherId).length;
    const score = 100
      - Math.min(30, conflicts.length * 6)
      - Math.min(25, pct(uncovered, teaching.length) * 1.5)
      - Math.min(15, pct(overloaded, Math.max(1, this.data.staff.length)) * 0.8)
      - Math.min(15, pct(noBackup, teaching.length) * 0.5);
    return Math.round(clamp(score, 0, 100));
  };

  App.termProgress = function () {
    const start = this.config.semStart, end = this.config.semEnd;
    if (!start || !end) return { pct: 0, elapsed: 0, total: 0, left: 0 };
    const s = parseISO(start), e = parseISO(end), now = new Date();
    const total = Math.max(1, Math.round((e - s) / 86400000));
    const elapsed = clamp(Math.round((now - s) / 86400000), 0, total);
    return { pct: pct(elapsed, total), elapsed, total, left: Math.max(0, total - elapsed) };
  };

  App.renderDashboardEnterprise = function () {
    const host = document.getElementById('dashEnterprise');
    if (!host) return;
    const date = todayISO();
    const wd = weekdayOf(date);
    const teaching = this.teachingSlots();
    const todaySlots = (wd && this.DAYS.includes(wd))
      ? teaching.filter((s) => s.day === wd).sort((a, b) => a.period - b.period)
      : [];
    const conflicts = this.validateSchedule();
    const uncovered = teaching.filter((s) => !this.effTeacher(s)).length;
    const noBackup = teaching.filter((s) => !s.backupTeacherId).length;
    const overloaded = this.data.staff.filter((s) => this.slotLoad(s.id) > (s.maxHoursPerWeek || this.config.maxWeekly));
    const fragile = typeof this._fragileSlots === 'function' ? this._fragileSlots().length : 0;
    const score = this.qualityScore();
    const term = this.termProgress();
    const scoreColor = score >= 85 ? 'var(--accent)' : score >= 65 ? 'var(--warning)' : 'var(--danger)';
    const holiday = (this.data.holidays || []).find((h) => h.date === date);

    const todayRows = todaySlots.slice(0, 10).map((s) => {
      const t = this.periodTime(s.period);
      return '<div class="today-row" onclick="TT.deptTab(\'bulk-view\');TT.showPanel(\'departments\')">' +
        '<span class="today-time">' + escapeHtml(t.start || ('P' + s.period)) + '</span>' +
        '<span class="today-main"><b>' + escapeHtml(this.subjectName(s.subjectCode)) + '</b>' +
        '<small>' + escapeHtml(this.sectionName(s.sectionId)) + ' · ' + escapeHtml(this.staffName(this.effTeacher(s))) + '</small></span>' +
        '<span class="today-room">' + escapeHtml(s.roomName || '—') + '</span></div>';
    }).join('');

    const riskRows = [
      conflicts.length ? { level: 'danger', label: conflicts.length + ' schedule conflict(s)', action: "TT.showPanel('regulations')" } : { level: 'success', label: 'No schedule conflicts', action: "TT.showPanel('regulations')" },
      uncovered ? { level: 'danger', label: uncovered + ' uncovered teaching slot(s)', action: "TT.showPanel('substitution')" } : { level: 'success', label: 'All classes covered', action: "TT.showPanel('substitution')" },
      noBackup ? { level: 'warning', label: noBackup + ' slot(s) without a backup', action: "TT.openGenerator()" } : { level: 'success', label: 'Backup coverage complete', action: "TT.openGenerator()" },
      fragile ? { level: 'warning', label: fragile + ' fragile slot(s) at risk', action: "TT.showPanel('substitution')" } : { level: 'success', label: 'No fragile slots detected', action: "TT.showPanel('substitution')" }
    ].map((r) => '<div class="risk-row risk-' + r.level + '" onclick="' + r.action + '"><span class="risk-dot"></span><span>' + escapeHtml(r.label) + '</span><span class="risk-arrow">›</span></div>').join('');

    const deptRows = this.deptCodes().map((code) => {
      const secs = this.data.sections.filter((s) => s.dept === code);
      const cap = secs.length * (this.config.days || 5) * (this.config.periods || 8);
      const used = teaching.filter((s) => (this.sectionById(s.sectionId) || {}).dept === code).length;
      const p = pct(used, cap);
      return '<div class="dept-row"><span class="dept-code">' + escapeHtml(code) + '</span>' +
        '<span class="dept-bar"><i style="width:' + p + '%;background:' + (p >= 90 ? 'var(--danger)' : p >= 70 ? 'var(--warning)' : 'var(--primary)') + '"></i></span>' +
        '<span class="dept-pct">' + p + '%</span></div>';
    }).join('') || '<div class="text-muted" style="font-size:0.85rem">No departments yet.</div>';

    const activity = (this.data.auditLogs || []).slice(0, 6).map((l) =>
      '<div class="activity-row"><span class="activity-dot"></span><span class="activity-main"><b>' + escapeHtml(l.action) + '</b>' +
      (l.detail ? '<small>' + escapeHtml(l.detail) + '</small>' : '') + '</span>' +
      '<span class="activity-ts">' + new Date(l.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span></div>'
    ).join('') || '<div class="text-muted" style="font-size:0.85rem">No activity recorded yet.</div>';

    host.innerHTML = `
      <div class="ent-kpis">
        <div class="ent-kpi" onclick="TT.showPanel('reports')">
          <div class="kpi-ring" style="--v:${score};--c:${scoreColor}"><b>${score}</b></div>
          <div><div class="kpi-title">Timetable quality</div><div class="kpi-sub">${score >= 85 ? 'Institution-ready' : score >= 65 ? 'Needs attention' : 'Action required'}</div></div>
        </div>
        <div class="ent-kpi" onclick="TT.showPanel('calendar')">
          <div class="kpi-icon">📅</div>
          <div><div class="kpi-title">${term.left} days left</div><div class="kpi-sub">${term.elapsed}/${term.total} term days · ${term.pct}%</div>
          <div class="kpi-bar"><i style="width:${term.pct}%"></i></div></div>
        </div>
        <div class="ent-kpi" onclick="TT.showPanel('attendance')">
          <div class="kpi-icon">🧑‍🏫</div>
          <div><div class="kpi-title">${todaySlots.length} classes today</div><div class="kpi-sub">${wd ? escapeHtml(wd) : 'Weekend'} · ${uncovered ? uncovered + ' uncovered' : 'coverage healthy'}</div></div>
        </div>
        <div class="ent-kpi" onclick="TT.showPanel('substitution')">
          <div class="kpi-icon">🔁</div>
          <div><div class="kpi-title">${this.data.substitutions.filter((s) => s.status !== 'reverted').length} substitutions</div><div class="kpi-sub">${this.data.staff.filter((s) => s.attendanceStatus === 'Absent').length} faculty absent today</div></div>
        </div>
      </div>

      <div class="ent-grid">
        <div class="card ent-card">
          <div class="ent-card-head"><span>🕘 Today's schedule</span>${holiday ? badge('Holiday · ' + holiday.name, 'warning') : ''}</div>
          ${holiday ? '<div class="empty-state" style="padding:20px">Today is a holiday — no classes scheduled.</div>' :
            todayRows ? '<div class="today-list">' + todayRows + '</div>' : '<div class="empty-state" style="padding:20px">No classes scheduled for today. Generate a timetable to populate this view.</div>'}
        </div>
        <div class="card ent-card">
          <div class="ent-card-head"><span>⚠ Operational risk</span><button class="btn btn-sm" onclick="TT.showPanel('regulations')">Audit</button></div>
          <div class="risk-list">${riskRows}</div>
          <div class="ent-subhead">Department utilisation</div>
          <div class="dept-list">${deptRows}</div>
        </div>
        <div class="card ent-card">
          <div class="ent-card-head"><span>🧾 Recent activity</span><button class="btn btn-sm" onclick="TT.showPanel('audit')">All logs</button></div>
          <div class="activity-list">${activity}</div>
          <div class="ent-subhead">Faculty workload</div>
          <div class="load-summary">
            <div><b>${this.data.staff.length}</b><small>Faculty</small></div>
            <div><b>${overloaded.length}</b><small>Overloaded</small></div>
            <div><b>${Math.round(teaching.length / Math.max(1, this.data.staff.length))}</b><small>Avg slots</small></div>
          </div>
        </div>
      </div>`;
  };

  /* ======================================================================
     Global command palette
     ====================================================================== */
  App._cmdItems = function () {
    const items = [];
    const nav = [
      ['dashboard', 'Dashboard', '🏠'], ['departments', 'Departments', '🏢'], ['sections', 'Sections & Curriculum', '🎓'],
      ['rooms', 'Rooms & Facilities', '🏫'], ['staff', 'Staff Directory', '👥'], ['subjects', 'Subject Catalogue', '📚'],
      ['attendance', 'Daily Attendance', '📋'], ['calendar', 'Academic Calendar', '🗓'], ['generator', 'Timetable Generator', '⚡'],
      ['substitution', 'Faculty Substitution', '🔄'], ['reports', 'Reports & Load', '📈'], ['regulations', 'Regulations', '📜'],
      ['audit', 'Audit Logs', '📝'], ['admin', 'Administration', '🛡️'], ['settings', 'Settings', '⚙']
    ];
    nav.forEach(([panel, label, icon]) => items.push({ group: 'Navigate', icon, label, sub: 'Open ' + label, run: () => this.showPanel(panel) }));

    const actions = [
      ['⚡', 'Generate timetable', 'Run the constraint solver', () => { this.showPanel('generator'); setTimeout(() => this.generateTimetable(), 150); }],
      ['📋', 'Take attendance', 'Mark faculty present or absent', () => this.showPanel('attendance')],
      ['👤', 'Add staff member', 'Create a faculty record', () => { this.showPanel('staff'); setTimeout(() => this.openStaffModal(), 120); }],
      ['📚', 'Add subject', 'Add a curriculum unit', () => { this.showPanel('subjects'); setTimeout(() => this.openSubjectModal(), 120); }],
      ['🎓', 'Add section', 'Create a class group', () => { this.showPanel('sections'); setTimeout(() => this.openSectionModal(), 120); }],
      ['🏫', 'Add room', 'Create a teaching space', () => { this.showPanel('rooms'); setTimeout(() => this.openRoomModal(), 120); }],
      ['🩺', 'Run data health check', 'Validate cross-entity integrity', () => { this.showPanel('admin'); setTimeout(() => this.runHealthCheck(), 150); }],
      ['💾', 'Download backup', 'Full localStorage snapshot', () => this.downloadBackup()],
      ['📸', 'Snapshot timetable', 'Save the current schedule version', () => this.snapshotVersion('manual snapshot')],
      ['📊', 'Export Excel workbook', 'Timetable, staff, subjects, substitutions', () => this.exportExcel()],
      ['🖨', 'Print timetable report', 'Signature-ready printable pack', () => this.printReport()],
      ['⌨', 'Keyboard shortcuts', 'All available shortcuts', () => this.showShortcuts()],
      ['🛡️', 'Users & roles', 'Access control', () => this.showPanel('admin')]
    ];
    actions.forEach(([icon, label, sub, run]) => items.push({ group: 'Actions', icon, label, sub, run }));

    (this.data.staff || []).forEach((s) => items.push({
      group: 'Staff', icon: '👤', label: s.name, sub: s.id + ' · ' + s.dept, run: () => this.openStaffProfile(s.id)
    }));
    (this.data.subjects || []).forEach((s) => items.push({
      group: 'Subjects', icon: '📚', label: s.code + ' — ' + s.name, sub: s.dept + ' · ' + s.type + ' · ' + s.hoursPerWeek + 'h', run: () => { this.showPanel('subjects'); setTimeout(() => this.openSubjectModal(s.code), 120); }
    }));
    (this.data.sections || []).forEach((s) => items.push({
      group: 'Sections', icon: '🎓', label: s.name, sub: s.dept + ' · Sem ' + s.semester + ' · ' + s.strength + ' students', run: () => { this.showPanel('sections'); setTimeout(() => this.openCurriculum(s.id), 120); }
    }));
    (this.data.rooms || []).forEach((r) => items.push({
      group: 'Rooms', icon: '🏫', label: r.name, sub: r.type + ' · ' + r.dept + ' · ' + r.capacity + ' seats', run: () => { this.showPanel('rooms'); setTimeout(() => this.openRoomModal(r.name), 120); }
    }));
    (this.data.departments || []).forEach((d) => items.push({
      group: 'Departments', icon: '🏢', label: deptOf(d), sub: d.name || '', run: () => this.showPanel('departments')
    }));
    return items;
  };

  App.openCommandPalette = function (seed) {
    const overlay = document.getElementById('cmdPalette');
    const input = document.getElementById('cmdInput');
    if (!overlay || !input) return;
    overlay.classList.add('open');
    input.value = seed || '';
    this._cmdIndex = 0;
    this._cmdFiltered = [];
    this.cmdFilter(input.value);
    setTimeout(() => input.focus(), 20);
  };
  App.closeCommandPalette = function () {
    const overlay = document.getElementById('cmdPalette');
    if (overlay) overlay.classList.remove('open');
  };
  App.cmdFilter = function (q) {
    const tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = this._cmdItems();
    this._cmdFiltered = all.filter((it) => {
      const hay = (it.label + ' ' + it.sub + ' ' + it.group).toLowerCase();
      return tokens.every((t) => hay.includes(t));
    }).slice(0, 40);
    this._cmdIndex = 0;
    this.cmdRenderResults();
  };
  App.cmdRenderResults = function () {
    const host = document.getElementById('cmdResults');
    if (!host) return;
    if (!this._cmdFiltered.length) { host.innerHTML = '<div class="cmd-empty">No matches. Try a staff name, subject code, section or action.</div>'; return; }
    let last = '';
    host.innerHTML = this._cmdFiltered.map((it, i) => {
      let head = '';
      if (it.group !== last) { last = it.group; head = '<div class="cmd-group">' + escapeHtml(it.group) + '</div>'; }
      return head + '<div class="cmd-item ' + (i === this._cmdIndex ? 'active' : '') + '" data-idx="' + i + '" onclick="TT.cmdPick(' + i + ')">' +
        '<span class="cmd-item-icon">' + it.icon + '</span><span class="cmd-item-main"><b>' + escapeHtml(it.label) + '</b><small>' + escapeHtml(it.sub) + '</small></span>' +
        '<span class="cmd-enter">↵</span></div>';
    }).join('');
    this.cmdEnsureVisible();
  };
  App.cmdEnsureVisible = function () {
    const host = document.getElementById('cmdResults');
    const active = host && host.querySelector('.cmd-item.active');
    if (host && active) {
      const top = active.offsetTop, bottom = top + active.offsetHeight;
      if (top < host.scrollTop) host.scrollTop = top - 8;
      else if (bottom > host.scrollTop + host.clientHeight) host.scrollTop = bottom - host.clientHeight + 8;
    }
  };
  App.cmdMove = function (delta) {
    if (!this._cmdFiltered || !this._cmdFiltered.length) return;
    this._cmdIndex = (this._cmdIndex + delta + this._cmdFiltered.length) % this._cmdFiltered.length;
    this.cmdRenderResults();
  };
  App.cmdPick = function (i) {
    const it = (this._cmdFiltered || [])[i];
    if (!it) return;
    this.closeCommandPalette();
    try { it.run(); } catch (e) { console.error(e); toast('Action failed: ' + e.message, 'error'); }
  };
  App.cmdKey = function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.cmdMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.cmdMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); this.cmdPick(this._cmdIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); this.closeCommandPalette(); }
  };

  /* ======================================================================
     Account menu + shortcuts
     ====================================================================== */
  App.openProfileMenu = function () {
    const u = this.currentUser();
    const caps = this.userCaps();
    const roles = this.config.roles || [];
    document.getElementById('modalTitle').textContent = 'Account & Access';
    document.getElementById('modalBody').innerHTML = `
      <div class="account-head">
        <div class="account-avatar">${escapeHtml(initials(u.name))}</div>
        <div style="flex:1">
          <div style="font-size:1.05rem;font-weight:800">${escapeHtml(u.name)}</div>
          <div class="text-muted" style="font-size:0.86rem">${escapeHtml(u.email || '')} · ${escapeHtml(u.dept || '')}</div>
          <div class="mt-8">${badge(u.role, u.role === 'Administrator' ? 'success' : u.role === 'Faculty' || u.role === 'Viewer' ? 'warning' : 'info')}
          ${caps.write ? '' : badge('Read-only session', 'danger')}</div>
        </div>
      </div>
      <div class="ent-subhead">Switch account</div>
      <div class="account-list">
        ${roles.map((r) => `<div class="account-row ${r.id === u.id ? 'current' : ''}">
          <span class="account-avatar small">${escapeHtml(initials(r.name))}</span>
          <span style="flex:1"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.role)} · ${escapeHtml(r.dept || '')}</small></span>
          ${r.active === false ? badge('Inactive', 'neutral') : r.id === u.id ? badge('Signed in', 'success') : `<button class="btn btn-sm" onclick="TT.switchUser('${escapeAttr(r.id)}')">Switch</button>`}
        </div>`).join('')}
      </div>
      <div class="text-muted" style="font-size:0.8rem;margin-top:10px">Access is enforced locally per role. Administrator can manage accounts in Administration → Users &amp; roles.</div>
      <div class="account-actions">
        <button class="btn" onclick="TT.showPanel('admin');TT.closeModal('modalGeneric')">🛡️ Administration</button>
        <button class="btn" onclick="TT.showShortcuts()">⌨ Keyboard shortcuts</button>
        <button class="btn" onclick="TT.showPanel('settings');TT.closeModal('modalGeneric')">⚙ Settings</button>
      </div>`;
    this.openModal('modalGeneric');
  };

  App.showShortcuts = function () {
    const rows = [
      ['Ctrl / ⌘ + K', 'Open command palette and search everything'],
      ['↑ / ↓', 'Move through palette results'],
      ['Enter', 'Open the highlighted result'],
      ['Esc', 'Close palette, modal or chat'],
      ['?', 'Show this shortcut guide'],
      ['Ctrl / ⌘ + P', 'Print the master report'],
      ['Ctrl / ⌘ + S', 'Download a full backup'],
      ['Alt + 1 … 9', 'Jump to the first nine panels']
    ];
    document.getElementById('modalTitle').textContent = 'Keyboard Shortcuts';
    document.getElementById('modalBody').innerHTML = '<div class="shortcut-list">' + rows.map(([k, v]) =>
      '<div class="shortcut-row"><span class="shortcut-key">' + escapeHtml(k) + '</span><span>' + escapeHtml(v) + '</span></div>').join('') +
      '</div><div class="mt-16"><button class="btn" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    this.openModal('modalGeneric');
  };

  /* ======================================================================
     Global bindings
     ====================================================================== */
  App.bindEnterprise = function () {
    const self = this;
    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) cmdInput.addEventListener('input', function () { self.cmdFilter(this.value); });
    if (cmdInput) cmdInput.addEventListener('keydown', function (e) { self.cmdKey(e); });
    const overlay = document.getElementById('cmdPalette');
    if (overlay) overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) self.closeCommandPalette(); });

    document.addEventListener('keydown', function (e) {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); self.openCommandPalette(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); self.printReport(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); self.downloadBackup(); return; }
      if (e.key === '?' && !typing) { e.preventDefault(); self.showShortcuts(); return; }
      if (e.altKey && /^[1-9]$/.test(e.key) && !typing) {
        const order = ['dashboard', 'departments', 'sections', 'rooms', 'staff', 'subjects', 'attendance', 'calendar', 'generator'];
        const panel = order[parseInt(e.key, 10) - 1];
        if (panel) { e.preventDefault(); self.showPanel(panel); }
      }
    });

    // Cross-tab live sync (multi-window / multi-tab reliability)
    let syncTimer = null;
    window.addEventListener('storage', function (e) {
      if (!e.key || !e.key.startsWith('tt_')) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(function () {
        try {
          self.loadAll();
          self.render();
          toast('Data updated from another tab', 'info');
        } catch (err) { console.warn(err); }
      }, 250);
    });

    // Base bindGlobal assigns these directly; rebind so paging resets and
    // enterprise filters (dept/status/sort) are applied by our renderers.
    const staffSearch = document.getElementById('staffSearch');
    if (staffSearch) staffSearch.oninput = function () { self._staffPage = 0; self.renderStaff(); };
    const subjectSearch = document.getElementById('subjectSearch');
    if (subjectSearch) subjectSearch.oninput = function () { self._subjectPage = 0; self.renderSubjects(); };
  };

  /* ======================================================================
     Method guard (role-based access)
     ====================================================================== */
  App._applyRoleGuards = function () {
    if (this._entGuardsApplied) return;
    const wrap = (name, cap) => {
      const orig = App[name];
      if (typeof orig !== 'function') return;
      const wrapped = function () {
        if (!this.userCaps()[cap]) {
          const u = this.currentUser();
          toast('Read-only role (' + u.role + ') cannot perform this action. Switch account from the top-right menu.', 'error');
          return;
        }
        return orig.apply(this, arguments);
      };
      wrapped._entGuarded = true;
      wrapped._entGuardCap = cap;
      App[name] = wrapped;
    };
    [
      'saveStaff', 'deleteStaff', 'clearAllStaff', 'saveSubject', 'deleteSubject', 'addDept', 'saveDept', 'deleteDept',
      'saveDeptRules', 'bulkApplySubjects', 'toggleAvailability', 'generateTimetable', 'clearSchedule', 'setAttendance',
      'markAllAttendance', 'markAbsentStaff', 'markPresentStaff', 'applySubstitutionPlan', 'applySubstitution',
      'revertSubstitution', 'addHoliday', 'removeHoliday', 'addCompDay', 'removeCompDay', 'setWorkingDays', 'resetToAuto',
      'handleImport', 'importExcelFile', 'importCSVFile', 'importJSONFile', 'loadSampleData', 'saveSection', 'deleteSection',
      'saveCurriculum', 'saveRoom', 'deleteRoom', 'duplicateRoom', 'saveOrgProfile', 'saveUser', 'deleteUser',
      'savePeriodTimes', 'savePrefs', 'runHealthFix', 'autofixAll', 'openAbsenceOptions', 'openSubstitutionPlanner',
      'confirmAutoAbsence', 'confirmAbsenceOnly'
    ].forEach((n) => wrap(n, 'write'));
    ['saveRules', 'saveSemester', 'saveOrgProfile', 'savePeriodTimes', 'savePrefs', 'saveUser', 'deleteUser', 'saveRegulationRules',
      'restoreVersion', 'deleteVersion', 'handleRestore'].forEach((n) => wrap(n, 'admin'));
    ['resetData', 'clearAuditLogs'].forEach((n) => wrap(n, 'owner'));
    this._entGuardsApplied = true;
  };

  /* ======================================================================
     Staff directory (enterprise)
     ====================================================================== */
  App.renderStaff = function () {
    const body = document.getElementById('staffTableBody');
    if (!body) return;
    const deptSel = document.getElementById('staffDeptFilter');
    if (deptSel) this.fillDeptSelect(deptSel, (this.data.staff || []).map((s) => s.dept));
    const q = (document.getElementById('staffSearch')?.value || '').toLowerCase().trim();
    const dept = deptSel?.value || '';
    const status = document.getElementById('staffStatusFilter')?.value || '';
    const sort = document.getElementById('staffSort')?.value || 'name';

    let rows = (this.data.staff || []).filter((s) => {
      const hay = [s.name, s.id, s.dept, (s.subjects || []).join(' ')].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!dept || s.dept === dept) && (!status || s.attendanceStatus === status);
    });
    const loadOf = (s) => this.ownLoad(s.id) + this.coverLoad(s.id);
    rows.sort((a, b) => {
      if (sort === 'dept') return (a.dept || '').localeCompare(b.dept || '') || a.name.localeCompare(b.name);
      if (sort === 'load') return loadOf(b) - loadOf(a) || a.name.localeCompare(b.name);
      if (sort === 'status') return (a.attendanceStatus === 'Absent' ? 0 : 1) - (b.attendanceStatus === 'Absent' ? 0 : 1) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

    this._staffSel = this._staffSel || new Set();
    [...this._staffSel].forEach((id) => { if (!rows.some((s) => s.id === id)) this._staffSel.delete(id); });
    this._staffPage = clamp(this._staffPage || 0, 0, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
    const pageRows = rows.slice(this._staffPage * PAGE, this._staffPage * PAGE + PAGE);
    const cnt = document.getElementById('staffCount');
    if (cnt) cnt.textContent = rows.length + ' of ' + this.data.staff.length + ' shown';

    body.innerHTML = pageRows.map((s) => {
      const own = this.ownLoad(s.id), cover = this.coverLoad(s.id), total = own + cover;
      const max = s.maxHoursPerWeek || this.config.maxWeekly;
      const p = pct(total, max);
      const isAbsent = s.attendanceStatus === 'Absent';
      const subs = (s.subjects || []);
      const expertChips = subs.slice(0, 2).map((c) => '<span class="chip" title="' + escapeAttr(this.subjectName(c)) + '">' + escapeHtml(c) + '</span>').join('') +
        (subs.length > 2 ? '<span class="chip muted">+' + (subs.length - 2) + '</span>' : '') || '<span class="text-muted">—</span>';
      return `<tr class="${isAbsent ? 'row-absent' : ''}">
        <td><input type="checkbox" ${this._staffSel.has(s.id) ? 'checked' : ''} onchange="TT.toggleStaffSel('${escapeAttr(s.id)}',this.checked)"/></td>
        <td><strong>${escapeHtml(s.id)}</strong></td>
        <td><a href="#" onclick="TT.openStaffProfile('${escapeAttr(s.id)}');return false" style="font-weight:700">${escapeHtml(s.name)}</a>
          <div class="text-muted" style="font-size:0.74rem">${escapeHtml(s.email || '')}</div></td>
        <td><span class="dept-pill">${escapeHtml(s.dept)}</span></td>
        <td style="font-size:0.8rem">${expertChips}</td>
        <td>
          <div class="load-line"><span>${own} own${cover ? ' + <b class="text-warning">' + cover + ' cover</b>' : ''}</span><b>${total}/${max}h</b></div>
          <div class="bar-track"><div class="bar-fill ${p >= 100 ? 'over' : p >= 80 ? 'warn' : ''}" style="width:${Math.min(100, p)}%"></div></div>
        </td>
        <td><span class="badge badge-${isAbsent ? 'danger' : 'success'}">${escapeHtml(s.attendanceStatus)}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-sm" onclick="TT.openStaffProfile('${escapeAttr(s.id)}')" title="Profile">Profile</button>
            <button class="btn btn-sm" onclick="TT.openStaffModal('${escapeAttr(s.id)}')" title="Edit">Edit</button>
            <button class="btn btn-sm ${isAbsent ? 'success' : 'danger'}" onclick="${isAbsent ? "TT.toggleAbsent('" + escapeAttr(s.id) + "')" : "TT.openAbsenceOptions('" + escapeAttr(s.id) + "')"}">${isAbsent ? 'Present' : 'Absent'}</button>
            <button class="btn btn-sm ghost" onclick="TT.openAvailability('${escapeAttr(s.id)}')" title="Availability">🗓</button>
            <button class="btn btn-sm danger" onclick="TT.deleteStaff('${escapeAttr(s.id)}')" title="Delete">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('') || emptyRow(8, 'No staff match these filters.');

    const pager = document.getElementById('staffPager');
    if (pager) pager.innerHTML = this.pagerHTML('staff', this._staffPage, Math.ceil(rows.length / PAGE), rows.length);

    const bulk = document.getElementById('staffBulkBar');
    if (bulk) {
      bulk.innerHTML = this._staffSel.size
        ? `<div class="bulk-inner"><b>${this._staffSel.size} selected</b>
            <button class="btn btn-sm success" onclick="TT.bulkStaffStatus('present')">Mark Present</button>
            <button class="btn btn-sm danger" onclick="TT.bulkStaffStatus('absent')">Mark Absent</button>
            <button class="btn btn-sm" onclick="TT.exportStaffCSV(true)">Export selected</button>
            <button class="btn btn-sm ghost" onclick="TT.clearStaffSel()">Clear</button></div>`
        : '<span class="text-muted" style="font-size:0.8rem">Select staff to run bulk actions · use the column header checkbox for the current page.</span>';
    }
    const all = document.getElementById('staffSelectAll');
    if (all) {
      const visibleIds = pageRows.map((s) => s.id);
      all.checked = visibleIds.length > 0 && visibleIds.every((id) => this._staffSel.has(id));
      all.indeterminate = !all.checked && visibleIds.some((id) => this._staffSel.has(id));
    }
  };

  App.pagerHTML = function (key, page, pages, total) {
    if (!pages || pages <= 1) return '<div class="pager-inner"><span class="text-muted">' + total + ' record' + (total === 1 ? '' : 's') + '</span></div>';
    const p = page + 1;
    return '<div class="pager-inner"><span class="text-muted">Page ' + p + ' of ' + pages + ' · ' + total + ' records</span>' +
      '<div class="pager-btns">' +
      '<button class="btn btn-sm" ' + (page <= 0 ? 'disabled' : '') + ' onclick="TT.pageTo(\'' + key + '\',' + (page - 1) + ')">‹ Prev</button>' +
      '<button class="btn btn-sm" ' + (page >= pages - 1 ? 'disabled' : '') + ' onclick="TT.pageTo(\'' + key + '\',' + (page + 1) + ')">Next ›</button>' +
      '</div></div>';
  };

  App.pageTo = function (key, page) {
    if (key === 'staff') { this._staffPage = page; this.renderStaff(); }
    else if (key === 'subjects') { this._subjectPage = page; this.renderSubjects(); }
    else if (key === 'audit') { this._auditPage = page; this.renderAudit(); }
  };

  App.toggleStaffSel = function (id, on) {
    this._staffSel = this._staffSel || new Set();
    if (on) this._staffSel.add(id); else this._staffSel.delete(id);
    this.renderStaff();
  };
  App.toggleAllStaff = function (on) {
    this._staffSel = this._staffSel || new Set();
    const q = (document.getElementById('staffSearch')?.value || '').toLowerCase().trim();
    const dept = document.getElementById('staffDeptFilter')?.value || '';
    const status = document.getElementById('staffStatusFilter')?.value || '';
    const rows = this.data.staff.filter((s) => {
      const hay = [s.name, s.id, s.dept, (s.subjects || []).join(' ')].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!dept || s.dept === dept) && (!status || s.attendanceStatus === status);
    }).sort((a, b) => a.name.localeCompare(b.name));
    const pageRows = rows.slice((this._staffPage || 0) * PAGE, (this._staffPage || 0) * PAGE + PAGE);
    pageRows.forEach((s) => { if (on) this._staffSel.add(s.id); else this._staffSel.delete(s.id); });
    this.renderStaff();
  };
  App.clearStaffSel = function () {
    this._staffSel = new Set();
    this.renderStaff();
  };
  App.bulkStaffStatus = function (mode) {
    if (!this._staffSel || !this._staffSel.size) return;
    const absent = mode === 'absent';
    if (!confirm((absent ? 'Mark ' : 'Mark ') + this._staffSel.size + ' selected faculty ' + (absent ? 'absent' : 'present') + '?')) return;
    let changed = 0, covered = 0, critical = 0;
    this._staffSel.forEach((id) => {
      const s = this.staffById(id);
      if (!s) return;
      if (absent && s.attendanceStatus !== 'Absent') {
        const r = this.markAbsentStaff(s, { date: null, mode: 'auto', silent: true });
        covered += r.success; critical += r.critical; changed++;
      } else if (!absent && s.attendanceStatus === 'Absent') {
        this.markPresentStaff(s, { date: null, silent: true }); changed++;
      }
    });
    this.audit('Bulk attendance (selected)', changed + ' faculty ' + (absent ? 'absent' : 'present'));
    toast(changed + ' staff updated' + (absent ? ' — ' + covered + ' covered, ' + critical + ' critical' : ''), absent && critical ? 'warn' : 'success');
    this._staffSel.clear();
    this.render();
  };

  App.openAvailability = function (id) {
    const s = this.staffById(id);
    if (!s) return;
    document.getElementById('modalTitle').textContent = 'Availability — ' + s.name;
    document.getElementById('modalBody').innerHTML = `
      <div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Mark slots this faculty member cannot take. Both the generator and the substitution engine respect these preferences.</div>
      <div id="availGrid"></div>
      <div class="mt-16"><button class="btn" onclick="TT.closeModal('modalGeneric')">Close</button></div>`;
    this.openModal('modalGeneric');
    const host = document.getElementById('availGrid');
    if (!host) return;
    const rec = this.availability().find((x) => x.staffId === id) || { staffId: id, unavailable: [] };
    let html = '<div class="tt-container"><table class="tt-table"><tr><th class="time-col">Day \\ Period</th>' +
      Array.from({ length: this.config.periods }, (_, i) => '<th>' + this.periodLabel(i + 1) + '</th>').join('') + '</tr>';
    this.DAYS.slice(0, this.config.days).forEach((day) => {
      html += '<tr><td class="time-col">' + day + '</td>' + Array.from({ length: this.config.periods }, (_, i) => {
        const p = i + 1;
        const un = (rec.unavailable || []).some((u) => u.day === day && u.period === p);
        return '<td class="tt-cell ' + (un ? 'conflict' : 'free') + '" style="' + (un ? '' : 'background:var(--accent-soft)') + '" onclick="TT.toggleAvailability(\'' + escapeAttr(id) + '\',\'' + day + '\',' + p + ',this)">' + (un ? '✗' : '✓') + '</td>';
      }).join('') + '</tr>';
    });
    host.innerHTML = html + '</table></div><div class="text-muted" style="font-size:0.78rem;margin-top:6px">✓ available · click to toggle ✗ unavailable</div>';
  };

  App.exportStaffCSV = function (selectedOnly) {
    const rows = [['Staff ID', 'Name', 'Department', 'Status', 'Email', 'Phone', 'Expertise', 'Own Slots', 'Cover Duties', 'Weekly Max', 'Daily Max', 'Max Consecutive']];
    const list = selectedOnly && this._staffSel && this._staffSel.size
      ? this.data.staff.filter((s) => this._staffSel.has(s.id))
      : this.data.staff;
    list.forEach((s) => rows.push([s.id, s.name, s.dept, s.attendanceStatus, s.email || '', s.phone || '',
      (s.subjects || []).join('; '), this.ownLoad(s.id), this.coverLoad(s.id), s.maxHoursPerWeek || '', s.maxHoursPerDay || '', s.maxConsec || '']));
    this.downloadCSV(rows, selectedOnly ? 'staff_selected.csv' : 'staff_directory.csv');
  };

  /* ======================================================================
     Subject catalogue (enterprise)
     ====================================================================== */
  App.renderSubjects = function () {
    const body = document.getElementById('subjectTableBody');
    if (!body) return;
    const deptSel = document.getElementById('subjectDeptFilter');
    if (deptSel) this.fillDeptSelect(deptSel, (this.data.subjects || []).map((s) => s.dept));
    const semSel = document.getElementById('subjectSemFilter');
    if (semSel) {
      const cur = semSel.value;
      const sems = [...new Set(this.data.subjects.map((s) => s.semester).filter((x) => x != null))].sort((a, b) => a - b);
      semSel.innerHTML = '<option value="">All Semesters</option>' + sems.map((n) => '<option value="' + n + '">Semester ' + n + '</option>').join('');
      if ([...semSel.options].some((o) => o.value === cur)) semSel.value = cur;
    }
    const q = (document.getElementById('subjectSearch')?.value || '').toLowerCase().trim();
    const dept = deptSel?.value || '';
    const type = document.getElementById('subjectTypeFilter')?.value || '';
    const sem = semSel?.value || '';
    let rows = this.data.subjects.filter((s) => {
      const hay = [s.code, s.name, s.dept].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!dept || s.dept === dept) && (!type || s.type === type) && (!sem || String(s.semester) === sem);
    });
    rows.sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || (a.semester || 0) - (b.semester || 0) || a.code.localeCompare(b.code));
    this._subjectPage = clamp(this._subjectPage || 0, 0, Math.max(0, Math.ceil(rows.length / PAGE) - 1));
    const pageRows = rows.slice(this._subjectPage * PAGE, this._subjectPage * PAGE + PAGE);
    const cnt = document.getElementById('subjectCount');
    if (cnt) cnt.textContent = rows.length + ' of ' + this.data.subjects.length + ' shown';

    body.innerHTML = pageRows.map((s) => {
      const experts = this.data.staff.filter((x) => (x.subjects || []).includes(s.code));
      const scheduled = this.teachingSlots().filter((x) => x.subjectCode === s.code).length;
      const expected = Math.max(1, s.type === 'Lab' ? Math.floor(s.hoursPerWeek / 2) : s.hoursPerWeek);
      const sessions = s.type === 'Lab' ? scheduled / 2 : scheduled;
      const cov = pct(sessions, expected);
      const ltpc = s.type === 'Lab' ? '0-0-' + (s.hoursPerWeek / 2) + '-' + s.credits : s.hoursPerWeek + '-0-0-' + s.credits;
      return `<tr>
        <td><b>${escapeHtml(s.code)}</b></td>
        <td>${escapeHtml(s.name)}<div class="text-muted" style="font-size:0.74rem">Semester ${escapeHtml(s.semester)}</div></td>
        <td><span class="dept-pill">${escapeHtml(s.dept)}</span></td>
        <td>${badge(s.type, s.type === 'Lab' ? 'info' : 'neutral')}</td>
        <td><span class="mono">${escapeHtml(ltpc)}</span></td>
        <td>${experts.length ? '<div class="chip-row">' + experts.slice(0, 2).map((e) => '<span class="chip" title="' + escapeAttr(e.name) + '">' + escapeHtml(e.id) + '</span>').join('') + (experts.length > 2 ? '<span class="chip muted">+' + (experts.length - 2) + '</span>' : '') + '</div>' : badge('None', 'danger')}</td>
        <td><div class="load-line"><span>${sessions}/${expected} sessions</span><b>${cov}%</b></div>
          <div class="bar-track"><div class="bar-fill ${cov >= 100 ? '' : cov >= 50 ? 'warn' : 'over'}" style="width:${Math.min(100, cov)}%"></div></div></td>
        <td><div class="row-actions">
          <button class="btn btn-sm" onclick="TT.openSubjectModal('${escapeAttr(s.code)}')">Edit</button>
          <button class="btn btn-sm" onclick="TT.assignExperts('${escapeAttr(s.code)}')">Experts</button>
          <button class="btn btn-sm danger" onclick="TT.deleteSubject('${escapeAttr(s.code)}')">Delete</button>
        </div></td>
      </tr>`;
    }).join('') || emptyRow(8, 'No subjects match these filters.');

    const pager = document.getElementById('subjectPager');
    if (pager) pager.innerHTML = this.pagerHTML('subjects', this._subjectPage, Math.ceil(rows.length / PAGE), rows.length);
  };

  App.assignExperts = function (code) {
    const sub = this.subjectByCode(code);
    if (!sub) { toast('Subject not found', 'error'); return; }
    const current = new Set(this.data.staff.filter((s) => (s.subjects || []).includes(code)).map((s) => s.id));
    const byDept = {};
    this.data.staff.forEach((s) => { (byDept[s.dept] = byDept[s.dept] || []).push(s); });
    document.getElementById('modalTitle').textContent = 'Expertise — ' + code + ' ' + sub.name;
    document.getElementById('modalBody').innerHTML = `
      <div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Select every faculty member qualified to teach <b>${escapeHtml(code)}</b>. Only selected faculty are assigned by the generator and ranked for substitution.</div>
      <div class="bulk-inner" style="margin-bottom:10px">
        <button class="btn btn-sm" onclick="TT.toggleExpertAll(true)">Select all</button>
        <button class="btn btn-sm" onclick="TT.toggleExpertAll(false)">Clear all</button>
        <span class="text-muted" style="font-size:0.8rem">${current.size} currently assigned</span>
      </div>
      <div class="expert-list">
        ${Object.keys(byDept).sort().map((d) => `<div class="expert-group"><div class="expert-group-head">${escapeHtml(d)}</div>
          ${byDept[d].map((s) => `<label class="expert-row"><input type="checkbox" class="expert-cb" value="${escapeAttr(s.id)}" ${current.has(s.id) ? 'checked' : ''}/>
            <span><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.id)} · ${s.dept === sub.dept ? 'home department' : 'cross-department'}</small></span></label>`).join('')}
        </div>`).join('')}
      </div>
      <div class="mt-16" style="display:flex;gap:8px">
        <button class="btn primary" onclick="TT.saveExperts('${escapeAttr(code)}')">Save expertise</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
      </div>`;
    this.openModal('modalGeneric');
  };
  App.toggleExpertAll = function (on) {
    document.querySelectorAll('.expert-cb').forEach((cb) => { cb.checked = !!on; });
  };
  App.saveExperts = function (code) {
    const chosen = new Set([...document.querySelectorAll('.expert-cb')].filter((cb) => cb.checked).map((cb) => cb.value));
    let added = 0, removed = 0;
    this.data.staff.forEach((s) => {
      const has = (s.subjects || []).includes(code);
      if (chosen.has(s.id) && !has) { s.subjects = (s.subjects || []).concat(code); added++; }
      else if (!chosen.has(s.id) && has) { s.subjects = s.subjects.filter((c) => c !== code); removed++; }
    });
    this.saveAll();
    this.audit('Subject expertise updated', code + ' +' + added + ' / −' + removed);
    toast('Expertise saved (' + chosen.size + ' faculty)', 'success');
    this.closeModal('modalGeneric');
    this.render();
  };

  App.exportSubjectsCSV = function () {
    const rows = [['Code', 'Name', 'Department', 'Type', 'Hours/Week', 'Credits', 'Semester', 'Experts', 'Scheduled Slots']];
    this.data.subjects.forEach((s) => rows.push([s.code, s.name, s.dept, s.type, s.hoursPerWeek, s.credits, s.semester,
      this.data.staff.filter((x) => (x.subjects || []).includes(s.code)).length,
      this.teachingSlots().filter((x) => x.subjectCode === s.code).length]));
    this.downloadCSV(rows, 'subject_catalogue.csv');
  };


  /* ======================================================================
     Departments overview (adds KPIs to the existing department surface)
     ====================================================================== */
  const baseDepartments = App.renderDepartments;
  App.renderDepartments = function () {
    baseDepartments.call(this);
    if (this.activeDeptTab !== 'dept-subj') return;
    const el = document.getElementById('deptContent');
    if (!el) return;
    el.insertAdjacentHTML('afterbegin', this.departmentsOverviewHTML());
  };

  App.departmentsOverviewHTML = function () {
    const codes = this.deptCodes();
    const totals = {
      sections: this.data.sections.length,
      students: this.data.sections.reduce((n, s) => n + num(s.strength), 0),
      staff: this.data.staff.length,
      subjects: this.data.subjects.length
    };
    const rows = codes.map((code) => {
      const secs = this.data.sections.filter((s) => s.dept === code);
      const subs = this.data.subjects.filter((s) => s.dept === code);
      const staff = this.data.staff.filter((s) => s.dept === code);
      const prescribed = secs.reduce((n, sec) => n + this.sectionStats(sec).prescribed, 0);
      const scheduled = this.teachingSlots().filter((s) => (this.sectionById(s.sectionId) || {}).dept === code).length;
      const cov = pct(scheduled, prescribed);
      const hod = (this.config.roles || []).find((r) => r.role === 'HOD' && r.dept === code);
      return `<div class="dept-card">
        <div class="dept-card-head"><span class="dept-pill">${escapeHtml(code)}</span><b>${escapeHtml((this.data.departments.find((d) => deptOf(d) === code) || {}).name || code)}</b></div>
        <div class="dept-metrics">
          <span><b>${secs.length}</b> sections</span><span><b>${staff.length}</b> faculty</span><span><b>${subs.length}</b> subjects</span>
        </div>
        <div class="load-line"><span>Delivery coverage</span><b>${cov}%</b></div>
        <div class="bar-track"><div class="bar-fill ${cov >= 90 ? '' : cov >= 60 ? 'warn' : 'over'}" style="width:${Math.min(100, cov)}%"></div></div>
        <div class="dept-card-foot"><span class="text-muted" style="font-size:0.76rem">${hod ? 'HOD · ' + escapeHtml(hod.name) : prescribed + ' prescribed hours'}</span>
          <button class="btn btn-sm" onclick="TT.openDeptSections('${escapeAttr(code)}')">Manage sections ›</button></div>
      </div>`;
    }).join('') || '<div class="empty-state">No departments yet.</div>';
    return `<div class="ent-kpis mt-16">
        <div class="ent-kpi"><div class="kpi-icon">🏢</div><div><div class="kpi-title">${codes.length} departments</div><div class="kpi-sub">${totals.sections} sections · ${totals.students} students</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">👥</div><div><div class="kpi-title">${totals.staff} faculty</div><div class="kpi-sub">${totals.subjects} subjects in catalogue</div></div></div>
        <div class="ent-kpi" onclick="TT.showPanel('sections')"><div class="kpi-icon">🎓</div><div><div class="kpi-title">Curriculum mapping</div><div class="kpi-sub">${this.data.sections.filter((s) => (s.subjects || []).length).length} of ${totals.sections} sections customised</div></div></div>
        <div class="ent-kpi" onclick="TT.showPanel('rooms')"><div class="kpi-icon">🏫</div><div><div class="kpi-title">${this.data.rooms.length} rooms</div><div class="kpi-sub">${this.data.rooms.filter((r) => r.type === 'Lab').length} labs · ${this.data.rooms.filter((r) => r.status === 'Maintenance').length} under maintenance</div></div></div>
      </div>
      <div class="card mt-16"><div class="ent-card-head"><span>Department performance</span><button class="btn btn-sm" onclick="TT.showPanel('sections')">Sections &amp; Curriculum</button></div>
        <div class="dept-grid">${rows}</div></div>`;
  };

  App.openDeptSections = function (code) {
    this.showPanel('sections');
    setTimeout(() => {
      const sel = document.getElementById('sectionDeptFilter');
      if (sel) { sel.value = code; }
      this.renderSections();
    }, 60);
  };

  /* ======================================================================
     Sections & Curriculum
     ====================================================================== */
  App.renderSections = function () {
    const host = document.getElementById('sectionsContent');
    if (!host) return;
    const deptSel = document.getElementById('sectionDeptFilter');
    if (deptSel) this.fillDeptSelect(deptSel, (this.data.sections || []).map((s) => s.dept));
    const semSel = document.getElementById('sectionSemFilter');
    if (semSel) {
      const cur = semSel.value;
      const sems = [...new Set(this.data.sections.map((s) => s.semester).filter((x) => x != null))].sort((a, b) => a - b);
      semSel.innerHTML = '<option value="">All Semesters</option>' + sems.map((n) => '<option value="' + n + '">Semester ' + n + '</option>').join('');
      if ([...semSel.options].some((o) => o.value === cur)) semSel.value = cur;
    }
    const q = (document.getElementById('sectionSearch')?.value || '').toLowerCase().trim();
    const dept = deptSel?.value || '';
    const sem = semSel?.value || '';
    const rows = this.data.sections.filter((s) => {
      const hay = [s.name, s.dept, s.id].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!dept || s.dept === dept) && (!sem || String(s.semester) === sem);
    }).sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || a.name.localeCompare(b.name));
    const cnt = document.getElementById('sectionCount');
    if (cnt) cnt.textContent = rows.length + ' of ' + this.data.sections.length + ' shown';

    const capacity = (this.config.days || 5) * (this.config.periods || 8);
    const stats = this.data.sections.map((s) => this.sectionStats(s));
    const totalPrescribed = stats.reduce((n, x) => n + x.prescribed, 0);
    const totalScheduled = stats.reduce((n, x) => n + x.scheduled, 0);
    const custom = this.data.sections.filter((s) => (s.subjects || []).length).length;
    const over = stats.filter((x) => x.over).length;

    const kpis = `<div class="ent-kpis">
      <div class="ent-kpi"><div class="kpi-icon">🎓</div><div><div class="kpi-title">${this.data.sections.length} sections</div><div class="kpi-sub">${this.data.sections.reduce((n, s) => n + num(s.strength), 0)} students enrolled</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">📚</div><div><div class="kpi-title">${totalPrescribed}h prescribed</div><div class="kpi-sub">${capacity}h weekly capacity per section</div></div></div>
      <div class="ent-kpi" onclick="TT.showPanel('reports')"><div class="kpi-icon">📈</div><div><div class="kpi-title">${pct(totalScheduled, totalPrescribed)}% delivered</div><div class="kpi-sub">${totalScheduled}h scheduled across all sections</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">${over ? '⚠️' : '✅'}</div><div><div class="kpi-title">${custom} custom curricula</div><div class="kpi-sub">${over ? over + ' section(s) over capacity' : 'All loads within weekly capacity'}</div></div></div>
    </div>`;

    const table = `<div class="table-wrap mt-16"><table>
      <thead><tr><th>Section</th><th>Department</th><th>Semester</th><th>Curriculum</th><th style="width:190px">Weekly Load</th><th style="width:170px">Delivery</th><th>Strength</th><th style="width:260px">Actions</th></tr></thead>
      <tbody>${rows.map((sec) => {
        const st = this.sectionStats(sec);
        const customMap = (sec.subjects || []).length;
        const cov = pct(st.scheduled, st.prescribed);
        return `<tr>
          <td><a href="#" onclick="TT.sectionTimetable('${escapeAttr(sec.id)}');return false" style="font-weight:700">${escapeHtml(sec.name)}</a>
            <div class="text-muted" style="font-size:0.74rem">${escapeHtml(sec.id)}${sec.homeRoom ? ' · ' + escapeHtml(sec.homeRoom) : ''}</div></td>
          <td><span class="dept-pill">${escapeHtml(sec.dept)}</span></td>
          <td>Sem ${escapeHtml(sec.semester)}<div class="text-muted" style="font-size:0.74rem">${escapeHtml(sec.year || '')}</div></td>
          <td>${customMap ? '<b>' + customMap + '</b> mapped' : '<span class="text-muted">Department default</span>'}
            <div class="text-muted" style="font-size:0.74rem">${st.subjects.length} subject(s) · ${st.prescribed}h</div></td>
          <td><div class="load-line"><span>${st.prescribed} / ${st.capacity}h</span><b>${pct(st.prescribed, st.capacity)}%</b></div>
            <div class="bar-track"><div class="bar-fill ${st.over ? 'over' : pct(st.prescribed, st.capacity) >= 85 ? 'warn' : ''}" style="width:${Math.min(100, pct(st.prescribed, st.capacity))}%"></div></div></td>
          <td><div class="load-line"><span>${st.scheduled} scheduled</span><b>${cov}%</b></div>
            <div class="bar-track"><div class="bar-fill ${cov >= 100 ? '' : cov >= 50 ? 'warn' : 'over'}" style="width:${Math.min(100, cov)}%"></div></div></td>
          <td>${num(sec.strength)}<div class="text-muted" style="font-size:0.74rem">students</div></td>
          <td><div class="row-actions">
            <button class="btn btn-sm" onclick="TT.openSectionModal('${escapeAttr(sec.id)}')">Edit</button>
            <button class="btn btn-sm primary" onclick="TT.openCurriculum('${escapeAttr(sec.id)}')">Curriculum</button>
            <button class="btn btn-sm" onclick="TT.sectionTimetable('${escapeAttr(sec.id)}')">Timetable</button>
            <button class="btn btn-sm danger" onclick="TT.deleteSection('${escapeAttr(sec.id)}')">Delete</button>
          </div></td>
        </tr>`;
      }).join('') || emptyRow(8, 'No sections match these filters. Add a section to start mapping the curriculum.')}</tbody>
    </table></div>`;
    host.innerHTML = kpis + table;
  };

  App.openSectionModal = function (id) {
    const s = id ? this.sectionById(id) : null;
    const depts = this.deptCodes();
    const rooms = this.data.rooms.filter((r) => r.status !== 'Maintenance');
    document.getElementById('modalTitle').textContent = s ? 'Edit Section' : 'Add Section';
    document.getElementById('modalBody').innerHTML = `
      <input type="hidden" id="sec_id0" value="${s ? escapeAttr(s.id) : ''}"/>
      <div class="form-row">
        <div class="form-group"><label>Section name</label><input id="sec_name" value="${s ? escapeAttr(s.name) : ''}" placeholder="e.g. CSE Sec C"/></div>
        <div class="form-group"><label>Department</label><select id="sec_dept">${depts.map((d) => `<option ${s && s.dept === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Semester</label><input type="number" id="sec_sem" min="1" max="12" value="${s ? s.semester : 3}"/></div>
        <div class="form-group"><label>Academic year</label><input type="number" id="sec_year" value="${s ? s.year : 2026}"/></div>
        <div class="form-group"><label>Class strength</label><input type="number" id="sec_strength" min="1" value="${s ? s.strength : 60}"/></div>
        <div class="form-group"><label>Home room (optional)</label><select id="sec_room"><option value="">No fixed room</option>${rooms.map((r) => `<option ${s && s.homeRoom === r.name ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select></div>
      </div>
      <div class="text-muted" style="font-size:0.82rem">Curriculum is inherited from the department unless you explicitly map subjects in the Curriculum dialog. Weekly capacity is ${(this.config.days || 5) * (this.config.periods || 8)} periods.</div>
      <div class="mt-16" style="display:flex;gap:8px">
        <button class="btn primary" onclick="TT.saveSection()">Save section</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
      </div>`;
    this.openModal('modalGeneric');
  };

  App.saveSection = function () {
    const oldId = document.getElementById('sec_id0').value;
    const name = document.getElementById('sec_name').value.trim();
    const dept = document.getElementById('sec_dept').value;
    const semester = parseInt(document.getElementById('sec_sem').value, 10) || 1;
    const year = parseInt(document.getElementById('sec_year').value, 10) || 2026;
    const strength = parseInt(document.getElementById('sec_strength').value, 10) || 60;
    const homeRoom = document.getElementById('sec_room').value || '';
    if (!name) { toast('Section name is required', 'error'); return; }
    if (this.data.sections.some((s) => s.id !== oldId && s.name.toLowerCase() === name.toLowerCase())) { toast('A section with this name already exists', 'error'); return; }
    let sec = oldId ? this.sectionById(oldId) : null;
    if (sec) Object.assign(sec, { name, dept, semester, year, strength, homeRoom });
    else {
      sec = { id: 'SEC' + Date.now().toString(36).toUpperCase(), name, dept, semester, year, strength, homeRoom, subjects: [] };
      this.data.sections.push(sec);
    }
    this.saveAll();
    this.audit(sec && oldId ? 'Section updated' : 'Section created', name + ' (' + dept + ')');
    toast('Section saved', 'success');
    this.closeModal('modalGeneric');
    this.render();
  };

  App.openCurriculum = function (id) {
    const sec = this.sectionById(id);
    if (!sec) return;
    this._curSection = id;
    const explicit = Array.isArray(sec.subjects) && sec.subjects.length;
    const selected = new Set(explicit ? sec.subjects : this.data.subjects.filter((s) => s.dept === sec.dept).map((s) => s.code));
    const byDept = {};
    this.data.subjects.forEach((s) => { (byDept[s.dept] = byDept[s.dept] || []).push(s); });
    const capacity = (this.config.days || 5) * (this.config.periods || 8);
    document.getElementById('modalTitle').textContent = 'Curriculum — ' + sec.name;
    document.getElementById('modalBody').innerHTML = `
      <div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">
        Choose the subjects prescribed for <b>${escapeHtml(sec.name)}</b>. ${explicit ? 'This section currently uses a custom curriculum.' : 'This section currently inherits the entire ' + escapeHtml(sec.dept) + ' department catalogue.'}
      </div>
      <div id="curSummary" class="cur-summary"></div>
      <div class="bulk-inner" style="margin:10px 0">
        <button class="btn btn-sm" onclick="TT.curSelectDept()">Select department subjects</button>
        <button class="btn btn-sm" onclick="TT.curSelectAll()">Select all</button>
        <button class="btn btn-sm" onclick="TT.curSelectNone()">Clear all</button>
      </div>
      <div class="curriculum-list">
        ${Object.keys(byDept).sort().map((d) => `<div class="cur-group"><div class="cur-group-head">${escapeHtml(d)}</div>
          ${byDept[d].map((s) => `<label class="cur-row ${s.dept !== sec.dept ? 'cross' : ''}"><input type="checkbox" class="cur-cb" value="${escapeAttr(s.code)}" data-hours="${num(s.hoursPerWeek)}" data-dept="${escapeAttr(s.dept)}" ${selected.has(s.code) ? 'checked' : ''} onchange="TT.updateCurriculumSummary()"/>
            <span><b>${escapeHtml(s.code)}</b> ${escapeHtml(s.name)}</span><small>${escapeHtml(s.type)} · ${s.hoursPerWeek}h · Sem ${s.semester}</small></label>`).join('')}
        </div>`).join('')}
      </div>
      <div class="mt-16" style="display:flex;gap:8px">
        <button class="btn primary" onclick="TT.saveCurriculum('${escapeAttr(id)}')">Save curriculum</button>
        <button class="btn" onclick="TT.openSectionModal('${escapeAttr(id)}')">Edit section</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
      </div>`;
    this.openModal('modalGeneric');
    this.updateCurriculumSummary();
  };

  App.updateCurriculumSummary = function () {
    const host = document.getElementById('curSummary');
    if (!host) return;
    const boxes = [...document.querySelectorAll('.cur-cb')];
    const hours = boxes.filter((b) => b.checked).reduce((n, b) => n + num(b.dataset.hours), 0);
    const capacity = (this.config.days || 5) * (this.config.periods || 8);
    const p = pct(hours, capacity);
    host.innerHTML = `<div class="load-line"><span><b>${boxes.filter((b) => b.checked).length}</b> subjects · <b>${hours}h</b> / ${capacity}h weekly capacity</span><b>${p}%</b></div>
      <div class="bar-track"><div class="bar-fill ${hours > capacity ? 'over' : p >= 85 ? 'warn' : ''}" style="width:${Math.min(100, p)}%"></div></div>
      ${hours > capacity ? '<div class="text-danger" style="font-size:0.8rem;margin-top:4px">Prescribed load exceeds weekly capacity — reduce hours or raise periods/day.</div>' : ''}`;
  };
  App.curSelectDept = function () {
    const sec = this.sectionById(this._curSection);
    if (!sec) return;
    document.querySelectorAll('.cur-cb').forEach((b) => { b.checked = b.dataset.dept === sec.dept; });
    this.updateCurriculumSummary();
  };
  App.curSelectAll = function () { document.querySelectorAll('.cur-cb').forEach((b) => { b.checked = true; }); this.updateCurriculumSummary(); };
  App.curSelectNone = function () { document.querySelectorAll('.cur-cb').forEach((b) => { b.checked = false; }); this.updateCurriculumSummary(); };

  App.saveCurriculum = function (id) {
    const sec = this.sectionById(id);
    if (!sec) return;
    const codes = [...document.querySelectorAll('.cur-cb')].filter((b) => b.checked).map((b) => b.value);
    if (!codes.length) { toast('Select at least one subject (or cancel to keep the department default)', 'error'); return; }
    sec.subjects = codes;
    this.saveAll();
    this.audit('Curriculum updated', sec.name + ': ' + codes.length + ' subject(s)');
    toast('Curriculum saved for ' + sec.name, 'success');
    this.closeModal('modalGeneric');
    this.render();
  };

  App.sectionTimetable = function (id) {
    const sec = this.sectionById(id);
    if (!sec) return;
    document.getElementById('modalTitle').textContent = sec.name + ' — Weekly Timetable';
    document.getElementById('modalBody').innerHTML = this.buildSectionGridHTML(id) +
      '<div class="mt-16" style="display:flex;gap:8px"><button class="btn" onclick="TT.openCurriculum(\'' + escapeAttr(id) + '\')">Curriculum</button>' +
      '<button class="btn" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    this.openModal('modalGeneric');
  };

  App.deleteSection = function (id) {
    const sec = this.sectionById(id);
    if (!sec) return;
    const slots = this.data.schedule.filter((s) => s.sectionId === id).length;
    if (!confirm('Delete ' + sec.name + (slots ? ' and remove its ' + slots + ' scheduled slot(s)' : '') + '?')) return;
    this.data.sections = this.data.sections.filter((s) => s.id !== id);
    this.data.schedule = this.data.schedule.filter((s) => s.sectionId !== id);
    this.saveAll();
    this.audit('Section deleted', sec.name);
    toast('Section deleted', 'success');
    this.render();
  };

  App.exportSectionsCSV = function () {
    const rows = [['Section ID', 'Name', 'Department', 'Semester', 'Year', 'Strength', 'Home Room', 'Curriculum Mapped', 'Subjects', 'Prescribed Hours', 'Scheduled Slots', 'Capacity']];
    this.data.sections.forEach((sec) => {
      const st = this.sectionStats(sec);
      rows.push([sec.id, sec.name, sec.dept, sec.semester, sec.year || '', num(sec.strength), sec.homeRoom || '',
        (sec.subjects || []).length ? 'Custom' : 'Department default', st.subjects.length, st.prescribed, st.scheduled, st.capacity]);
    });
    this.downloadCSV(rows, 'sections_curriculum.csv');
  };

  /* ======================================================================
     Rooms & Facilities
     ====================================================================== */
  App.roomBookings = function (name) {
    return this.teachingSlots().filter((s) => s.roomName === name);
  };
  App.roomUtil = function (room) {
    const bookings = this.roomBookings(room.name).length;
    const capacity = (this.config.days || 5) * (this.config.periods || 8);
    const conflicts = this.validateSchedule().filter((c) => c.type === 'room' && String(c.detail || '').includes(room.name)).length;
    return { bookings, capacity, pct: pct(bookings, capacity), conflicts };
  };

  App.renderRooms = function () {
    const host = document.getElementById('roomsContent');
    if (!host) return;
    const deptSel = document.getElementById('roomDeptFilter');
    if (deptSel) this.fillDeptSelect(deptSel, (this.data.rooms || []).map((r) => r.dept));
    const q = (document.getElementById('roomSearch')?.value || '').toLowerCase().trim();
    const type = document.getElementById('roomTypeFilter')?.value || '';
    const dept = deptSel?.value || '';
    const rows = this.data.rooms.filter((r) => {
      const hay = [r.name, r.dept, r.building, r.type, (r.facilities || []).join(' ')].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!type || r.type === type) && (!dept || r.dept === dept);
    }).sort((a, b) => (a.type || '').localeCompare(b.type || '') || a.name.localeCompare(b.name));
    const cnt = document.getElementById('roomCount');
    if (cnt) cnt.textContent = rows.length + ' of ' + this.data.rooms.length + ' shown';

    const util = this.data.rooms.map((r) => this.roomUtil(r));
    const totalSeats = this.data.rooms.reduce((n, r) => n + num(r.capacity), 0);
    const avgUtil = this.data.rooms.length ? Math.round(util.reduce((n, u) => n + u.pct, 0) / this.data.rooms.length) : 0;
    const roomConflicts = util.reduce((n, u) => n + u.conflicts, 0);
    const kpis = `<div class="ent-kpis">
      <div class="ent-kpi"><div class="kpi-icon">🏫</div><div><div class="kpi-title">${this.data.rooms.length} teaching spaces</div><div class="kpi-sub">${this.data.rooms.filter((r) => r.type === 'Lab').length} labs · ${totalSeats} total seats</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">📊</div><div><div class="kpi-title">${avgUtil}% average utilisation</div><div class="kpi-sub">${this.data.rooms.filter((r) => this.roomUtil(r).pct >= 80).length} room(s) above 80%</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">${roomConflicts ? '⚠️' : '✅'}</div><div><div class="kpi-title">${roomConflicts} room conflict(s)</div><div class="kpi-sub">${roomConflicts ? 'Resolve in Regulations → Conflict Audit' : 'No double bookings detected'}</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">🛠️</div><div><div class="kpi-title">${this.data.rooms.filter((r) => r.status === 'Maintenance').length} under maintenance</div><div class="kpi-sub">Excluded from generation</div></div></div>
    </div>`;

    const table = `<div class="table-wrap mt-16"><table>
      <thead><tr><th>Room</th><th>Type</th><th>Department</th><th>Building</th><th>Capacity</th><th>Facilities</th><th style="width:190px">Weekly utilisation</th><th>Status</th><th style="width:230px">Actions</th></tr></thead>
      <tbody>${rows.map((r) => {
        const u = this.roomUtil(r);
        return `<tr>
          <td><a href="#" onclick="TT.roomWeekView('${escapeAttr(r.name)}');return false" style="font-weight:700">${escapeHtml(r.name)}</a></td>
          <td>${badge(r.type, r.type === 'Lab' ? 'info' : 'neutral')}</td>
          <td><span class="dept-pill">${escapeHtml(r.dept)}</span></td>
          <td>${escapeHtml(r.building || '—')}</td>
          <td>${num(r.capacity)}</td>
          <td><div class="chip-row">${(r.facilities || []).slice(0, 2).map((f) => '<span class="chip">' + escapeHtml(f) + '</span>').join('')}${(r.facilities || []).length > 2 ? '<span class="chip muted">+' + (r.facilities.length - 2) + '</span>' : ''}</div></td>
          <td><div class="load-line"><span>${u.bookings} / ${u.capacity} slots</span><b>${u.pct}%</b></div>
            <div class="bar-track"><div class="bar-fill ${u.pct >= 90 ? 'over' : u.pct >= 70 ? 'warn' : ''}" style="width:${Math.min(100, u.pct)}%"></div></div></td>
          <td>${badge(r.status || 'Active', r.status === 'Maintenance' ? 'warning' : 'success')}</td>
          <td><div class="row-actions">
            <button class="btn btn-sm" onclick="TT.roomWeekView('${escapeAttr(r.name)}')">Week</button>
            <button class="btn btn-sm" onclick="TT.openRoomModal('${escapeAttr(r.name)}')">Edit</button>
            <button class="btn btn-sm" onclick="TT.duplicateRoom('${escapeAttr(r.name)}')">Copy</button>
            <button class="btn btn-sm danger" onclick="TT.deleteRoom('${escapeAttr(r.name)}')">Delete</button>
          </div></td>
        </tr>`;
      }).join('') || emptyRow(9, 'No rooms match these filters.')}</tbody>
    </table></div>`;
    host.innerHTML = kpis + table;
  };

  App.openRoomModal = function (name) {
    const r = name ? this.data.rooms.find((x) => x.name === name) : null;
    const depts = [...this.deptCodes(), 'GENERAL'];
    const facilities = ['Projector', 'Smart Board', 'Air Conditioning', 'Computers', 'Lab Equipment', 'Audio System', 'CCTV'];
    document.getElementById('modalTitle').textContent = r ? 'Edit Room' : 'Add Room';
    document.getElementById('modalBody').innerHTML = `
      <input type="hidden" id="rm_name0" value="${r ? escapeAttr(r.name) : ''}"/>
      <div class="form-row">
        <div class="form-group"><label>Room name / code</label><input id="rm_name" value="${r ? escapeAttr(r.name) : ''}" placeholder="e.g. CSE-CR3"/></div>
        <div class="form-group"><label>Type</label><select id="rm_type"><option ${r && r.type === 'Classroom' ? 'selected' : ''}>Classroom</option><option ${r && r.type === 'Lab' ? 'selected' : ''}>Lab</option><option ${r && r.type === 'Seminar Hall' ? 'selected' : ''}>Seminar Hall</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Department</label><select id="rm_dept">${depts.map((d) => `<option ${r && r.dept === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Building / block</label><input id="rm_building" value="${r ? escapeAttr(r.building || '') : 'Main Block'}"/></div>
        <div class="form-group"><label>Capacity (seats)</label><input type="number" id="rm_capacity" min="1" value="${r ? num(r.capacity) : 60}"/></div>
        <div class="form-group"><label>Status</label><select id="rm_status"><option ${r && r.status === 'Maintenance' ? '' : 'selected'}>Active</option><option ${r && r.status === 'Maintenance' ? 'selected' : ''}>Maintenance</option></select></div>
      </div>
      <div class="form-group"><label>Facilities</label>
        <div class="check-grid">${facilities.map((f) => `<label class="check"><input type="checkbox" class="rm-fac" value="${escapeAttr(f)}" ${r && (r.facilities || []).includes(f) ? 'checked' : ''}/> ${escapeHtml(f)}</label>`).join('')}</div>
      </div>
      <div class="text-muted" style="font-size:0.8rem">Rooms under maintenance are automatically excluded from timetable generation. Capacity is enforced against class strength.</div>
      <div class="mt-16" style="display:flex;gap:8px">
        <button class="btn primary" onclick="TT.saveRoom()">Save room</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
      </div>`;
    this.openModal('modalGeneric');
  };

  App.saveRoom = function () {
    const oldName = document.getElementById('rm_name0').value;
    const name = document.getElementById('rm_name').value.trim().toUpperCase();
    const type = document.getElementById('rm_type').value;
    const dept = document.getElementById('rm_dept').value;
    const building = document.getElementById('rm_building').value.trim();
    const capacity = parseInt(document.getElementById('rm_capacity').value, 10) || 60;
    const status = document.getElementById('rm_status').value;
    const facilities = [...document.querySelectorAll('.rm-fac')].filter((c) => c.checked).map((c) => c.value);
    if (!name) { toast('Room name is required', 'error'); return; }
    if (this.data.rooms.some((r) => r.name !== oldName && r.name === name)) { toast('A room with this name already exists', 'error'); return; }
    let room = oldName ? this.data.rooms.find((r) => r.name === oldName) : null;
    if (room) {
      Object.assign(room, { name, type, dept, building, capacity, status, facilities });
      if (oldName !== name) this.data.schedule.forEach((s) => { if (s.roomName === oldName) s.roomName = name; });
    } else {
      this.data.rooms.push({ name, type, dept, building, capacity, status, facilities });
    }
    this.saveAll();
    this.audit(room ? 'Room updated' : 'Room created', name + ' (' + type + ', ' + capacity + ' seats)');
    toast('Room saved', 'success');
    this.closeModal('modalGeneric');
    this.render();
  };

  App.duplicateRoom = function (name) {
    const r = this.data.rooms.find((x) => x.name === name);
    if (!r) return;
    let base = name + '-COPY', n = 2;
    while (this.data.rooms.some((x) => x.name === base)) base = name + '-COPY' + (n++);
    this.data.rooms.push(Object.assign({}, r, { name: base }));
    this.saveAll();
    this.audit('Room duplicated', name + ' → ' + base);
    toast('Room duplicated as ' + base, 'success');
    this.render();
  };

  App.deleteRoom = function (name) {
    const r = this.data.rooms.find((x) => x.name === name);
    if (!r) return;
    const n = this.data.schedule.filter((s) => s.roomName === name).length;
    if (!confirm('Delete ' + name + (n ? '? Its ' + n + ' scheduled slot(s) will be left without a room.' : '?'))) return;
    this.data.schedule.forEach((s) => { if (s.roomName === name) s.roomName = null; });
    this.data.rooms = this.data.rooms.filter((x) => x.name !== name);
    this.saveAll();
    this.audit('Room deleted', name);
    toast('Room deleted', 'success');
    this.render();
  };

  App.roomWeekView = function (name) {
    const room = this.data.rooms.find((r) => r.name === name);
    if (!room) return;
    const bookings = this.roomBookings(name);
    let html = '<div class="tt-container"><table class="tt-table"><tr><th class="time-col">Day \\ Period</th>' +
      Array.from({ length: this.config.periods }, (_, i) => '<th>' + this.periodLabel(i + 1) + '</th>').join('') + '</tr>';
    this.DAYS.slice(0, this.config.days).forEach((day) => {
      html += '<tr><td class="time-col">' + day + '</td>' + Array.from({ length: this.config.periods }, (_, i) => {
        const p = i + 1;
        const slot = bookings.find((s) => s.day === day && s.period === p);
        if (!slot) return '<td class="tt-cell free"><span class="text-muted">Free</span></td>';
        return '<td class="tt-cell slot"><span class="slot-subject">' + escapeHtml(slot.subjectCode) + '</span><span class="slot-teacher">' + escapeHtml(this.sectionName(slot.sectionId)) + '</span><span class="slot-room">' + escapeHtml(this.staffName(this.effTeacher(slot))) + '</span></td>';
      }).join('') + '</tr>';
    });
    html += '</table></div>';
    document.getElementById('modalTitle').textContent = name + ' — Weekly Occupancy';
    document.getElementById('modalBody').innerHTML = `<div class="text-muted" style="font-size:0.85rem;margin-bottom:8px">${escapeHtml(room.type)} · ${num(room.capacity)} seats · ${escapeHtml(room.building || '')} · ${bookings.length} booking(s)</div>` + html +
      '<div class="mt-16"><button class="btn" onclick="TT.closeModal(\'modalGeneric\')">Close</button></div>';
    this.openModal('modalGeneric');
  };

  App.exportRoomsCSV = function () {
    const rows = [['Room', 'Type', 'Department', 'Building', 'Capacity', 'Facilities', 'Status', 'Bookings', 'Utilisation %']];
    this.data.rooms.forEach((r) => {
      const u = this.roomUtil(r);
      rows.push([r.name, r.type, r.dept, r.building || '', num(r.capacity), (r.facilities || []).join('; '), r.status || 'Active', u.bookings, u.pct]);
    });
    this.downloadCSV(rows, 'rooms_facilities.csv');
  };

  /* ======================================================================
     Daily attendance (filters, date navigation, exports)
     ====================================================================== */
  App.renderAttendance = function () {
    const body = document.getElementById('attendanceTableBody');
    if (!body) return;
    const dateEl = document.getElementById('attDate');
    if (dateEl && !dateEl.value) dateEl.value = todayISO();
    const date = dateEl ? dateEl.value : todayISO();
    const wd = weekdayOf(date);
    const deptSel = document.getElementById('attDeptFilter');
    if (deptSel) this.fillDeptSelect(deptSel, (this.data.staff || []).map((s) => s.dept));
    const dept = deptSel?.value || '';
    const status = document.getElementById('attStatusFilter')?.value || '';
    const q = (document.getElementById('attSearch')?.value || '').toLowerCase().trim();
    const scopeEl = document.getElementById('attWeekScope');
    if (scopeEl && scopeEl.dataset.entBound !== '1') {
      scopeEl.dataset.entBound = '1';
      scopeEl.onchange = () => this.renderAttendance();
    }
    const rows = this.data.staff.filter((s) => {
      const hay = [s.name, s.id, s.dept].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (!dept || s.dept === dept) && (!status || s.attendanceStatus === status);
    });
    const holiday = (this.data.holidays || []).find((h) => h.date === date);
    const comp = (this.data.compDays || []).find((c) => c.date === date);

    // summary
    const host = document.getElementById('attendanceSummary');
    if (host) {
      const present = this.data.staff.filter((s) => s.attendanceStatus !== 'Absent').length;
      const absent = this.data.staff.filter((s) => s.attendanceStatus === 'Absent').length;
      const uncovered = this.teachingSlots().filter((sl) => !this.effTeacher(sl)).length;
      const affected = (wd && this.DAYS.includes(wd))
        ? this.teachingSlots().filter((sl) => sl.day === wd && this.data.staff.some((f) => f.id === (sl.originalTeacherId || sl.teacherId) && f.attendanceStatus === 'Absent')).length
        : 0;
      const state = holiday
        ? '<div class="cal-alert warning">🎌 <b>' + escapeHtml(holiday.name) + '</b> — declared holiday, no classes are expected.</div>'
        : comp
          ? '<div class="cal-alert warning">🔁 Compensatory day — follows the <b>' + escapeHtml(comp.follows) + '</b> timetable.</div>'
          : wd && !this.DAYS.includes(wd)
            ? '<div class="cal-alert info">Weekend — no scheduled classes on ' + escapeHtml(wd) + '.</div>'
            : '';
      host.innerHTML = `<div class="att-summary">
        <div class="att-stat"><span class="att-num" style="color:var(--accent)">${present}</span><span class="att-lbl">Present</span></div>
        <div class="att-stat"><span class="att-num" style="color:${absent ? 'var(--danger)' : 'var(--text-muted)'}">${absent}</span><span class="att-lbl">Absent</span></div>
        <div class="att-stat"><span class="att-num">${affected}</span><span class="att-lbl">Affected Slots</span></div>
        <div class="att-stat"><span class="att-num" style="color:${uncovered ? 'var(--danger)' : 'var(--accent)'}">${uncovered}</span><span class="att-lbl">Uncovered</span></div>
        <div class="att-actions">
          <div class="text-muted" style="font-size:0.8rem;margin-bottom:6px">Applying to: <b>${scopeEl && scopeEl.checked ? 'the whole week' : escapeHtml(date) + ' (' + escapeHtml(wd || 'Weekend') + ')'}</b></div>
          <button class="btn btn-sm primary" onclick="TT.showPanel('substitution')">Open Substitution Planner</button>
        </div>
      </div>${state}`;
    }

    body.innerHTML = rows.map((s) => {
      const slotsToday = (wd && this.DAYS.includes(wd))
        ? this.teachingSlots().filter((sl) => sl.day === wd && ((sl.originalTeacherId || sl.teacherId) === s.id || sl.currentTeacherId === s.id)).length
        : 0;
      const isAbsent = s.attendanceStatus === 'Absent';
      const covering = this.coverLoad(s.id);
      const affected = this.slotsToCover(s, date).filter((sl) => this.effTeacher(sl) === s.id).length;
      const periods = (wd && this.DAYS.includes(wd))
        ? this.teachingSlots().filter((sl) => sl.day === wd && this.effTeacher(sl) === s.id).map((sl) => 'P' + sl.period).sort().join(' ')
        : '';
      return `<tr class="${isAbsent ? 'row-absent' : ''}">
        <td><strong>${escapeHtml(s.id)}</strong></td>
        <td><a href="#" onclick="TT.openStaffProfile('${escapeAttr(s.id)}');return false" style="font-weight:700">${escapeHtml(s.name)}</a>
          ${periods ? '<div class="text-muted" style="font-size:0.72rem">' + escapeHtml(periods) + '</div>' : ''}</td>
        <td><span class="dept-pill">${escapeHtml(s.dept)}</span></td>
        <td>
          <label class="toggle ${isAbsent ? 'on' : ''}" title="${isAbsent ? 'Absent' : 'Present'} — click to change">
            <input type="checkbox" ${isAbsent ? 'checked' : ''} onchange="TT.setAttendance('${escapeAttr(s.id)}', this.checked)"/>
            <span class="track"><span class="thumb"></span></span>
            <span class="toggle-label">${isAbsent ? 'Absent' : 'Present'}</span>
          </label>
        </td>
        <td>${wd && this.DAYS.includes(wd) ? slotsToday : '<span class="text-muted">—</span>'}${covering ? `<div class="text-muted" style="font-size:0.76rem">${covering} cover dut${covering === 1 ? 'y' : 'ies'}</div>` : ''}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm" onclick="TT.openSubstitutionPlanner('${escapeAttr(s.id)}')">${isAbsent ? 'Rearrange Cover' : 'Plan Cover'}${affected ? ' (' + affected + ')' : ''}</button>
          <button class="btn btn-sm" onclick="TT.openStaffModal('${escapeAttr(s.id)}')">Details</button>
        </div></td>
      </tr>`;
    }).join('') || emptyRow(6, 'No staff match these filters.');
    this.renderAttendanceLog();
  };

  App.shiftAttDate = function (n) {
    const el = document.getElementById('attDate');
    if (!el) return;
    el.value = addDays(el.value || todayISO(), n);
    this.renderAttendance();
  };
  App.jumpAttToday = function () {
    const el = document.getElementById('attDate');
    if (el) el.value = todayISO();
    this.renderAttendance();
  };

  App.exportAttendanceCSV = function () {
    const date = document.getElementById('attDate')?.value || todayISO();
    const wd = weekdayOf(date);
    const rows = [['Date', 'Day', 'Staff ID', 'Name', 'Department', 'Status', 'Classes Today', 'Cover Duties', 'Weekly Max']];
    this.data.staff.forEach((s) => {
      const slots = (wd && this.DAYS.includes(wd)) ? this.teachingSlots().filter((sl) => sl.day === wd && this.effTeacher(sl) === s.id).length : 0;
      rows.push([date, wd || 'Weekend', s.id, s.name, s.dept, s.attendanceStatus, slots, this.coverLoad(s.id), s.maxHoursPerWeek || this.config.maxWeekly]);
    });
    this.downloadCSV(rows, 'attendance_' + date + '.csv');
  };

  /* ======================================================================
     Academic calendar (month view)
     ====================================================================== */
  const baseCalendar = App.renderCalendar;
  App.renderCalendar = function () {
    baseCalendar.call(this);
    try { this.renderCalendarMonth(); } catch (e) { console.error('Calendar month', e); }
  };

  App.renderCalendarMonth = function () {
    const host = document.getElementById('calMonthGrid');
    if (!host) return;
    if (!this._calCursor) { const n = new Date(); this._calCursor = new Date(n.getFullYear(), n.getMonth(), 1); }
    const cursor = this._calCursor;
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const label = document.getElementById('calMonthLabel');
    if (label) label.textContent = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const today = todayISO();
    const semStart = this.config.semStart, semEnd = this.config.semEnd;
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(y, m, 1 - startOffset);
    const holidays = new Map((this.data.holidays || []).map((h) => [h.date, h]));
    const comps = new Map((this.data.compDays || []).map((c) => [c.date, c]));
    const term = this.termProgress();

    let html = '<div class="cal-term"><div class="load-line"><span><b>Term progress</b> · ' + escapeHtml(semStart || '—') + ' → ' + escapeHtml(semEnd || '—') + ' · ' + term.left + ' days left</span><b>' + term.pct + '%</b></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + term.pct + '%"></div></div></div>';
    html += '<div class="cal-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => '<div class="cal-dow">' + d + '</div>').join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = iso(d);
      const inMonth = d.getMonth() === m;
      const dow = d.getDay();
      const h = holidays.get(key);
      const c = comps.get(key);
      const inTerm = key >= semStart && key <= semEnd;
      const cls = ['cal-cell'];
      if (!inMonth) cls.push('other');
      if (dow === 0 || dow === 6) cls.push('weekend');
      if (h) cls.push('holiday');
      if (c) cls.push('comp');
      if (key === today) cls.push('today');
      if (inTerm && !h && dow !== 0 && dow !== 6) cls.push('working');
      const dots = (h ? '<i class="cal-dot holiday"></i>' : '') + (c ? '<i class="cal-dot comp"></i>' : '');
      html += '<div class="' + cls.join(' ') + '" onclick="TT.calDay(\'' + key + '\')" title="' + escapeAttr((h ? h.name + ' · ' : '') + (c ? 'Follows ' + c.follows : '')) + '">' +
        '<div class="cal-cell-top"><span>' + d.getDate() + '</span><span class="cal-dots">' + dots + '</span></div>' +
        (h ? '<div class="cal-label">' + escapeHtml(h.name) + '</div>' : c ? '<div class="cal-label">' + escapeHtml(c.follows) + '</div>' : inTerm ? '<div class="cal-label muted">Working day</div>' : '') +
        '</div>';
    }
    html += '</div>';
    host.innerHTML = html;
  };

  App.shiftCalMonth = function (n) {
    if (!this._calCursor) this._calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    this._calCursor = new Date(this._calCursor.getFullYear(), this._calCursor.getMonth() + n, 1);
    this.renderCalendarMonth();
  };
  App.jumpCalMonth = function () {
    const n = new Date();
    this._calCursor = new Date(n.getFullYear(), n.getMonth(), 1);
    this.renderCalendarMonth();
  };
  App.focusHolidayForm = function () {
    const el = document.getElementById('holDate');
    if (el && !el.value) el.value = todayISO();
    const name = document.getElementById('holName');
    if (name) setTimeout(() => name.focus(), 80);
  };
  App.calDay = function (key) {
    const h = (this.data.holidays || []).find((x) => x.date === key);
    const c = (this.data.compDays || []).find((x) => x.date === key);
    const wd = weekdayOf(key);
    const sessions = (wd && this.DAYS.includes(wd)) ? this.teachingSlots().filter((s) => s.day === wd).length : 0;
    document.getElementById('modalTitle').textContent = key + ' — ' + (wd || 'Weekend');
    document.getElementById('modalBody').innerHTML = `
      <div class="kv"><span>Day type</span><b>${h ? 'Holiday' : c ? 'Compensatory working day' : wd && !this.DAYS.includes(wd) ? 'Weekend' : 'Working day'}</b></div>
      <div class="kv"><span>Scheduled teaching slots</span><b>${sessions}</b></div>
      <div class="kv"><span>In term</span><b>${key >= this.config.semStart && key <= this.config.semEnd ? 'Yes' : 'No'}</b></div>
      ${h ? '<div class="kv"><span>Holiday</span><b>' + escapeHtml(h.name) + '</b></div>' : ''}
      ${c ? '<div class="kv"><span>Follows timetable</span><b>' + escapeHtml(c.follows) + '</b> · ' + escapeHtml(c.reason || '') + '</div>' : ''}
      <div class="mt-16" style="display:flex;gap:8px;flex-wrap:wrap">
        ${h ? '<button class="btn danger" onclick="TT.removeHoliday(\'' + escapeAttr(key) + '\');TT.closeModal(\'modalGeneric\')">Remove holiday</button>'
            : '<button class="btn primary" onclick="TT.quickAddHoliday(\'' + escapeAttr(key) + '\')">+ Mark as holiday</button>'}
        ${c ? '<button class="btn danger" onclick="TT.removeCompDay(\'' + escapeAttr(key) + '\');TT.closeModal(\'modalGeneric\')">Remove compensatory day</button>'
            : '<button class="btn" onclick="TT.quickAddComp(\'' + escapeAttr(key) + '\')">+ Compensatory day</button>'}
        <button class="btn" onclick="TT.showPanel('attendance');document.getElementById('attDate').value='${escapeAttr(key)}';TT.renderAttendance();TT.closeModal('modalGeneric')">Take attendance</button>
      </div>`;
    this.openModal('modalGeneric');
  };
  App.quickAddHoliday = function (key) {
    const name = prompt('Holiday name', 'Declared holiday');
    if (!name) return;
    const el = document.getElementById('holDate'); if (el) el.value = key;
    const nm = document.getElementById('holName'); if (nm) nm.value = name;
    this.addHoliday();
    this.closeModal('modalGeneric');
  };
  App.quickAddComp = function (key) {
    const follows = prompt('Follow timetable of which day? (Monday…Saturday)', 'Saturday');
    if (!follows) return;
    const el = document.getElementById('compDate'); if (el) el.value = key;
    const f = document.getElementById('compFollows'); if (f) f.value = follows;
    const r = document.getElementById('compReason'); if (r) r.value = 'Compensatory for loss of classes';
    this.addCompDay();
    this.closeModal('modalGeneric');
  };
  App.exportCalendarCSV = function () {
    const rows = [['Date', 'Day', 'Type', 'Name / Follows', 'Reason']];
    this.data.holidays.forEach((h) => rows.push([h.date, weekdayOf(h.date) || '', 'Holiday', h.name, '']));
    this.data.compDays.forEach((c) => rows.push([c.date, weekdayOf(c.date) || '', 'Compensatory', c.follows, c.reason || '']));
    this.downloadCSV(rows, 'academic_calendar.csv');
  };

  /* ======================================================================
     Reports & load analytics
     ====================================================================== */
  App.renderReports = function () {
    const el = document.getElementById('reportsContent');
    if (!el) return;
    const deptSel = document.getElementById('reportDeptFilter');
    if (deptSel) this.fillDeptSelect(deptSel, (this.data.staff || []).map((s) => s.dept));
    const dept = deptSel?.value || '';
    const scope = document.getElementById('reportScope')?.value || 'all';
    const onlyIssues = !!document.getElementById('reportOnlyIssues')?.checked;
    const staff = this.data.staff.filter((s) => !dept || s.dept === dept);
    const sections = this.data.sections.filter((s) => !dept || s.dept === dept);
    const secIds = new Set(sections.map((s) => s.id));
    const slots = this.teachingSlots().filter((s) => secIds.has(s.sectionId));
    const conflicts = this.validateSchedule();
    const uncovered = slots.filter((s) => !this.effTeacher(s)).length;
    const noBackup = slots.filter((s) => !s.backupTeacherId).length;
    const overloaded = staff.filter((s) => this.slotLoad(s.id) > (s.maxHoursPerWeek || this.config.maxWeekly));
    const backupCov = pct(slots.filter((s) => s.backupTeacherId).length, slots.length);
    const subs = this.data.substitutions;
    const covered = subs.filter((s) => s.status === 'success').length;
    const critical = subs.filter((s) => s.status === 'critical').length;
    const score = this.qualityScore();
    const today = todayISO(), wd = weekdayOf(today);
    const todaySlots = (wd && this.DAYS.includes(wd)) ? slots.filter((s) => s.day === wd) : [];
    const cnt = document.getElementById('reportCount');
    if (cnt) cnt.textContent = slots.length + ' slots · ' + staff.length + ' faculty';

    const dayRows = this.DAYS.slice(0, this.config.days).map((d) => {
      const n = slots.filter((s) => s.day === d).length;
      const max = Math.max(1, ...this.DAYS.slice(0, this.config.days).map((x) => slots.filter((s) => s.day === x).length));
      return '<div class="dept-row"><span class="dept-code">' + d + '</span><span class="dept-bar"><i style="width:' + pct(n, max) + '%"></i></span><span class="dept-pct">' + n + '</span></div>';
    }).join('');

    const facultyRows = staff.map((s) => {
      const own = this.ownLoad(s.id), cover = this.coverLoad(s.id), total = own + cover;
      const max = s.maxHoursPerWeek || this.config.maxWeekly;
      const p = pct(total, max);
      const issue = total > max || s.attendanceStatus === 'Absent';
      if (onlyIssues && !issue) return '';
      return `<tr>
        <td><b>${escapeHtml(s.name)}</b><div class="text-muted" style="font-size:0.74rem">${escapeHtml(s.id)}</div></td>
        <td><span class="dept-pill">${escapeHtml(s.dept)}</span></td>
        <td>${own}</td><td style="${cover ? 'color:var(--warning);font-weight:700' : ''}">${cover || '—'}</td>
        <td><b>${total}</b> / ${max}</td>
        <td><div class="bar-track"><div class="bar-fill ${p >= 100 ? 'over' : p >= 80 ? 'warn' : ''}" style="width:${Math.min(100, p)}%"></div></div></td>
        <td>${s.attendanceStatus === 'Absent' ? badge('Absent', 'danger') : total > max ? badge('Over', 'danger') : total >= max * 0.85 ? badge('Near cap', 'warning') : badge('OK', 'success')}</td>
      </tr>`;
    }).join('');

    const sectionRows = sections.map((sec) => {
      const st = this.sectionStats(sec);
      const cov = pct(st.scheduled, st.prescribed);
      if (onlyIssues && cov >= 100) return '';
      return `<tr><td><b>${escapeHtml(sec.name)}</b><div class="text-muted" style="font-size:0.74rem">${escapeHtml(sec.dept)} · Sem ${escapeHtml(sec.semester)}</div></td>
        <td>${st.subjects.length}</td><td>${st.prescribed}h</td><td>${st.scheduled}</td>
        <td><div class="bar-track"><div class="bar-fill ${cov >= 100 ? '' : cov >= 50 ? 'warn' : 'over'}" style="width:${Math.min(100, cov)}%"></div></div></td>
        <td>${badge(cov + '%', cov >= 100 ? 'success' : cov >= 60 ? 'warning' : 'danger')}</td></tr>`;
    }).join('');

    const roomRows = this.data.rooms.map((r) => {
      const u = this.roomUtil(r);
      if (onlyIssues && u.conflicts === 0) return '';
      return `<tr><td><b>${escapeHtml(r.name)}</b></td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.dept)}</td><td>${u.bookings}</td>
        <td><div class="bar-track"><div class="bar-fill ${u.pct >= 90 ? 'over' : u.pct >= 70 ? 'warn' : ''}" style="width:${Math.min(100, u.pct)}%"></div></div></td>
        <td>${u.pct}%</td><td>${u.conflicts ? badge(u.conflicts + ' conflict(s)', 'danger') : badge('Clean', 'success')}</td></tr>`;
    }).join('');

    const subRows = subs.slice(0, 12).map((r) =>
      `<tr><td>${escapeHtml(r.date || 'week-wide')}</td><td>${escapeHtml(this.staffName(r.absentTeacher))}</td>
       <td>${r.substitute ? escapeHtml(this.staffName(r.substitute)) : '<b class="text-danger">Uncovered</b>'}</td>
       <td>${escapeHtml(this.sectionName(r.sectionId))} · ${escapeHtml(r.subjectCode || '')}</td>
       <td>${escapeHtml(r.day || '')} P${escapeHtml(r.period || '')}</td>
       <td>${badge(r.status || 'info', r.status === 'success' ? 'success' : r.status === 'reverted' ? 'neutral' : 'danger')}</td></tr>`).join('') ||
      '<tr><td colspan="6" class="empty-state">No substitution records.</td></tr>';

    el.innerHTML = `
      <div class="ent-kpis mt-16">
        <div class="ent-kpi"><div class="kpi-ring" style="--v:${score};--c:${score >= 85 ? 'var(--accent)' : score >= 65 ? 'var(--warning)' : 'var(--danger)'}"><b>${score}</b></div><div><div class="kpi-title">Quality score</div><div class="kpi-sub">Conflicts, coverage &amp; workload</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">📚</div><div><div class="kpi-title">${slots.length} teaching slots</div><div class="kpi-sub">${sections.length} sections · ${this.pct(slots.length, sections.length * (this.config.days * this.config.periods))}% timetable fill</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">${conflicts.length ? '⚠️' : '✅'}</div><div><div class="kpi-title">${conflicts.length} conflict(s)</div><div class="kpi-sub">${uncovered} uncovered · ${noBackup} without backup</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">🔁</div><div><div class="kpi-title">${covered} covered · ${critical} critical</div><div class="kpi-sub">${backupCov}% backup coverage</div></div></div>
      </div>
      ${scope === 'today' ? `<div class="card mt-16"><div class="ent-card-head"><span>📅 Today's teaching load (${escapeHtml(today)} · ${escapeHtml(wd || 'Weekend')})</span>${badge(todaySlots.length + ' sessions', 'info')}</div>
        <div class="table-wrap"><table><thead><tr><th>Period</th><th>Time</th><th>Section</th><th>Subject</th><th>Faculty</th><th>Room</th></tr></thead><tbody>
        ${todaySlots.sort((a, b) => a.period - b.period).map((s) => `<tr><td>P${s.period}</td><td>${escapeHtml(this.periodTime(s.period).start || '')}</td><td>${escapeHtml(this.sectionName(s.sectionId))}</td><td>${escapeHtml(this.subjectCode || s.subjectCode)} ${escapeHtml(this.subjectName(s.subjectCode))}</td><td>${escapeHtml(this.staffName(this.effTeacher(s)))}</td><td>${escapeHtml(s.roomName || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-state">No classes today.</td></tr>'}
        </tbody></table></div></div>` : ''}
      <div class="two-col mt-16">
        <div class="card"><div class="ent-card-head"><span>📊 Load distribution</span><button class="btn btn-sm" onclick="TT.showPanel('calendar')">Calendar</button></div><div class="dept-list">${dayRows}</div>
          <div class="ent-subhead">Department coverage</div>
          ${this.deptCodes().map((code) => {
            const st = sections.filter((s) => s.dept === code).map((s) => this.sectionStats(s));
            const pre = st.reduce((n, x) => n + x.prescribed, 0), sch = st.reduce((n, x) => n + x.scheduled, 0);
            return '<div class="dept-row"><span class="dept-code">' + escapeHtml(code) + '</span><span class="dept-bar"><i style="width:' + pct(sch, pre) + '%"></i></span><span class="dept-pct">' + pct(sch, pre) + '%</span></div>';
          }).join('') || '<div class="text-muted" style="font-size:0.84rem">No departments.</div>'}
        </div>
        <div class="card"><div class="ent-card-head"><span>🔁 Substitution activity</span><button class="btn btn-sm" onclick="TT.showPanel('substitution')">Open planner</button></div>
          <div class="load-summary"><div><b>${subs.length}</b><small>Total</small></div><div><b>${covered}</b><small>Covered</small></div><div><b>${critical}</b><small>Critical</small></div><div><b>${subs.filter((s) => s.status === 'reverted').length}</b><small>Reverted</small></div></div>
          <div class="table-wrap mt-16"><table><thead><tr><th>Date</th><th>Absent</th><th>Cover</th><th>Class</th><th>Slot</th><th>Status</th></tr></thead><tbody>${subRows}</tbody></table></div>
        </div>
      </div>
      <div class="card mt-16"><div class="ent-card-head"><span>👥 Faculty workload</span><span class="text-muted" style="font-size:0.8rem">${overloaded.length} overloaded · ${staff.length} faculty</span></div>
        <div class="table-wrap"><table><thead><tr><th>Faculty</th><th>Dept</th><th>Own</th><th>Cover</th><th>Total / Max</th><th style="width:30%">Load</th><th>Status</th></tr></thead>
        <tbody>${facultyRows || '<tr><td colspan="7" class="empty-state">No faculty match this view.</td></tr>'}</tbody></table></div></div>
      <div class="card mt-16"><div class="ent-card-head"><span>🎓 Curriculum coverage</span><button class="btn btn-sm" onclick="TT.showPanel('sections')">Mapping</button></div>
        <div class="table-wrap"><table><thead><tr><th>Section</th><th>Subjects</th><th>Prescribed</th><th>Scheduled</th><th style="width:28%">Coverage</th><th>Status</th></tr></thead>
        <tbody>${sectionRows || '<tr><td colspan="6" class="empty-state">No sections match this view.</td></tr>'}</tbody></table></div></div>
      <div class="card mt-16"><div class="ent-card-head"><span>🏫 Room utilisation</span><button class="btn btn-sm" onclick="TT.showPanel('rooms')">Rooms</button></div>
        <div class="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Dept</th><th>Bookings</th><th style="width:28%">Utilisation</th><th>%</th><th>Health</th></tr></thead>
        <tbody>${roomRows || '<tr><td colspan="7" class="empty-state">No room issues.</td></tr>'}</tbody></table></div></div>
      <div class="card mt-16"><div class="ent-card-head"><span>🧩 Conflict details</span><span class="text-muted" style="font-size:0.8rem">${conflicts.length} item(s)</span></div>
        <div class="table-wrap"><table><thead><tr><th>Type</th><th>Detail</th><th>Day</th><th>Period</th></tr></thead>
        <tbody>${conflicts.map((c) => `<tr><td>${badge(c.type, 'danger')}</td><td>${escapeHtml(c.detail || '')}</td><td>${escapeHtml(c.day || '')}</td><td>${escapeHtml(c.period || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">No conflicts detected.</td></tr>'}</tbody></table></div></div>`;
  };

  App.pct = pct;

  App.exportReportCSV = function () {
    const rows = [['Report', 'Value']];
    const teaching = this.teachingSlots();
    rows.push(['Generated at', new Date().toISOString()]);
    rows.push(['Institution', this.config.institution || '']);
    rows.push(['Academic year', this.config.academicYear || '']);
    rows.push(['Quality score', this.qualityScore()]);
    rows.push(['Departments', this.data.departments.length]);
    rows.push(['Sections', this.data.sections.length]);
    rows.push(['Staff', this.data.staff.length]);
    rows.push(['Subjects', this.data.subjects.length]);
    rows.push(['Rooms', this.data.rooms.length]);
    rows.push(['Teaching slots', teaching.length]);
    rows.push(['Conflicts', this.validateSchedule().length]);
    rows.push(['Uncovered slots', teaching.filter((s) => !this.effTeacher(s)).length]);
    rows.push(['Backup coverage %', pct(teaching.filter((s) => s.backupTeacherId).length, teaching.length)]);
    rows.push(['Substitutions covered', this.data.substitutions.filter((s) => s.status === 'success').length]);
    rows.push(['Substitutions critical', this.data.substitutions.filter((s) => s.status === 'critical').length]);
    rows.push([]);
    rows.push(['Faculty', 'Department', 'Own', 'Cover', 'Total', 'Max']);
    this.data.staff.forEach((s) => rows.push([s.name, s.dept, this.ownLoad(s.id), this.coverLoad(s.id), this.slotLoad(s.id), s.maxHoursPerWeek || this.config.maxWeekly]));
    rows.push([]);
    rows.push(['Section', 'Department', 'Prescribed hours', 'Scheduled slots', 'Coverage %']);
    this.data.sections.forEach((sec) => { const st = this.sectionStats(sec); rows.push([sec.name, sec.dept, st.prescribed, st.scheduled, pct(st.scheduled, st.prescribed)]); });
    this.downloadCSV(rows, 'management_report.csv');
  };

  /* ======================================================================
     Regulations & compliance
     ====================================================================== */
  const baseRegulations = App.renderRegulations;
  App.renderRegulations = function () {
    baseRegulations.call(this);
    const el = document.getElementById('regulationsContent');
    if (!el) return;
    let pairs = 0, ok = 0;
    this.data.sections.forEach((sec) => {
      this.subjectsForSection(sec).forEach((sub) => {
        pairs++;
        const slots = this.teachingSlots().filter((s) => s.sectionId === sec.id && s.subjectCode === sub.code).length;
        if (slots >= sub.hoursPerWeek) ok++;
      });
    });
    const conflicts = this.validateSchedule().length;
    const overloaded = this.data.staff.filter((s) => this.slotLoad(s.id) > (s.maxHoursPerWeek || this.config.maxWeekly)).length;
    const compliance = pct(ok, pairs);
    const mapped = this.data.sections.filter((s) => (s.subjects || []).length).length;
    el.insertAdjacentHTML('afterbegin', `<div class="ent-kpis mt-16">
      <div class="ent-kpi"><div class="kpi-ring" style="--v:${compliance};--c:${compliance >= 90 ? 'var(--accent)' : compliance >= 60 ? 'var(--warning)' : 'var(--danger)'}"><b>${compliance}</b></div><div><div class="kpi-title">Curriculum compliance</div><div class="kpi-sub">${ok} of ${pairs} section-subject pairs fully scheduled</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">${conflicts ? '⚠️' : '✅'}</div><div><div class="kpi-title">${conflicts} conflict(s)</div><div class="kpi-sub">Across ${this.teachingSlots().length} teaching slots</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">⏱</div><div><div class="kpi-title">${overloaded} overloaded faculty</div><div class="kpi-sub">Weekly cap ${this.config.maxWeekly}h · daily ${this.config.maxDaily}h</div></div></div>
      <div class="ent-kpi"><div class="kpi-icon">🎓</div><div><div class="kpi-title">${mapped} custom curricula</div><div class="kpi-sub">Remaining sections use department defaults</div></div></div>
    </div><div class="card mt-16"><div class="ent-card-head"><span>Compliance actions</span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" onclick="TT.exportComplianceCSV()">⬇ Export compliance</button><button class="btn btn-sm" onclick="TT.showPanel('sections')">Curriculum mapping</button><button class="btn btn-sm" onclick="TT.runHealthCheck();TT.showPanel('admin')">Health check</button></div></div></div>`);
  };

  App.regComplianceHTML = function () {
    return `<div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Verifies every section receives its prescribed weekly load under its curriculum (Theory L-hours, Lab 2-hour sessions) and that credit totals are consistent.</div>
      <div class="table-wrap"><table>
      <thead><tr><th>Section</th><th>Subject</th><th>Type</th><th>L / T / P (prescribed)</th><th>Prescribed hours</th><th>Scheduled</th><th>Status</th></tr></thead>
      <tbody>${this.data.sections.map((sec) => {
        const subs = this.subjectsForSection(sec);
        if (!subs.length) return '<tr><td>' + escapeHtml(sec.name) + '</td><td colspan="6" class="text-muted">No subjects mapped.</td></tr>';
        return subs.map((sub) => {
          const slots = this.teachingSlots().filter((s) => s.sectionId === sec.id && s.subjectCode === sub.code).length;
          const ok = slots >= sub.hoursPerWeek;
          const ltpc = sub.type === 'Lab' ? '0-0-' + (sub.hoursPerWeek / 2) + '-' + sub.credits : sub.hoursPerWeek + '-0-0-' + sub.credits;
          return `<tr><td>${escapeHtml(sec.name)}</td><td><b>${escapeHtml(sub.code)}</b> ${escapeHtml(sub.name)}</td>
            <td>${badge(sub.type, sub.type === 'Lab' ? 'info' : 'neutral')}</td><td>${ltpc}</td><td>${sub.hoursPerWeek}</td><td>${slots}</td>
            <td>${badge(ok ? 'Compliant' : 'Short by ' + (sub.hoursPerWeek - slots) + 'h', ok ? 'success' : 'danger')}</td></tr>`;
        }).join('');
      }).join('') || '<tr><td colspan="7" class="empty-state">No sections.</td></tr>'}</tbody></table></div>`;
  };

  App.regRulesHTML = function () {
    return `<div class="text-muted" style="font-size:0.85rem;margin-bottom:12px">Institution-wide planning rules. Changes apply to the next timetable generation.</div>
      <div class="form-row">
        <div class="form-group"><label>Max hours / week</label><input type="number" id="rr_week" min="1" value="${this.config.maxWeekly}"/></div>
        <div class="form-group"><label>Max hours / day</label><input type="number" id="rr_day" min="1" value="${this.config.maxDaily}"/></div>
        <div class="form-group"><label>Max consecutive periods</label><input type="number" id="rr_consec" min="1" value="${this.config.maxConsec}"/></div>
        <div class="form-group"><label>Teaching days / week</label><input type="number" id="rr_days" min="1" max="6" value="${this.config.days}"/></div>
        <div class="form-group"><label>Periods / day</label><input type="number" id="rr_periods" min="1" max="12" value="${this.config.periods}"/></div>
        <div class="form-group"><label>Casual leave / year</label><input type="number" id="rr_casual" min="0" value="${this.config.leaveCasualLimit}"/></div>
        <div class="form-group"><label>Sick leave / year</label><input type="number" id="rr_sick" min="0" value="${this.config.leaveSickLimit}"/></div>
        <div class="form-group" style="justify-content:flex-end"><label class="switch-scope"><input type="checkbox" id="rr_holidays" ${this.config.respectHolidays ? 'checked' : ''}/> Respect holidays during planning</label></div>
      </div>
      <button class="btn primary" onclick="TT.saveRegulationRules()">Save regulation rules</button>`;
  };

  App.saveRegulationRules = function () {
    const v = (id, d) => parseInt(document.getElementById(id)?.value, 10) || d;
    this.config.maxWeekly = v('rr_week', this.config.maxWeekly);
    this.config.maxDaily = v('rr_day', this.config.maxDaily);
    this.config.maxConsec = v('rr_consec', this.config.maxConsec);
    this.config.days = clamp(v('rr_days', this.config.days), 1, 6);
    this.config.periods = clamp(v('rr_periods', this.config.periods), 1, 12);
    this.config.leaveCasualLimit = v('rr_casual', this.config.leaveCasualLimit);
    this.config.leaveSickLimit = v('rr_sick', this.config.leaveSickLimit);
    const h = document.getElementById('rr_holidays');
    if (h) this.config.respectHolidays = h.checked;
    LS('tt_config', this.config);
    this.audit('Regulation rules saved', 'weekly=' + this.config.maxWeekly + ' daily=' + this.config.maxDaily + ' consec=' + this.config.maxConsec + ' days=' + this.config.days + ' periods=' + this.config.periods);
    toast('Regulation rules saved', 'success');
    this.render();
  };

  App.exportComplianceCSV = function () {
    const rows = [['Section', 'Department', 'Subject Code', 'Subject', 'Type', 'Prescribed Hours', 'Scheduled', 'Compliant']];
    this.data.sections.forEach((sec) => {
      this.subjectsForSection(sec).forEach((sub) => {
        const slots = this.teachingSlots().filter((s) => s.sectionId === sec.id && s.subjectCode === sub.code).length;
        rows.push([sec.name, sec.dept, sub.code, sub.name, sub.type, sub.hoursPerWeek, slots, slots >= sub.hoursPerWeek ? 'Yes' : 'No']);
      });
    });
    this.downloadCSV(rows, 'regulatory_compliance.csv');
  };

  /* ======================================================================
     Audit log (advanced filters)
     ====================================================================== */
  App.renderAudit = function () {
    const el = document.getElementById('auditContent');
    if (!el) return;
    const logs = this.data.auditLogs || [];
    const actions = [...new Set(logs.map((l) => l.action))].sort();
    const users = [...new Set(logs.map((l) => l.user || 'Admin'))].sort();
    const q = (this._auditFilter || '').toLowerCase();
    const action = this._auditAction || '';
    const user = this._auditUser || '';
    const from = this._auditFrom || '';
    const to = this._auditTo || '';
    const filtered = logs.filter((l) => {
      const day = (l.ts || '').slice(0, 10);
      return (!q || (l.action + ' ' + l.detail).toLowerCase().includes(q)) &&
        (!action || l.action === action) && (!user || (l.user || 'Admin') === user) &&
        (!from || day >= from) && (!to || day <= to);
    });
    const pageSize = 20;
    this._auditPage = clamp(this._auditPage || 0, 0, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
    const pageLogs = filtered.slice(this._auditPage * pageSize, this._auditPage * pageSize + pageSize);
    const today = todayISO();

    el.innerHTML = `<div class="ent-kpis mt-16">
        <div class="ent-kpi"><div class="kpi-icon">📝</div><div><div class="kpi-title">${logs.length} audit entries</div><div class="kpi-sub">Full mutation history</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">📅</div><div><div class="kpi-title">${logs.filter((l) => (l.ts || '').slice(0, 10) === today).length} today</div><div class="kpi-sub">${filtered.length} match current filters</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">👤</div><div><div class="kpi-title">${users.length} actor(s)</div><div class="kpi-sub">${actions.length} distinct action types</div></div></div>
        <div class="ent-kpi"><div class="kpi-icon">💾</div><div><div class="kpi-title">Retention</div><div class="kpi-sub">${this.config.auditRetention || 5000} entries max</div></div></div>
      </div>
      <div class="card mt-16">
        <div class="toolbar">
          <input id="auditFilter" placeholder="Search action or detail…" value="${escapeAttr(this._auditFilter || '')}" oninput="TT._auditFilter=this.value;TT._auditPage=0;TT.renderAudit()"/>
          <select onchange="TT._auditAction=this.value;TT._auditPage=0;TT.renderAudit()"><option value="">All actions</option>${actions.map((a) => `<option ${a === action ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select>
          <select onchange="TT._auditUser=this.value;TT._auditPage=0;TT.renderAudit()"><option value="">All users</option>${users.map((u) => `<option ${u === user ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('')}</select>
          <input type="date" value="${escapeAttr(from)}" title="From date" onchange="TT._auditFrom=this.value;TT._auditPage=0;TT.renderAudit()"/>
          <input type="date" value="${escapeAttr(to)}" title="To date" onchange="TT._auditTo=this.value;TT._auditPage=0;TT.renderAudit()"/>
          <button class="btn btn-sm" onclick="TT._auditFilter='';TT._auditAction='';TT._auditUser='';TT._auditFrom='';TT._auditTo='';TT._auditPage=0;TT.renderAudit()">Reset</button>
          <button class="btn btn-sm" onclick="TT.exportAuditCSV()">CSV</button>
          <button class="btn btn-sm" onclick="TT.exportAuditJSON()">JSON</button>
          <button class="btn btn-sm danger" onclick="TT.clearAuditLogs()">Clear</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th style="width:170px">Time</th><th style="width:220px">Action</th><th>Detail</th><th style="width:130px">User</th></tr></thead>
          <tbody>${pageLogs.map((l) => `<tr>
            <td style="font-size:0.8rem">${new Date(l.ts).toLocaleString()}</td>
            <td><b>${escapeHtml(l.action)}</b></td>
            <td style="font-size:0.84rem">${escapeHtml(l.detail)}</td>
            <td><span class="chip">${escapeHtml(l.user || 'Admin')}</span></td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty-state">No audit entries match these filters.</td></tr>'}</tbody>
        </table></div>
        ${this.pagerHTML('audit', this._auditPage, Math.ceil(filtered.length / pageSize), filtered.length)}
      </div>`;
    if (this._auditFocus) {
      const input = document.getElementById(this._auditFocus);
      if (input) { input.focus(); if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length); }
      this._auditFocus = null;
    }
  };
  // Keep focus stable while typing in the live audit search.
  const baseAudit = App.renderAudit;
  App.renderAudit = function () {
    baseAudit.call(this);
    const input = document.getElementById('auditFilter');
    if (input) {
      input.addEventListener('focus', function () { App._auditFocus = 'auditFilter'; });
      if (App._auditFocus) { input.focus(); if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length); }
    }
  };

  App.exportAuditJSON = function () {
    const blob = new Blob([JSON.stringify(this.data.auditLogs || [], null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit_log.json'; a.click();
    toast('Audit log exported', 'success');
  };

  App.clearAuditLogs = function () {
    if (!confirm('Clear the entire audit log? This cannot be undone. Consider exporting it first.')) return;
    this.data.auditLogs = [];
    LS('tt_audit_logs', []);
    this.audit('Audit log cleared', 'by ' + this.currentUser().name);
    this.render();
    toast('Audit log cleared', 'success');
  };

  /* ======================================================================
     Administration
     ====================================================================== */
  App.renderAdmin = function () {
    const host = document.getElementById('adminContent');
    if (!host) return;
    const c = this.config;
    const me = this.currentUser();
    const u = this.currentUser();
    const roles = c.roles || [];
    const times = c.periodTimes && c.periodTimes.length ? c.periodTimes : this.defaultPeriodTimes();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('tt_'));
    const bytes = keys.reduce((n, k) => n + (localStorage.getItem(k) || '').length, 0);
    const keyRows = keys.sort().map((k) => {
      const raw = localStorage.getItem(k) || '';
      return `<div class="kv"><span class="mono">${escapeHtml(k)}</span><span class="text-muted">${Math.round(raw.length / 1024 * 10) / 10} KB</span></div>`;
    }).join('');

    host.innerHTML = `
      <div class="two-col">
        <div class="card">
          <div class="ent-card-head"><span>🏛 Institution profile</span><button class="btn btn-sm primary" onclick="TT.saveOrgProfile()">Save</button></div>
          <div class="form-row">
            <div class="form-group"><label>Institution name</label><input id="org_name" value="${escapeAttr(c.institution || '')}"/></div>
            <div class="form-group"><label>Short name / brand</label><input id="org_short" value="${escapeAttr(c.orgShort || '')}"/></div>
            <div class="form-group"><label>Institution code</label><input id="org_code" value="${escapeAttr(c.orgCode || '')}"/></div>
            <div class="form-group"><label>Email</label><input id="org_email" value="${escapeAttr(c.orgEmail || '')}"/></div>
            <div class="form-group"><label>Phone</label><input id="org_phone" value="${escapeAttr(c.orgPhone || '')}"/></div>
            <div class="form-group"><label>Academic year</label><input id="org_year" value="${escapeAttr(c.academicYear || '')}"/></div>
            <div class="form-group full"><label>Address</label><input id="org_address" value="${escapeAttr(c.orgAddress || '')}"/></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Term start</label><input type="date" id="org_start" value="${escapeAttr(c.semStart || '')}"/></div>
            <div class="form-group"><label>Term end</label><input type="date" id="org_end" value="${escapeAttr(c.semEnd || '')}"/></div>
            <div class="form-group"><label>Current semester</label><input type="number" id="org_sem" min="1" value="${c.semester || 1}"/></div>
          </div>
        </div>
        <div class="card">
          <div class="ent-card-head"><span>👤 Current session</span><button class="btn btn-sm" onclick="TT.openProfileMenu()">Switch</button></div>
          <div class="account-head" style="border:none;padding:0">
            <div class="account-avatar">${escapeHtml(initials(me.name))}</div>
            <div style="flex:1"><div style="font-weight:800">${escapeHtml(me.name)}</div><div class="text-muted" style="font-size:0.84rem">${escapeHtml(me.email || '')}</div>
            <div class="mt-8">${badge(me.role, ROLE_MATRIX[me.role] && ROLE_MATRIX[me.role].write ? 'success' : 'warning')}</div></div>
          </div>
          <div class="ent-subhead">Preferences</div>
          <label class="check"><input type="checkbox" id="pref_autoprocess" ${c.autoProcess ? 'checked' : ''}/> Auto-process due leaves and uncovered slots</label>
          <label class="check"><input type="checkbox" id="pref_autosnapshot" ${c.autoSnapshot ? 'checked' : ''}/> Automatic timetable snapshots</label>
          <label class="check"><input type="checkbox" id="pref_attendance" ${c.notifyPrefs.attendance ? 'checked' : ''}/> Notify on attendance changes</label>
          <label class="check"><input type="checkbox" id="pref_conflicts" ${c.notifyPrefs.conflicts ? 'checked' : ''}/> Notify on new conflicts</label>
          <label class="check"><input type="checkbox" id="pref_leaves" ${c.notifyPrefs.leaves ? 'checked' : ''}/> Notify on planned leaves</label>
          <label class="check"><input type="checkbox" id="pref_substitution" ${c.notifyPrefs.substitution ? 'checked' : ''}/> Notify on substitution outcomes</label>
          <button class="btn primary mt-8" onclick="TT.savePrefs()">Save preferences</button>
        </div>
      </div>

      <div class="card mt-16">
        <div class="ent-card-head"><span>🛡 Users &amp; roles</span><div style="display:flex;gap:6px"><button class="btn btn-sm" onclick="TT.openUserModal()">+ Add user</button><button class="btn btn-sm" onclick="TT.showPermissions()">Permission matrix</button></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Email</th><th>Status</th><th style="width:200px">Actions</th></tr></thead>
          <tbody>${roles.map((r) => `<tr class="${r.id === u.id ? 'row-current' : ''}">
            <td><b>${escapeHtml(r.name)}</b><div class="text-muted" style="font-size:0.74rem">${escapeHtml(r.id)}</div></td>
            <td>${badge(r.role, r.role === 'Administrator' ? 'success' : r.role === 'Faculty' || r.role === 'Viewer' ? 'warning' : 'info')}</td>
            <td>${escapeHtml(r.dept || '—')}</td><td style="font-size:0.82rem">${escapeHtml(r.email || '')}</td>
            <td>${r.id === u.id ? badge('Active session', 'success') : r.active === false ? badge('Inactive', 'neutral') : badge('Active', 'success')}</td>
            <td><div class="row-actions">
              ${r.id === u.id ? '<span class="text-muted" style="font-size:0.78rem">Signed in</span>' : `<button class="btn btn-sm" onclick="TT.switchUser('${escapeAttr(r.id)}')">Switch</button>`}
              <button class="btn btn-sm" onclick="TT.openUserModal('${escapeAttr(r.id)}')">Edit</button>
              <button class="btn btn-sm danger" onclick="TT.deleteUser('${escapeAttr(r.id)}')">Delete</button>
            </div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>

      <div class="two-col mt-16">
        <div class="card">
          <div class="ent-card-head"><span>⏰ Period timings</span><button class="btn btn-sm primary" onclick="TT.savePeriodTimes()">Save timings</button></div>
          <div class="text-muted" style="font-size:0.82rem;margin-bottom:8px">Used across attendance, room views and printed reports. Period 5 follows a lunch break.</div>
          <div class="period-table">
            <div class="period-row head"><span>Period</span><span>Start</span><span>End</span></div>
            ${times.map((t) => `<div class="period-row"><b>P${t.period}</b>
              <input type="time" class="pt-start" data-period="${t.period}" value="${escapeAttr(t.start || '')}"/>
              <input type="time" class="pt-end" data-period="${t.period}" value="${escapeAttr(t.end || '')}"/></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="ent-card-head"><span>🩺 Data health</span><button class="btn btn-sm primary" onclick="TT.runHealthCheck()">Run check</button></div>
          <div id="healthResults">${this._health ? this.healthHTML() : '<div class="text-muted" style="font-size:0.85rem">Run a check to validate cross-entity integrity — expertise, curriculum capacity, schedule references, backups and conflicts.</div>'}</div>
        </div>
      </div>

      <div class="card mt-16">
        <div class="ent-card-head"><span>💾 Local storage</span><span class="text-muted" style="font-size:0.8rem">${keys.length} keys · ${Math.round(bytes / 1024)} KB</span></div>
        <div class="two-col">
          <div>${keyRows}</div>
          <div>
            <div class="ent-subhead">Data operations</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn" onclick="TT.downloadBackup()">⬇ Download backup</button>
              <button class="btn" onclick="TT.snapshotVersion('manual snapshot')">📸 Snapshot timetable</button>
              <button class="btn" onclick="TT.showPanel('settings')">⚙ Backup &amp; versions</button>
            </div>
            <div class="ent-subhead">Audit retention</div>
            <div class="text-muted" style="font-size:0.84rem">Logs are capped at ${c.auditRetention || 5000} entries. Export before clearing older records.</div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
              <button class="btn btn-sm" onclick="TT.showPanel('audit')">Open audit log</button>
              <button class="btn btn-sm danger" onclick="TT.clearAuditLogs()">Clear audit log</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card mt-16">
        <div class="ent-card-head"><span>ℹ System information</span></div>
        <div class="info-grid">
          <div><span>Application</span><b>College Timetable Enterprise</b></div>
          <div><span>Version</span><b>2.1 Enterprise</b></div>
          <div><span>Storage engine</span><b>Browser localStorage</b></div>
          <div><span>Offline capability</span><b>Core features available</b></div>
          <div><span>Last backup</span><b>${escapeHtml(c.lastBackupAt ? new Date(c.lastBackupAt).toLocaleString() : 'Not recorded')}</b></div>
          <div><span>Active user</span><b>${escapeHtml(u.name)} · ${escapeHtml(u.role)}</b></div>
        </div>
      </div>`;
  };

  App.saveOrgProfile = function () {
    const g = (id, d) => { const el = document.getElementById(id); return el ? el.value.trim() : d; };
    const start = g('org_start', this.config.semStart), end = g('org_end', this.config.semEnd);
    if (start && end && end < start) { toast('Term end must be after term start', 'error'); return; }
    this.config.institution = g('org_name', this.config.institution);
    this.config.orgShort = g('org_short', this.config.orgShort);
    this.config.orgCode = g('org_code', this.config.orgCode);
    this.config.orgEmail = g('org_email', this.config.orgEmail);
    this.config.orgPhone = g('org_phone', this.config.orgPhone);
    this.config.academicYear = g('org_year', this.config.academicYear);
    this.config.orgAddress = g('org_address', this.config.orgAddress);
    this.config.semStart = start || this.config.semStart;
    this.config.semEnd = end || this.config.semEnd;
    this.config.semester = parseInt(g('org_sem', this.config.semester), 10) || 1;
    LS('tt_config', this.config);
    this.audit('Institution profile saved', this.config.institution + ' · ' + this.config.academicYear);
    toast('Institution profile saved', 'success');
    this.render();
  };

  App.savePrefs = function () {
    const chk = (id, d) => { const el = document.getElementById(id); return el ? el.checked : d; };
    this.config.autoProcess = chk('pref_autoprocess', true);
    this.config.autoSnapshot = chk('pref_autosnapshot', true);
    this.config.notifyPrefs = {
      attendance: chk('pref_attendance', true),
      conflicts: chk('pref_conflicts', true),
      leaves: chk('pref_leaves', true),
      substitution: chk('pref_substitution', true),
      weeklyDigest: !!this.config.notifyPrefs.weeklyDigest
    };
    LS('tt_config', this.config);
    this.audit('Preferences saved', JSON.stringify(this.config.notifyPrefs));
    toast('Preferences saved', 'success');
  };

  App.savePeriodTimes = function () {
    const rows = [...document.querySelectorAll('.pt-start')].map((el) => {
      const p = parseInt(el.dataset.period, 10);
      const endEl = document.querySelector('.pt-end[data-period="' + p + '"]');
      return { period: p, start: el.value, end: endEl ? endEl.value : '' };
    });
    const invalid = rows.find((r) => !r.start || !r.end);
    if (invalid) { toast('Set a start and end time for every period', 'error'); return; }
    this.config.periodTimes = rows;
    LS('tt_config', this.config);
    this.audit('Period timings saved', rows.map((r) => 'P' + r.period + ' ' + r.start + '-' + r.end).join(', '));
    toast('Period timings saved', 'success');
    this.render();
  };

  App.openUserModal = function (id) {
    const u = id ? (this.config.roles || []).find((r) => r.id === id) : null;
    const depts = ['Academic Cell', ...this.deptCodes()];
    document.getElementById('modalTitle').textContent = u ? 'Edit User' : 'Add User';
    document.getElementById('modalBody').innerHTML = `
      <input type="hidden" id="usr_id0" value="${u ? escapeAttr(u.id) : ''}"/>
      <div class="form-row">
        <div class="form-group"><label>Full name</label><input id="usr_name" value="${u ? escapeAttr(u.name) : ''}"/></div>
        <div class="form-group"><label>Email</label><input id="usr_email" value="${u ? escapeAttr(u.email || '') : ''}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Role</label><select id="usr_role">${Object.keys(ROLE_MATRIX).map((r) => `<option ${u && u.role === r ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Department / unit</label><select id="usr_dept">${depts.map((d) => `<option ${u && u.dept === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select></div>
        <div class="form-group" style="justify-content:flex-end"><label class="switch-scope"><input type="checkbox" id="usr_active" ${!u || u.active !== false ? 'checked' : ''}/> Account active</label></div>
      </div>
      <div class="text-muted" style="font-size:0.82rem">${Object.keys(ROLE_MATRIX).map((r) => '<b>' + r + '</b>: ' + ROLE_MATRIX[r].desc).join('<br/>')}</div>
      <div class="mt-16" style="display:flex;gap:8px"><button class="btn primary" onclick="TT.saveUser()">Save user</button><button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button></div>`;
    this.openModal('modalGeneric');
  };

  App.saveUser = function () {
    const oldId = document.getElementById('usr_id0').value;
    const name = document.getElementById('usr_name').value.trim();
    const email = document.getElementById('usr_email').value.trim();
    const role = document.getElementById('usr_role').value;
    const dept = document.getElementById('usr_dept').value;
    const active = document.getElementById('usr_active').checked;
    if (!name) { toast('User name is required', 'error'); return; }
    const roles = this.config.roles || (this.config.roles = []);
    let u = oldId ? roles.find((r) => r.id === oldId) : null;
    if (!u) { u = { id: 'U-' + Date.now().toString(36).toUpperCase(), name, email, role, dept, active }; roles.push(u); }
    else Object.assign(u, { name, email, role, dept, active });
    LS('tt_config', this.config);
    this.audit(u && oldId ? 'User updated' : 'User created', name + ' (' + role + ')');
    toast('User saved', 'success');
    this.closeModal('modalGeneric');
    this.render();
  };

  App.deleteUser = function (id) {
    const roles = this.config.roles || [];
    const u = roles.find((r) => r.id === id);
    if (!u) return;
    if (id === this.config.currentUserId) { toast('Cannot delete the currently signed-in user', 'error'); return; }
    if (u.role === 'Administrator' && roles.filter((r) => r.role === 'Administrator').length <= 1) { toast('At least one administrator must remain', 'error'); return; }
    if (!confirm('Delete user ' + u.name + '?')) return;
    this.config.roles = roles.filter((r) => r.id !== id);
    LS('tt_config', this.config);
    this.audit('User deleted', u.name + ' (' + u.role + ')');
    toast('User deleted', 'success');
    this.render();
  };

  App.showPermissions = function () {
    const rows = Object.keys(ROLE_MATRIX).map((r) => {
      const c = ROLE_MATRIX[r];
      return `<tr><td><b>${escapeHtml(r)}</b><div class="text-muted" style="font-size:0.74rem">${escapeHtml(c.desc)}</div></td>
        <td>${c.write ? badge('Yes', 'success') : badge('No', 'danger')}</td>
        <td>${c.admin ? badge('Yes', 'success') : badge('No', 'danger')}</td>
        <td>${c.owner ? badge('Yes', 'success') : badge('No', 'danger')}</td></tr>`;
    }).join('');
    document.getElementById('modalTitle').textContent = 'Permission Matrix';
    document.getElementById('modalBody').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Role</th><th>Operational edits</th><th>Configuration</th><th>Data ownership</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="text-muted" style="font-size:0.8rem;margin-top:10px">Operational edits include attendance, substitutions, sections, rooms and generation. Configuration includes institution profile, rules, users and restores. Data ownership includes full reset and audit purge.</div>
      <div class="mt-16"><button class="btn" onclick="TT.closeModal('modalGeneric')">Close</button></div>`;
    this.openModal('modalGeneric');
  };

  /* ======================================================================
     Data health
     ====================================================================== */
  App.runHealthCheck = function () {
    const issues = [];
    const add = (level, area, message, fix, fixLabel) => issues.push({ level, area, message, fix, fixLabel });
    this.data.staff.forEach((s) => {
      if (!(s.subjects || []).length) add('warning', 'Staff', s.name + ' (' + s.id + ') has no subject expertise', 'expertise', 'Assign expertise');
      if (!s.maxHoursPerWeek) add('info', 'Staff', s.name + ' has no weekly hour limit', 'limits', 'Set defaults');
    });
    this.data.subjects.forEach((sub) => {
      const experts = this.data.staff.filter((s) => (s.subjects || []).includes(sub.code)).length;
      if (experts === 0) add('danger', 'Subjects', sub.code + ' ' + sub.name + ' has no qualified faculty', 'experts', 'Assign experts');
      else if (experts === 1) add('warning', 'Subjects', sub.code + ' relies on a single expert', 'experts', 'Add experts');
    });
    const capacity = (this.config.days || 5) * (this.config.periods || 8);
    this.data.sections.forEach((sec) => {
      const st = this.sectionStats(sec);
      if (st.prescribed > capacity) add('danger', 'Curriculum', sec.name + ' prescribes ' + st.prescribed + 'h against ' + capacity + 'h capacity', null, null);
      if (!(sec.subjects || []).length) add('info', 'Curriculum', sec.name + ' inherits the department catalogue (no explicit mapping)', null, null);
    });
    this.data.schedule.forEach((sl) => {
      if (sl.subjectCode === 'FREE') return;
      if (!this.sectionById(sl.sectionId)) add('danger', 'Schedule', 'Slot references a missing section (' + sl.sectionId + ')', 'orphans', 'Repair schedule');
      if (!this.subjectByCode(sl.subjectCode)) add('danger', 'Schedule', 'Slot references a missing subject (' + sl.subjectCode + ')', 'orphans', 'Repair schedule');
      if (sl.roomName && !this.data.rooms.some((r) => r.name === sl.roomName)) add('warning', 'Schedule', 'Slot uses a missing room (' + sl.roomName + ')', 'orphans', 'Repair schedule');
      if (!this.effTeacher(sl)) add('danger', 'Schedule', 'Uncovered class: ' + this.sectionName(sl.sectionId) + ' ' + sl.subjectCode, 'cover', 'Auto-cover');
    });
    const teaching = this.teachingSlots();
    const noBackup = teaching.filter((s) => !s.backupTeacherId).length;
    if (noBackup) add('warning', 'Coverage', noBackup + ' teaching slot(s) have no designated backup', 'backups', 'Assign backups');
    const conflicts = this.validateSchedule().length;
    if (conflicts) add('danger', 'Scheduling', conflicts + ' scheduling conflict(s) detected', null, null);
    const overloaded = this.data.staff.filter((s) => this.slotLoad(s.id) > (s.maxHoursPerWeek || this.config.maxWeekly)).length;
    if (overloaded) add('warning', 'Workload', overloaded + ' faculty member(s) exceed their weekly limit', null, null);
    this.data.departments.forEach((d) => {
      const code = deptOf(d);
      if (!this.data.staff.some((s) => s.dept === code)) add('warning', 'Departments', code + ' has no faculty', null, null);
      if (!this.data.sections.some((s) => s.dept === code)) add('warning', 'Departments', code + ' has no sections', null, null);
      if (!this.data.rooms.some((r) => r.dept === code && r.type === 'Classroom')) add('info', 'Rooms', code + ' has no classroom', null, null);
    });
    if (!this.data.schedule.length) add('info', 'Schedule', 'No timetable generated yet', null, null);
    this._health = issues;
    if (document.getElementById('healthResults')) document.getElementById('healthResults').innerHTML = this.healthHTML();
    this.audit('Data health check', issues.length + ' issue(s) found');
    toast(issues.length ? issues.length + ' issue(s) found' : 'All checks passed — data is healthy', issues.some((i) => i.level === 'danger') ? 'warn' : 'success');
  };

  App.healthHTML = function () {
    const issues = this._health || [];
    if (!issues.length) return '<div class="health-ok">✅ All integrity checks passed.</div>';
    const counts = { danger: 0, warning: 0, info: 0 };
    issues.forEach((i) => { counts[i.level] = (counts[i.level] || 0) + 1; });
    return `<div class="health-summary">
      <span class="health-pill danger">${counts.danger || 0} critical</span>
      <span class="health-pill warning">${counts.warning || 0} warnings</span>
      <span class="health-pill info">${counts.info || 0} notices</span>
      <button class="btn btn-sm" onclick="TT.autofixAll()">Auto-fix safe issues</button>
    </div>
    <div class="health-list">${issues.slice(0, 40).map((i) => `<div class="health-row h-${i.level}">
      <span class="health-dot"></span><span class="health-main"><b>${escapeHtml(i.area)}</b> · ${escapeHtml(i.message)}</span>
      ${i.fix ? `<button class="btn btn-sm" onclick="TT.runHealthFix('${i.fix}')">${escapeHtml(i.fixLabel || 'Fix')}</button>` : ''}
    </div>`).join('')}${issues.length > 40 ? '<div class="text-muted" style="font-size:0.8rem;padding:6px">…and ' + (issues.length - 40) + ' more</div>' : ''}</div>`;
  };

  App.runHealthFix = function (fix) {
    let n = 0;
    if (fix === 'expertise') {
      this.data.staff.forEach((s) => {
        if ((s.subjects || []).length) return;
        const pool = this.data.subjects.filter((x) => x.dept === s.dept);
        if (!pool.length) return;
        const mates = this.data.staff.filter((x) => x.dept === s.dept);
        const j = Math.max(0, mates.indexOf(s));
        s.subjects = [0, 1, 2].map((k) => pool[(j + k) % pool.length].code);
        n++;
      });
    } else if (fix === 'experts') {
      this.data.subjects.forEach((sub) => {
        let experts = this.data.staff.filter((s) => (s.subjects || []).includes(sub.code));
        if (experts.length >= 2) return;
        const pool = this.data.staff.filter((s) => s.dept === sub.dept && !(s.subjects || []).includes(sub.code))
          .sort((a, b) => this.slotLoad(a.id) - this.slotLoad(b.id));
        while (experts.length < 2 && pool.length) {
          const s = pool.shift();
          s.subjects = (s.subjects || []).concat(sub.code);
          experts.push(s); n++;
        }
      });
    } else if (fix === 'limits') {
      this.data.staff.forEach((s) => {
        if (!s.maxHoursPerWeek) { s.maxHoursPerWeek = this.config.maxWeekly; n++; }
        if (!s.maxHoursPerDay) { s.maxHoursPerDay = this.config.maxDaily; n++; }
        if (!s.maxConsec) { s.maxConsec = this.config.maxConsec; n++; }
      });
    } else if (fix === 'orphans') {
      const secIds = new Set(this.data.sections.map((s) => s.id));
      const subCodes = new Set(this.data.subjects.map((s) => s.code));
      const rooms = new Set(this.data.rooms.map((r) => r.name));
      this.data.schedule = this.data.schedule.filter((s) => {
        if (!secIds.has(s.sectionId)) { n++; return false; }
        if (s.subjectCode !== 'FREE' && !subCodes.has(s.subjectCode)) { n++; return false; }
        if (s.roomName && !rooms.has(s.roomName)) { s.roomName = null; n++; }
        return true;
      });
    } else if (fix === 'backups') {
      this.assignBackups();
      n = this.teachingSlots().filter((s) => s.backupTeacherId).length;
    } else if (fix === 'cover') {
      this.data.staff.filter((s) => s.attendanceStatus === 'Absent').forEach((s) => {
        const r = this.autoSubstitute(s, { date: null, silent: true });
        n += r.success;
      });
      // also cover any slot whose effective teacher is missing
      this.teachingSlots().filter((s) => !this.effTeacher(s)).forEach((slot) => {
        const cands = this.candidatesForSlot(slot, null, null);
        if (cands && cands.length) { this.applySubstitution(slot, cands[0].id || cands[0].staffId, { date: null, mode: 'repair', silent: true }); n++; }
      });
    }
    this.saveAll();
    this.audit('Health auto-fix', fix + ' · ' + n + ' change(s)');
    toast('Auto-fix applied — ' + n + ' change(s)', 'success');
    this.runHealthCheck();
    this.render();
  };

  App.autofixAll = function () {
    ['expertise', 'limits', 'experts', 'orphans', 'backups', 'cover'].forEach((fix) => {
      try { this.runHealthFix(fix); } catch (e) { console.warn('autofix', fix, e); }
    });
    this.runHealthCheck();
  };


  App.installEnterprise = function () {
    if (this._entInstalled) return;
    this._entInstalled = true;
    this.ensureEnterprise();
    this.bindEnterprise();
    this._applyRoleGuards();
    this.renderChrome();
    this.render();
  };

  const boot = function () {
    try { App.installEnterprise(); } catch (e) { console.error('Enterprise install failed', e); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
