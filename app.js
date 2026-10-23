/* ==========================================================================
   College Timetable & Absence Management — Professional Platform (v2)
   --------------------------------------------------------------------------
   Single, self-contained core application:
     - Departments / sections / subjects / staff / rooms directory
     - Constraint-based timetable generation (backtracking + greedy repair)
     - Section-wise, subject-wise, bulk and FACULTY-wise timetable views
     - Professional absence handling:
         * ranked substitution candidates (expertise, availability, load)
         * automatic substitution (conflict-free) AND manual per-slot planner
         * substitutions tally on BOTH the absent and the covering faculty
         * planned leaves with automatic processing on due dates
     - Academic calendar (holidays, compensatory days, working days)
     - Reports, workload/coverage analytics, iCal / CSV / Excel / JSON export
     - Regulations compliance checks, audit log, notifications, versions,
       backup/restore, local RAG document search + AI assistant
   All state persists in localStorage. No build step, no framework.
   ========================================================================== */

/* ---------- LocalStorage helpers ---------- */
const LS = (k, v) => {
  if (v === undefined) {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('LS write failed', k, e); }
  return v;
};
const uid = () => 'ST_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const escapeHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const escapeAttr = (s) => String(s == null ? '' : s).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** 'YYYY-MM-DD' -> 'Mon' | 'Tue' | ... | null (weekend) */
const weekdayOf = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  return DAY_NAMES[d.getDay()];
};

/* ---------- Toast ---------- */
const toast = (msg, type = 'info') => {
  const container = document.getElementById('toastContainer') || document.body;
  const d = document.createElement('div');
  d.className = 'toast ' + type;
  d.innerHTML = '<span>' + escapeHtml(msg) + '</span>';
  container.appendChild(d);
  setTimeout(() => { try { d.remove(); } catch (e) {} }, 3400);
};

/* ---------- TT App ---------- */
const TT = {
  DAYS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  STATUS: { PRESENT: 'Present', ABSENT: 'Absent' },
  config: {
    days: 5, periods: 8, maxWeekly: 18, maxDaily: 5, maxConsec: 3,
    respectHolidays: true, semester: 1, academicYear: '2026-27',
    institution: 'College of Engineering', semStart: '2026-07-01', semEnd: '2026-12-30',
    workingDaysOverride: 0, leaveCasualLimit: 12, leaveSickLimit: 10
  },
  data: {
    staff: [], subjects: [], rooms: [], sections: [],
    departments: [], holidays: [], compDays: [], schedule: [],
    templates: [], auditLogs: [], substitutions: [], leaves: []
  },
  activePanel: 'dashboard',
  activeDeptTab: 'dept-subj',
  activeSubTab: 'planner',
  chartInstance: null,
  generationCancellation: false,
  _inited: false,

  /* ================= Init / State ================= */
  init() {
    if (this._inited) return;
    this._inited = true;
    this.seed();
    this.loadAll();
    this.bindNav();
    this.bindGlobal();
    this.render();
    this.bindModalDismiss();
    this.startSchedulers();
    this.renderAssistant();
  },

  /**
   * Seed a COMPLETE dataset on first run so the app is never empty:
   * departments, staff with subject expertise, named subjects incl. labs,
   * sections, rooms, holidays and a compensatory day.
   */
  seed() {
    const pools = {
      CSE: ['Data Structures & Algorithms', 'Operating Systems', 'Database Management Systems', 'Computer Networks', 'Software Engineering', 'Design & Analysis of Algorithms'],
      ECE: ['Electronic Circuits', 'Signals & Systems', 'Digital Electronics', 'Communication Systems', 'Microprocessors & Microcontrollers', 'VLSI Design'],
      IT: ['Web Technologies', 'Cloud Computing', 'Information Security', 'Object Oriented Programming', 'Data Analytics', 'Software Testing'],
      EEE: ['Circuit Theory', 'Electrical Machines', 'Power Systems', 'Control Systems', 'Electrical Measurements', 'Power Electronics'],
      MECH: ['Engineering Mechanics', 'Thermodynamics', 'Fluid Mechanics', 'Manufacturing Technology', 'Theory of Machines', 'Machine Design'],
      CIVIL: ['Surveying', 'Strength of Materials', 'Concrete Technology', 'Environmental Engineering', 'Transportation Engineering', 'Structural Analysis'],
      AIML: ['Machine Learning', 'Artificial Intelligence', 'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Big Data Analytics'],
      AIDS: ['Data Science Foundations', 'Statistical Learning', 'Data Visualization', 'Predictive Modeling', 'Data Engineering', 'Business Analytics'],
      CSDS: ['Blockchain Technology', 'Internet of Things', 'Cyber Physical Systems', 'Full Stack Development', 'DevOps Practices', 'AR / VR Systems'],
      BIOMED: ['Biomedical Instrumentation', 'Human Anatomy & Physiology', 'Biomaterials', 'Medical Imaging', 'Tissue Engineering', 'Rehabilitation Engineering']
    };
    const names = ['Rajesh', 'Anjali', 'Vikram', 'Priya', 'Amit', 'Neha', 'Sandeep', 'Kavitha', 'Gopal', 'Geetha', 'Manoj', 'Sindhu', 'Ramesh', 'Meena', 'Senthil', 'Lakshmi', 'Vijay', 'Uma', 'Balaji', 'Deepa', 'Arjun', 'Divya', 'Karthik', 'Swetha', 'Mohan', 'Ilakiya', 'Praveen', 'Ramya', 'Ashok', 'Nandhini', 'Suresh', 'Janani', 'Harish', 'Mounika', 'Vignesh', 'Aishwarya', 'Bala', 'Kripa', 'Dinesh', 'Oviya', 'Rahul', 'Shruti', 'Naveen', 'Keerthi', 'Ganesh', 'Yamini', 'Prakash', 'Steena', 'Murali', 'Abirami'];
    const suffixes = ['', '', '', ' Kumar', ' Selvi', ' Murugan', ' Devi', ' Pandian', ' Raman', ' Nayak'];

    if (!LS('tt_departments')) {
      const depts = Object.keys(pools);
      LS('tt_departments', depts.map((d, i) => ({ id: 'DEPT' + (i + 1), code: d, name: d + ' Department' })));
    }
    const departments = LS('tt_departments') || [];

    if (!LS('tt_staff')) {
      const staff = [];
      let c = 0;
      departments.forEach((d) => {
        const names6 = pools[d.code] ? 6 : 5;
        for (let i = 0; i < names6; i++) {
          const nm = names[c % names.length] + suffixes[c % suffixes.length] + ' ' + d.code;
          staff.push({
            id: 'ST' + String(c + 1).padStart(3, '0'), name: nm,
            dept: d.code, subjects: [], maxHoursPerWeek: 18, maxHoursPerDay: 5, maxConsec: 3,
            attendanceStatus: 'Present', email: 's' + (c + 1) + '@college.edu', phone: ''
          });
          c++;
        }
      });
      LS('tt_staff', staff);
    }

    if (!LS('tt_subjects')) {
      const subjects = [];
      departments.forEach((d) => {
        const pool = pools[d.code] || Array.from({ length: 6 }, (_, i) => d.code + ' Subject ' + (i + 1));
        pool.forEach((name, i) => {
          const isLab = (i + 1) % 3 === 0;               // subjects 3 and 6 are labs
          subjects.push({
            code: d.code + (100 + i + 1), name, dept: d.code,
            type: isLab ? 'Lab' : 'Theory', hoursPerWeek: isLab ? 4 : 3,
            credits: isLab ? 2 : 3, semester: Math.ceil((i + 1) / 2)
          });
        });
      });
      LS('tt_subjects', subjects);
    }

    if (!LS('tt_rooms')) {
      const rooms = [];
      departments.forEach((d) => {
        rooms.push({ name: d.code + '-CR1', type: 'Classroom', capacity: 60, dept: d.code });
        rooms.push({ name: d.code + '-CR2', type: 'Classroom', capacity: 60, dept: d.code });
        rooms.push({ name: d.code + '-LAB1', type: 'Lab', capacity: 30, dept: d.code });
        rooms.push({ name: d.code + '-LAB2', type: 'Lab', capacity: 30, dept: d.code });
      });
      rooms.push({ name: 'GEN-HALL', type: 'Classroom', capacity: 150, dept: 'GENERAL' });
      LS('tt_rooms', rooms);
    }

    if (!LS('tt_sections')) {
      const sections = [];
      let n = 1;
      departments.forEach((d) => {
        for (let i = 1; i <= 2; i++) {
          sections.push({ id: 'SEC' + String(n).padStart(3, '0'), name: d.code + ' Sec ' + String.fromCharCode(64 + i), dept: d.code, semester: 3, year: 2026 });
          n++;
        }
      });
      LS('tt_sections', sections);
    }

    if (!LS('tt_config')) LS('tt_config', this.config);
    if (!LS('tt_holidays')) {
      LS('tt_holidays', [
        { date: '2026-10-02', name: 'Gandhi Jayanti' },
        { date: '2026-10-20', name: 'Diwali' },
        { date: '2026-12-25', name: 'Christmas' }
      ]);
    }
    if (!LS('tt_compdays')) LS('tt_compdays', [{ date: '2026-11-07', follows: 'Saturday', reason: 'Diwali compensatory working day' }]);
    if (!LS('tt_templates')) LS('tt_templates', []);
    if (!LS('tt_audit_logs')) LS('tt_audit_logs', []);
    if (!LS('tt_substitutions')) LS('tt_substitutions', []);
    if (!LS('tt_leaves')) LS('tt_leaves', []);
    if (!LS('tt_schedule')) LS('tt_schedule', []);
    if (!LS('tt_notifications')) LS('tt_notifications', []);
    if (!LS('tt_attendance_log')) LS('tt_attendance_log', []);
    if (!LS('tt_faculty_availability')) LS('tt_faculty_availability', []);
    if (!LS('tt_dept_rules')) LS('tt_dept_rules', []);
    if (!LS('tt_timetable_versions')) LS('tt_timetable_versions', []);

    // integrity pass: every staff member must have subject expertise,
    // sane limits and a normalized attendance status. Expertise uses a
    // rotating window so that EVERY subject ends up with >=3 experts.
    const staff = LS('tt_staff') || [];
    const subjects = LS('tt_subjects') || [];
    staff.forEach((s) => {
      if (!Array.isArray(s.subjects) || !s.subjects.length) {
        const per = subjects.filter((x) => x.dept === s.dept);
        if (per.length) {
          const mates = staff.filter((x) => x.dept === s.dept);
          const j = Math.max(0, mates.indexOf(s));
          s.subjects = [0, 1, 2].map((k) => per[(j + k) % per.length].code);
        } else {
          s.subjects = [];
        }
      }
      if (!s.maxHoursPerWeek) s.maxHoursPerWeek = 18;
      if (!s.maxHoursPerDay) s.maxHoursPerDay = 5;
      if (!s.maxConsec) s.maxConsec = 3;
      if (s.attendanceStatus !== 'Absent') s.attendanceStatus = 'Present';
    });
    LS('tt_staff', staff);
  },

  loadAll() {
    this.data.departments = LS('tt_departments') || [];
    this.data.staff = LS('tt_staff') || [];
    this.data.subjects = LS('tt_subjects') || [];
    this.data.rooms = LS('tt_rooms') || [];
    this.data.sections = LS('tt_sections') || [];
    this.data.holidays = LS('tt_holidays') || [];
    this.data.compDays = LS('tt_compdays') || [];
    this.data.schedule = LS('tt_schedule') || [];
    this.data.templates = LS('tt_templates') || [];
    this.data.auditLogs = LS('tt_audit_logs') || [];
    this.data.substitutions = LS('tt_substitutions') || [];
    this.data.leaves = LS('tt_leaves') || [];
    const cfg = LS('tt_config') || {};
    this.config = { ...this.config, ...cfg };
  },

  saveAll() {
    LS('tt_departments', this.data.departments);
    LS('tt_staff', this.data.staff);
    LS('tt_subjects', this.data.subjects);
    LS('tt_rooms', this.data.rooms);
    LS('tt_sections', this.data.sections);
    LS('tt_holidays', this.data.holidays);
    LS('tt_compdays', this.data.compDays);
    LS('tt_schedule', this.data.schedule);
    LS('tt_templates', this.data.templates);
    LS('tt_config', this.config);
    LS('tt_audit_logs', this.data.auditLogs);
    LS('tt_substitutions', this.data.substitutions);
    LS('tt_leaves', this.data.leaves);
  },

  audit(action, detail = '') {
    this.data.auditLogs.unshift({ id: uid(), ts: new Date().toISOString(), action, detail: String(detail || ''), user: 'Admin' });
    if (this.data.auditLogs.length > 5000) this.data.auditLogs.length = 5000;
    LS('tt_audit_logs', this.data.auditLogs);
  },

  /* ---------- Lookups ---------- */
  staffById(id) { return this.data.staff.find((s) => s.id === id) || null; },
  staffName(id) { const s = this.staffById(id); return s ? s.name : (id || '—'); },
  sectionById(id) { return this.data.sections.find((s) => s.id === id) || null; },
  sectionName(id) { const s = this.sectionById(id); return s ? s.name : (id || '—'); },
  subjectByCode(code) { return this.data.subjects.find((s) => s.code === code) || null; },
  subjectName(code) { const s = this.subjectByCode(code); return s ? s.name : (code || '—'); },
  /** The teacher actually responsible for a slot right now. */
  effTeacher(sl) { return sl.currentTeacherId || sl.teacherId || null; },
  teachingSlots(sched) { return (sched || this.data.schedule).filter((s) => s.subjectCode !== 'FREE'); },
  slotLoad(staffId, sched) {
    return this.teachingSlots(sched).filter((s) => this.effTeacher(s) === staffId).length;
  },
  /** Slots the staff teaches under their own name (excluding cover duties). */
  ownLoad(staffId) {
    return this.teachingSlots().filter((s) => (s.currentTeacherId || s.teacherId) === staffId && s.originalTeacherId === staffId).length;
  },
  /** Slots the staff is covering for absent colleagues. */
  coverLoad(staffId) {
    return this.teachingSlots().filter((s) => s.currentTeacherId === staffId && s.originalTeacherId && s.originalTeacherId !== staffId).length;
  },
  /**
   * Does this slot still need cover?
   * A slot needs cover when its owning teacher is absent and no substitute has
   * been assigned (either never substituted, or substituted with no one — the
   * "critical" case where currentTeacherId is null).
   */
  slotNeedsCover(sl) {
    if (!sl || sl.subjectCode === 'FREE') return false;
    const owner = sl.originalTeacherId || sl.teacherId;
    const ownerStaff = this.staffById(owner);
    const ownerAbsent = !!(ownerStaff && ownerStaff.attendanceStatus === 'Absent');
    // Covered when a *different* teacher is now assigned.
    const covered = !!(sl.isSubstituted && sl.currentTeacherId && sl.currentTeacherId !== owner);
    return ownerAbsent && !covered;
  },
  /** Count of slots that still need cover, optionally limited to a weekday. */
  slotsNeedingCover(day) {
    return this.teachingSlots().filter((s) => (!day || s.day === day) && this.slotNeedsCover(s));
  },

  /* ================= Navigation ================= */
  bindNav() {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.addEventListener('click', () => this.showPanel(el.dataset.panel));
    });
  },

  showPanel(name) {
    this.activePanel = name;
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.add('active');
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.panel === name);
    });
    const titles = {
      dashboard: 'Dashboard', departments: 'Departments & Sections Management',
      generator: 'Timetable Gen Dashboard', staff: 'Staff Directory',
      subjects: 'Subjects', attendance: 'Daily Attendance',
      calendar: 'Academic Calendar', reports: 'Reports & Load',
      settings: 'Timetable Settings', substitution: 'Faculty Substitution Management',
      regulations: 'University Regulations', audit: 'Audit Logs'
    };
    const t = document.getElementById('pageTitle');
    if (t) t.textContent = titles[name] || name;
    this.render();
  },

  bindGlobal() {
    window.TT = this;
    window.showPanel = (name) => this.showPanel(name);
    window.slotCountByName = (id) => this.slotLoad(id);
    const bell = document.getElementById('btnBell');
    if (bell) bell.onclick = () => this.openNotifications();
    const attDate = document.getElementById('attDate');
    if (attDate && !attDate.value) attDate.value = todayISO();
    if (attDate) attDate.onchange = () => this.renderAttendance();
    const subDate = document.getElementById('subDate');
    if (subDate && !subDate.value) subDate.value = todayISO();
    if (subDate) subDate.onchange = () => this.renderSubstitution();
    const subSearch = document.getElementById('subSearch');
    if (subSearch) subSearch.oninput = () => this.renderSubstitutionFaculty();
    const subDept = document.getElementById('subDeptFilter');
    if (subDept) subDept.onchange = () => this.renderSubstitutionFaculty();
    const staffSearch = document.getElementById('staffSearch');
    if (staffSearch) staffSearch.oninput = () => this.renderStaff();
    const staffDept = document.getElementById('staffDeptFilter');
    if (staffDept) staffDept.onchange = () => this.renderStaff();
    const subjectSearch = document.getElementById('subjectSearch');
    if (subjectSearch) subjectSearch.oninput = () => this.renderSubjects();

    // Substitution planner — delegated controls (accept auto, pick alternate,
    // leave uncovered, filter alternates). Works for any open planner modal.
    document.addEventListener('click', (e) => {
      const accept = e.target.closest('[data-accept]');
      if (accept) { e.preventDefault(); this.acceptPlanAuto(accept.dataset.accept); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick && !pick.disabled) { e.preventDefault(); this.pickPlanSubstitute(pick.dataset.pick, pick.dataset.sub); return; }
    });
    document.addEventListener('change', (e) => {
      const leave = e.target.closest('[data-leave]');
      if (leave) { this.togglePlanLeave(leave.dataset.leave, leave.checked); return; }
      const filter = e.target.closest('[data-filter]');
      if (filter) { this.filterPlanAlternates(filter.dataset.filter, filter.value); return; }
    });
  },

  bindModalDismiss() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
    });
    document.querySelectorAll('.modal').forEach((m) => {
      m.addEventListener('mousedown', (e) => { if (e.target === m) m.classList.remove('open'); });
    });
  },

  startSchedulers() {
    if (this._schedStarted) return;
    this._schedStarted = true;
    // process due leaves / repair uncovered substitutions every 2 minutes
    setInterval(() => { try { this.autoProcessAbsences(true); } catch (e) { console.warn(e); } }, 120000);
    // auto snapshot of schedule every 5 minutes
    setInterval(() => { try { this.snapshotVersion('auto', true); } catch (e) { console.warn(e); } }, 300000);
  },

  /* ================= Master render ================= */
  render() {
    this.renderDashboard();
    if (this.activePanel === 'generator') this.renderGenerator();
    if (this.activePanel === 'departments') this.renderDepartments();
    if (this.activePanel === 'staff') this.renderStaff();
    if (this.activePanel === 'subjects') this.renderSubjects();
    if (this.activePanel === 'attendance') this.renderAttendance();
    if (this.activePanel === 'calendar') this.renderCalendar();
    if (this.activePanel === 'reports') this.renderReports();
    if (this.activePanel === 'settings') this.renderSettings();
    if (this.activePanel === 'substitution') this.renderSubstitution();
    if (this.activePanel === 'regulations') this.renderRegulations();
    if (this.activePanel === 'audit') this.renderAudit();
    this.renderBell();
  },

  openGenerator() { this.showPanel('generator'); },

  /* ================= Dashboard ================= */
  renderDashboard() {
    const stats = document.getElementById('dashStats');
    if (!stats) return;
    const conflicts = this.validateSchedule().length;
    const teaching = this.teachingSlots().length;
    const backupCov = teaching ? Math.round(
      this.teachingSlots().filter((s) => s.backupTeacherId).length / teaching * 100
    ) : 0;
    const present = this.data.staff.filter((s) => s.attendanceStatus !== 'Absent').length;
    const absent = this.data.staff.filter((s) => s.attendanceStatus === 'Absent').length;
    const critical = this.data.substitutions.filter((s) => s.status === 'critical').length;

    const card = (num, label, panel, color) =>
      `<div class="card stat-link" onclick="TT.showPanel('${panel}')" title="Open ${label}"><div class="num"${color ? ' style="color:' + color + '"' : ''}>${num}</div><div class="label">${label}</div></div>`;

    stats.innerHTML = `
      ${card(this.data.departments.length, 'Departments', 'departments')}
      ${card(this.data.sections.length, 'Sections', 'departments')}
      ${card(this.data.staff.length, 'Staff Members', 'staff')}
      ${card(this.data.subjects.length, 'Subjects', 'subjects')}
      ${card(teaching, 'Scheduled Slots', 'reports')}
      ${card(conflicts, 'Conflicts', 'generator', conflicts ? 'var(--danger)' : 'var(--accent)')}
      ${card(backupCov + '%', 'Backup Coverage', 'substitution')}
      ${card(present, 'Staff Present', 'attendance', 'var(--accent)')}
      ${card(absent, 'Staff Absent', 'attendance', absent ? 'var(--danger)' : 'var(--text-muted)')}
      ${card(critical, 'Uncovered (Critical)', 'substitution', critical ? 'var(--danger)' : 'var(--accent)')}
    `;
    this.renderDashboardSide();
  },

  renderDashboardSide() {
    const today = todayISO();
    const wd = weekdayOf(today);
    const absent = this.data.staff.filter((s) => s.attendanceStatus === 'Absent');
    const dueLeaves = this.data.leaves.filter((l) => l.status === 'approved' && l.start <= today && l.end >= today);
    const upcoming = [...this.data.holidays].filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const recent = this.data.substitutions.slice(0, 6);

    const mk = (hostId, title, inner) => {
      const el = document.getElementById(hostId);
      if (!el) return;
      el.innerHTML = `<div class="card">
        <div style="font-weight:700;color:var(--text);font-size:1.02rem;margin-bottom:10px;display:flex;align-items:center;gap:8px">${title}</div>
        ${inner || '<div class="text-muted" style="font-size:0.86rem">Nothing to show.</div>'}
      </div>`;
    };

    mk('dashToday', '📅 Today — ' + escapeHtml(today) + ' (' + escapeHtml(wd || 'Weekend') + ')', `
      <div style="font-size:0.88rem;line-height:1.9">
        <div>Absent today: <b class="${absent.length ? 'text-danger' : 'text-success'}">${absent.length}</b>
          ${absent.slice(0, 5).map((s) => escapeHtml(s.name)).join(', ') || ''}</div>
        <div>Leaves due today: <b>${dueLeaves.length}</b></div>
        <div>Critical uncovered slots: <b class="${this.data.substitutions.filter((s) => s.status === 'critical').length ? 'text-danger' : 'text-success'}">${this.data.schedule.filter((s) => s.subjectCode !== 'FREE' && !this.effTeacher(s)).length}</b></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-sm primary" onclick="TT.showPanel('attendance')">Take Attendance</button>
        <button class="btn btn-sm" onclick="TT.showPanel('substitution')">Substitution Planner</button>
        <button class="btn btn-sm" onclick="TT.showPanel('reports')">Load Report</button>
      </div>`);

    mk('dashRecent', '🔄 Recent Substitutions', recent.map((r) => {
      const sub = r.substitute ? this.staffName(r.substitute) : '⚠ No substitute';
      const color = r.status === 'success' ? 'var(--accent)' : r.status === 'reverted' ? 'var(--text-muted)' : 'var(--danger)';
      return `<div class="dash-link" onclick="TT.showPanel('substitution')" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.84rem">
        <b>${escapeHtml(this.staffName(r.absentTeacher))}</b> → <b style="color:${color}">${escapeHtml(sub)}</b>
        <span class="text-muted"> • ${escapeHtml(r.sectionId || '')} ${escapeHtml(r.day || '')} P${escapeHtml(r.period || '')}</span>
      </div>`;
    }).join(''));

    mk('dashHolidays', '🎌 Upcoming Holidays', upcoming.map((h) => `
      <div class="dash-link" onclick="TT.showPanel('calendar')" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.86rem">
        <b>${escapeHtml(h.date)}</b> — ${escapeHtml(h.name)}
      </div>`).join(''));
  },

  /* ================= Notifications ================= */
  getNotifications() { return LS('tt_notifications') || []; },
  notify(type, msg) {
    const list = this.getNotifications();
    list.unshift({ id: uid(), type: type || 'info', msg: String(msg || ''), ts: new Date().toISOString() });
    if (list.length > 60) list.length = 60;
    LS('tt_notifications', list);
    this.renderBell();
  },
  renderBell() {
    const badge = document.getElementById('bellCount');
    if (!badge) return;
    const n = this.getNotifications().length;
    badge.style.display = n ? 'block' : 'none';
  },
  openNotifications() {
    const list = this.getNotifications();
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '🚨' };
    document.getElementById('modalTitle').textContent = 'Notifications';
    document.getElementById('modalBody').innerHTML = `
      <div style="max-height:50vh;overflow:auto">
      ${list.map((n) => `<div class="notif-item">
        <span style="font-size:1.1rem">${icons[n.type] || 'ℹ️'}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.88rem">${escapeHtml(n.msg)}</div>
          <div class="text-muted" style="font-size:0.76rem">${new Date(n.ts).toLocaleString()}</div>
        </div>
      </div>`).join('') || '<div class="empty-state" style="padding:20px">No notifications.</div>'}
      </div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn danger btn-sm" onclick="TT.clearNotifications()">Clear all</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Close</button>
      </div>`;
    this.openModal('modalGeneric');
  },
  clearNotifications() {
    LS('tt_notifications', []);
    this.renderBell();
    this.closeModal('modalGeneric');
    toast('Notifications cleared', 'success');
  },

  /* ================= Modals ================= */
  openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('open'); },
  closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('open'); },

  /* ================= Staff Directory ================= */
  renderStaff() {
    const q = (document.getElementById('staffSearch')?.value || '').toLowerCase();
    const deptSel = document.getElementById('staffDeptFilter');
    this.fillDeptSelect(deptSel, this.data.staff.map((s) => s.dept));
    const dfv = deptSel ? deptSel.value : '';
    const rows = this.data.staff.filter((s) =>
      (!q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) ||
       (s.subjects || []).join(',').toLowerCase().includes(q) || (s.dept || '').toLowerCase().includes(q)) &&
      (!dfv || s.dept === dfv)
    );
    const cnt = document.getElementById('staffCount');
    if (cnt) cnt.textContent = rows.length + ' shown';
    const body = document.getElementById('staffTableBody');
    if (!body) return;
    body.innerHTML =
      rows.map((s) => {
        const own = this.ownLoad(s.id);
        const cover = this.coverLoad(s.id);
        const isAbsent = s.attendanceStatus === 'Absent';
        return `<tr>
          <td><strong>${escapeHtml(s.id)}</strong></td>
          <td><a href="#" onclick="TT.openStaffProfile('${escapeAttr(s.id)}');return false" style="font-weight:600">${escapeHtml(s.name)}</a></td>
          <td><span style="color:var(--primary);font-weight:600;font-size:0.88rem">${escapeHtml(s.dept)}</span></td>
          <td style="font-size:0.82rem">${(s.subjects || []).map(escapeHtml).join(', ') || '—'}</td>
          <td>
            <span class="badge badge-${isAbsent ? 'danger' : 'success'}">${escapeHtml(s.attendanceStatus)}</span>
            <div class="text-muted" style="font-size:0.78rem;margin-top:4px">${own} own${cover ? ` + <b style="color:var(--warning)">${cover} cover</b>` : ''} / ${s.maxHoursPerWeek || this.config.maxWeekly} max</div>
          </td>
          <td>
            <button class="btn btn-sm" onclick="TT.openStaffProfile('${escapeAttr(s.id)}')">Profile</button>
            <button class="btn btn-sm" onclick="TT.openStaffModal('${escapeAttr(s.id)}')">Edit</button>
            <button class="btn btn-sm ${isAbsent ? 'success' : 'danger'}" onclick="${isAbsent ? "TT.toggleAbsent('" + escapeAttr(s.id) + "')" : "TT.openAbsenceOptions('" + escapeAttr(s.id) + "')"}">${isAbsent ? 'Mark Present' : 'Mark Absent'}</button>
            <button class="btn btn-sm danger" onclick="TT.deleteStaff('${escapeAttr(s.id)}')">Delete</button>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="6" class="empty-state" style="padding:24px">No staff members found.</td></tr>`;
  },

  fillDeptSelect(sel, sourceArr, includeAll = true) {
    if (!sel) return;
    const depts = [...new Set(sourceArr.filter(Boolean))];
    const current = sel.value;
    sel.innerHTML = (includeAll ? '<option value="">All Departments</option>' : '') +
      depts.map((d) => `<option value="${escapeAttr(d)}">${escapeHtml(d)}</option>`).join('');
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  },

  openStaffProfile(id) {
    const s = this.staffById(id);
    if (!s) { toast('Staff not found', 'error'); return; }
    const own = this.ownLoad(s.id), cover = this.coverLoad(s.id);
    const upcomingLeaves = this.data.leaves.filter((l) => l.staffId === id && l.end >= todayISO());
    document.getElementById('modalTitle').textContent = s.name + ' — Profile';
    document.getElementById('modalBody').innerHTML = `
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="card"><div class="num">${own}</div><div class="label">Own Slots</div></div>
        <div class="card"><div class="num" style="color:var(--warning)">${cover}</div><div class="label">Cover Duties</div></div>
        <div class="card"><div class="num">${s.maxHoursPerWeek || this.config.maxWeekly}</div><div class="label">Weekly Max</div></div>
      </div>
      <div class="table-wrap mt-16"><table>
        <tr><th style="width:140px">Department</th><td>${escapeHtml(s.dept)}</td></tr>
        <tr><th>Status</th><td><span class="badge badge-${s.attendanceStatus === 'Absent' ? 'danger' : 'success'}">${escapeHtml(s.attendanceStatus)}</span></td></tr>
        <tr><th>Expertise</th><td>${(s.subjects || []).map(escapeHtml).join(', ') || '—'}</td></tr>
        <tr><th>Email</th><td>${escapeHtml(s.email || '—')}</td></tr>
      </table></div>
      <div class="label mt-16">Weekly Timetable (${own + cover} slots)</div>
      ${this.buildFacultyGridHTML(s.id, { compact: true })}
      ${upcomingLeaves.length ? `<div class="label mt-16">Upcoming Leaves</div>` + upcomingLeaves.map((l) => `<div style="font-size:0.85rem">• ${escapeHtml(l.start)} → ${escapeHtml(l.end)} (${escapeHtml(l.type)}) ${escapeHtml(l.reason || '')}</div>`).join('') : ''}
      <div class="mt-16"><button class="btn" onclick="TT.closeModal('modalGeneric')">Close</button></div>`;
    this.openModal('modalGeneric');
  },

  openStaffModal(id) {
    const s = id ? this.staffById(id) : null;
    const depts = this.data.departments.map((d) => d.code).filter(Boolean);
    document.getElementById('modalBody').innerHTML = `
      <input type="hidden" id="sf_id0" value="${s ? escapeAttr(s.id) : ''}"/>
      <div class="form-row">
        <div class="form-group"><label>Staff ID</label><input id="sf_id2" value="${s ? escapeAttr(s.id) : ''}" ${s ? 'readonly' : ''} placeholder="e.g. ST001"/></div>
        <div class="form-group"><label>Full Name</label><input id="sf_name" value="${s ? escapeAttr(s.name) : ''}" placeholder="e.g. Dr. Rajesh Kumar"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Department</label><select id="sf_dept">${depts.map((d) => `<option ${s && s.dept === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Status</label><select id="sf_status"><option ${s && s.attendanceStatus !== 'Absent' ? 'selected' : ''}>Present</option><option ${s && s.attendanceStatus === 'Absent' ? 'selected' : ''}>Absent</option></select></div>
      </div>
      <div class="form-group"><label>Subjects (codes, comma separated)</label><input id="sf_subjects" class="full" value="${s ? (s.subjects || []).join(', ') : ''}" placeholder="e.g. CSE101, CSE102"/></div>
      <div class="form-row">
        <div class="form-group"><label>Max Hours / Week</label><input type="number" id="sf_maxw" value="${s ? s.maxHoursPerWeek : 18}" min="1"/></div>
        <div class="form-group"><label>Max Hours / Day</label><input type="number" id="sf_maxd" value="${s ? s.maxHoursPerDay : 5}" min="1"/></div>
        <div class="form-group"><label>Max Consecutive</label><input type="number" id="sf_maxc" value="${s ? s.maxConsec : 3}" min="1"/></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="align-self:end"><button class="btn primary" style="margin-top:24px" onclick="TT.saveStaff()">Save Staff</button></div>
      </div>`;
    document.getElementById('modalTitle').textContent = s ? 'Edit Staff Member' : 'Add Staff Member';
    this.openModal('modalGeneric');
  },

  saveStaff() {
    const oldId = document.getElementById('sf_id0').value;
    const id = document.getElementById('sf_id2').value.trim() || uid();
    const name = document.getElementById('sf_name').value.trim();
    const dept = document.getElementById('sf_dept').value;
    const status = document.getElementById('sf_status').value === 'Absent' ? 'Absent' : 'Present';
    const subs = document.getElementById('sf_subjects').value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    const maxw = parseInt(document.getElementById('sf_maxw').value) || 18;
    const maxd = parseInt(document.getElementById('sf_maxd').value) || 5;
    const maxc = parseInt(document.getElementById('sf_maxc').value) || 3;
    if (!name) { toast('Name is required', 'error'); return; }
    if (!oldId && this.data.staff.find((x) => x.id === id)) { toast('Staff ID already exists', 'error'); return; }
    let s = oldId ? this.staffById(oldId) : null;
    if (s) { Object.assign(s, { id, name, dept, attendanceStatus: status, subjects: subs, maxHoursPerWeek: maxw, maxHoursPerDay: maxd, maxConsec: maxc }); }
    else { this.data.staff.push({ id, name, dept, subjects: subs, maxHoursPerWeek: maxw, maxHoursPerDay: maxd, maxConsec: maxc, attendanceStatus: status, email: '', phone: '' }); }
    this.saveAll();
    this.audit('Staff saved', name + ' (' + id + ')');
    toast('Staff saved', 'success');
    this.closeModal('modalGeneric');
    this.render();
  },

  deleteStaff(id) {
    const s = this.staffById(id);
    if (!s) return;
    const load = this.slotLoad(id);
    if (!confirm('Delete ' + s.name + '?' + (load ? ' Their ' + load + ' slot(s) will be released (backup takes over when available).' : ''))) return;
    this.data.schedule.forEach((sl) => {
      if (this.effTeacher(sl) === id && sl.subjectCode !== 'FREE') {
        if (sl.backupTeacherId && sl.backupTeacherId !== id) {
          sl.currentTeacherId = sl.backupTeacherId;
          sl.isSubstituted = true;
        } else {
          sl.currentTeacherId = null;
          sl.isSubstituted = true;
        }
      }
      if (sl.backupTeacherId === id) sl.backupTeacherId = null;
      if (sl.originalTeacherId === id && this.effTeacher(sl) !== id) { /* keep history */ }
    });
    this.data.staff = this.data.staff.filter((x) => x.id !== id);
    this.saveAll();
    this.audit('Staff deleted', s.name + ' (' + id + ')');
    toast('Staff deleted', 'success');
    this.render();
  },

  clearAllStaff() {
    if (!confirm('Clear ALL staff data? This cannot be undone.')) return;
    this.data.staff = [];
    this.saveAll();
    this.audit('All staff cleared', '');
    toast('All staff cleared', 'success');
    this.render();
  },

  /* ================= Subjects ================= */
  renderSubjects() {
    const q = (document.getElementById('subjectSearch')?.value || '').toLowerCase();
    const rows = this.data.subjects.filter((s) =>
      !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.dept.toLowerCase().includes(q)
    );
    const body = document.getElementById('subjectTableBody');
    if (!body) return;
    body.innerHTML =
      rows.map((s) => {
        const experts = this.data.staff.filter((x) => (x.subjects || []).includes(s.code)).length;
        return `<tr>
          <td><strong>${escapeHtml(s.code)}</strong></td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.dept)}</td>
          <td><span class="badge badge-${s.type === 'Lab' ? 'info' : 'neutral'}">${escapeHtml(s.type)}</span></td>
          <td>${s.hoursPerWeek}</td><td>${s.credits}</td><td>${s.semester}</td>
          <td><span class="badge badge-${experts >= 2 ? 'success' : 'warning'}">${experts} expert${experts === 1 ? '' : 's'}</span></td>
          <td>
            <button class="btn btn-sm" onclick="TT.openSubjectModal('${escapeAttr(s.code)}')">Edit</button>
            <button class="btn btn-sm danger" onclick="TT.deleteSubject('${escapeAttr(s.code)}')">Delete</button>
          </td>
        </tr>`;
      }).join('') || `<tr><td colspan="9" class="empty-state" style="padding:24px">No subjects found.</td></tr>`;
  },

  openSubjectModal(code) {
    const s = code ? this.subjectByCode(code) : null;
    const depts = this.data.departments.map((d) => d.code).filter(Boolean);
    document.getElementById('modalBody').innerHTML = `
      <input type="hidden" id="sub_code0" value="${s ? escapeAttr(s.code) : ''}"/>
      <div class="form-row">
        <div class="form-group"><label>Code</label><input id="sub_code" value="${s ? escapeAttr(s.code) : ''}" ${s ? 'readonly' : ''} placeholder="e.g. CSE101"/></div>
        <div class="form-group"><label>Name</label><input id="sub_name" value="${s ? escapeAttr(s.name) : ''}" placeholder="e.g. Data Structures"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Department</label><select id="sub_dept">${depts.map((d) => `<option ${s && s.dept === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}</select></div>
        <div class="form-group"><label>Type</label><select id="sub_type"><option ${s && s.type === 'Theory' ? 'selected' : ''}>Theory</option><option ${s && s.type === 'Lab' ? 'selected' : ''}>Lab</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Hours / Week</label><input type="number" id="sub_hours" value="${s ? s.hoursPerWeek : 3}" min="1"/></div>
        <div class="form-group"><label>Credits</label><input type="number" id="sub_credits" value="${s ? s.credits : 3}" min="1"/></div>
        <div class="form-group"><label>Semester</label><input type="number" id="sub_sem" value="${s ? s.semester : 1}" min="1"/></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="align-self:end"><button class="btn primary" style="margin-top:24px" onclick="TT.saveSubject()">Save Subject</button></div>
      </div>`;
    document.getElementById('modalTitle').textContent = s ? 'Edit Subject' : 'Add Subject';
    this.openModal('modalGeneric');
  },

  saveSubject() {
    const oldCode = document.getElementById('sub_code0').value;
    const code = document.getElementById('sub_code').value.trim().toUpperCase();
    const name = document.getElementById('sub_name').value.trim();
    const dept = document.getElementById('sub_dept').value;
    const type = document.getElementById('sub_type').value;
    const hours = parseInt(document.getElementById('sub_hours').value) || 3;
    const credits = parseInt(document.getElementById('sub_credits').value) || 3;
    const sem = parseInt(document.getElementById('sub_sem').value) || 1;
    if (!code || !name) { toast('Code and name required', 'error'); return; }
    if (oldCode) {
      const s = this.subjectByCode(oldCode);
      if (s) { Object.assign(s, { code, name, dept, type, hoursPerWeek: hours, credits, semester: sem }); }
    } else {
      if (this.subjectByCode(code)) { toast('Code already exists', 'error'); return; }
      this.data.subjects.push({ code, name, dept, type, hoursPerWeek: hours, credits, semester: sem });
    }
    this.saveAll();
    this.audit('Subject saved', code);
    toast('Subject saved', 'success');
    this.closeModal('modalGeneric');
    this.render();
  },

  deleteSubject(code) {
    if (!confirm('Delete subject ' + code + '?')) return;
    this.data.subjects = this.data.subjects.filter((s) => s.code !== code);
    this.saveAll();
    this.audit('Subject deleted', code);
    toast('Subject deleted', 'success');
    this.render();
  },

  /* ================= Departments & views ================= */
  renderDepartments() {
    const el = document.getElementById('deptContent');
    if (!el) return;
    const tab = this.activeDeptTab || 'dept-subj';
    document.querySelectorAll('#panel-departments .section-actions .btn').forEach((b) => {
      const onclick = b.getAttribute('onclick') || '';
      b.classList.toggle('primary', onclick.includes("'" + tab + "'"));
    });
    if (tab === 'dept-subj') this.renderDeptSubj(el);
    else if (tab === 'subject-wise') this.renderSubjectWise(el);
    else if (tab === 'bulk-view') this.renderBulkView(el);
    else if (tab === 'customizations') this.renderCustomizations(el);
    else if (tab === 'faculty-tt') this.renderFacultyTimetables(el);
  },

  deptTab(tab) { this.activeDeptTab = tab; this.renderDepartments(); },

  renderDeptSubj(el) {
    el.innerHTML = `
      <div class="card mt-16">
        <div class="label">Add Department</div>
        <div class="form-row">
          <div class="form-group full"><input id="newDeptName" placeholder="New Department Name" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px"/></div>
          <div class="form-group" style="align-self:end"><button class="btn primary" style="margin-top:24px" onclick="TT.addDept()">Add Department</button></div>
        </div>
      </div>
      <div class="card mt-24">
        <div class="label">Section Timetables</div>
        <div class="filters" style="margin-top:8px">
          <select id="sectionTTSelect" onchange="TT.renderSectionTT()" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px">
            ${this.data.sections.map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </div>
        <div id="sectionTTGrid">${this.data.sections.length ? '' : '<div class="empty-state">No sections yet.</div>'}</div>
      </div>
      <div class="table-wrap mt-24"><table>
        <thead><tr><th>Code</th><th>Name</th><th>Sections</th><th>Staff</th><th>Subjects</th><th>Actions</th></tr></thead>
        <tbody>
          ${this.data.departments.map((d) => {
            const code = d.code || d.id || d;
            return `<tr>
              <td><strong>${escapeHtml(code)}</strong></td>
              <td>${escapeHtml(d.name || d)}</td>
              <td>${this.data.sections.filter((s) => s.dept === code).length}</td>
              <td>${this.data.staff.filter((s) => s.dept === code).length}</td>
              <td>${this.data.subjects.filter((s) => s.dept === code).length}</td>
              <td>
                <button class="btn btn-sm" onclick="TT.editDept('${escapeAttr(code)}', '${escapeAttr(d.name || d)}')">Edit</button>
                <button class="btn btn-sm danger" onclick="TT.deleteDept('${escapeAttr(code)}')">Delete</button>
              </td>
            </tr>`;
          }).join('') || `<tr><td colspan="6" class="empty-state" style="padding:20px">No departments found.</td></tr>`}
        </tbody>
      </table></div>`;
    if (this.data.sections.length) this.renderSectionTT();
  },

  renderSectionTT() {
    const sel = document.getElementById('sectionTTSelect');
    const host = document.getElementById('sectionTTGrid');
    if (!sel || !host) return;
    host.innerHTML = this.buildSectionGridHTML(sel.value);
  },

  addDept() {
    const name = document.getElementById('newDeptName').value.trim();
    const code = name.toUpperCase().replace(/\s+/g, '');
    if (!code) { toast('Enter a name', 'error'); return; }
    if (this.data.departments.find((d) => (d.code || d.id) === code)) { toast('Department exists', 'error'); return; }
    this.data.departments.push({ id: 'DEPT' + Date.now(), code, name });
    this.saveAll();
    this.audit('Department added', code);
    toast('Department added', 'success');
    document.getElementById('newDeptName').value = '';
    this.renderDepartments();
  },

  editDept(code, name) {
    document.getElementById('modalBody').innerHTML = `
      <input type="hidden" id="dept_code0" value="${escapeAttr(code)}"/>
      <div class="form-row">
        <div class="form-group"><label>Code</label><input id="dept_code" value="${escapeAttr(code)}" readonly/></div>
        <div class="form-group"><label>Name</label><input id="dept_name" value="${escapeAttr(name)}"/></div>
      </div>
      <div class="form-row"><div class="form-group" style="align-self:end"><button class="btn primary" style="margin-top:24px" onclick="TT.saveDept()">Save</button></div></div>`;
    document.getElementById('modalTitle').textContent = 'Edit Department';
    this.openModal('modalGeneric');
  },

  saveDept() {
    const oldCode = document.getElementById('dept_code0').value;
    const code = document.getElementById('dept_code').value.trim().toUpperCase();
    const name = document.getElementById('dept_name').value.trim();
    if (!code || !name) { toast('Code and name required', 'error'); return; }
    const d = this.data.departments.find((x) => (x.code || x.id) === oldCode);
    if (d) { d.code = code; d.name = name; }
    this.saveAll();
    this.audit('Department saved', code);
    toast('Department saved', 'success');
    this.closeModal('modalGeneric');
    this.renderDepartments();
  },

  deleteDept(code) {
    if (!confirm('Delete department ' + code + '?')) return;
    this.data.departments = this.data.departments.filter((d) => (d.code || d.id) !== code);
    this.saveAll();
    this.audit('Department deleted', code);
    toast('Department deleted', 'success');
    this.renderDepartments();
  },

  /* ---------- Subject-wise timetable ---------- */
  renderSubjectWise(el) {
    if (!this.data.schedule.length) {
      el.innerHTML = '<div class="empty-state"><h3>Subject-Wise Timetable</h3><p class="text-muted">Generate a timetable first, then view subject-wise distribution here.</p></div>';
      return;
    }
    const depts = [...new Set(this.data.subjects.map((s) => s.dept))];
    el.innerHTML = `
      <div class="card mt-16">
        <div class="filters">
          <select id="swDept" onchange="TT.renderSubjectWiseBody()" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px">
            ${depts.map((d) => `<option>${escapeHtml(d)}</option>`).join('')}
          </select>
        </div>
        <div id="swBody"></div>
      </div>`;
    this.renderSubjectWiseBody();
  },

  renderSubjectWiseBody() {
    const dept = document.getElementById('swDept')?.value;
    const host = document.getElementById('swBody');
    if (!host) return;
    const subs = this.data.subjects.filter((s) => !dept || s.dept === dept);
    host.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Subject</th><th>Type</th><th>Hrs/Wk</th><th>Scheduled</th><th>Sessions (Section • Day • Period • Faculty • Room)</th></tr></thead>
      <tbody>
      ${subs.map((sub) => {
        const slots = this.data.schedule.filter((s) => s.subjectCode === sub.code && s.subjectCode !== 'FREE');
        const sessions = [];
        const seen = new Set();
        slots.forEach((s) => {
          const k = s.sectionId + '|' + s.day + '|' + (s.isLab ? s.period - 1 : s.period);
          if (s.isLab && s.period % 2 === 0) return;      // group lab pairs
          if (seen.has(k)) return;
          seen.add(k);
          sessions.push(`${escapeHtml(this.sectionName(s.sectionId))} • ${escapeHtml(s.day)} P${s.period}${s.isLab ? '-P' + (s.period + 1) : ''} • ${escapeHtml(this.staffName(this.effTeacher(s)))} • ${escapeHtml(s.roomName || '—')}`);
        });
        const planned = sub.type === 'Lab' ? Math.max(1, Math.floor(sub.hoursPerWeek / 2)) : sub.hoursPerWeek;
        const done = slots.length;
        const pct = sub.hoursPerWeek ? Math.min(100, Math.round(done / sub.hoursPerWeek * 100)) : 0;
        return `<tr>
          <td><b>${escapeHtml(sub.code)}</b> ${escapeHtml(sub.name)}</td>
          <td><span class="badge badge-${sub.type === 'Lab' ? 'info' : 'neutral'}">${escapeHtml(sub.type)}</span></td>
          <td>${sub.hoursPerWeek}</td>
          <td><span class="badge badge-${pct >= 100 ? 'success' : pct >= 50 ? 'warning' : 'danger'}">${done} slots (${pct}%)</span>
            <div class="text-muted" style="font-size:0.74rem">${planned} planned session(s)</div></td>
          <td style="font-size:0.8rem">${sessions.join('<br/>') || '<span class="text-muted">Not scheduled</span>'}</td>
        </tr>`;
      }).join('') || `<tr><td colspan="5" class="empty-state">No subjects.</td></tr>`}
      </tbody></table></div>`;
  },

  /* ---------- Bulk view ---------- */
  renderBulkView(el) {
    if (!this.data.schedule.length) {
      el.innerHTML = '<div class="empty-state"><h3>Bulk View (All Sections)</h3><p class="text-muted">Generate a timetable first, then view all sections in bulk here.</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="card mt-16">
        <div class="label">All Sections — weekly grids (click a section to expand)</div>
        ${this.data.sections.map((sec) => `<details class="bulk-sec" ${this.data.sections.length <= 3 ? 'open' : ''}>
          <summary><b>${escapeHtml(sec.name)}</b> <span class="text-muted">(${escapeHtml(sec.dept)}) — ${this.teachingSlots().filter((s) => s.sectionId === sec.id).length} teaching slots</span></summary>
          <div class="mt-8">${this.buildSectionGridHTML(sec.id)}</div>
        </details>`).join('') || '<div class="empty-state">No sections.</div>'}
      </div>`;
  },

  /* ---------- Customizations (dept rules + faculty availability) ---------- */
  renderCustomizations(el) {
    const rules = LS('tt_dept_rules') || [];
    const ruleFor = (dept) => rules.find((r) => r.dept === dept) || { maxWeekly: this.config.maxWeekly, maxDaily: this.config.maxDaily };
    el.innerHTML = `
      <div class="card mt-16">
        <div style="font-weight:700;margin-bottom:6px">Per-Department Workload Rules</div>
        <div class="text-muted" style="font-size:0.85rem;margin-bottom:12px">Overrides used by the generator for each department's faculty.</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Department</th><th>Max Hours / Week</th><th>Max Hours / Day</th></tr></thead>
          <tbody>${this.data.departments.map((d) => {
            const r = ruleFor(d.code);
            return `<tr>
              <td><b>${escapeHtml(d.code)}</b></td>
              <td><input type="number" class="dept-rule" data-dept="${escapeAttr(d.code)}" data-field="maxWeekly" value="${r.maxWeekly}" style="width:90px;padding:8px;border:1px solid var(--border);border-radius:6px"/></td>
              <td><input type="number" class="dept-rule" data-dept="${escapeAttr(d.code)}" data-field="maxDaily" value="${r.maxDaily}" style="width:90px;padding:8px;border:1px solid var(--border);border-radius:6px"/></td>
            </tr>`;
          }).join('') || '<tr><td colspan="3" class="empty-state">No departments.</td></tr>'}</tbody>
        </table></div>
        <button class="btn primary mt-16" onclick="TT.saveDeptRules()">Save Department Rules</button>
      </div>
      <div class="card mt-24">
        <div style="font-weight:700;margin-bottom:6px">Bulk Subject Editor</div>
        <div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">One subject per line: <code>code, name, dept, type (Theory|Lab), hoursPerWeek</code></div>
        <textarea id="bulksubj" rows="5" placeholder="CSE199, Cloud Native, CSE, Theory, 3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:monospace"></textarea>
        <button class="btn primary mt-8" onclick="TT.bulkApplySubjects()">Apply</button>
      </div>
      <div class="card mt-24">
        <div style="font-weight:700;margin-bottom:6px">Faculty Availability Preferences</div>
        <div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Mark day/period slots a faculty member cannot take. The generator and substitution engine both respect these.</div>
        <div class="filters">
          <select id="fpStaff" onchange="TT.renderFpGrid()" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px">
            ${this.data.staff.map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.dept)})</option>`).join('')}
          </select>
        </div>
        <div id="fpGrid"></div>
      </div>`;
    if (this.data.staff.length) this.renderFpGrid();
  },

  saveDeptRules() {
    const rules = [];
    document.querySelectorAll('.dept-rule').forEach((inp) => {
      const dept = inp.dataset.dept;
      let r = rules.find((x) => x.dept === dept);
      if (!r) { r = { dept, maxWeekly: this.config.maxWeekly, maxDaily: this.config.maxDaily }; rules.push(r); }
      r[inp.dataset.field] = parseInt(inp.value) || (inp.dataset.field === 'maxWeekly' ? this.config.maxWeekly : this.config.maxDaily);
    });
    LS('tt_dept_rules', rules);
    this.audit('Department rules saved', rules.map((r) => r.dept + ':w' + r.maxWeekly + '/d' + r.maxDaily).join(', '));
    toast('Department rules saved', 'success');
  },

  bulkApplySubjects() {
    const txt = document.getElementById('bulksubj').value.trim();
    if (!txt) { toast('Nothing to apply', 'error'); return; }
    let n = 0;
    txt.split('\n').forEach((line) => {
      const c = line.split(',').map((x) => x.trim());
      if (c.length < 5) return;
      const [code, name, dept, type, hours] = c;
      const sub = { code: code.toUpperCase(), name, dept, type: type === 'Lab' ? 'Lab' : 'Theory', hoursPerWeek: parseInt(hours) || 3, credits: type === 'Lab' ? 2 : 3, semester: 1 };
      const idx = this.data.subjects.findIndex((x) => x.code === sub.code);
      if (idx >= 0) this.data.subjects[idx] = Object.assign(this.data.subjects[idx], sub);
      else this.data.subjects.push(sub);
      n++;
    });
    this.saveAll();
    this.audit('Bulk subjects applied', n + ' subject(s)');
    toast(n + ' subject(s) applied', 'success');
    this.renderDepartments();
  },

  availability() { return LS('tt_faculty_availability') || []; },
  isUnavailable(staffId, day, period) {
    const rec = this.availability().find((x) => x.staffId === staffId);
    return !!(rec && (rec.unavailable || []).some((u) => u.day === day && u.period === period));
  },
  renderFpGrid() {
    const id = document.getElementById('fpStaff')?.value;
    const grid = document.getElementById('fpGrid');
    if (!grid || !id) return;
    const rec = this.availability().find((x) => x.staffId === id) || { staffId: id, unavailable: [] };
    let html = '<div class="tt-container"><table class="tt-table"><tr><th class="time-col">Day \\ Period</th>' +
      Array.from({ length: this.config.periods }, (_, i) => `<th>P${i + 1}</th>`).join('') + '</tr>';
    this.DAYS.forEach((day) => {
      html += `<tr><td class="time-col">${day}</td>` +
        Array.from({ length: this.config.periods }, (_, i) => {
          const p = i + 1;
          const un = (rec.unavailable || []).some((u) => u.day === day && u.period === p);
          return `<td class="tt-cell ${un ? 'conflict' : 'free'}" style="${un ? '' : 'background:var(--accent-soft)'}" onclick="TT.toggleAvailability('${escapeAttr(id)}','${day}',${p},this)">${un ? '✗' : '✓'}</td>`;
        }).join('') + '</tr>';
    });
    html += '</table></div><div class="text-muted" style="font-size:0.8rem;margin-top:6px">✓ available — click to toggle ✗ unavailable</div>';
    grid.innerHTML = html;
  },
  toggleAvailability(staffId, day, period, cell) {
    const avail = this.availability();
    let rec = avail.find((x) => x.staffId === staffId);
    if (!rec) { rec = { staffId, unavailable: [] }; avail.push(rec); }
    rec.unavailable = rec.unavailable || [];
    const idx = rec.unavailable.findIndex((u) => u.day === day && u.period === period);
    if (idx >= 0) rec.unavailable.splice(idx, 1);
    else rec.unavailable.push({ day, period });
    LS('tt_faculty_availability', avail);
    if (cell) {
      const nowUn = idx < 0;
      cell.className = 'tt-cell ' + (nowUn ? 'conflict' : 'free');
      cell.style.cssText = nowUn ? '' : 'background:var(--accent-soft)';
      cell.textContent = nowUn ? '✗' : '✓';
    }
  },

  /* ---------- Faculty timetables (substitution tally view) ---------- */
  renderFacultyTimetables(el) {
    const depts = [...new Set(this.data.staff.map((s) => s.dept))];
    el.innerHTML = `
      <div class="card mt-16">
        <div style="font-weight:700;margin-bottom:6px">Faculty-wise Timetables</div>
        <div class="text-muted" style="font-size:0.85rem;margin-bottom:12px">
          Shows each faculty member's week. Substituted classes are highlighted:
          a faculty member covering for an absent colleague sees the added duty (<b>+SUB</b>),
          while the absent member's own grid shows who is covering (<b>Covered by …</b>) —
          the timetable is tallied on both sides automatically.
        </div>
        <div class="filters">
          <select id="ftDept" onchange="TT.renderFacultyList()" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px">
            <option value="">All Departments</option>${depts.map((d) => `<option>${escapeHtml(d)}</option>`).join('')}
          </select>
          <select id="ftStaff" onchange="TT.renderFacultyGridHost()" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px;min-width:260px"></select>
        </div>
        <div id="ftGrid"></div>
      </div>`;
    this.renderFacultyList();
  },
  renderFacultyList() {
    const dept = document.getElementById('ftDept')?.value || '';
    const sel = document.getElementById('ftStaff');
    if (!sel) return;
    const list = this.data.staff.filter((s) => !dept || s.dept === dept);
    sel.innerHTML = list.map((s) => {
      const own = this.ownLoad(s.id), cover = this.coverLoad(s.id);
      return `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.dept)}) — ${own} own${cover ? ' + ' + cover + ' cover' : ''}${s.attendanceStatus === 'Absent' ? ' • ABSENT' : ''}</option>`;
    }).join('');
    this.renderFacultyGridHost();
  },
  renderFacultyGridHost() {
    const id = document.getElementById('ftStaff')?.value;
    const host = document.getElementById('ftGrid');
    if (!host || !id) { if (host) host.innerHTML = '<div class="empty-state">No faculty in this department.</div>'; return; }
    host.innerHTML = this.buildFacultyGridHTML(id);
  },

  /**
   * Faculty-wise weekly grid. Three states per cell:
   *  - normal: the faculty teaches their own class
   *  - SUB (+tag): covering for an absent colleague (extra duty)
   *  - covered: their own class is being covered by someone else
   */
  buildFacultyGridHTML(staffId, opts = {}) {
    const s = this.staffById(staffId);
    if (!s) return '';
    const conflicts = this.validateSchedule();
    const conflictIds = new Set(conflicts.map((c) => c.slot).filter((x) => String(x).startsWith('slot:')).map((x) => String(x).slice(5)));
    const own = this.ownLoad(staffId), cover = this.coverLoad(staffId);
    const days = this.DAYS.slice(0, this.config.days);
    const periods = Array.from({ length: this.config.periods }, (_, i) => i + 1);
    let html = `<div class="tt-legend">
      <span><i class="dot" style="background:var(--primary)"></i> Own class</span>
      <span><i class="dot" style="background:var(--warning)"></i> Covering for absent faculty (+SUB)</span>
      <span><i class="dot" style="background:var(--danger)"></i> Covered by someone else</span>
      <span class="text-muted">${escapeHtml(s.name)} — ${own} own + ${cover} cover = ${own + cover} slots/week</span>
    </div>`;
    html += '<div class="tt-container"><table class="tt-table"><tr><th class="time-col">Day \\ Period</th>' +
      periods.map((p) => `<th>P${p}${p === 5 ? '<br><small style="color:var(--warning)">Break</small>' : ''}</th>`).join('') + '</tr>';
    days.forEach((day) => {
      html += `<tr><td class="time-col">${day}</td>`;
      periods.forEach((p) => {
        const slot = this.data.schedule.find((sl) => sl.day === day && sl.period === p && sl.subjectCode !== 'FREE' &&
          (sl.currentTeacherId === staffId || ((sl.originalTeacherId || sl.teacherId) === staffId)));
        let cls = 'tt-cell empty', inner = '<span class="text-muted">—</span>';
        if (slot) {
          const isCovering = slot.currentTeacherId === staffId && (slot.originalTeacherId || slot.teacherId) !== staffId;
          const isCovered = (slot.originalTeacherId || slot.teacherId) === staffId && slot.currentTeacherId && slot.currentTeacherId !== staffId;
          const isUncovered = !slot.currentTeacherId && !slot.teacherId ? false : ((slot.originalTeacherId || slot.teacherId) === staffId && !slot.currentTeacherId);
          const subName = this.subjectName(slot.subjectCode);
          if (isCovering) {
            cls = 'tt-cell slot substituted' + (this.isSlotLocked(slot) ? ' locked' : '');
            inner = `<span class="slot-subject">${this.isSlotLocked(slot) ? '🔒 ' : ''}+SUB ${escapeHtml(subName)}</span><span class="slot-teacher">for ${escapeHtml(this.staffName(slot.originalTeacherId || slot.teacherId))}</span><span class="slot-teacher">${escapeHtml(this.sectionName(slot.sectionId))} • ${escapeHtml(slot.roomName || '')}</span>`;
          } else if (isCovered) {
            cls = 'tt-cell slot conflict' + (this.isSlotLocked(slot) ? ' locked' : '');
            inner = `<span class="slot-subject">${this.isSlotLocked(slot) ? '🔒 ' : ''}${escapeHtml(subName)}</span><span class="slot-teacher">Covered by <b>${escapeHtml(this.staffName(slot.currentTeacherId))}</b></span><span class="slot-teacher">${escapeHtml(this.sectionName(slot.sectionId))}</span>`;
          } else if (isUncovered) {
            cls = 'tt-cell slot conflict';
            inner = `<span class="slot-subject">${escapeHtml(subName)}</span><span class="slot-teacher">⚠ Uncovered</span>`;
          } else {
            cls = 'tt-cell slot' + (slot.isLab ? ' lab' : '') + (conflictIds.has(slot.id) ? ' conflict' : '');
            inner = `<span class="slot-subject">${escapeHtml(subName)}</span><span class="slot-teacher">${escapeHtml(this.sectionName(slot.sectionId))} • ${escapeHtml(slot.roomName || '')}</span>`;
          }
        }
        html += `<td class="${cls}" style="min-width:104px">${inner}</td>`;
      });
      html += '</tr>';
    });
    html += '</table></div>';
    return opts.compact ? html : html;
  },

  /** Section-wise weekly grid. */
  buildSectionGridHTML(secId) {
    const sec = this.sectionById(secId);
    if (!sec) return '';
    if (!this.data.schedule.some((s) => s.sectionId === secId)) {
      return '<div class="empty-state">No schedule generated yet for this section.</div>';
    }
    const days = this.DAYS.slice(0, this.config.days);
    const periods = Array.from({ length: this.config.periods }, (_, i) => i + 1);
    let html = `<div class="tt-legend">
      <span><i class="dot" style="background:var(--accent)"></i> Lab</span>
      <span><i class="dot" style="background:var(--primary)"></i> Theory</span>
      <span><i class="dot" style="background:var(--warning)"></i> Substituted</span>
      <span><i class="dot" style="background:var(--accent);opacity:0.4"></i> Free</span>
      <span class="text-muted">${escapeHtml(sec.name)} (${escapeHtml(sec.dept)})</span>
    </div>`;
    html += '<div class="tt-container"><table class="tt-table"><tr><th class="time-col">Day \\ Period</th>' +
      periods.map((p) => `<th>P${p}${p === 5 ? '<br><small style="color:var(--warning)">Break</small>' : ''}</th>`).join('') + '</tr>';
    days.forEach((day) => {
      html += `<tr><td class="time-col">${day}</td>`;
      periods.forEach((p) => {
        const slot = this.data.schedule.find((sl) => sl.sectionId === secId && sl.day === day && sl.period === p);
        let cls = 'tt-cell empty', inner = '<span class="text-muted">—</span>';
        if (slot) {
          if (slot.subjectCode === 'FREE') {
            cls = 'tt-cell free';
            inner = '<span class="text-muted">FREE</span>';
          } else {
            const covering = slot.currentTeacherId && slot.currentTeacherId !== (slot.originalTeacherId || slot.teacherId);
            const uncovered = !slot.currentTeacherId;
            const locked = this.isSlotLocked(slot);
            cls = 'tt-cell slot' + (slot.isLab ? ' lab' : '') + (covering || uncovered ? ' substituted' : '') + (locked ? ' locked' : '');
            const teacherLine = uncovered
              ? `<span class="slot-teacher" style="color:var(--danger)">⚠ No faculty</span>`
              : covering
                ? `<span class="slot-teacher">${locked ? '🔒 ' : ''}${escapeHtml(this.staffName(slot.currentTeacherId))} <b style="color:var(--warning)">(sub for ${escapeHtml(this.staffName(slot.originalTeacherId || slot.teacherId))})</b></span>`
                : `<span class="slot-teacher">${escapeHtml(this.staffName(this.effTeacher(slot)))}</span>`;
            inner = `<span class="slot-subject">${escapeHtml(this.subjectName(slot.subjectCode))}</span>${teacherLine}<span class="slot-room">${escapeHtml(slot.roomName || '')}</span>`;
          }
        }
        html += `<td class="${cls}" style="min-width:104px">${inner}</td>`;
      });
      html += '</tr>';
    });
    html += '</table></div>';
    return html;
  },

  /* ================= Timetable Generator ================= */
  renderGenerator() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('genDays', this.config.days);
    set('genPeriods', this.config.periods);
    set('genMaxWeekly', this.config.maxWeekly);
    set('genMaxDaily', this.config.maxDaily);
    set('genMaxConsec', this.config.maxConsec);
    const rh = document.getElementById('genRespectHolidays');
    if (rh) rh.checked = this.config.respectHolidays;
    const results = document.getElementById('genResults');
    if (results) {
      const conflicts = this.validateSchedule().length;
      const teaching = this.teachingSlots().length;
      results.innerHTML = `
        <div class="card mt-24">
          <div class="label">Current Schedule Summary</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
            <div class="card"><div class="num">${teaching}</div><div class="label">Teaching Slots</div></div>
            <div class="card"><div class="num">${this.data.schedule.filter((s) => s.subjectCode === 'FREE').length}</div><div class="label">Free Periods</div></div>
            <div class="card"><div class="num" style="color:${conflicts ? 'var(--danger)' : 'var(--accent)'}">${conflicts}</div><div class="label">Conflicts</div></div>
            <div class="card"><div class="num">${this.data.sections.length ? Math.round(teaching / this.data.sections.length) : 0}</div><div class="label">Avg Slots / Section</div></div>
          </div>
          ${this.data.schedule.length ? `<div class="mt-16">
            <button class="btn primary" onclick="TT.deptTab('dept-subj');TT.showPanel('departments')">View Timetable</button>
            <button class="btn" onclick="TT.snapshotVersion('manual')">📸 Snapshot Version</button>
            <button class="btn danger" onclick="TT.clearSchedule()">Clear Schedule</button>
          </div>` : ''}
        </div>`;
    }
  },

  setGenStatus(text, cls) {
    const b = document.getElementById('genStatusBadge');
    if (b) { b.textContent = text; b.className = 'badge badge-' + (cls || 'info'); }
  },

  generateTimetable() {
    this.config.days = parseInt(document.getElementById('genDays')?.value) || this.config.days;
    this.config.periods = parseInt(document.getElementById('genPeriods')?.value) || this.config.periods;
    this.config.maxWeekly = parseInt(document.getElementById('genMaxWeekly')?.value) || this.config.maxWeekly;
    this.config.maxDaily = parseInt(document.getElementById('genMaxDaily')?.value) || this.config.maxDaily;
    this.config.maxConsec = parseInt(document.getElementById('genMaxConsec')?.value) || this.config.maxConsec;
    const rh = document.getElementById('genRespectHolidays');
    if (rh) this.config.respectHolidays = rh.checked;
    LS('tt_config', this.config);

    if (this.data.sections.length === 0 || this.data.subjects.length === 0 || this.data.staff.length === 0 || this.data.rooms.length === 0) {
      toast('Please add sections, subjects, staff, and rooms first', 'error');
      return;
    }

    this.generationCancellation = false;
    this.setGenStatus('Running…', 'info');
    this.showGenProgress(true, 0, 'Building curriculum...');

    setTimeout(() => {
      try {
        const result = this.solveTimetable(this.DAYS.slice(0, this.config.days), Array.from({ length: this.config.periods }, (_, i) => i + 1));
        this.data.schedule = result.schedule;
        this.assignBackups();
        this.saveAll();
        this.snapshotVersion('generation ' + new Date().toLocaleString(), true);
        this.audit('Timetable generated', `slots=${result.schedule.length}, conflicts=${result.conflicts.length}, unscheduled=${result.unscheduled}`);
        this.showGenProgress(false);
        this.setGenStatus(result.conflicts.length ? result.conflicts.length + ' conflicts' : 'Clean', result.conflicts.length ? 'warning' : 'success');
        if (result.unscheduled) {
          this.notify('warn', result.unscheduled + ' session(s) could not be placed — increase limits or reduce load');
          toast(result.unscheduled + ' session(s) unplaced, ' + result.conflicts.length + ' conflicts', 'warn');
        } else {
          toast('Timetable generated — ' + result.conflicts.length + ' conflicts', result.conflicts.length ? 'warn' : 'success');
        }
        this.render();
      } catch (e) {
        console.error(e);
        this.showGenProgress(false);
        this.setGenStatus('Failed', 'danger');
        toast('Generation failed: ' + e.message, 'error');
      }
    }, 30);
  },

  showGenProgress(show, pct = 0, text = '', log = '') {
    const ov = document.getElementById('genProgressOverlay');
    if (!ov) return;
    if (show) {
      ov.classList.add('open');
      this.updateGenProgress(pct, text, log);
    } else { ov.classList.remove('open'); }
  },

  updateGenProgress(pct, text, log) {
    const bar = document.getElementById('genProgressBar');
    const ptext = document.getElementById('genProgressText');
    const title = document.getElementById('genProgressTitle');
    const ltext = document.getElementById('genProgressLog');
    if (bar) bar.style.width = pct + '%';
    if (ptext) ptext.textContent = pct + '%';
    if (title && text) title.textContent = text;
    if (ltext && log) ltext.textContent = log;
  },

  deptRuleFor(dept) {
    const rules = LS('tt_dept_rules') || [];
    return rules.find((r) => r.dept === dept) || null;
  },

  /**
   * Constraint solver: backtracking with MRV ordering; if it fails or times
   * out, a greedy repair pass places whatever remains. Reports unplaced
   * sessions instead of silently dropping them.
   */
  solveTimetable(days, periods) {
    const sessions = [];
    this.data.sections.forEach((sec) => {
      const subs = this.subjectsForSection
        ? this.subjectsForSection(sec)
        : this.data.subjects.filter((s) => s.dept === sec.dept);
      subs.forEach((sub) => {
        let count = sub.hoursPerWeek;
        if (sub.type === 'Lab') count = Math.max(1, Math.floor(count / 2));
        for (let i = 0; i < count; i++) {
          sessions.push({ sectionId: sec.id, subjectCode: sub.code, isLab: sub.type === 'Lab', dept: sec.dept });
        }
      });
    });

    const rooms = this.data.rooms.filter((r) => r.status !== 'Maintenance');
    sessions.sort((a, b) => {
      if (a.isLab !== b.isLab) return b.isLab ? 1 : -1;
      return a.sectionId.localeCompare(b.sectionId);
    });

    const assignment = [];
    let nodes = 0;
    const startTime = Date.now();
    const timeLimitMs = 15000;

    const weekMaxFor = (t) => {
      const dr = this.deptRuleFor(t.dept);
      return t.maxHoursPerWeek || (dr && dr.maxWeekly) || this.config.maxWeekly;
    };
    const dayMaxFor = (t) => {
      const dr = this.deptRuleFor(t.dept);
      return t.maxHoursPerDay || (dr && dr.maxDaily) || this.config.maxDaily;
    };

    const getCandidates = (session, day, period) => {
      const sec = this.sectionById(session.sectionId);
      if (!sec) return [];
      const qualified = this.data.staff.filter((t) =>
        (t.subjects || []).includes(session.subjectCode) &&
        t.attendanceStatus !== 'Absent' && !this.isUnavailable(t.id, day, period)
      );
      if (!qualified.length) return [];
      const roomType = session.isLab ? 'Lab' : 'Classroom';
      const strength = Number(sec.strength) || 0;
      const roomOpts = rooms.filter((r) =>
        r.type === roomType && (r.dept === sec.dept || r.dept === 'GENERAL') &&
        (!strength || !Number(r.capacity) || Number(r.capacity) >= strength)
      );
      if (!roomOpts.length) return [];

      const out = [];
      for (const t of qualified) {
        if (assignment.some((a) => a.teacher === t.id && a.day === day && a.period === period)) continue;
        if (this.teacherLoad(assignment, t.id) + 1 > weekMaxFor(t)) continue;
        if (this.teacherDailyLoad(assignment, t.id, day) + 1 > dayMaxFor(t)) continue;
        if (this.teacherConsecutive(assignment, t.id, day, period) >= (t.maxConsec || this.config.maxConsec)) continue;
        for (const r of roomOpts) {
          if (assignment.some((a) => a.room === r.name && a.day === day && a.period === period)) continue;
          if (assignment.some((a) => a.sectionId === sec.id && a.day === day && a.period === period)) continue;
          out.push({ day, period, teacher: t.id, room: r.name });
        }
      }
      return out;
    };

    const tryPlace = (session, cand) => {
      const slots = [{ ...cand, subjectCode: session.subjectCode, sectionId: session.sectionId, isLab: session.isLab }];
      if (session.isLab && cand.period + 1 <= this.config.periods) {
        const p2 = cand.period + 1;
        if (assignment.some((a) => a.teacher === cand.teacher && a.day === cand.day && a.period === p2)) return null;
        if (assignment.some((a) => a.room === cand.room && a.day === cand.day && a.period === p2)) return null;
        if (assignment.some((a) => a.sectionId === session.sectionId && a.day === cand.day && a.period === p2)) return null;
        slots.push({ ...cand, period: p2, subjectCode: session.subjectCode, sectionId: session.sectionId, isLab: session.isLab });
      } else if (session.isLab) {
        return null;                                  // lab needs 2 consecutive periods
      }
      slots.forEach((s) => assignment.push(s));
      return slots;
    };

    const placed = new Set();                          // session indices placed
    const solve = (index) => {
      nodes++;
      if (nodes % 400 === 0) {
        const pct = Math.min(95, Math.round((placed.size / sessions.length) * 100));
        this.updateGenProgress(pct, 'Solving constraints...', `Nodes: ${nodes} — placed ${placed.size}/${sessions.length}`);
        if (this.generationCancellation) throw new Error('Generation cancelled');
        if (Date.now() - startTime > timeLimitMs) throw new Error('Time limit reached');
      }
      if (placed.size === sessions.length) return true;

      // MRV: choose the unplaced session with fewest options
      let bestIdx = -1, bestCands = null, bestCount = Infinity;
      for (let i = 0; i < sessions.length; i++) {
        if (placed.has(i)) continue;
        const session = sessions[i];
        const cands = [];
        for (const day of days) {
          for (const period of periods) {
            if (assignment.some((a) => a.sectionId === session.sectionId && a.day === day && a.period === period)) continue;
            if (session.isLab && period + 1 > this.config.periods) continue;
            for (const c of getCandidates(session, day, period)) cands.push(c);
          }
        }
        if (cands.length === 0) return false;
        if (cands.length < bestCount) { bestCount = cands.length; bestIdx = i; bestCands = cands; }
        if (bestCount === 1) break;
      }
      if (bestIdx < 0) return false;

      const session = sessions[bestIdx];
      bestCands.sort((a, b) => this.teacherLoad(assignment, a.teacher) - this.teacherLoad(assignment, b.teacher));

      for (const cand of bestCands) {
        const slots = tryPlace(session, cand);
        if (!slots) continue;
        placed.add(bestIdx);
        if (solve(index + 1)) return true;
        slots.forEach(() => assignment.pop());
        placed.delete(bestIdx);
      }
      return false;
    };

    let solved = false;
    try {
      solved = solve(0);
    } catch (e) {
      if (e.message !== 'Time limit reached' && e.message !== 'Generation cancelled') throw e;
    }

    // ---- greedy repair for anything the exact solver could not place ----
    let unscheduled = 0;
    for (let i = 0; i < sessions.length; i++) {
      if (placed.has(i)) continue;
      const session = sessions[i];
      let done = false;
      for (const day of days) {
        for (const period of periods) {
          if (done) break;
          if (assignment.some((a) => a.sectionId === session.sectionId && a.day === day && a.period === period)) continue;
          if (session.isLab && period + 1 > this.config.periods) continue;
          for (const cand of getCandidates(session, day, period)) {
            if (tryPlace(session, cand)) { placed.add(i); done = true; break; }
          }
        }
        if (done) break;
      }
      if (!done) unscheduled++;
    }
    this.updateGenProgress(97, 'Finalizing...', `Placed ${placed.size}/${sessions.length}`);

    const schedule = assignment.map((a) => ({
      id: uid(), day: a.day, period: a.period, sectionId: a.sectionId,
      subjectCode: a.subjectCode, teacherId: a.teacher, roomName: a.room,
      isLab: a.isLab, isSubstituted: false, originalTeacherId: a.teacher,
      currentTeacherId: a.teacher, backupTeacherId: null
    }));

    for (const sec of this.data.sections) {
      for (const day of days) {
        for (const period of periods) {
          const exists = schedule.find((s) => s.sectionId === sec.id && s.day === day && s.period === period);
          if (!exists) {
            schedule.push({ id: uid(), day, period, sectionId: sec.id, subjectCode: 'FREE', teacherId: null, roomName: null, isLab: false, isSubstituted: false, originalTeacherId: null, currentTeacherId: null, backupTeacherId: null });
          }
        }
      }
    }
    return { schedule, conflicts: this.validateSchedule(schedule), solved, unscheduled };
  },

  teacherLoad(assigned, teacherId) { return assigned.filter((a) => a.teacher === teacherId).length; },
  teacherDailyLoad(assigned, teacherId, day) { return assigned.filter((a) => a.teacher === teacherId && a.day === day).length; },
  teacherConsecutive(assigned, teacherId, day, period) {
    let c = 1;
    for (let p = period - 1; p >= 1; p--) { if (assigned.some((a) => a.teacher === teacherId && a.day === day && a.period === p)) c++; else break; }
    for (let p = period + 1; p <= this.config.periods; p++) { if (assigned.some((a) => a.teacher === teacherId && a.day === day && a.period === p)) c++; else break; }
    return c;
  },

  /** Assign a designated backup (ideally free at that time) to every teaching slot. */
  assignBackups() {
    const busyAt = (day, period) => new Set(
      this.teachingSlots().filter((s) => s.day === day && s.period === period).map((s) => this.effTeacher(s))
    );
    this.data.schedule.forEach((slot) => {
      if (slot.subjectCode === 'FREE') return;
      if (!slot.originalTeacherId) slot.originalTeacherId = slot.teacherId;
      if (!slot.currentTeacherId) slot.currentTeacherId = slot.teacherId;
      const sec = this.sectionById(slot.sectionId);
      const dept = sec ? sec.dept : null;
      const busy = busyAt(slot.day, slot.period);
      busy.add(slot.teacherId);
      const pool = this.data.staff.filter((s) => s.id !== slot.teacherId && s.attendanceStatus !== 'Absent' && !this.isUnavailable(s.id, slot.day, slot.period));
      const expertFree = pool.find((s) => s.dept === dept && (s.subjects || []).includes(slot.subjectCode) && !busy.has(s.id));
      const deptFree = pool.find((s) => s.dept === dept && !busy.has(s.id));
      const expertAny = pool.find((s) => (s.subjects || []).includes(slot.subjectCode));
      const any = pool.find((s) => s.dept === dept);
      const b = expertFree || deptFree || expertAny || any || null;
      slot.backupTeacherId = b ? b.id : null;
      slot.isSubstituted = false;
    });
    this.saveAll();
  },

  clearSchedule() {
    if (!confirm('Clear the generated timetable?')) return;
    this.data.schedule = [];
    this.saveAll();
    this.audit('Schedule cleared', '');
    toast('Schedule cleared', 'success');
    this.render();
  },

  /**
   * Validate a schedule (defaults to current). Uses the EFFECTIVE teacher so
   * substitutions are checked too, and flags uncovered slots as critical.
   */
  validateSchedule(sched) {
    const list = sched || this.data.schedule;
    const conflicts = [];
    const seen = new Map();
    for (const s of list) {
      if (s.subjectCode === 'FREE') continue;
      const teacher = this.effTeacher(s);
      if (teacher) {
        const k1 = s.day + '|' + s.period + '|teacher|' + teacher;
        if (seen.has(k1)) conflicts.push({ type: 'teacher', slot: 'slot:' + s.id, day: s.day, period: s.period, detail: this.staffName(teacher) + ' double-booked (' + this.sectionName(s.sectionId) + ' ' + s.subjectCode + ')' });
        seen.set(k1, true);
      } else {
        conflicts.push({ type: 'uncovered', slot: 'slot:' + s.id, day: s.day, period: s.period, detail: 'No faculty for ' + this.sectionName(s.sectionId) + ' ' + s.subjectCode });
      }
      if (s.roomName) {
        const k2 = s.day + '|' + s.period + '|room|' + s.roomName;
        if (seen.has(k2)) conflicts.push({ type: 'room', slot: 'slot:' + s.id, day: s.day, period: s.period, detail: 'Room ' + s.roomName + ' double-booked' });
        seen.set(k2, true);
      }
      const k3 = s.day + '|' + s.period + '|section|' + s.sectionId;
      if (seen.has(k3)) conflicts.push({ type: 'section', slot: 'slot:' + s.id, day: s.day, period: s.period, detail: this.sectionName(s.sectionId) + ' double-booked' });
      seen.set(k3, true);
    }
    for (const st of this.data.staff) {
      const load = this.slotLoad(st.id, list);
      const max = st.maxHoursPerWeek || (this.deptRuleFor(st.dept) && this.deptRuleFor(st.dept).maxWeekly) || this.config.maxWeekly;
      if (load > max) {
        conflicts.push({ type: 'overload', slot: 'staff_' + st.id, detail: st.name + ' overloaded (' + load + ' > ' + max + ' hrs/week)' });
      }
      for (const day of this.DAYS) {
        const daily = list.filter((s) => s.subjectCode !== 'FREE' && s.day === day && this.effTeacher(s) === st.id).length;
        const dmax = st.maxHoursPerDay || (this.deptRuleFor(st.dept) && this.deptRuleFor(st.dept).maxDaily) || this.config.maxDaily;
        if (daily > dmax) {
          conflicts.push({ type: 'daily-overload', slot: 'staff_' + st.id, day, detail: st.name + ' exceeds daily max on ' + day + ' (' + daily + ' > ' + dmax + ')' });
        }
      }
    }
    return conflicts;
  },

  /* ================= Daily Attendance ================= */
  attendanceLog() { return LS('tt_attendance_log') || []; },
  logAttendance(date, staffId, status, note) {
    const log = this.attendanceLog();
    log.unshift({ id: uid(), date, staffId, status, note: note || '', ts: new Date().toISOString() });
    if (log.length > 2000) log.length = 2000;
    LS('tt_attendance_log', log);
  },

  renderAttendance() {
    const el = document.getElementById('attendanceTableBody');
    if (!el) return;
    const dateEl = document.getElementById('attDate');
    if (dateEl && !dateEl.value) dateEl.value = todayISO();
    const date = dateEl ? dateEl.value : todayISO();
    const wd = weekdayOf(date);
    const scopeEl = document.getElementById('attWeekScope');
    const weekScope = !!(scopeEl && scopeEl.checked);
    if (scopeEl && scopeEl.dataset.bound !== '1') {
      scopeEl.dataset.bound = '1';
      scopeEl.onchange = () => this.renderAttendance();
    }
    this.renderAttendanceSummary(date, wd, weekScope);
    el.innerHTML = this.data.staff.map((s) => {
      const slotsToday = (wd && this.DAYS.includes(wd))
        ? this.teachingSlots().filter((sl) => sl.day === wd && ((sl.originalTeacherId || sl.teacherId) === s.id || sl.currentTeacherId === s.id)).length
        : 0;
      const isAbsent = s.attendanceStatus === 'Absent';
      const covering = this.coverLoad(s.id);
      const affected = this.slotsToCover(s, weekScope ? null : date).filter((sl) => this.effTeacher(sl) === s.id).length;
      return `<tr class="${isAbsent ? 'row-absent' : ''}">
        <td><strong>${escapeHtml(s.id)}</strong></td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.dept)}</td>
        <td>
          <label class="toggle ${isAbsent ? 'on' : ''}" title="${isAbsent ? 'Absent' : 'Present'} — click to change">
            <input type="checkbox" ${isAbsent ? 'checked' : ''} onchange="TT.setAttendance('${escapeAttr(s.id)}', this.checked)"/>
            <span class="track"><span class="thumb"></span></span>
            <span class="toggle-label">${isAbsent ? 'Absent' : 'Present'}</span>
          </label>
        </td>
        <td>${wd && this.DAYS.includes(wd) ? slotsToday : '<span class="text-muted">—</span>'}${covering ? `<div class="text-muted" style="font-size:0.76rem">${covering} cover dut${covering === 1 ? 'y' : 'ies'}</div>` : ''}</td>
        <td>
          <button class="btn btn-sm" onclick="TT.openSubstitutionPlanner('${escapeAttr(s.id)}')">${isAbsent ? 'Rearrange Cover' : 'Plan Cover'}${affected ? ' (' + affected + ')' : ''}</button>
          <button class="btn btn-sm" onclick="TT.openStaffModal('${escapeAttr(s.id)}')">Details</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="empty-state" style="padding:24px">No staff found.</td></tr>`;
    this.renderAttendanceLog();
  },

  renderAttendanceSummary(date, wd, weekScope) {
    const host = document.getElementById('attendanceSummary');
    if (!host) return;
    const present = this.data.staff.filter((s) => s.attendanceStatus !== 'Absent').length;
    const absent = this.data.staff.filter((s) => s.attendanceStatus === 'Absent').length;
    const uncovered = this.teachingSlots().filter((sl) => !this.effTeacher(sl)).length;
    const affected = (wd && this.DAYS.includes(wd))
      ? this.teachingSlots().filter((sl) => sl.day === wd && this.data.staff.some((f) => f.id === (sl.originalTeacherId || sl.teacherId) && f.attendanceStatus === 'Absent')).length
      : 0;
    host.innerHTML = `
      <div class="att-summary">
        <div class="att-stat"><span class="att-num" style="color:var(--accent)">${present}</span><span class="att-lbl">Present</span></div>
        <div class="att-stat"><span class="att-num" style="color:${absent ? 'var(--danger)' : 'var(--text-muted)'}">${absent}</span><span class="att-lbl">Absent</span></div>
        <div class="att-stat"><span class="att-num">${affected}</span><span class="att-lbl">Affected Slots</span></div>
        <div class="att-stat"><span class="att-num" style="color:${uncovered ? 'var(--danger)' : 'var(--accent)'}">${uncovered}</span><span class="att-lbl">Uncovered</span></div>
        <div class="att-actions">
          <div class="text-muted" style="font-size:0.8rem;margin-bottom:6px">Applying to: <b>${weekScope ? 'the whole week' : escapeHtml(date) + ' (' + escapeHtml(wd || 'Weekend') + ')'}</b></div>
          <button class="btn btn-sm primary" onclick="TT.showPanel('substitution')">Open Substitution Planner</button>
        </div>
      </div>`;
  },

  /** Sliding-switch handler: true = absent, false = present. */
  setAttendance(id, isAbsent) {
    const s = this.staffById(id);
    if (!s) return;
    const scopeEl = document.getElementById('attWeekScope');
    const weekScope = !!(scopeEl && scopeEl.checked);
    const dateEl = document.getElementById('attDate');
    const date = weekScope ? null : (dateEl && dateEl.value ? dateEl.value : todayISO());
    if (isAbsent) {
      if (s.attendanceStatus === 'Absent') return;
      const res = this.markAbsentStaff(s, { date, mode: 'auto', silent: false });
      this.notify(res.critical ? 'error' : 'success', s.name + ' marked absent — ' + res.success + ' covered' + (res.critical ? ', ' + res.critical + ' critical' : ''));
    } else {
      if (s.attendanceStatus !== 'Absent') return;
      this.markPresentStaff(s, { date, silent: false });
    }
    this.render();
    this.renderAttendanceLog();
  },

  /** Bulk present/absent for the selected date (or whole week). */
  markAllAttendance(mode) {
    const scopeEl = document.getElementById('attWeekScope');
    const weekScope = !!(scopeEl && scopeEl.checked);
    const dateEl = document.getElementById('attDate');
    const date = weekScope ? null : (dateEl && dateEl.value ? dateEl.value : todayISO());
    const absent = mode === 'absent';
    if (!confirm((absent ? 'Mark ALL ' + this.data.staff.length + ' faculty absent' : 'Mark ALL ' + this.data.staff.length + ' faculty present')
      + (weekScope ? ' for the whole week?' : ' for ' + date + '?'))) return;
    let changed = 0, covered = 0, critical = 0;
    this.data.staff.forEach((s) => {
      if (absent) {
        if (s.attendanceStatus === 'Absent') return;
        const res = this.markAbsentStaff(s, { date, mode: 'auto', silent: true });
        covered += res.success; critical += res.critical; changed++;
      } else {
        if (s.attendanceStatus !== 'Absent') return;
        this.markPresentStaff(s, { date, silent: true }); changed++;
      }
    });
    this.audit('Bulk attendance', (absent ? 'All absent' : 'All present') + ' ×' + changed + (weekScope ? ' (week)' : ' (' + date + ')'));
    toast(changed + ' staff updated' + (absent ? ' — ' + covered + ' covered, ' + critical + ' critical' : ''), absent && critical ? 'warn' : 'success');
    this.notify(absent && critical ? 'warn' : 'success', 'Bulk attendance: ' + changed + ' updated' + (absent ? ', ' + covered + ' covered, ' + critical + ' critical' : ''));
    this.render();
  },

  renderAttendanceLog() {
    const host = document.getElementById('attendanceLog');
    if (!host) return;
    const dateEl = document.getElementById('attDate');
    const date = dateEl ? dateEl.value : todayISO();
    const log = this.attendanceLog().filter((l) => l.date === date).slice(0, 20);
    const subs = this.data.substitutions.filter((r) => r.date === date).slice(0, 20);
    host.innerHTML = `
      <div class="card">
        <div style="font-weight:700;margin-bottom:10px">Activity for ${escapeHtml(date)}</div>
        ${log.map((l) => `<div class="kv"><span><b>${escapeHtml(this.staffName(l.staffId))}</b> marked <span class="badge badge-${l.status === 'Absent' ? 'danger' : 'success'}">${escapeHtml(l.status)}</span> ${l.note ? '<span class="text-muted">' + escapeHtml(l.note) + '</span>' : ''}</span><span class="text-muted" style="font-size:0.78rem">${new Date(l.ts).toLocaleTimeString()}</span></div>`).join('')}
        ${subs.map((r) => `<div class="kv"><span>${escapeHtml(this.staffName(r.absentTeacher))} → ${r.substitute ? escapeHtml(this.staffName(r.substitute)) : '<b class="text-danger">uncovered</b>'} <span class="text-muted">${escapeHtml(this.sectionName(r.sectionId))} ${escapeHtml(r.day)} P${escapeHtml(r.period)} (${escapeHtml(r.mode || 'auto')})</span></span></div>`).join('')}
        ${!log.length && !subs.length ? '<div class="text-muted" style="font-size:0.86rem">No activity recorded for this date.</div>' : ''}
      </div>`;
  },

  /** Toggle global attendance; date-scoped when a date is selected on the attendance panel. */
  toggleAbsent(id) {
    const s = this.staffById(id);
    if (!s) return;
    const onAttendancePanel = this.activePanel === 'attendance';
    const dateEl = document.getElementById('attDate');
    const date = onAttendancePanel && dateEl && dateEl.value ? dateEl.value : null;
    if (s.attendanceStatus === 'Absent') {
      this.markPresentStaff(s, { date, silent: false });
    } else {
      this.markAbsentStaff(s, { date, mode: 'auto', silent: false });
    }
    this.audit('Attendance toggled', s.name + ' -> ' + s.attendanceStatus + (date ? ' (' + date + ')' : ''));
    this.render();
  },

  autoProcessAbsences(silent) {
    const today = todayISO();
    const wd = weekdayOf(today);
    let processed = 0, covered = 0, critical = 0;
    // 1) due planned leaves -> mark absent (date-scoped)
    this.data.leaves.forEach((l) => {
      if (l.status !== 'approved' || !l.start || !l.end) return;
      if (l.start <= today && today <= l.end) {
        l.processed = l.processed || {};
        if (!l.processed[today]) {
          const s = this.staffById(l.staffId);
          if (s && s.attendanceStatus !== 'Absent') {
            const res = this.markAbsentStaff(s, { date: today, mode: 'auto', silent: true, reason: 'Planned leave (' + (l.type || 'leave') + ')' });
            covered += res.success; critical += res.critical; processed++;
          }
          l.processed[today] = true;
        }
      }
    });
    // 2) repair: staff marked absent who still hold slots (uncovered)
    if (wd && this.DAYS.includes(wd)) {
      this.data.staff.filter((s) => s.attendanceStatus === 'Absent').forEach((s) => {
        const holding = this.teachingSlots().filter((sl) => sl.day === wd && (sl.originalTeacherId || sl.teacherId) === s.id && this.effTeacher(sl) === s.id);
        if (holding.length) {
          const res = this.autoSubstitute(s, { date: today, silent: true });
          covered += res.success; critical += res.critical; processed++;
        }
      });
    }
    if (!silent) {
      if (processed) this.notify('info', 'Auto-processed absences: ' + processed + ' staff, ' + covered + ' covered, ' + critical + ' critical');
      toast('Auto-processed ' + processed + ' absence(s) — ' + covered + ' covered, ' + critical + ' critical', processed ? 'success' : 'info');
      this.render();
    }
    return { processed, covered, critical };
  },

  /* ================= Substitution Engine ================= */

  /** Busy effective teachers at day|period, optionally simulating extra assignments. */
  busyAt(day, period, extra) {
    const set = new Set(this.teachingSlots().filter((s) => s.day === day && s.period === period).map((s) => this.effTeacher(s)));
    if (extra) extra.forEach((x) => set.add(x));
    return set;
  },

  /**
   * Ranked substitution candidates for one slot, grouped into explicit
   * priority tiers so the *preference order* is: same subject first, then
   * same department, then other qualified staff.
   *
   *   tier 1 — teaches the exact subject (subject expert)
   *   tier 2 — same department as the affected section
   *   tier 3 — any other available member of staff
   *   tier 0 — not eligible (busy at this time, or marks unavailable)
   *
   * Within a tier, a free candidate always outranks a busy one, a designated
   * backup is nudged up, and lighter current load breaks remaining ties.
   * Busy / tier-3 staff are shown but never auto-picked.
   */
  candidatesForSlot(slot, absentId, extraBusy) {
    const sec = this.sectionById(slot.sectionId);
    const dept = sec ? sec.dept : null;
    const busy = this.busyAt(slot.day, slot.period, extraBusy);
    busy.add(absentId);
    return this.data.staff
      .filter((x) => x.id !== absentId && x.attendanceStatus !== 'Absent')
      .map((x) => {
        const expert = (x.subjects || []).includes(slot.subjectCode);
        const sameDept = x.dept === dept;
        const free = !busy.has(x.id);
        const unavailable = this.isUnavailable(x.id, slot.day, slot.period);
        const load = this.slotLoad(x.id);
        const backup = slot.backupTeacherId === x.id;

        // Priority tier: subject > department > other.
        let priority = 3, priorityLabel = 'Other staff';
        if (expert) { priority = 1; priorityLabel = 'Same subject'; }
        else if (sameDept) { priority = 2; priorityLabel = 'Same department'; }
        if (unavailable) { priority = 0; priorityLabel = 'Unavailable'; }

        const tags = [];
        if (expert) tags.push('subject expert');
        if (sameDept) tags.push('same dept');
        if (free) tags.push('free'); else tags.push('BUSY at this time');
        if (backup) tags.push('designated backup');
        if (unavailable) tags.push('marked unavailable');

        // Sort key: tier first (1 = best), then availability, then backup, then load.
        // Higher score = better, so invert the tier number.
        const tierWeight = { 1: 3, 2: 2, 3: 1, 0: 0 }[priority];
        const score = tierWeight * 1000
          + (free ? 100 : 0)
          + (backup ? 30 : 0)
          - Math.min(load, 20) * 0.6;

        return {
          staff: x,
          score: Math.round(score * 10) / 10,
          priority, priorityLabel, tags,
          expert, sameDept, free, backup, unavailable, load,
          // Auto/most-preferred pick must be free AND be same-subject or same-dept.
          eligible: free && !unavailable && (expert || sameDept)
        };
      })
      .sort((a, b) => b.score - a.score);
  },

  /** Slots of a teacher that need substitution (optionally scoped to a weekday). */
  slotsToCover(teacher, date) {
    const wd = weekdayOf(date);
    return this.teachingSlots().filter((sl) =>
      (sl.originalTeacherId || sl.teacherId) === teacher.id &&
      (!wd || !this.DAYS.includes(wd) || sl.day === wd)
    );
  },

  /**
   * AUTOMATIC substitution: walks the affected slots in order and assigns the
   * best ranked candidate, simulating assignments so the same free faculty is
   * never double-booked across simultaneous slots. Returns counts.
   */
  autoSubstitute(teacher, opts = {}) {
    const { date = null, silent = false } = opts;
    const slots = this.slotsToCover(teacher, date);
    // simulated assignments per time-slot (day|period -> staff ids), so a
    // substitute used at Mon P1 stays available for Tue P1.
    const extraBusy = new Map();
    const busyFor = (sl) => {
      const k = sl.day + '|' + sl.period;
      if (!extraBusy.has(k)) extraBusy.set(k, new Set());
      return extraBusy.get(k);
    };
    let success = 0, critical = 0, locked = 0;
    slots.forEach((sl) => {
      if (this.isSlotLocked(sl)) { locked++; return; }        // confirmed cover is protected
      if (this.effTeacher(sl) !== teacher.id) return;         // already covered
      const extra = busyFor(sl);
      const cands = this.candidatesForSlot(sl, teacher.id, extra);
      const best = cands.find((c) => c.eligible);
      if (best) {
        this.applySubstitution(sl, best.staff.id, { mode: 'auto', date, reason: opts.reason || 'Auto substitution', priority: best.priority, lock: true });
        extra.add(best.staff.id);
        success++;
      } else {
        this.applySubstitution(sl, null, { mode: 'auto', date, reason: opts.reason || 'No eligible substitute' });
        critical++;
      }
    });
    teacher.attendanceStatus = 'Absent';
    this.logAttendance(date || todayISO(), teacher.id, 'Absent', (opts.reason || '') + (date ? '' : ' (week-wide)'));
    this.saveAll();
    this.audit('Auto substitution', `${teacher.name}: ${success} covered, ${critical} critical` + (date ? ' on ' + date : ''));
    if (!silent) {
      this.notify(critical ? 'error' : 'success', critical
        ? teacher.name + ' absent — ' + success + ' covered, ' + critical + ' slot(s) need manual attention'
        : teacher.name + ' absent — all ' + success + ' slot(s) covered automatically');
      toast(teacher.name + ' absent — ' + success + ' auto-covered, ' + critical + ' critical', critical ? 'error' : 'success');
    }
    return { success, critical, locked, slots: slots.length };
  },

  /** Record a substitution on one slot (keeps the designated backup intact). */
  applySubstitution(slot, subId, meta = {}) {
    const absentId = slot.originalTeacherId || slot.teacherId;
    slot.currentTeacherId = subId || null;
    slot.isSubstituted = true;
    // A confirmed assignment locks the slot so it is not silently re-planned.
    slot.subLocked = subId ? true : !!meta.lock;
    if (meta.mode) slot.subMode = meta.mode;
    this.data.substitutions.unshift({
      id: uid(), ts: new Date().toISOString(), date: meta.date || null,
      slotId: slot.id, absentTeacher: absentId, substitute: subId,
      sectionId: slot.sectionId, subjectCode: slot.subjectCode,
      day: slot.day, period: slot.period,
      status: subId ? 'success' : 'critical', mode: meta.mode || 'auto',
      reason: meta.reason || '', priority: meta.priority || null, locked: !!slot.subLocked
    });
    if (this.data.substitutions.length > 1000) this.data.substitutions.length = 1000;
    if (!subId) {
      this.notify('error', 'Critical: no substitute for ' + this.sectionName(slot.sectionId) + ' ' + slot.subjectCode + ' (' + slot.day + ' P' + slot.period + ') — ' + this.staffName(absentId));
    }
  },

  /** Is this slot's cover confirmed and locked against re-planning? */
  isSlotLocked(slot) {
    if (!slot || slot.subjectCode === 'FREE') return false;
    return !!(slot.isSubstituted && slot.subLocked && slot.currentTeacherId);
  },

  /** Mark staff absent and cover their slots (date-scoped or week-wide). */
  markAbsentStaff(teacher, opts = {}) {
    const { date = null, mode = 'auto', silent = false } = opts;
    teacher.attendanceStatus = 'Absent';
    const result = mode === 'manual'
      ? { success: 0, critical: 0 }
      : this.autoSubstitute(teacher, { date, silent: true, reason: opts.reason });
    if (!silent) {
      this.notify('warn', teacher.name + ' marked absent' + (date ? ' on ' + date : ''));
    }
    this.saveAll();
    return result;
  },

  /**
   * Mark present: restore the faculty's own classes (reverting substitutions
   * that covered them). Cover duties the faculty performs for others remain.
   */
  markPresentStaff(teacher, opts = {}) {
    const { date = null, silent = false } = opts;
    const wd = weekdayOf(date);
    teacher.attendanceStatus = 'Present';
    this.logAttendance(date || todayISO(), teacher.id, 'Present');
    let restored = 0;
    this.data.schedule.forEach((sl) => {
      if (sl.subjectCode === 'FREE') return;
      const orig = sl.originalTeacherId || sl.teacherId;
      if (orig !== teacher.id) return;
      if (wd && this.DAYS.includes(wd) && sl.day !== wd) return;
      if (sl.currentTeacherId !== teacher.id && (sl.isSubstituted || sl.currentTeacherId === null)) {
        sl.currentTeacherId = teacher.id;
        sl.isSubstituted = false;
        sl.subLocked = false;
        sl.subMode = null;
        restored++;
        const rec = this.data.substitutions.find((r) => r.slotId === sl.id && r.absentTeacher === teacher.id && r.status !== 'reverted');
        if (rec) { rec.status = 'reverted'; rec.revertedTs = new Date().toISOString(); }
      }
    });
    this.saveAll();
    this.audit('Marked present', teacher.name + (restored ? ': restored ' + restored + ' slot(s)' : '') + (date ? ' (' + date + ')' : ''));
    if (!silent) toast(teacher.name + ' present — ' + restored + ' slot(s) restored', 'success');
    return { restored };
  },

  /** Undo one substitution record (manual correction). */
  revertSubstitution(recordId) {
    const rec = this.data.substitutions.find((r) => r.id === recordId);
    if (!rec || rec.status === 'reverted') return;
    const slot = this.data.schedule.find((s) => s.id === rec.slotId);
    if (slot) {
      slot.currentTeacherId = slot.originalTeacherId || slot.teacherId;
      slot.isSubstituted = false;
      slot.subLocked = false;
      slot.subMode = null;
    }
    rec.status = 'reverted';
    rec.locked = false;
    rec.revertedTs = new Date().toISOString();
    this.saveAll();
    this.audit('Substitution reverted', this.staffName(rec.absentTeacher) + ' slot ' + (rec.day || '') + ' P' + (rec.period || ''));
    toast('Substitution reverted — original faculty restored', 'success');
    this.render();
  },

  /* ================= Substitution Panel (UI) ================= */
  renderSubstitution() {
    const dateEl = document.getElementById('subDate');
    if (dateEl && !dateEl.value) dateEl.value = todayISO();
    this.renderSubStats();
    this.renderSubstitutionFaculty();
    this.renderSubstitutionHistory();
    this.renderLeavePlanner();
  },

  renderSubStats() {
    const host = document.getElementById('subStats');
    if (!host) return;
    const date = document.getElementById('subDate')?.value || todayISO();
    const wd = weekdayOf(date);
    const absent = this.data.staff.filter((s) => s.attendanceStatus === 'Absent').length;
    const daySlots = (wd && this.DAYS.includes(wd)) ? this.teachingSlots().filter((s) => s.day === wd) : this.teachingSlots();
    const affected = daySlots.filter((s) => this.data.staff.some((f) => f.id === (s.originalTeacherId || s.teacherId) && f.attendanceStatus === 'Absent')).length;
    const uncovered = daySlots.filter((s) => this.slotNeedsCover(s)).length;
    const covered = Math.max(0, affected - uncovered);
    const dueLeaves = this.data.leaves.filter((l) => l.status === 'approved' && l.start <= date && date <= l.end).length;
    const planned = this.data.leaves.filter((l) => l.status === 'approved' && l.start <= date && date <= l.end).length;
    host.innerHTML = `
      <div class="card"><div class="num" style="color:${absent ? 'var(--danger)' : 'var(--accent)'}">${absent}</div><div class="label">Absent Faculty</div></div>
      <div class="card"><div class="num">${affected}</div><div class="label">Affected Slots (${escapeHtml(wd || 'week')})</div></div>
      <div class="card"><div class="num" style="color:${uncovered ? 'var(--danger)' : 'var(--accent)'}">${uncovered}</div><div class="label">Uncovered Slots</div></div>
      <div class="card"><div class="num" style="color:var(--accent)">${covered}</div><div class="label">Covered Slots</div></div>
      <div class="card"><div class="num">${dueLeaves || planned}</div><div class="label">Leaves Due</div></div>`;
  },

  renderSubstitutionFaculty() {
    const el = document.getElementById('substitutionFacultyList');
    if (!el) return;
    const q = (document.getElementById('subSearch')?.value || '').toLowerCase();
    const deptSel = document.getElementById('subDeptFilter');
    this.fillDeptSelect(deptSel, this.data.staff.map((s) => s.dept));
    const dfv = deptSel ? deptSel.value : '';
    const date = document.getElementById('subDate')?.value || todayISO();
    const wd = weekdayOf(date);
    const rows = this.data.staff.filter((s) =>
      (!q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || (s.dept || '').toLowerCase().includes(q)) &&
      (!dfv || s.dept === dfv)
    ).sort((a, b) => (a.attendanceStatus === 'Absent' ? 0 : 1) - (b.attendanceStatus === 'Absent' ? 0 : 1) || a.name.localeCompare(b.name));

    el.innerHTML = rows.map((s) => {
      const isAbsent = s.attendanceStatus === 'Absent';
      const ownSlots = this.slotsToCover(s, date);
      const total = ownSlots.length;
      // A slot needs cover when its owner is absent and no substitute is assigned.
      const uncovered = ownSlots.filter((sl) => this.slotNeedsCover(sl)).length;
      const covered = Math.max(0, total - uncovered);
      const lockedCount = ownSlots.filter((sl) => this.isSlotLocked(sl)).length;
      const cover = this.coverLoad(s.id);
      return `<div class="sub-row ${isAbsent ? 'absent' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${escapeHtml(s.name)} ${cover ? `<span class="badge badge-warning" title="Currently covering for others">+${cover} cover</span>` : ''}${lockedCount ? `<span class="badge badge-success" title="Cover confirmed and locked">🔒 ${lockedCount} locked</span>` : ''}</div>
          <div style="font-size:0.84rem;color:var(--text-muted)">${escapeHtml(s.id)} • ${escapeHtml(s.dept)} • ${isAbsent
            ? (total === 0
                ? '<b class="text-success">No classes on this date</b>'
                : (uncovered
                    ? '<b class="text-danger">' + uncovered + ' slot(s) need cover</b>' + (covered ? ' • ' + covered + ' covered' : '') + ' of ' + total
                    : '<b class="text-success">All ' + total + ' slot(s) covered</b>'))
            : total + ' slot(s) on this date'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge badge-${isAbsent ? 'danger' : 'success'}">${escapeHtml(s.attendanceStatus)}</span>
          ${isAbsent
            ? `<button class="btn btn-sm success" onclick="TT.plannerMarkPresent('${escapeAttr(s.id)}')">Mark Present</button>
               <button class="btn btn-sm" onclick="TT.openSubstitutionPlanner('${escapeAttr(s.id)}')">Review / Reassign</button>
               <button class="btn btn-sm primary" onclick="TT.plannerAutoSubstitute('${escapeAttr(s.id)}')">⚡ Auto Substitute</button>`
            : `<button class="btn btn-sm" onclick="TT.openSubstitutionPlanner('${escapeAttr(s.id)}')">Plan Substitution</button>
               <button class="btn btn-sm danger" onclick="TT.plannerMarkAbsent('${escapeAttr(s.id)}')">Mark Absent</button>`}
        </div>
      </div>`;
    }).join('') || '<div style="padding:16px;color:var(--text-muted);text-align:center">No faculty match the filter.</div>';
  },

  plannerMarkAbsent(id) {
    this.openAbsenceOptions(id);
  },

  /**
   * Absence prompt: when marking faculty absent, show their affected slots with
   * substitution options — best automatic pick highlighted on top (one-click),
   * all other eligible alternatives ranked below in the same list.
   */
  openAbsenceOptions(id) {
    const teacher = this.staffById(id);
    if (!teacher) { toast('Faculty not found', 'error'); return; }
    const scopeEl = document.getElementById('attWeekScope');
    const weekScope = !!(scopeEl && scopeEl.checked);
    const date = weekScope ? null : (document.getElementById('subDate')?.value || document.getElementById('attDate')?.value || todayISO());
    const wd = weekdayOf(date);
    const scoped = !!(wd && this.DAYS.includes(wd));
    const slots = this.slotsToCover(teacher, date).filter((sl) => this.effTeacher(sl) === sl.originalTeacherId || sl.originalTeacherId === teacher.id || this.effTeacher(sl) === teacher.id);
    const whenLabel = weekScope ? 'the whole week' : (scoped ? date + ' (' + wd + ')' : 'all weekly classes');

    document.getElementById('modalTitle').textContent = 'Mark Absent — ' + teacher.name;

    if (!slots.length) {
      document.getElementById('modalBody').innerHTML = `<div class="empty-state">
        <h3>No classes affected</h3>
        <p class="text-muted">${escapeHtml(teacher.name)} has no classes ${escapeHtml(whenLabel)}. You can still record the absence.</p>
        <div class="mt-16" style="display:flex;gap:8px;justify-content:center">
          <button class="btn danger" onclick="TT.confirmAbsenceOnly('${escapeAttr(teacher.id)}')">Mark absent only</button>
          <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
        </div></div>`;
      this.openModal('modalGeneric');
      return;
    }

    const extraBusy = new Map();
    const busyFor = (sl) => { const k = sl.day + '|' + sl.period; if (!extraBusy.has(k)) extraBusy.set(k, new Set()); return extraBusy.get(k); };
    // simulate the automatic best-pick plan so the preview matches what auto would do
    const autoPlan = [];
    let autoCovered = 0, autoCritical = 0;
    slots.forEach((sl) => {
      const cands = this.candidatesForSlot(sl, teacher.id, busyFor(sl));
      const best = cands.find((c) => c.eligible);
      if (best) { busyFor(sl).add(best.staff.id); autoCovered++; } else autoCritical++;
      autoPlan.push({ slot: sl, best: best || null, cands });
    });

    let html = `<div class="abs-prompt">
      <div class="abs-banner">
        <div><b>${escapeHtml(teacher.name)}</b> <span class="text-muted">(${escapeHtml(teacher.dept)})</span> — ${escapeHtml(whenLabel)}</div>
        <div class="text-muted" style="font-size:0.84rem;margin-top:2px">${slots.length} class(es) affected · ${autoCovered} can be covered automatically${autoCritical ? ' · <b class="text-danger">' + autoCritical + ' critical</b>' : ''}</div>
      </div>`;

    // ── Top option: automatic best substitution ──
    html += `<div class="abs-option best">
      <div class="abs-option-head">
        <span class="abs-rank">★ Recommended</span>
        <b>Automatic substitution</b>
        <span class="badge badge-success">best available</span>
      </div>
      <div class="text-muted" style="font-size:0.83rem;margin:6px 0 10px">Assigns the top-ranked available faculty to each class and applies the absence in one step.</div>
      <ul class="abs-plan-list">
        ${autoPlan.slice(0, 8).map((p) => `<li>${escapeHtml(p.slot.day)} P${p.slot.period} · ${escapeHtml(this.subjectName(p.slot.subjectCode))} → ${p.best ? '<b>' + escapeHtml(p.best.staff.name) + '</b> <span class="text-muted">(' + escapeHtml(p.best.tags.join(', ')) + ')</span>' : '<b class="text-danger">no one available</b>'}</li>`).join('')}
        ${autoPlan.length > 8 ? `<li class="text-muted">… ${autoPlan.length - 8} more</li>` : ''}
      </ul>
      <button class="btn primary" style="width:100%;margin-top:10px" onclick="TT.confirmAutoAbsence('${escapeAttr(teacher.id)}', ${weekScope ? 'null' : "'" + escapeAttr(date) + "'"})">Mark Absent &amp; Auto-substitute</button>
    </div>`;

    // ── Manual option: ranked alternatives per slot ──
    html += `<div class="abs-option">
      <div class="abs-option-head">
        <span class="abs-rank">Options</span>
        <b>Choose substitutes manually</b>
        <span class="text-muted" style="font-size:0.82rem">best is preselected</span>
      </div>
      <div class="mt-8" style="max-height:340px;overflow:auto;padding-right:4px">
      ${autoPlan.map((p) => {
        const sl = p.slot;
        return `<div class="sub-slot-card" style="padding:10px 12px">
          <div class="sub-slot-head">
            <span><b>${escapeHtml(this.subjectName(sl.subjectCode))}</b></span>
            <span class="text-muted" style="font-size:0.8rem">${escapeHtml(this.sectionName(sl.sectionId))} • ${escapeHtml(sl.day)} P${sl.period}</span>
          </div>
          <select class="plan-select" data-slot="${escapeAttr(sl.id)}">
            <option value="" ${!p.best ? 'selected' : ''}>⚠ Leave uncovered (critical)</option>
            ${p.cands.map((c) => `<option value="${escapeAttr(c.staff.id)}" ${p.best && p.best.staff.id === c.staff.id ? 'selected' : ''} ${c.eligible ? '' : 'disabled'}>${p.best && p.best.staff.id === c.staff.id ? '★ ' : '  '}${escapeHtml(c.staff.name)} (${escapeHtml(c.staff.dept)}) — ${c.eligible ? 'score ' + c.score + ' · ' + escapeHtml(c.tags.join(', ')) : 'UNAVAILABLE'}</option>`).join('')}
          </select>
        </div>`;
      }).join('')}
      </div>
      <button class="btn" style="width:100%;margin-top:10px" onclick="TT.applySubstitutionPlan('${escapeAttr(teacher.id)}')">Mark Absent &amp; Apply My Choices</button>
    </div>`;

    // ── Fallback: record absence without covering ──
    html += `<div class="abs-option">
      <div class="abs-option-head"><span class="abs-rank">—</span><b>Record absence only</b></div>
      <div class="text-muted" style="font-size:0.83rem;margin:6px 0 10px">Marks absent without assigning substitutes — their classes stay flagged as uncovered until you arrange cover.</div>
      <button class="btn danger" style="width:100%" onclick="TT.confirmAbsenceOnly('${escapeAttr(teacher.id)}')">Mark Absent Only (no cover)</button>
    </div>`;

    html += `<div class="mt-16"><button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button></div></div>`;
    document.getElementById('modalBody').innerHTML = html;
    this.openModal('modalGeneric');
  },

  confirmAutoAbsence(id, date) {
    const s = this.staffById(id);
    if (!s) return;
    const res = this.markAbsentStaff(s, { date: date || null, mode: 'auto', silent: false, reason: 'Marked absent (auto-substituted)' });
    this.closeModal('modalGeneric');
    this.audit('Absence + auto-substitution', s.name + ': ' + res.success + ' covered, ' + res.critical + ' critical' + (date ? ' (' + date + ')' : ''));
    toast(s.name + ' absent — ' + res.success + ' covered, ' + res.critical + ' critical', res.critical ? 'warn' : 'success');
    this.render();
  },

  confirmAbsenceOnly(id) {
    const s = this.staffById(id);
    if (!s) return;
    const scopeEl = document.getElementById('attWeekScope');
    const weekScope = !!(scopeEl && scopeEl.checked);
    const date = weekScope ? null : (document.getElementById('subDate')?.value || document.getElementById('attDate')?.value || todayISO());
    s.attendanceStatus = 'Absent';
    this.logAttendance(date || todayISO(), s.id, 'Absent', weekScope ? '(week-wide, no cover arranged)' : '(no cover arranged)');
    this.saveAll();
    this.closeModal('modalGeneric');
    this.audit('Marked absent (no cover)', s.name + (date ? ' on ' + date : ' (week-wide)'));
    toast(s.name + ' marked absent — cover not arranged', 'warn');
    this.notify('warn', s.name + ' is absent with classes left uncovered');
    this.render();
  },
  plannerMarkPresent(id) {
    const s = this.staffById(id);
    if (!s) return;
    const date = document.getElementById('subDate')?.value || todayISO();
    this.markPresentStaff(s, { date, silent: false });
    this.render();
  },
  plannerAutoSubstitute(id) {
    const s = this.staffById(id);
    if (!s) return;
    const date = document.getElementById('subDate')?.value || todayISO();
    const res = this.autoSubstitute(s, { date, silent: false });
    this.render();
    return res;
  },

  /**
   * MANUAL substitution planner: shows every affected slot of the selected
   * faculty for the chosen date with ranked candidate options. Best candidate
   * is preselected; busy staff are greyed out; "leave uncovered" is explicit.
   */
  openSubstitutionPlanner(id) {
    const teacher = this.staffById(id);
    if (!teacher) { toast('Faculty not found', 'error'); return; }
    const date = document.getElementById('subDate')?.value || todayISO();
    const allSlots = this.slotsToCover(teacher, date);
    const wd = weekdayOf(date);
    const scoped = (wd && this.DAYS.includes(wd));
    const slots = allSlots.filter((sl) => this.effTeacher(sl) === sl.originalTeacherId || sl.originalTeacherId === teacher.id);
    document.getElementById('modalTitle').textContent = 'Substitution Planner — ' + teacher.name;
    if (!slots.length) {
      document.getElementById('modalBody').innerHTML = `<div class="empty-state">
        <h3>No classes to cover</h3>
        <p class="text-muted">${escapeHtml(teacher.name)} has no uncovered classes ${scoped ? 'on ' + escapeHtml(date) + ' (' + escapeHtml(wd) + ')' : 'in the week'}.</p>
        <button class="btn mt-16" onclick="TT.closeModal('modalGeneric')">Close</button></div>`;
      this.openModal('modalGeneric');
      return;
    }
    const extraBusy = new Map();
    const busyFor = (sl) => {
      const k = sl.day + '|' + sl.period;
      if (!extraBusy.has(k)) extraBusy.set(k, new Set());
      return extraBusy.get(k);
    };
    const plan = {};
    let lockedCount = 0;
    let html = `<div class="planner-head">
      <div><b>${escapeHtml(teacher.name)}</b> — ${scoped ? 'classes on ' + escapeHtml(date) + ' (' + escapeHtml(wd) + ')' : 'all weekly classes'} (${slots.length} slot${slots.length === 1 ? '' : 's'})</div>
      <label style="font-size:0.85rem;display:flex;align-items:center;gap:6px"><input type="checkbox" id="planMarkAbsent" checked style="width:16px;height:16px"/> Also mark ${escapeHtml(teacher.name)} absent</label>
    </div>
    <div class="plan-legend">
      <span class="pl-badge p1">1 · Same subject</span>
      <span class="pl-badge p2">2 · Same department</span>
      <span class="pl-badge p3">3 · Other staff</span>
      <span class="text-muted">Same subject always ranks first, then same department. Pick a recommendation, accept the auto choice, or choose an alternate.</span>
    </div>`;

    slots.forEach((sl) => {
      const extra = busyFor(sl);
      const cands = this.candidatesForSlot(sl, teacher.id, extra);
      const eligible = cands.filter((c) => c.eligible);
      const recommended = eligible[0] || null;
      const alternates = cands.filter((c) => c !== recommended);
      const locked = this.isSlotLocked(sl);
      if (locked) lockedCount++;
      const currentSub = locked || (sl.isSubstituted && sl.currentTeacherId) ? this.staffById(sl.currentTeacherId) : null;
      plan[sl.id] = { slot: sl, cands, recommended, filter: 'all' };

      html += `<div class="sub-slot-card ${locked ? 'locked' : ''}" data-card="${escapeAttr(sl.id)}">
        <div class="sub-slot-head">
          <span><b>${escapeHtml(this.subjectName(sl.subjectCode))}</b> <span class="text-muted">(${escapeHtml(sl.subjectCode)})</span></span>
          <span class="text-muted">${escapeHtml(this.sectionName(sl.sectionId))} • ${escapeHtml(sl.day)} P${sl.period}${sl.isLab ? '-P' + (sl.period + 1) : ''} • ${escapeHtml(sl.roomName || '')}</span>
          ${locked ? `<span class="pl-lock" title="Cover confirmed and locked">🔒 Locked${currentSub ? ' — ' + escapeHtml(currentSub.name) : ''}</span>` : ''}
        </div>`;

      if (recommended) {
        html += `<div class="plan-rec">
          <div class="plan-rec-main">
            <span class="plan-rec-flag">${recommended.priority === 1 ? '★ Best match' : '◆ Department match'}</span>
            <b>${escapeHtml(recommended.staff.name)}</b>
            <span class="pl-badge p${recommended.priority}">${escapeHtml(recommended.priorityLabel)}</span>
            <span class="text-muted" style="font-size:0.78rem">${escapeHtml(recommended.staff.dept)} · load ${recommended.load} · ${escapeHtml(recommended.tags.filter(t => t !== 'subject expert').join(', '))}</span>
          </div>
          <button class="btn btn-sm primary" data-accept="${escapeAttr(sl.id)}" data-sub="${escapeAttr(recommended.staff.id)}">${locked ? 'Reassign' : 'Accept auto'}</button>
        </div>`;
      } else {
        html += `<div class="plan-rec none">
          <div class="plan-rec-main"><span class="plan-rec-flag warn">No eligible same-subject or same-department cover</span></div>
        </div>`;
      }

      html += `<div class="plan-alt-head">
          <span>Alternates</span>
          <label class="plan-filter">Show <select class="plan-filter-sel" data-filter="${escapeAttr(sl.id)}">
            <option value="all">All staff (${cands.length})</option>
            <option value="pri1">Same subject only</option>
            <option value="pri2">Same department (1–2)</option>
            <option value="free">Free at this time</option>
          </select></label>
        </div>
        <div class="plan-alt-list" data-list="${escapeAttr(sl.id)}">`;

      if (!alternates.length) {
        html += `<div class="plan-alt-empty text-muted">No other candidates.</div>`;
      }
      alternates.forEach((c) => {
        const isCurrent = locked && currentSub && c.staff.id === currentSub.id;
        html += `<div class="plan-alt ${c.priority === 0 ? 'ineligible' : ''} ${isCurrent ? 'chosen' : ''}" data-priority="${c.priority}" data-free="${c.free ? 1 : 0}">
          <span class="pl-badge p${c.priority || 3}">${escapeHtml(c.priorityLabel)}</span>
          <span class="plan-alt-name">${escapeHtml(c.staff.name)} <span class="text-muted">· ${escapeHtml(c.staff.dept)}</span>${isCurrent ? ' <b style="color:var(--accent)">· current</b>' : ''}</span>
          <span class="plan-alt-meta ${c.free ? '' : 'busy'}">${escapeHtml(c.tags.join(' · '))} · load ${c.load}</span>
          <button class="btn btn-xs ${c.eligible ? 'primary' : ''}" data-pick="${escapeAttr(sl.id)}" data-sub="${escapeAttr(c.staff.id)}" ${c.eligible ? '' : 'disabled'}>${c.eligible ? (isCurrent ? 'Keep' : 'Choose') : 'Unavailable'}</button>
        </div>`;
      });
      html += `</div>
        <div class="plan-slot-foot">
          <label class="plan-leave"><input type="checkbox" data-leave="${escapeAttr(sl.id)}"/> Leave uncovered (critical)</label>
          <span class="plan-chosen" data-chosen="${escapeAttr(sl.id)}">${locked && currentSub ? '🔒 Locked to <b>' + escapeHtml(currentSub.name) + '</b> — pick another to reassign' : (recommended ? 'Will assign <b>' + escapeHtml(recommended.staff.name) + '</b>' : 'Nothing selected')}</span>
        </div>
      </div>`;
    });

    html += `<div class="mt-16 plan-footer">
      <div class="plan-summary" id="planSummary"></div>
      <div style="display:flex;gap:8px">
        <button class="btn primary" onclick="TT.applySubstitutionPlan('${escapeAttr(teacher.id)}')">Apply &amp; Lock Plan</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
      </div>
    </div>`;
    document.getElementById('modalBody').innerHTML = html;
    this._plannerState = { teacherId: teacher.id, date, plan };
    this._planPick = {};
    this.updatePlanSummary();
    this.openModal('modalGeneric');
  },

  /** Recompute the planner footer summary from current selections. */
  updatePlanSummary() {
    const st = this._plannerState;
    const el = document.getElementById('planSummary');
    if (!st || !el) return;
    let assign = 0, leave = 0, keep = 0;
    Object.entries(st.plan).forEach(([slotId, info]) => {
      const leaveBox = document.querySelector(`.plan-leave [data-leave="${slotId}"]`);
      const chosen = this._planPick[slotId];
      if (leaveBox && leaveBox.checked) { leave++; return; }
      if (chosen) { assign++; return; }
      if (this.isSlotLocked(info.slot)) { keep++; return; }   // confirmed & untouched
      if (info.recommended) assign++;
    });
    const parts = [`<b>${assign}</b> to assign`, `<b>${leave}</b> left uncovered`];
    if (keep) parts.push(`<b>${keep}</b> locked (protected)`);
    el.innerHTML = parts.join(' · ');
  },

  /** Choose a specific alternate for a slot (locks the row immediately). */
  pickPlanSubstitute(slotId, subId) {
    if (!this._planPick) this._planPick = {};
    this._planPick[slotId] = subId;
    const card = document.querySelector(`.sub-slot-card[data-card="${slotId}"]`);
    if (card) {
      card.querySelectorAll('.plan-alt').forEach((row) => {
        const btn = row.querySelector('[data-pick]');
        row.classList.toggle('chosen', !!(btn && btn.dataset.sub === subId));
      });
      const leave = card.querySelector(`[data-leave="${slotId}"]`); if (leave) leave.checked = false;
      const chosenEl = card.querySelector(`[data-chosen="${slotId}"]`);
      const staff = this.staffById(subId);
      if (chosenEl && staff) chosenEl.innerHTML = 'Selected <b>' + escapeHtml(staff.name) + '</b>';
      const recBtn = card.querySelector('[data-accept]'); if (recBtn) recBtn.classList.remove('primary');
    }
    this.updatePlanSummary();
  },

  /** Toggle "leave uncovered" for a slot. */
  togglePlanLeave(slotId, checked) {
    const card = document.querySelector(`.sub-slot-card[data-card="${slotId}"]`);
    if (card && checked) {
      if (this._planPick) delete this._planPick[slotId];
      card.querySelectorAll('.plan-alt').forEach((r) => r.classList.remove('chosen'));
      const chosenEl = card.querySelector(`[data-chosen="${slotId}"]`);
      if (chosenEl) chosenEl.innerHTML = '<span style="color:var(--warning)">Left uncovered — critical</span>';
    }
    this.updatePlanSummary();
  },

  /** Accept the recommended (auto) substitute for one slot. */
  acceptPlanAuto(slotId) {
    const st = this._plannerState;
    const info = st && st.plan[slotId];
    if (info && info.recommended) this.pickPlanSubstitute(slotId, info.recommended.staff.id);
  },

  /** Toggle the alternates filter (all / same subject / same dept / free). */
  filterPlanAlternates(slotId, mode) {
    const list = document.querySelector(`[data-list="${slotId}"]`);
    if (!list) return;
    list.querySelectorAll('.plan-alt').forEach((row) => {
      const p = +row.dataset.priority;
      const free = row.dataset.free === '1';
      let show = true;
      if (mode === 'pri1') show = p === 1;
      else if (mode === 'pri2') show = p === 1 || p === 2;
      else if (mode === 'free') show = free;
      row.style.display = show ? '' : 'none';
    });
    const empty = list.querySelector('.plan-alt-empty');
    const anyVisible = [...list.querySelectorAll('.plan-alt')].some((r) => r.style.display !== 'none');
    if (empty) empty.style.display = anyVisible ? 'none' : '';
  },

  /**
   * Apply the manual plan. Called with (teacherId) it reads the open planner
   * modal; called with (teacherId, plan, {date, markAbsent}) it applies a
   * programmatic plan: [{ slotId, subId|null }, ...]. Conflict-checked either way.
   */
  applySubstitutionPlan(teacherId, plan = null, opts = {}) {
    const teacher = this.staffById(teacherId);
    if (!teacher) return null;
    let date, markAbsent, items;
    if (Array.isArray(plan)) {
      date = opts.date || null;
      markAbsent = opts.markAbsent !== false;
      items = plan.map((p) => ({ slotId: p.slotId, subId: p.subId || null }));
    } else {
      date = document.getElementById('subDate')?.value || todayISO();
      markAbsent = !!document.getElementById('planMarkAbsent')?.checked;
      const picks = this._planPick || {};
      const styledCards = [...document.querySelectorAll('.modal.open .sub-slot-card[data-card]')];
      if (styledCards.length) {
        items = styledCards.map((card) => {
          const slotId = card.dataset.card;
          const locked = card.classList.contains('locked');
          const leave = card.querySelector(`[data-leave="${slotId}"]`);
          // An explicit pick always wins (reassign + relock) — even for a locked row.
          if (picks[slotId]) return { slotId, subId: picks[slotId], reassign: true };
          if (leave && leave.checked) return { slotId, subId: null, leave: true };
          // Locked and untouched → protect the existing confirmed cover.
          if (locked) return { slotId, subId: null, skip: true };
          const info = this._plannerState && this._plannerState.plan[slotId];
          return { slotId, subId: info && info.recommended ? info.recommended.staff.id : null };
        });
      } else {
        // Simple quick-absence dialog with per-slot <select class="plan-select">.
        items = [...document.querySelectorAll('.modal.open .plan-select')].map((sel) => ({ slotId: sel.dataset.slot, subId: sel.value || null }));
      }
    }
    const extraBusy = new Map();                     // per day|period simulation
    const busySet = (slot) => {
      const k = slot.day + '|' + slot.period;
      if (!extraBusy.has(k)) extraBusy.set(k, new Set());
      return extraBusy.get(k);
    };
    let assigned = 0, uncovered = 0, skipped = 0, protectedCount = 0, reassigned = 0;
    items.forEach((item) => {
      const slot = this.data.schedule.find((s) => s.id === item.slotId);
      if (!slot) return;
      if (item.skip) { protectedCount++; return; }             // locked, untouched by admin
      // Protected rows are left as-is unless the admin explicitly re-picked one.
      if (this.isSlotLocked(slot) && !item.reassign) { protectedCount++; return; }
      const wasLocked = this.isSlotLocked(slot);
      const subId = item.subId || null;
      if (subId) {
        const sub = this.staffById(subId);
        if (!sub || sub.attendanceStatus === 'Absent' || this.busyAt(slot.day, slot.period, busySet(slot)).has(subId)) {
          skipped++;
          toast('Skipped ' + this.sectionName(slot.sectionId) + ' P' + slot.period + ': ' + (sub ? sub.name + ' is unavailable' : 'substitute missing'), 'warn');
          return;
        }
        busySet(slot).add(subId);
        const cand = this.candidatesForSlot(slot, slot.originalTeacherId || slot.teacherId, busySet(slot)).find((c) => c.staff.id === subId);
        this.applySubstitution(slot, subId, { mode: 'manual', date, reason: wasLocked ? 'Reassigned (admin override)' : 'Manual assignment', priority: cand ? cand.priority : null, lock: true });
        if (wasLocked) reassigned++; else assigned++;
      } else {
        this.applySubstitution(slot, null, { mode: 'manual', date, reason: 'Left uncovered by admin' });
        uncovered++;
      }
    });
    if (this._plannerState) { this._plannerState = null; this._planPick = {}; }
    if (markAbsent) {
      teacher.attendanceStatus = 'Absent';
      this.logAttendance(date, teacher.id, 'Absent', 'via substitution planner');
    }
    this.saveAll();
    this.audit('Manual substitution plan', `${teacher.name}: ${assigned} assigned, ${reassigned} reassigned, ${uncovered} uncovered, ${skipped} skipped${protectedCount ? ', ' + protectedCount + ' locked' : ''}` + (date ? ' on ' + date : ''));
    this.notify(uncovered || skipped ? 'warn' : 'success', `Substitution plan applied for ${teacher.name}: ${assigned} assigned${reassigned ? ', ' + reassigned + ' reassigned' : ''}, ${uncovered} uncovered${skipped ? ', ' + skipped + ' skipped' : ''}${protectedCount ? ', ' + protectedCount + ' locked' : ''}`);
    toast('Plan applied — ' + assigned + ' assigned' + (reassigned ? ', ' + reassigned + ' reassigned' : '') + ', ' + uncovered + ' uncovered' + (skipped ? ', ' + skipped + ' skipped' : ''), uncovered || skipped ? 'warn' : 'success');
    this.closeModal('modalGeneric');
    this.render();
    return { assigned, reassigned, uncovered, skipped, locked: protectedCount };
  },
  saveSubstitutes(teacherId) { if (teacherId) this.applySubstitutionPlan(teacherId); },
  confirmSubstitute(id) { this.openSubstitutionPlanner(id); },

  renderSubstitutionHistory() {
    const el = document.getElementById('substitutionHistory');
    if (!el) return;
    const filter = this._subHistoryFilter || 'all';
    const list = this.data.substitutions.filter((r) => filter === 'all' || r.status === filter).slice(0, 60);
    el.innerHTML = `
      <div class="filters" style="margin-bottom:10px">
        <select onchange="TT._subHistoryFilter=this.value;TT.renderSubstitutionHistory()" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px">
          <option value="all" ${filter === 'all' ? 'selected' : ''}>All events</option>
          <option value="success" ${filter === 'success' ? 'selected' : ''}>Covered</option>
          <option value="critical" ${filter === 'critical' ? 'selected' : ''}>Critical</option>
          <option value="reverted" ${filter === 'reverted' ? 'selected' : ''}>Reverted</option>
        </select>
      </div>
      ${list.map((r) => {
        const badge = r.status === 'success' ? '<span class="badge badge-success">Covered</span>'
          : r.status === 'reverted' ? '<span class="badge badge-neutral">Reverted</span>'
          : '<span class="badge badge-danger">Critical</span>';
        const prBadge = r.priority === 1 ? '<span class="badge badge-success" title="Cover assigned from same subject">1 · Same subject</span>'
          : r.priority === 2 ? '<span class="badge badge-warning" title="Cover assigned from same department">2 · Same dept</span>'
          : '';
        const lockBadge = r.locked && r.status === 'success' ? '<span class="badge badge-neutral" title="Confirmed and locked">🔒 Locked</span>' : '';
        return `<div class="hist-item">
          <div style="font-weight:600;font-size:0.88rem">${escapeHtml(this.staffName(r.absentTeacher))} → ${r.substitute ? escapeHtml(this.staffName(r.substitute)) : '<span class="text-danger">no substitute</span>'} ${prBadge} ${lockBadge}</div>
          <div style="font-size:0.8rem;color:var(--text-muted)">${badge} ${escapeHtml(r.subjectCode || '')} • ${escapeHtml(this.sectionName(r.sectionId))} • ${escapeHtml(r.day || '')} P${escapeHtml(r.period || '')} • ${escapeHtml(r.date || 'week-wide')} • ${escapeHtml(r.mode || 'auto')}</div>
          <div style="font-size:0.76rem;color:var(--text-muted)">${new Date(r.ts).toLocaleString()}</div>
          ${r.status !== 'reverted' && r.substitute ? `<button class="btn btn-sm ghost" style="margin-top:4px" onclick="TT.revertSubstitution('${escapeAttr(r.id)}')">↩ Undo</button>` : ''}
        </div>`;
      }).join('') || '<div style="padding:16px;color:var(--text-muted);text-align:center">No substitution history.</div>'}`;
  },

  /* ---------- Leave planner ---------- */
  renderLeavePlanner() {
    const host = document.getElementById('leavePlannerHost');
    if (!host) return;
    const today = todayISO();
    const leaves = [...this.data.leaves].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    const balanceOf = (staffId) => {
      const used = this.data.leaves.filter((l) => l.staffId === staffId && (l.start || '').startsWith(today.slice(0, 4)));
      return {
        casual: (this.config.leaveCasualLimit || 12) - used.filter((l) => l.type === 'casual').length,
        sick: (this.config.leaveSickLimit || 10) - used.filter((l) => l.type === 'sick').length
      };
    };
    host.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:700">📅 Planned Leave</div>
        <button class="btn btn-sm primary" onclick="TT.openLeaveForm()">+ Apply Leave</button>
      </div>
      <div class="text-muted" style="font-size:0.82rem;margin-bottom:10px">Approved leaves are processed automatically on their start date — substitutions are planned per day using the ranked engine.</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Faculty</th><th>From</th><th>To</th><th>Type</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>${leaves.map((l) => {
          const active = l.start <= today && today <= l.end;
          return `<tr>
            <td>${escapeHtml(this.staffName(l.staffId))}</td>
            <td>${escapeHtml(l.start)}</td><td>${escapeHtml(l.end)}</td>
            <td><span class="badge badge-${l.type === 'sick' ? 'warning' : 'info'}">${escapeHtml(l.type || 'casual')}</span></td>
            <td style="font-size:0.84rem">${escapeHtml(l.reason || '—')}</td>
            <td><span class="badge badge-${active ? 'danger' : l.status === 'approved' ? 'success' : 'neutral'}">${active ? 'In progress' : escapeHtml(l.status)}</span></td>
            <td><button class="btn btn-sm danger" onclick="TT.cancelLeave('${escapeAttr(l.id)}')">Cancel</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="7" class="empty-state" style="padding:16px">No leaves planned.</td></tr>'}</tbody>
      </table></div>
      <div class="label mt-16">Leave Balances (this year)</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Faculty</th><th>Casual Remaining</th><th>Sick Remaining</th></tr></thead>
        <tbody>${this.data.staff.slice(0, 50).map((s) => {
          const b = balanceOf(s.id);
          return `<tr><td>${escapeHtml(s.name)}</td><td>${b.casual} / ${this.config.leaveCasualLimit || 12}</td><td>${b.sick} / ${this.config.leaveSickLimit || 10}</td></tr>`;
        }).join('') || '<tr><td colspan="3" class="empty-state">No staff.</td></tr>'}</tbody>
      </table></div>`;
  },

  openLeaveForm() {
    document.getElementById('modalTitle').textContent = 'Apply Leave';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>Faculty</label><select id="lv_staff">${this.data.staff.map((s) => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.name)} (${escapeHtml(s.dept)})</option>`).join('')}</select></div>
        <div class="form-group"><label>Type</label><select id="lv_type"><option value="casual">Casual</option><option value="sick">Sick</option><option value="duty">Duty Leave</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>From</label><input type="date" id="lv_start" value="${todayISO()}"/></div>
        <div class="form-group"><label>To</label><input type="date" id="lv_end" value="${todayISO()}"/></div>
      </div>
      <div class="form-group"><label>Reason</label><input id="lv_reason" placeholder="e.g. Medical appointment"/></div>
      <div class="mt-16" style="display:flex;gap:8px">
        <button class="btn primary" onclick="TT.submitLeave()">Submit Leave</button>
        <button class="btn" onclick="TT.closeModal('modalGeneric')">Cancel</button>
      </div>`;
    this.openModal('modalGeneric');
  },

  submitLeave() {
    const staffId = document.getElementById('lv_staff').value;
    const start = document.getElementById('lv_start').value;
    const end = document.getElementById('lv_end').value || start;
    const type = document.getElementById('lv_type').value;
    const reason = document.getElementById('lv_reason').value.trim();
    if (!staffId || !start) { toast('Faculty and start date required', 'error'); return; }
    if (end < start) { toast('End date must be after start date', 'error'); return; }
    this.data.leaves.push({ id: uid(), staffId, start, end, type, reason, status: 'approved', processed: {}, ts: new Date().toISOString() });
    this.saveAll();
    this.audit('Leave applied', this.staffName(staffId) + ': ' + start + ' → ' + end + ' (' + type + ')');
    this.notify('info', 'Leave approved for ' + this.staffName(staffId) + ' (' + start + ' → ' + end + ') — substitutions will be planned automatically');
    toast('Leave scheduled — substitutions will auto-process on the start date', 'success');
    this.closeModal('modalGeneric');
    this.render();
  },

  cancelLeave(id) {
    this.data.leaves = this.data.leaves.filter((l) => l.id !== id);
    this.saveAll();
    this.audit('Leave cancelled', id);
    toast('Leave cancelled', 'success');
    this.render();
  },

  /* ================= Academic Calendar ================= */
  renderCalendar() {
    const s = document.getElementById('semStart'); if (s) s.value = this.config.semStart;
    const e = document.getElementById('semEnd'); if (e) e.value = this.config.semEnd;
    const ov = document.getElementById('calOverride'); if (ov) ov.value = this.config.workingDaysOverride || '';
    this.renderHolidayList();
    this.renderCompList();
    this.updateCalStats();
  },

  renderHolidayList() {
    const el = document.getElementById('holidayList');
    if (!el) return;
    el.innerHTML = [...this.data.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => `
      <div class="kv">
        <span><strong>${escapeHtml(h.date)}</strong> — ${escapeHtml(h.name || 'Holiday')}</span>
        <button class="btn btn-sm danger" onclick="TT.removeHoliday('${escapeAttr(h.date)}')">Delete</button>
      </div>`).join('') || 'No holidays added yet.';
  },

  renderCompList() {
    const el = document.getElementById('compList');
    if (!el) return;
    el.innerHTML = this.data.compDays.map((c) => `
      <div class="kv">
        <span><strong>${escapeHtml(c.date)}</strong> follows ${escapeHtml(c.follows)} — ${escapeHtml(c.reason || '')}</span>
        <button class="btn btn-sm danger" onclick="TT.removeCompDay('${escapeAttr(c.date)}')">Delete</button>
      </div>`).join('') || 'No compensatory days assigned.';
  },

  /** Working days = weekdays in range − holidays falling on weekdays + comp days. */
  computeWorkingDays() {
    const start = new Date(this.config.semStart + 'T00:00:00');
    const end = new Date(this.config.semEnd + 'T00:00:00');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    let workDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (dow === 0 || dow === 6) continue;
      if (this.data.holidays.some((h) => h.date === iso)) continue;
      workDays++;
    }
    // compensatory days add working days back (typically fall on weekends)
    workDays += this.data.compDays.filter((c) => {
      const d = new Date(c.date + 'T00:00:00');
      return !isNaN(d) && d >= start && d <= end;
    }).length;
    return workDays;
  },

  updateCalStats() {
    const wd = this.config.workingDaysOverride > 0 ? this.config.workingDaysOverride : this.computeWorkingDays();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('calWorkDays', wd);
    set('calHolidays', this.data.holidays.length);
    set('calComp', this.data.compDays.length);
  },

  addHoliday() {
    const d = document.getElementById('holDate').value;
    const n = document.getElementById('holName').value || 'Holiday';
    if (!d) { toast('Select a date', 'error'); return; }
    if (this.data.holidays.find((h) => h.date === d)) { toast('Date already exists', 'error'); return; }
    this.data.holidays.push({ date: d, name: n });
    this.saveAll();
    this.audit('Holiday added', d + ' ' + n);
    toast('Holiday added', 'success');
    document.getElementById('holName').value = '';
    this.renderCalendar();
  },

  removeHoliday(date) {
    this.data.holidays = this.data.holidays.filter((h) => h.date !== date);
    this.saveAll();
    this.audit('Holiday removed', date);
    this.renderCalendar();
  },

  addCompDay() {
    const d = document.getElementById('compDate').value;
    const f = document.getElementById('compFollows').value;
    const r = document.getElementById('compReason').value || '';
    if (!d) { toast('Select a date', 'error'); return; }
    if (this.data.compDays.find((c) => c.date === d)) { toast('Date already exists', 'error'); return; }
    this.data.compDays.push({ date: d, follows: f, reason: r });
    this.saveAll();
    this.audit('Compensatory day added', d + ' follows ' + f);
    toast('Compensatory day added', 'success');
    document.getElementById('compReason').value = '';
    this.renderCalendar();
  },

  removeCompDay(date) {
    this.data.compDays = this.data.compDays.filter((c) => c.date !== date);
    this.saveAll();
    this.audit('Compensatory day removed', date);
    this.renderCalendar();
  },

  saveSemester() {
    const s = document.getElementById('semStart').value;
    const e = document.getElementById('semEnd').value;
    if (s && e && e < s) { toast('End date must be after start date', 'error'); return; }
    this.config.semStart = s || this.config.semStart;
    this.config.semEnd = e || this.config.semEnd;
    LS('tt_config', this.config);
    this.audit('Semester dates saved', this.config.semStart + ' → ' + this.config.semEnd);
    this.updateCalStats();
    toast('Semester dates saved', 'success');
  },

  setWorkingDays() {
    const v = parseInt(document.getElementById('calOverride').value) || 0;
    if (!v) { toast('Enter a positive number', 'error'); return; }
    this.config.workingDaysOverride = v;
    LS('tt_config', this.config);
    this.audit('Working days override set', String(v));
    this.updateCalStats();
    toast('Working days set to ' + v, 'success');
  },

  resetToAuto() {
    const ov = document.getElementById('calOverride');
    if (ov) ov.value = '';
    this.config.workingDaysOverride = 0;
    LS('tt_config', this.config);
    this.updateCalStats();
    toast('Reset to auto-calculated (' + this.computeWorkingDays() + ' working days)', 'success');
  },

  /* ================= Reports ================= */
  renderReports() {
    const el = document.getElementById('reportsContent');
    if (!el) return;
    const conflicts = this.validateSchedule();
    const teaching = this.teachingSlots().length;
    const backupCov = teaching ? Math.round(this.teachingSlots().filter((s) => s.backupTeacherId).length / teaching * 100) : 0;
    const overload = this.data.staff.filter((s) => this.slotLoad(s.id) > (s.maxHoursPerWeek || this.config.maxWeekly)).length;
    const noBackup = this.teachingSlots().filter((s) => !s.backupTeacherId).length;
    const uncovered = this.teachingSlots().filter((s) => !this.effTeacher(s)).length;
    const subs = this.data.substitutions;
    const coveredN = subs.filter((s) => s.status === 'success').length;
    const criticalN = subs.filter((s) => s.status === 'critical').length;
    const maxLoad = Math.max(1, ...this.data.staff.map((s) => this.slotLoad(s.id)));

    el.innerHTML = `
      <div class="grid mt-16">
        <div class="card"><div class="num">${teaching}</div><div class="label">Teaching Slots</div></div>
        <div class="card"><div class="num" style="color:${conflicts.length ? 'var(--danger)' : 'var(--accent)'}">${conflicts.length}</div><div class="label">Conflicts</div></div>
        <div class="card"><div class="num">${backupCov}%</div><div class="label">Backup Coverage</div></div>
        <div class="card"><div class="num" style="color:${overload ? 'var(--danger)' : 'var(--accent)'}">${overload}</div><div class="label">Overloaded Staff</div></div>
        <div class="card"><div class="num">${noBackup}</div><div class="label">No Backup</div></div>
        <div class="card"><div class="num" style="color:${uncovered ? 'var(--danger)' : 'var(--accent)'}">${uncovered}</div><div class="label">Uncovered</div></div>
        <div class="card"><div class="num">${coveredN}</div><div class="label">Substitutions (covered)</div></div>
        <div class="card"><div class="num" style="color:${criticalN ? 'var(--danger)' : 'var(--text-muted)'}">${criticalN}</div><div class="label">Substitutions (critical)</div></div>
      </div>
      <div class="card mt-24">
        <div class="label">Workload by Faculty (own + cover)</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Faculty</th><th>Dept</th><th>Own</th><th>Cover</th><th>Total / Max</th><th style="width:34%">Load</th><th>Status</th></tr></thead>
          <tbody>
            ${this.data.staff.map((s) => {
              const own = this.ownLoad(s.id), cover = this.coverLoad(s.id), total = own + cover;
              const max = s.maxHoursPerWeek || this.config.maxWeekly;
              const pct = Math.min(100, Math.round(total / max * 100));
              return `<tr>
                <td><b>${escapeHtml(s.name)}</b></td>
                <td>${escapeHtml(s.dept)}</td>
                <td>${own}</td>
                <td style="${cover ? 'color:var(--warning);font-weight:700' : ''}">${cover || '—'}</td>
                <td>${total} / ${max}</td>
                <td><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--primary)'}"></div></div></td>
                <td>${s.attendanceStatus === 'Absent' ? '<span class="badge badge-danger">Absent</span>' : total > max ? '<span class="badge badge-danger">Over</span>' : '<span class="badge badge-success">OK</span>'}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="7" class="empty-state">No staff.</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="card mt-24">
        <div class="label">Curriculum Coverage by Section</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Section</th><th>Subjects</th><th>Scheduled</th><th>Slots</th><th>Coverage</th></tr></thead>
          <tbody>
            ${this.data.sections.map((sec) => {
              const subsList = this.data.subjects.filter((s) => s.dept === sec.dept);
              const sched = this.teachingSlots().filter((s) => s.sectionId === sec.id);
              const bySub = new Set(sched.map((s) => s.subjectCode));
              const pct = subsList.length ? Math.round(bySub.size / subsList.length * 100) : 0;
              return `<tr><td><b>${escapeHtml(sec.name)}</b></td><td>${subsList.length}</td>
                <td>${bySub.size}</td><td>${sched.length}</td>
                <td><span class="badge badge-${pct >= 100 ? 'success' : pct >= 60 ? 'warning' : 'danger'}">${pct}%</span></td></tr>`;
            }).join('') || '<tr><td colspan="5" class="empty-state">No sections.</td></tr>'}
          </tbody>
        </table></div>
      </div>
      <div class="card mt-24">
        <div class="label">Workload by Department</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Department</th><th>Staff</th><th>Slots</th><th>Utilization</th></tr></thead>
          <tbody>
            ${[...new Set(this.data.staff.map((s) => s.dept))].map((dept) => {
              const staff = this.data.staff.filter((s) => s.dept === dept);
              const slots = staff.reduce((sum, s) => sum + this.slotLoad(s.id), 0);
              const max = staff.reduce((sum, s) => sum + (s.maxHoursPerWeek || this.config.maxWeekly), 0);
              return `<tr><td>${escapeHtml(dept)}</td><td>${staff.length}</td><td>${slots}</td><td>${max ? Math.round(slots / max * 100) + '%' : '0%'}</td></tr>`;
            }).join('') || `<tr><td colspan="4" class="empty-state" style="padding:20px">No data.</td></tr>`}
          </tbody>
        </table></div>
      </div>
      <div class="card mt-24">
        <div class="label">Conflict Details</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Type</th><th>Detail</th><th>Day</th><th>Period</th></tr></thead>
          <tbody>
            ${conflicts.map((c) => `<tr><td><span class="badge badge-danger">${escapeHtml(c.type)}</span></td><td>${escapeHtml(c.detail || '')}</td><td>${escapeHtml(c.day || '')}</td><td>${escapeHtml(c.period || '')}</td></tr>`).join('') || `<tr><td colspan="4" class="empty-state" style="padding:20px">No conflicts detected.</td></tr>`}
          </tbody>
        </table></div>
      </div>`;
  },

  exportCSV() {
    const rows = [['ID', 'Day', 'Period', 'Section', 'Subject', 'Subject Name', 'Original Faculty', 'Current Faculty', 'Room', 'Type', 'Substituted', 'Backup']];
    this.data.schedule.forEach((s) => rows.push([
      s.id, s.day, s.period, this.sectionName(s.sectionId), s.subjectCode, this.subjectName(s.subjectCode),
      this.staffName(s.originalTeacherId || s.teacherId), s.subjectCode === 'FREE' ? '' : this.staffName(this.effTeacher(s)),
      s.roomName || '', s.isLab ? 'Lab' : 'Theory', s.isSubstituted ? 'Yes' : 'No', this.staffName(s.backupTeacherId)
    ]));
    this.downloadCSV(rows, 'timetable.csv');
  },

  exportExcel() {
    if (!window.XLSX) { toast('SheetJS not loaded (offline?)', 'error'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ID', 'Day', 'Period', 'Section', 'Subject', 'Original Faculty', 'Current Faculty', 'Room', 'Type', 'Substituted'],
      ...this.data.schedule.map((s) => [s.id, s.day, s.period, this.sectionName(s.sectionId), s.subjectCode,
        this.staffName(s.originalTeacherId || s.teacherId), s.subjectCode === 'FREE' ? '' : this.staffName(this.effTeacher(s)),
        s.roomName || '', s.isLab ? 'Lab' : 'Theory', s.isSubstituted ? 'Yes' : 'No'])
    ]), 'Timetable');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.data.staff.map((s) => ({ id: s.id, name: s.name, dept: s.dept, subjects: (s.subjects || []).join(';'), ownSlots: this.ownLoad(s.id), coverSlots: this.coverLoad(s.id), maxHoursPerWeek: s.maxHoursPerWeek, status: s.attendanceStatus }))), 'Staff');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.data.subjects.map((s) => ({ code: s.code, name: s.name, dept: s.dept, type: s.type, hoursPerWeek: s.hoursPerWeek, credits: s.credits, semester: s.semester }))), 'Subjects');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.data.substitutions.map((r) => ({ date: r.date || 'week-wide', absent: this.staffName(r.absentTeacher), substitute: r.substitute ? this.staffName(r.substitute) : 'NONE', section: this.sectionName(r.sectionId), subject: r.subjectCode, day: r.day, period: r.period, status: r.status, mode: r.mode }))), 'Substitutions');
    XLSX.writeFile(wb, 'timetable_export.xlsx');
    toast('Excel exported', 'success');
  },

  exportJSON() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), staff: this.data.staff, subjects: this.data.subjects, rooms: this.data.rooms, sections: this.data.sections, departments: this.data.departments, schedule: this.data.schedule, substitutions: this.data.substitutions, leaves: this.data.leaves, config: this.config, holidays: this.data.holidays, compDays: this.data.compDays }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'timetable_data.json'; a.click();
    toast('JSON exported', 'success');
  },

  exportICal() {
    if (!this.data.schedule.length) { toast('No schedule to export', 'error'); return; }
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CollegeTimetable//EN', 'CALSCALE:GREGORIAN'];
    const byDay = { Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR' };
    this.teachingSlots().forEach((sl) => {
      const sec = this.sectionById(sl.sectionId);
      const semEnd = (this.config.semEnd || '2026-12-30').replace(/-/g, '');
      lines.push('BEGIN:VEVENT',
        'SUMMARY:' + sl.subjectCode + ' — ' + this.sectionName(sl.sectionId) + ' (' + this.staffName(this.effTeacher(sl)) + ')',
        'DESCRIPTION:Room ' + (sl.roomName || 'TBA') + (sl.isSubstituted && this.effTeacher(sl) !== (sl.originalTeacherId || sl.teacherId) ? ' | SUBSTITUTION: ' + this.staffName(sl.originalTeacherId || sl.teacherId) + ' covered by ' + this.staffName(this.effTeacher(sl)) : ''),
        'LOCATION:' + (sl.roomName || 'TBA'),
        'RRULE:FREQ=WEEKLY;BYDAY=' + (byDay[sl.day] || 'MO') + ';UNTIL=' + semEnd + 'T235959Z',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'timetable.ics'; a.click();
    toast('iCal exported', 'success');
  },

  downloadCSV(rows, filename) {
    const csv = rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    toast('CSV exported', 'success');
  },

  printReport() {
    const pr = window.open('', '_blank');
    if (!pr) { toast('Popup blocked — allow popups to print', 'error'); return; }
    const conflicts = this.validateSchedule();
    pr.document.write(`<!DOCTYPE html><html><head><title>Timetable Report</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#111}
      table{border-collapse:collapse;width:100%;margin:10px 0 22px}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;font-size:12px}
      th{background:#f1f5f9;font-weight:700}
      h2,h3{margin:6px 0}
      .sub{color:#b45309;font-weight:700}
    }</style></head>
    <body>
      <h2>${escapeHtml(this.config.institution)} — Master Timetable Report</h2>
      <p>Academic Year ${escapeHtml(this.config.academicYear)} • Generated ${new Date().toLocaleString()} • ${this.teachingSlots().length} teaching slots • ${conflicts.length} conflict(s)</p>
      ${this.data.sections.map((sec) => `<h3>${escapeHtml(sec.name)} (${escapeHtml(sec.dept)})</h3>
        <table><tr><th>Day</th><th>Period</th><th>Subject</th><th>Faculty</th><th>Room</th></tr>
        ${this.teachingSlots().filter((s) => s.sectionId === sec.id).sort((a, b) => this.DAYS.indexOf(a.day) - this.DAYS.indexOf(b.day) || a.period - b.period).map((s) => `<tr>
          <td>${escapeHtml(s.day)}</td><td>${s.period}</td>
          <td>${escapeHtml(s.subjectCode)} — ${escapeHtml(this.subjectName(s.subjectCode))}${s.isLab ? ' (Lab)' : ''}</td>
          <td class="${s.isSubstituted || this.effTeacher(s) !== (s.originalTeacherId || s.teacherId) ? 'sub' : ''}">${escapeHtml(this.staffName(this.effTeacher(s)))}${s.isSubstituted && this.effTeacher(s) !== (s.originalTeacherId || s.teacherId) ? ' (sub for ' + escapeHtml(this.staffName(s.originalTeacherId || s.teacherId)) + ')' : ''}</td>
          <td>${escapeHtml(s.roomName || '')}</td></tr>`).join('')}
        </table>`).join('')}
      ${conflicts.length ? `<h3>Conflicts (${conflicts.length})</h3><table><tr><th>Type</th><th>Detail</th><th>Day</th><th>Period</th></tr>
        ${conflicts.map((c) => `<tr><td>${escapeHtml(c.type)}</td><td>${escapeHtml(c.detail || '')}</td><td>${escapeHtml(c.day || '')}</td><td>${escapeHtml(c.period || '')}</td></tr>`).join('')}</table>` : ''}
      <div style="margin-top:40px;display:flex;justify-content:space-between;font-size:13px">
        <div>_________________<br/>HOD</div><div>_________________<br/>Principal</div>
      </div>
    </body></html>`);
    pr.document.close();
    setTimeout(() => pr.print(), 350);
  },

  /* ================= Regulations ================= */
  renderRegulations() {
    const el = document.getElementById('regulationsContent');
    if (!el) return;
    const tab = this._regTab || 'compliance';
    el.innerHTML = `
      <div class="card mt-16">
        <div class="filters">
          <button class="btn ${tab === 'compliance' ? 'primary' : ''}" onclick="TT.showRegTab('compliance')">L-T-P-C Compliance</button>
          <button class="btn ${tab === 'workload' ? 'primary' : ''}" onclick="TT.showRegTab('workload')">Workload Rules</button>
          <button class="btn ${tab === 'conflicts' ? 'primary' : ''}" onclick="TT.showRegTab('conflicts')">Conflict Audit</button>
          <button class="btn ${tab === 'rules' ? 'primary' : ''}" onclick="TT.showRegTab('rules')">Rule Configuration</button>
        </div>
        <div id="regTabContent">${tab === 'compliance' ? this.regComplianceHTML() : tab === 'workload' ? this.regWorkloadHTML() : tab === 'conflicts' ? this.regConflictsHTML() : this.regRulesHTML()}</div>
      </div>`;
  },
  showRegTab(tab) { this._regTab = tab; this.renderRegulations(); },

  /** Per-section L-T-P-C style check: scheduled hours vs curriculum prescription. */
  regComplianceHTML() {
    return `<div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">
      Verifies every section receives its prescribed weekly load per subject (Theory L-hours, Lab 2-hour sessions) under the active regulation preset, and that credit totals are consistent.</div>
      <div class="table-wrap"><table>
      <thead><tr><th>Section</th><th>Subject</th><th>Type</th><th>L / T / P (prescribed)</th><th>Scheduled</th><th>Credits</th><th>Status</th></tr></thead>
      <tbody>
      ${this.data.sections.map((sec) => {
        const subs = this.data.subjects.filter((s) => s.dept === sec.dept);
        if (!subs.length) return `<tr><td colspan="7">${escapeHtml(sec.name)} — no subjects defined</td></tr>`;
        return subs.map((sub) => {
          const slots = this.teachingSlots().filter((s) => s.sectionId === sec.id && s.subjectCode === sub.code);
          const ok = slots.length >= sub.hoursPerWeek;
          const ltpc = sub.type === 'Lab' ? '0-0-' + (sub.hoursPerWeek / 2) + '-' + sub.credits : sub.hoursPerWeek + '-0-0-' + sub.credits;
          return `<tr>
            <td>${escapeHtml(sec.name)}</td>
            <td><b>${escapeHtml(sub.code)}</b> ${escapeHtml(sub.name)}</td>
            <td><span class="badge badge-${sub.type === 'Lab' ? 'info' : 'neutral'}">${escapeHtml(sub.type)}</span></td>
            <td>${ltpc}</td>
            <td>${slots.length} slot(s)</td>
            <td>${sub.credits}</td>
            <td><span class="badge badge-${ok ? 'success' : 'danger'}">${ok ? 'Compliant' : 'Short by ' + (sub.hoursPerWeek - slots.length) + ' hr'}</span></td>
          </tr>`;
        }).join('');
      }).join('') || '<tr><td colspan="7" class="empty-state">No sections.</td></tr>'}
      </tbody></table></div>`;
  },

  regWorkloadHTML() {
    return `<div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Faculty workload against UGC / regulation norms (max 24 hrs/week hard cap, configured limits below).</div>
      <div class="table-wrap"><table>
      <thead><tr><th>Faculty</th><th>Dept</th><th>Own</th><th>Cover</th><th>Total</th><th>Daily max hit</th><th>Consecutive max hit</th><th>Status</th></tr></thead>
      <tbody>
      ${this.data.staff.map((s) => {
        const own = this.ownLoad(s.id), cover = this.coverLoad(s.id), total = own + cover;
        const max = s.maxHoursPerWeek || this.config.maxWeekly;
        let dailyMax = 0, consecMax = 0;
        this.DAYS.slice(0, this.config.days).forEach((day) => {
          const n = this.teachingSlots().filter((x) => x.day === day && this.effTeacher(x) === s.id).length;
          if (n > dailyMax) dailyMax = n;
          let run = 0, best = 0;
          for (let p = 1; p <= this.config.periods; p++) {
            if (this.teachingSlots().some((x) => x.day === day && x.period === p && this.effTeacher(x) === s.id)) { run++; best = Math.max(best, run); } else run = 0;
          }
          consecMax = Math.max(consecMax, best);
        });
        const overDaily = dailyMax > (s.maxHoursPerDay || this.config.maxDaily);
        const overConsec = consecMax > (s.maxConsec || this.config.maxConsec);
        return `<tr><td><b>${escapeHtml(s.name)}</b></td><td>${escapeHtml(s.dept)}</td><td>${own}</td><td>${cover}</td><td>${total} / ${max}</td>
          <td>${dailyMax} ${overDaily ? '<span class="badge badge-danger">over</span>' : ''}</td>
          <td>${consecMax} ${overConsec ? '<span class="badge badge-danger">over</span>' : ''}</td>
          <td>${total > max ? '<span class="badge badge-danger">Overloaded</span>' : '<span class="badge badge-success">Within limits</span>'}</td></tr>`;
      }).join('') || '<tr><td colspan="8" class="empty-state">No staff.</td></tr>'}
      </tbody></table></div>`;
  },

  regConflictsHTML() {
    const conflicts = this.validateSchedule();
    return `<div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Full constraint audit: teacher / room / section double-bookings, uncovered slots and load violations.</div>
      <div class="table-wrap"><table>
      <thead><tr><th>Type</th><th>Detail</th><th>Day</th><th>Period</th></tr></thead>
      <tbody>${conflicts.map((c) => `<tr><td><span class="badge badge-danger">${escapeHtml(c.type)}</span></td><td>${escapeHtml(c.detail || '')}</td><td>${escapeHtml(c.day || '')}</td><td>${escapeHtml(c.period || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-state">No conflicts — timetable is clean.</td></tr>'}</tbody>
      </table></div>`;
  },

  regRulesHTML() {
    const cfg = this.config;
    return `<div class="text-muted" style="font-size:0.85rem;margin-bottom:10px">Active rule configuration (edit in Timetable Settings or Generation Settings).</div>
      <div class="table-wrap"><table>
        <tr><th>Rule</th><th>Value</th></tr>
        <tr><td>Max hours / week (faculty)</td><td>${cfg.maxWeekly}</td></tr>
        <tr><td>Max hours / day (faculty)</td><td>${cfg.maxDaily}</td></tr>
        <tr><td>Max consecutive periods</td><td>${cfg.maxConsec}</td></tr>
        <tr><td>Working days / week</td><td>${cfg.days}</td></tr>
        <tr><td>Periods / day</td><td>${cfg.periods}</td></tr>
        <tr><td>Respect holidays during planning</td><td>${cfg.respectHolidays ? 'Yes' : 'No'}</td></tr>
        <tr><td>Academic year</td><td>${escapeHtml(cfg.academicYear)}</td></tr>
        <tr><td>Casual leave limit / year</td><td>${cfg.leaveCasualLimit}</td></tr>
        <tr><td>Sick leave limit / year</td><td>${cfg.leaveSickLimit}</td></tr>
      </table></div>`;
  },

  /* ================= Audit Logs ================= */
  renderAudit() {
    const el = document.getElementById('auditContent');
    if (!el) return;
    if (this._auditPage == null) this._auditPage = 0;
    const pageSize = 25;
    const q = (this._auditFilter || '').toLowerCase();
    const logs = this.data.auditLogs.filter((l) => !q || (l.action + ' ' + l.detail).toLowerCase().includes(q));
    const pages = Math.max(1, Math.ceil(logs.length / pageSize));
    if (this._auditPage >= pages) this._auditPage = pages - 1;
    const pageLogs = logs.slice(this._auditPage * pageSize, this._auditPage * pageSize + pageSize);
    el.innerHTML = `
      <div class="card mt-16">
        <div class="filters">
          <input placeholder="Filter logs..." value="${escapeAttr(this._auditFilter || '')}" oninput="TT._auditFilter=this.value;TT._auditPage=0;TT.renderAudit()" style="padding:10px 14px;border:1px solid var(--border);border-radius:8px;flex:1;max-width:320px"/>
          <button class="btn" onclick="TT.exportAuditCSV()">Export CSV</button>
          <span class="badge badge-neutral">${logs.length} entries</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th style="width:180px">Time</th><th>Action</th><th>Detail</th><th style="width:100px">User</th></tr></thead>
          <tbody>${pageLogs.map((l) => `<tr>
            <td style="font-size:0.8rem">${new Date(l.ts).toLocaleString()}</td>
            <td><b>${escapeHtml(l.action)}</b></td>
            <td style="font-size:0.84rem">${escapeHtml(l.detail)}</td>
            <td>${escapeHtml(l.user || 'Admin')}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="empty-state">No audit entries.</td></tr>'}</tbody>
        </table></div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
          <button class="btn btn-sm" ${this._auditPage <= 0 ? 'disabled' : ''} onclick="TT._auditPage--;TT.renderAudit()">‹ Prev</button>
          <span class="text-muted" style="font-size:0.85rem">Page ${this._auditPage + 1} of ${pages}</span>
          <button class="btn btn-sm" ${this._auditPage >= pages - 1 ? 'disabled' : ''} onclick="TT._auditPage++;TT.renderAudit()">Next ›</button>
        </div>
      </div>`;
  },

  exportAuditCSV() {
    const rows = [['Time', 'Action', 'Detail', 'User'], ...this.data.auditLogs.map((l) => [l.ts, l.action, l.detail, l.user || 'Admin'])];
    this.downloadCSV(rows, 'audit_logs.csv');
  },

  /* ================= Settings ================= */
  renderSettings() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('ruleMaxWeekly', this.config.maxWeekly);
    set('ruleMaxDaily', this.config.maxDaily);
    set('ruleMaxConsec', this.config.maxConsec);
    set('instName', this.config.institution);
    set('instYear', this.config.academicYear);
    set('ruleCasual', this.config.leaveCasualLimit);
    set('ruleSick', this.config.leaveSickLimit);
    this.renderVersionHistory();
    const stats = document.getElementById('backupStats');
    if (stats) {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('tt_'));
      const bytes = keys.reduce((n, k) => n + (localStorage.getItem(k) || '').length, 0);
      stats.textContent = keys.length + ' data keys • ' + Math.round(bytes / 1024) + ' KB stored locally';
    }
  },

  saveRules() {
    this.config.maxWeekly = parseInt(document.getElementById('ruleMaxWeekly')?.value) || 18;
    this.config.maxDaily = parseInt(document.getElementById('ruleMaxDaily')?.value) || 5;
    this.config.maxConsec = parseInt(document.getElementById('ruleMaxConsec')?.value) || 3;
    this.config.leaveCasualLimit = parseInt(document.getElementById('ruleCasual')?.value) || 12;
    this.config.leaveSickLimit = parseInt(document.getElementById('ruleSick')?.value) || 10;
    this.config.institution = document.getElementById('instName')?.value.trim() || this.config.institution;
    this.config.academicYear = document.getElementById('instYear')?.value.trim() || this.config.academicYear;
    LS('tt_config', this.config);
    this.audit('Rules saved', `weekly=${this.config.maxWeekly} daily=${this.config.maxDaily} consec=${this.config.maxConsec}`);
    toast('Rules saved', 'success');
    this.render();
  },

  resetData() {
    if (!confirm('WARNING: This will wipe ALL local data and reseed defaults. Continue?')) return;
    localStorage.clear();
    this._inited = false;
    this.seed();
    this.loadAll();
    this.saveAll();
    this.audit('Data reset', 'reseeded defaults');
    toast('Data reset and reseeded', 'success');
    this.render();
  },

  /* ================= Versions ================= */
  snapshotVersion(label, silent) {
    if (!this.data.schedule.length) { if (!silent) toast('No schedule to snapshot', 'error'); return; }
    const v = LS('tt_timetable_versions') || [];
    v.unshift({ id: uid(), label: label || 'Snapshot', ts: new Date().toISOString(), schedule: JSON.parse(JSON.stringify(this.data.schedule)) });
    if (v.length > 10) v.length = 10;
    LS('tt_timetable_versions', v);
    if (!silent) { toast('Version snapshot saved', 'success'); this.renderVersionHistory(); }
  },
  renderVersionHistory() {
    const host = document.getElementById('versionHistoryHost');
    if (!host) return;
    const v = LS('tt_timetable_versions') || [];
    host.innerHTML = v.map((x) => {
      const changed = this.versionDiff(x).changed.length + this.versionDiff(x).added.length + this.versionDiff(x).removed.length;
      return `<div class="kv">
        <span><b>${escapeHtml(x.label)}</b> <span class="text-muted">${new Date(x.ts).toLocaleString()} • ${(x.schedule || []).length} slots</span></span>
        <span style="display:flex;gap:6px">
          <button class="btn btn-sm" onclick="TT.compareVersion('${escapeAttr(x.id)}')">Compare (${changed})</button>
          <button class="btn btn-sm primary" onclick="TT.restoreVersion('${escapeAttr(x.id)}')">Restore</button>
          <button class="btn btn-sm danger" onclick="TT.deleteVersion('${escapeAttr(x.id)}')">Delete</button>
        </span>
      </div>`;
    }).join('') || '<div class="text-muted" style="font-size:0.86rem">No versions yet — snapshots are taken automatically after each generation.</div>';
  },
  versionDiff(v) {
    const key = (s) => s.day + '|' + s.period + '|' + s.sectionId;
    const oldMap = new Map((v.schedule || []).map((s) => [key(s), s]));
    const curMap = new Map(this.data.schedule.map((s) => [key(s), s]));
    const added = [], removed = [], changed = [];
    curMap.forEach((s, k) => {
      if (!oldMap.has(k)) added.push(s);
      else {
        const o = oldMap.get(k);
        if (o.subjectCode !== s.subjectCode || (o.currentTeacherId || o.teacherId) !== (s.currentTeacherId || s.teacherId)) changed.push({ old: o, new: s });
      }
    });
    oldMap.forEach((s, k) => { if (!curMap.has(k)) removed.push(s); });
    return { added, removed, changed };
  },
  compareVersion(id) {
    const v = (LS('tt_timetable_versions') || []).find((x) => x.id === id);
    if (!v) return;
    const d = this.versionDiff(v);
    document.getElementById('modalTitle').textContent = 'Version Diff — ' + v.label;
    document.getElementById('modalBody').innerHTML = `
      <div class="grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="card"><div class="num" style="color:var(--accent)">${d.added.length}</div><div class="label">Added</div></div>
        <div class="card"><div class="num" style="color:var(--danger)">${d.removed.length}</div><div class="label">Removed</div></div>
        <div class="card"><div class="num" style="color:var(--warning)">${d.changed.length}</div><div class="label">Changed</div></div>
      </div>
      <div class="mt-16" style="font-size:0.85rem;max-height:40vh;overflow:auto">
        ${d.added.map((s) => `<div>➕ ${escapeHtml(s.day)} P${s.period} ${escapeHtml(this.sectionName(s.sectionId))}: ${escapeHtml(s.subjectCode)} (${escapeHtml(this.staffName(this.effTeacher(s)))})</div>`).join('')}
        ${d.removed.map((s) => `<div>➖ ${escapeHtml(s.day)} P${s.period} ${escapeHtml(this.sectionName(s.sectionId))}: ${escapeHtml(s.subjectCode)}</div>`).join('')}
        ${d.changed.map((c) => `<div>🔁 ${escapeHtml(c.new.day)} P${c.new.period} ${escapeHtml(this.sectionName(c.new.sectionId))}: ${escapeHtml(c.old.subjectCode)} → ${escapeHtml(c.new.subjectCode)} (${escapeHtml(this.staffName(this.effTeacher(c.old)))} → ${escapeHtml(this.staffName(this.effTeacher(c.new)))})</div>`).join('')}
        ${!d.added.length && !d.removed.length && !d.changed.length ? '<div class="text-muted">No differences from the current schedule.</div>' : ''}
      </div>
      <div class="mt-16"><button class="btn" onclick="TT.closeModal('modalGeneric')">Close</button></div>`;
    this.openModal('modalGeneric');
  },
  restoreVersion(id) {
    const v = (LS('tt_timetable_versions') || []).find((x) => x.id === id);
    if (!v) return;
    if (!confirm('Restore version "' + v.label + '"? Current schedule will be replaced (a snapshot of the current state is kept).')) return;
    this.snapshotVersion('before restore', true);
    this.data.schedule = JSON.parse(JSON.stringify(v.schedule || []));
    this.saveAll();
    this.audit('Version restored', v.label);
    toast('Version restored', 'success');
    this.render();
  },
  deleteVersion(id) {
    LS('tt_timetable_versions', (LS('tt_timetable_versions') || []).filter((x) => x.id !== id));
    this.renderVersionHistory();
  },

  /* ================= Backup / Restore ================= */
  downloadBackup() {
    const snap = { app: 'CollegeTimetable', version: 2, exportedAt: new Date().toISOString() };
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) snap[k] = localStorage.getItem(k); }
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'timetable_backup_' + todayISO() + '.json'; a.click();
    toast('Backup downloaded', 'success');
    this.audit('Backup downloaded', '');
  },

  handleRestore(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const snap = JSON.parse(e.target.result);
        if (!snap || typeof snap !== 'object' || !Object.keys(snap).some((k) => k.startsWith('tt_'))) {
          toast('Not a valid timetable backup', 'error');
          return;
        }
        if (!confirm('Restore backup from ' + (snap.exportedAt || 'unknown date') + '? This overwrites ALL current data.')) return;
        Object.keys(snap).forEach((k) => {
          if (k === 'app' || k === 'version' || k === 'exportedAt') return;
          if (k.startsWith('tt_')) localStorage.setItem(k, snap[k]);
        });
        toast('Backup restored — reloading…', 'success');
        this.audit('Backup restored', snap.exportedAt || '');
        setTimeout(() => location.reload(), 800);
      } catch (err) { toast('Restore failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  },

  /* ================= Import / Export Engine ================= */
  /** RFC-4180-ish CSV parser (handles quoted fields with commas + newlines). */
  parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((x) => x !== '')) rows.push(row);
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] == null ? '' : String(r[i]).trim()); });
      return o;
    });
  },

  detectImportType(sheetName, rows) {
    const n = String(sheetName || '').toLowerCase();
    const keys = Object.keys(rows[0] || {}).map((k) => k.toLowerCase());
    if (n.includes('holiday') || (keys.includes('date') && keys.includes('name') && !keys.includes('dept'))) return 'holidays';
    if (n.includes('staff') || keys.includes('maxhoursperweek')) return 'staff';
    if (n.includes('subject') || (keys.includes('code') && keys.includes('type'))) return 'subjects';
    if (n.includes('room') || (keys.includes('capacity') && keys.includes('type'))) return 'rooms';
    if (n.includes('section') || (keys.includes('id') && keys.includes('dept') && !keys.includes('code'))) return 'sections';
    if (n.includes('department') || (keys.includes('code') && keys.includes('name') && !keys.includes('subjects'))) return 'departments';
    if (keys.includes('code') && keys.includes('name')) return 'subjects';
    return 'unknown';
  },

  handleImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) this.importExcelFile(file);
    else if (name.endsWith('.csv')) this.importCSVFile(file);
    else if (name.endsWith('.json')) this.importJSONFile(file);
    else toast('Unsupported file type', 'error');
    event.target.value = '';
  },
  importExcel() { document.getElementById('importFile')?.click(); },

  importResult(msg, cls) {
    const el = document.getElementById('importResult');
    if (el) el.innerHTML = '<span class="text-' + (cls || 'success') + '">' + escapeHtml(msg) + '</span>';
  },

  importExcelFile(file) {
    if (!window.XLSX) { toast('SheetJS not loaded (check internet)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const counts = {};
        wb.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
          if (!rows.length) return;
          this.importRows(this.detectImportType(sheetName, rows), rows, counts);
        });
        this.saveAll();
        this.audit('Excel import', file.name + ': ' + JSON.stringify(counts));
        this.importResult('Imported from ' + file.name + ': ' + Object.entries(counts).map(([k, v]) => k + '=' + v).join(', '));
        toast('Import complete', 'success');
        this.render();
      } catch (err) { toast('Excel import failed: ' + err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  },

  importCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = this.parseCSV(e.target.result);
        if (!rows.length) { toast('CSV is empty', 'error'); return; }
        const counts = {};
        this.importRows(this.detectImportType(file.name, rows), rows, counts);
        this.saveAll();
        this.audit('CSV import', file.name + ': ' + JSON.stringify(counts));
        this.importResult('Imported from ' + file.name + ': ' + Object.entries(counts).map(([k, v]) => k + '=' + v).join(', '));
        toast('CSV import complete', 'success');
        this.render();
      } catch (err) { toast('CSV import failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
  },

  importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const counts = {};
        if (Array.isArray(data.staff)) { data.staff.forEach((r) => this.upsertStaff(r)); counts.staff = data.staff.length; }
        if (Array.isArray(data.subjects)) { data.subjects.forEach((r) => this.upsertSubject(r)); counts.subjects = data.subjects.length; }
        if (Array.isArray(data.sections)) { data.sections.forEach((r) => this.upsertSection(r)); counts.sections = data.sections.length; }
        if (Array.isArray(data.rooms)) { data.rooms.forEach((r) => this.upsertRoom(r)); counts.rooms = data.rooms.length; }
        if (Array.isArray(data.departments)) { data.departments.forEach((d) => this.upsertDept(d)); counts.departments = data.departments.length; }
        if (Array.isArray(data.holidays)) { data.holidays.forEach((h) => { if (h.date && !this.data.holidays.find((x) => x.date === h.date)) this.data.holidays.push({ date: h.date, name: h.name || 'Holiday' }); }); counts.holidays = data.holidays.length; }
        if (Array.isArray(data.schedule) && data.schedule.length) { this.data.schedule = data.schedule; counts.schedule = data.schedule.length; }
        this.saveAll();
        this.audit('JSON import', file.name + ': ' + JSON.stringify(counts));
        this.importResult('Imported from ' + file.name + ': ' + Object.entries(counts).map(([k, v]) => k + '=' + v).join(', '));
        toast('JSON import complete', 'success');
        this.render();
      } catch (err) { toast('JSON import failed: ' + err.message, 'error'); }
    };
    reader.readAsText(file);
  },

  importRows(type, rows, counts) {
    const map = { staff: 'upsertStaff', subjects: 'upsertSubject', sections: 'upsertSection', rooms: 'upsertRoom', departments: 'upsertDept' };
    if (map[type]) { rows.forEach((r) => this[map[type]](r)); counts[type] = (counts[type] || 0) + rows.length; }
    else if (type === 'holidays') {
      rows.forEach((r) => { const d = r.date || r.Date; if (d && !this.data.holidays.find((x) => x.date === d)) this.data.holidays.push({ date: d, name: r.name || r.Name || 'Holiday' }); });
      counts.holidays = (counts.holidays || 0) + rows.length;
    } else counts.unknown = (counts.unknown || 0) + rows.length;
  },

  upsertStaff(row) {
    const id = String(row.id || row.StaffId || row.ID || '').trim() || uid();
    const name = String(row.name || row.Name || row.Staff || '').trim();
    const dept = String(row.dept || row.Dept || row.department || '').trim().toUpperCase();
    if (!name) return;
    const subs = String(row.subjects || row.Subjects || '').split(/[;,]/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    let status = String(row.attendanceStatus || row.Status || 'Present').trim();
    status = /absent/i.test(status) ? 'Absent' : 'Present';
    const st = { id, name, dept, subjects: subs, maxHoursPerWeek: parseInt(row.maxHoursPerWeek || row.MaxHours) || 18, maxHoursPerDay: parseInt(row.maxHoursPerDay) || 5, maxConsec: parseInt(row.maxConsec) || 3, attendanceStatus: status, email: row.email || '', phone: row.phone || '' };
    const idx = this.data.staff.findIndex((s) => s.id === id);
    if (idx >= 0) this.data.staff[idx] = Object.assign(this.data.staff[idx], st); else this.data.staff.push(st);
  },
  upsertSubject(row) {
    const code = String(row.code || row.SubjectCode || row.Code || '').trim().toUpperCase();
    const name = String(row.name || row.Subject || row.Name || '').trim();
    if (!code || !name) return;
    const type = /lab/i.test(String(row.type || row.Type || '')) ? 'Lab' : 'Theory';
    const sub = { code, name, dept: String(row.dept || row.Dept || '').trim().toUpperCase(), type, hoursPerWeek: parseInt(row.hoursPerWeek || row.Hours) || 3, credits: parseInt(row.credits || row.Credits) || 3, semester: parseInt(row.semester || row.Semester) || 1 };
    const idx = this.data.subjects.findIndex((s) => s.code === code);
    if (idx >= 0) this.data.subjects[idx] = Object.assign(this.data.subjects[idx], sub); else this.data.subjects.push(sub);
  },
  upsertSection(row) {
    const id = String(row.id || row.SectionId || '').trim() || uid();
    const name = String(row.name || row.Name || row.section || '').trim();
    if (!name) return;
    const sec = { id, name, dept: String(row.dept || row.Dept || '').trim().toUpperCase(), year: parseInt(row.year) || 2026, semester: parseInt(row.semester) || 1 };
    const idx = this.data.sections.findIndex((s) => s.id === id);
    if (idx >= 0) this.data.sections[idx] = Object.assign(this.data.sections[idx], sec); else this.data.sections.push(sec);
  },
  upsertRoom(row) {
    const name = String(row.name || row.Name || row.Room || '').trim();
    if (!name) return;
    const type = /lab/i.test(String(row.type || row.Type || '')) ? 'Lab' : 'Classroom';
    const r = { name, type, capacity: parseInt(row.capacity || row.Capacity) || 60, dept: String(row.dept || row.Dept || 'GENERAL').trim().toUpperCase() };
    const idx = this.data.rooms.findIndex((x) => x.name === name);
    if (idx >= 0) this.data.rooms[idx] = Object.assign(this.data.rooms[idx], r); else this.data.rooms.push(r);
  },
  upsertDept(row) {
    const code = String(row.code || row.Code || row.dept || row.Dept || '').trim().toUpperCase();
    const name = String(row.name || row.Name || row.department || '').trim();
    if (!code || !name) return;
    const idx = this.data.departments.findIndex((d) => (d.code || d.id) === code);
    if (idx >= 0) { this.data.departments[idx].code = code; this.data.departments[idx].name = name; }
    else this.data.departments.push({ id: 'DEPT' + Date.now() + Math.floor(Math.random() * 99), code, name });
  },

  downloadTemplate(kind) {
    if (kind === 'excel') {
      if (!window.XLSX) { toast('SheetJS not loaded', 'error'); return; }
      const wb = XLSX.utils.book_new();
      const sheets = {
        Departments: this.data.departments.map((d) => ({ code: d.code, name: d.name })),
        Sections: this.data.sections.slice(0, 8).map((s) => ({ id: s.id, name: s.name, dept: s.dept, year: s.year, semester: s.semester })),
        Staff: this.data.staff.slice(0, 8).map((s) => ({ id: s.id, name: s.name, dept: s.dept, subjects: (s.subjects || []).join(';'), maxHoursPerWeek: s.maxHoursPerWeek, maxHoursPerDay: s.maxHoursPerDay, maxConsec: s.maxConsec })),
        Subjects: this.data.subjects.slice(0, 8).map((s) => ({ code: s.code, name: s.name, dept: s.dept, type: s.type, hoursPerWeek: s.hoursPerWeek, credits: s.credits, semester: s.semester })),
        Rooms: this.data.rooms.slice(0, 8).map((r) => ({ name: r.name, type: r.type, capacity: r.capacity, dept: r.dept })),
        Holidays: this.data.holidays.length ? this.data.holidays : [{ date: '2026-10-02', name: 'Gandhi Jayanti' }]
      };
      Object.keys(sheets).forEach((name) => { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheets[name]), name); });
      XLSX.writeFile(wb, 'timetable_template.xlsx');
      toast('Excel template downloaded', 'success');
    } else if (kind === 'csv') {
      this.downloadCSV([['code', 'name', 'dept', 'type', 'hoursPerWeek', 'credits', 'semester'], ...this.data.subjects.slice(0, 8).map((s) => [s.code, s.name, s.dept, s.type, s.hoursPerWeek, s.credits, s.semester])], 'subjects_template.csv');
      setTimeout(() => this.downloadCSV([['id', 'name', 'dept', 'subjects', 'maxHoursPerWeek', 'maxHoursPerDay', 'maxConsec'], ...this.data.staff.slice(0, 8).map((s) => [s.id, s.name, s.dept, (s.subjects || []).join(';'), s.maxHoursPerWeek, s.maxHoursPerDay, s.maxConsec])], 'staff_template.csv'), 400);
    } else {
      const blob = new Blob([JSON.stringify({ departments: this.data.departments, sections: this.data.sections.slice(0, 5), staff: this.data.staff.slice(0, 5), subjects: this.data.subjects.slice(0, 5), rooms: this.data.rooms.slice(0, 5), holidays: this.data.holidays.slice(0, 3) }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'timetable_template.json'; a.click();
      toast('JSON template downloaded', 'success');
    }
  },

  /**
   * REAL sample data loader: builds a complete, self-consistent demo campus
   * (depts, expert staff, named subjects with labs, sections, rooms,
   * calendar) and generates the timetable so every screen has data.
   */
  loadSampleData() {
    if (this.data.schedule.length || this.data.staff.length > 8) {
      if (!confirm('Replace current data with the full sample campus? (A backup snapshot of the current schedule is kept.)')) return;
      if (this.data.schedule.length) this.snapshotVersion('before sample data', true);
    }
    const pools = {
      CSE: ['Data Structures & Algorithms', 'Operating Systems', 'Database Management Systems', 'Computer Networks', 'Software Engineering', 'Design & Analysis of Algorithms'],
      ECE: ['Electronic Circuits', 'Signals & Systems', 'Digital Electronics', 'Communication Systems', 'Microprocessors & Microcontrollers', 'VLSI Design'],
      IT: ['Web Technologies', 'Cloud Computing', 'Information Security', 'Object Oriented Programming', 'Data Analytics', 'Software Testing'],
      EEE: ['Circuit Theory', 'Electrical Machines', 'Power Systems', 'Control Systems', 'Electrical Measurements', 'Power Electronics'],
      MECH: ['Engineering Mechanics', 'Thermodynamics', 'Fluid Mechanics', 'Manufacturing Technology', 'Theory of Machines', 'Machine Design'],
      CIVIL: ['Surveying', 'Strength of Materials', 'Concrete Technology', 'Environmental Engineering', 'Transportation Engineering', 'Structural Analysis'],
      AIML: ['Machine Learning', 'Artificial Intelligence', 'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Big Data Analytics']
    };
    const first = ['Arun', 'Bhavana', 'Chetan', 'Divya', 'Eswar', 'Farida', 'Ganesh', 'Harini', 'Ilan', 'Jaya', 'Kiran', 'Latha', 'Mani', 'Nithya', 'Omkar', 'Pooja', 'Quadir', 'Rita', 'Suresh', 'Tanvi', 'Uday', 'Vimal', 'Wahida', 'Yogesh', 'Zara', 'Anand', 'Beulah', 'Cyril', 'Deepika', 'Emil', 'Fathima', 'Gowtham', 'Hema', 'Imran', 'Janani', 'Kabir', 'Logan', 'Meera', 'Naveen', 'Oviya', 'Pranav', 'Rhea', 'Sathish', 'Tara', 'Vikas'];

    const departments = Object.keys(pools).map((code, i) => ({ id: 'DEPT' + (i + 1), code, name: code + ' Department' }));
    const subjects = [];
    departments.forEach((d) => {
      pools[d.code].forEach((name, i) => {
        const isLab = (i + 1) % 3 === 0;
        subjects.push({ code: d.code + (100 + i + 1), name, dept: d.code, type: isLab ? 'Lab' : 'Theory', hoursPerWeek: isLab ? 4 : 3, credits: isLab ? 2 : 3, semester: 3 });
      });
    });
    const staff = [];
    let ni = 0;
    departments.forEach((d) => {
      const dsubs = subjects.filter((s) => s.dept === d.code);
      for (let i = 0; i < 6; i++) {
        // rotating expertise window of 3 -> every subject has exactly 3 experts
        const exp = [dsubs[i % 6].code, dsubs[(i + 1) % 6].code, dsubs[(i + 2) % 6].code];
        staff.push({
          id: 'ST' + String(staff.length + 1).padStart(3, '0'),
          name: first[ni % first.length] + ' ' + d.code, dept: d.code, subjects: exp,
          maxHoursPerWeek: 18, maxHoursPerDay: 5, maxConsec: 3, attendanceStatus: 'Present',
          email: 'faculty' + (staff.length + 1) + '@college.edu', phone: ''
        });
        ni++;
      }
    });
    const sections = [];
    departments.forEach((d) => {
      sections.push({ id: 'SEC' + (sections.length + 1), name: d.code + ' Sec A', dept: d.code, semester: 3, year: 2026 });
      sections.push({ id: 'SEC' + (sections.length + 1), name: d.code + ' Sec B', dept: d.code, semester: 3, year: 2026 });
    });
    const rooms = [];
    departments.forEach((d) => {
      rooms.push({ name: d.code + '-CR1', type: 'Classroom', capacity: 60, dept: d.code });
      rooms.push({ name: d.code + '-LAB1', type: 'Lab', capacity: 30, dept: d.code });
      rooms.push({ name: d.code + '-LAB2', type: 'Lab', capacity: 30, dept: d.code });
    });
    rooms.push({ name: 'GEN-HALL', type: 'Classroom', capacity: 150, dept: 'GENERAL' });

    this.data.departments = departments;
    this.data.staff = staff;
    this.data.subjects = subjects;
    this.data.sections = sections;
    this.data.rooms = rooms;
    this.data.holidays = [
      { date: '2026-10-02', name: 'Gandhi Jayanti' },
      { date: '2026-10-20', name: 'Diwali' },
      { date: '2026-11-14', name: 'Children\u2019s Day (Working)' },
      { date: '2026-12-25', name: 'Christmas' }
    ];
    this.data.compDays = [{ date: '2026-11-07', follows: 'Saturday', reason: 'Diwali compensatory working day' }];
    LS('tt_faculty_availability', []);
    LS('tt_dept_rules', []);
    this.saveAll();

    // generate the timetable + backups right away so every view has data
    const days = this.DAYS.slice(0, this.config.days);
    const periods = Array.from({ length: this.config.periods }, (_, i) => i + 1);
    const result = this.solveTimetable(days, periods);
    this.data.schedule = result.schedule;
    this.assignBackups();
    this.saveAll();
    this.snapshotVersion('sample data generation', true);
    this.audit('Sample data loaded', `${staff.length} staff, ${subjects.length} subjects, ${sections.length} sections, ${rooms.length} rooms — ${result.schedule.length} slots, ${result.conflicts.length} conflicts, ${result.unscheduled} unplaced`);
    this.notify('success', 'Sample campus loaded — ' + result.schedule.length + ' timetable slots generated');
    toast('Sample campus loaded: ' + staff.length + ' faculty, ' + subjects.length + ' subjects, timetable generated (' + result.unscheduled + ' unplaced)', result.unscheduled ? 'warn' : 'success');
    this.render();
  },

  /* ================= Assistant: context-aware help engine =================
     Plain professional UI, real capability underneath:
     - typo-tolerant fuzzy matching of faculty/sections/subjects (Levenshtein)
     - understands "tomorrow", weekday names, ISO dates, "next monday"
     - conversation memory: follow-ups ("what about Tuesday?", "cover him")
     - clarification on ambiguous names instead of guessing
     - dry-run absence simulation, fragile-slot risk report, rebalancing
       suggestions with concrete one-click reassignments
     - every recommendation explains its reasoning (score breakdown)       */
  _lev(a, b) {
    a = String(a).toLowerCase(); b = String(b).toLowerCase();
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  },
  _sim(a, b) { return 1 - this._lev(a, b) / Math.max(String(a).length, String(b).length, 1); },

  /** All fuzzy matches of free text against a list. Handles typos ("Priva"->"Priya"),
      full names, IDs, and partial names. The GIVEN-NAME token must match — a shared
      department token alone ("CSE") never counts as a match. Returns [{item, score}]. */
  _fuzzyAll(text, list, getName) {
    const clean = String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim();
    if (!clean) return [];
    const textToks = clean.split(/\s+/);
    const out = [];
    list.forEach((item) => {
      const nm = String(getName(item) || '').toLowerCase().trim();
      if (!nm) return;
      let score = 0;
      if (clean === nm) score = 1;
      else if (clean.includes(nm)) score = 0.93;                          // full name typed inside a sentence
      else if (nm.includes(clean) && clean.length >= 3) score = 0.86;      // name prefix
      else {
        const nameToks = nm.split(/\s+/);
        const tokSim = (nt) => {
          let best = 0;
          textToks.forEach((tt) => {
            if (nt === tt) best = 1;
            else if (nt.length >= 3 && tt.length >= 3) best = Math.max(best, this._sim(nt, tt));
          });
          return best;
        };
        const given = tokSim(nameToks[0]);
        if (given >= 0.72) {
          if (textToks.length <= 1) {
            score = Math.min(0.92, given * 0.9 + 0.1);                    // only a (possibly misspelled) first name typed
          } else {
            const rest = nameToks.slice(1).map(tokSim);
            const restAvg = rest.length ? rest.reduce((a, b) => a + b, 0) / rest.length : given;
            score = Math.min(0.92, given * 0.6 + restAvg * 0.4);          // needs the rest of the name too
            if (score < 0.62) score = 0;
          }
        }
      }
      if (score >= 0.62) out.push({ item, score });
    });
    return out.sort((x, y) => y.score - x.score);
  },
  _fuzzyPick(text, list, getName) { const a = this._fuzzyAll(text, list, getName); return a.length ? a[0] : null; },

  /** Parse relative/absolute date expressions. Returns {date, day, label} or null. */
  _parseWhen(text) {
    const t = String(text).toLowerCase();
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const now = new Date();
    const isoM = t.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (isoM) return { date: isoM[0], day: weekdayOf(isoM[0]), label: isoM[0] };
    if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate() + 1); return { date: iso(d), day: weekdayOf(iso(d)), label: 'tomorrow' }; }
    if (/\btoday\b/.test(t)) return { date: iso(now), day: weekdayOf(iso(now)), label: 'today' };
    const idxMap = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
    let dayIdx = -1;
    const full = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].findIndex((d) => new RegExp('\\b' + d + '\\b').test(t));
    if (full >= 0) dayIdx = full;
    else { const st = t.match(/\b(sun|mon|tues?|wed|thur?s|fri|sat)\b/); if (st) dayIdx = idxMap[st[1]]; }
    if (dayIdx >= 0) {
      const cur = now.getDay();
      let diff = (dayIdx - cur + 7) % 7;
      if (diff === 0) diff = 7;
      const d = new Date(now); d.setDate(d.getDate() + diff);
      return { date: iso(d), day: DAY_NAMES[dayIdx], label: DAY_NAMES[dayIdx] };
    }
    return null;
  },

  /* ---------- conversation memory ---------- */
  assistCtx() {
    if (!this._assistCtx) this._assistCtx = { staffId: null, sectionId: null, subjectCode: null, date: null, lastIntent: null };
    return this._assistCtx;
  },
  /** Resolve a person from text with typo tolerance + pronouns + memory.
      Returns {item, score} | {ambiguous, alternatives} | null */
  _resolveStaff(text) {
    const t = String(text).toLowerCase();
    const byName = this._fuzzyAll(text, this.data.staff, (s) => s.name);
    const byId = this._fuzzyAll(text, this.data.staff, (s) => s.id);
    const seen = new Set();
    const hits = byName.concat(byId).filter((h) => {
      if (seen.has(h.item.id)) return false;
      seen.add(h.item.id);
      return true;
    }).sort((a, b) => b.score - a.score);
    if (hits.length) {
      const top = hits[0];
      const close = hits.filter((h) => h.score >= 0.75 && top.score - h.score <= 0.06 && h.item.id !== top.item.id);
      if (close.length) return { ambiguous: true, alternatives: [top.item].concat(close.map((h) => h.item)).slice(0, 3) };
      return { item: top.item, score: top.score };
    }
    const ctx = this.assistCtx();
    if (ctx.staffId) {
      if (/\b(he|she|him|her|his|hers|they|them)\b/.test(t) || /\b(that one|same person|same one|again)\b/.test(t)) {
        return { item: this.staffById(ctx.staffId), viaMemory: true };
      }
    }
    return null;
  },
  _resolveSection(text) {
    const pick = this._fuzzyPick(text, this.data.sections, (s) => s.name) || this._fuzzyPick(text, this.data.sections, (s) => s.id);
    return pick ? pick.item : null;
  },
  _resolveSubject(text) {
    const pick = this._fuzzyPick(text, this.data.subjects, (s) => s.name) || this._fuzzyPick(text, this.data.subjects, (s) => s.code);
    return pick ? pick.item : null;
  },

  /* ---------- intent router: scored keyword sets, best match wins ---------- */
  _assistRoute(text) {
    const t = ' ' + String(text).toLowerCase().replace(/[^a-z0-9?!\s-]/g, ' ') + ' ';
    const when = this._parseWhen(t);
    const scored = [];
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // whole-word match that tolerates inflections ("risk"→"risks", "balance"→"balanced"),
    // but only for words long enough that the suffix can't create false hits ("hi" never matches "his")
    const wordRx = (w) => {
      const toks = w.split(' ');
      const last = toks[toks.length - 1];
      const tail = last.length >= 4 ? '(?:s|d|es|ed|ing)?' : '';
      return new RegExp('\\b' + toks.map(esc).join('\\s+') + tail + '\\b');
    };
    const add = (intent, words, weight) => {
      let s = 0;
      words.forEach((w) => { if (wordRx(w).test(t)) s += weight; });
      if (s > 0) scored.push({ intent, score: s });
    };
    // order matters on ties: specific actions are listed before broad lookup intents
    add('help', ['help', 'commands', 'what can you do', 'options'], 3);
    add('greet', ['hello', 'hi', 'hey', 'good morning', 'good evening'], 2);
    add('simulate', ['what if', 'what happens if', 'simulate', 'preview', 'dry run', 'if absent'], 3);
    add('mark_absent', ['mark absent', 'report absent', 'is absent', 'declare absent', 'out of office', 'on leave'], 3);
    add('mark_present', ['mark present', 'is back', 'rejoined', 'came back'], 3);
    add('who_cover', ['who can cover', 'who can substitute', 'substitute for', 'cover for', 'replacement for', 'who will teach'], 3);
    add('absent_list', ['who is absent', 'who is out', 'absent list', 'anyone absent', 'attendance today'], 2);
    add('uncovered', ['uncovered', 'no substitute', 'critical slots', 'left open'], 2);
    add('risk', ['risk', 'fragile', 'single point', 'vulnerable', 'breakdown', 'emergency readiness'], 3);
    add('insights', ['insights', 'overview', 'how are we', 'status', 'summary', 'health'], 2);
    add('balance', ['balance', 'rebalance', 'overloaded', 'underloaded', 'uneven', 'redistribute'], 3);
    add('explain', ['why', 'explain', 'reason', 'justification'], 2);
    add('conflicts', ['conflict', 'clash', 'double book', 'overlapping'], 3);
    add('workload', ['workload', 'load report', 'teaching hours', 'how many hours'], 2);
    add('schedule', ['schedule', 'timetable', 'classes', 'free slots', 'when is'], 2);
    add('who_teaches', ['who teaches', 'who takes', 'faculty for', 'teacher for'], 3);
    add('generate', ['generate timetable', 'build timetable', 'regenerate'], 3);
    add('goto', ['go to', 'open', 'take me to', 'navigate'], 2);
    add('backup', ['save backup', 'download backup', 'backup'], 2);
    add('sample', ['load sample', 'sample data', 'demo data'], 3);
    add('holiday', ['add holiday', 'holiday on', 'declare holiday'], 3);
    scored.sort((a, b) => b.score - a.score);
    return { intent: scored.length ? scored[0].intent : null, when, text: t };
  },

  /* ---------- analysis: one-click safe reassignment ---------- */
  /** Can `to` take over `slot` without breaking expertise, load, daily or
      consecutive rules? Shared by the reassign action and rebalance suggestions. */
  _canTake(to, slot) {
    if (!to) return { ok: false, msg: 'Faculty not found.' };
    if (to.attendanceStatus === 'Absent') return { ok: false, msg: to.name + ' is absent.' };
    if (!(to.subjects || []).includes(slot.subjectCode)) return { ok: false, msg: to.name + ' is not an expert in ' + slot.subjectCode + '.' };
    if (this.busyAt(slot.day, slot.period).has(to.id)) return { ok: false, msg: to.name + ' is already teaching at ' + slot.day + ' P' + slot.period + '.' };
    if (this.ownLoad(to.id) + 1 > (to.maxHoursPerWeek || this.config.maxWeekly)) return { ok: false, msg: to.name + ' would exceed the weekly limit.' };
    const dayCount = this.teachingSlots().filter((s) => this.effTeacher(s) === to.id && s.day === slot.day).length;
    if (dayCount + 1 > (to.maxHoursPerDay || this.config.maxDaily)) return { ok: false, msg: to.name + ' would exceed the daily maximum on ' + slot.day + '.' };
    const sameDay = this.teachingSlots().filter((s) => this.effTeacher(s) === to.id && s.day === slot.day).map((s) => s.period).sort((a, b) => a - b);
    let run = 1, best = 1;
    for (let i = 1; i < sameDay.length; i++) { run = sameDay[i] === sameDay[i - 1] + 1 ? run + 1 : 1; if (run > best) best = run; }
    if (best >= (to.maxConsec || this.config.maxConsec)) return { ok: false, msg: to.name + ' already has ' + best + ' consecutive periods on ' + slot.day + ' — adding this would break the consecutive rule.' };
    return { ok: true, msg: '' };
  },

  assistReassign(slotId, toId) {
    const slot = this.data.schedule.find((s) => s.id === slotId);
    const to = this.staffById(toId);
    if (!slot || !to) return { ok: false, msg: 'Slot or faculty not found.' };
    const guard = this._canTake(to, slot);
    if (!guard.ok) return guard;
    const from = this.staffById(slot.originalTeacherId || slot.teacherId);
    slot.teacherId = to.id;
    slot.originalTeacherId = to.id;
    slot.currentTeacherId = to.id;
    slot.isSubstituted = false;
    slot.backupTeacherId = null;
    this.assignBackups();
    this.saveAll();
    this.audit('Slot reassigned (assistant)', this.subjectName(slot.subjectCode) + ' ' + this.sectionName(slot.sectionId) + ' ' + slot.day + ' P' + slot.period + ': ' + (from ? from.name : '?') + ' \u2192 ' + to.name);
    return { ok: true, msg: 'Reassigned ' + this.subjectName(slot.subjectCode) + ' (' + this.sectionName(slot.sectionId) + ', ' + slot.day + ' P' + slot.period + ') to ' + to.name + '.' };
  },

  /** Fragile slots: classes whose teacher is the ONLY qualified option
      (no other expert, or all experts busy) — an emergency waiting to happen. */
  _fragileSlots() {
    const slots = this.teachingSlots();
    const busyMap = new Map();
    slots.forEach((s) => {
      const k = s.day + '|' + s.period;
      if (!busyMap.has(k)) busyMap.set(k, new Set());
      busyMap.get(k).add(this.effTeacher(s));
    });
    const loads = new Map();
    this.data.staff.forEach((s) => loads.set(s.id, this.slotLoad(s.id)));
    const out = [];
    slots.forEach((sl) => {
      const teacher = this.effTeacher(sl);
      if (!teacher) { out.push({ slot: sl, count: 0, best: null }); return; }
      const sec = this.sectionById(sl.sectionId);
      const busy = busyMap.get(sl.day + '|' + sl.period);
      let count = 0, best = null;
      this.data.staff.forEach((x) => {
        if (x.id === teacher || x.attendanceStatus === 'Absent') return;
        const expert = (x.subjects || []).includes(sl.subjectCode);
        const sameDept = x.dept === (sec ? sec.dept : null);
        if (!expert && !sameDept) return;
        if (busy.has(x.id)) return;
        count++;
        const score = (expert ? 50 : 0) + (sameDept ? 20 : 0) + 30 - Math.min(loads.get(x.id) || 0, 20) * 0.6;
        if (!best || score > best.score) best = { staff: x, score: Math.round(score) };
      });
      if (count <= 1) out.push({ slot: sl, count, best });
    });
    return out;
  },

  /** Dry-run: what WOULD happen if this faculty is absent on a day/week.
      Computes candidates per slot without touching any state. */
  _simulateAbsence(teacher, when) {
    const date = when && when.date ? when.date : null;
    const slots = this.slotsToCover(teacher, date).filter((sl) => this.effTeacher(sl) === teacher.id);
    const extraBusy = new Map();
    const busyFor = (sl) => { const k = sl.day + '|' + sl.period; if (!extraBusy.has(k)) extraBusy.set(k, new Set()); return extraBusy.get(k); };
    const rows = slots.map((sl) => {
      const cands = this.candidatesForSlot(sl, teacher.id, busyFor(sl));
      const best = cands.find((c) => c.eligible);
      if (best) busyFor(sl).add(best.staff.id);
      return { slot: sl, best: best || null, runnerUp: cands.filter((c) => c.eligible)[1] || null };
    });
    return { rows, coverable: rows.filter((r) => r.best).length, critical: rows.filter((r) => !r.best).length };
  },

  /** Concrete rebalancing moves: shift a slot from the most loaded faculty in
      a department to an underloaded expert in the SAME department who is free
      at that time. Fairness-based (dept average), not just limit violations. */
  _rebalanceSuggestions(limit) {
    const maxW = this.config.maxWeekly;
    const rows = this.data.staff.map((s) => ({ s, load: this.ownLoad(s.id) + this.coverLoad(s.id) }));
    const deptAvg = new Map();
    rows.forEach((r) => {
      const d = r.s.dept;
      if (!deptAvg.has(d)) deptAvg.set(d, { sum: 0, n: 0 });
      const a = deptAvg.get(d); a.sum += r.load; a.n++;
    });
    const out = [];
    rows.filter((r) => r.s.attendanceStatus !== 'Absent').forEach((o) => {
      if (out.length >= (limit || 4)) return;
      const avg = (deptAvg.get(o.s.dept) || { sum: 0, n: 1 }).sum / ((deptAvg.get(o.s.dept) || { n: 1 }).n || 1);
      if (o.load < avg + 0.5) return;                              // only shift from the above-average side
      this.teachingSlots().forEach((sl) => {
        if (out.length >= (limit || 4)) return;
        if ((sl.originalTeacherId || sl.teacherId) !== o.s.id || sl.isSubstituted) return;
        const sec = this.sectionById(sl.sectionId);
        if (!sec || sec.dept !== o.s.dept) return;
        const match = rows.find((u) => u.s.id !== o.s.id && u.s.dept === o.s.dept
          && u.load <= avg - 0.5 && u.s.attendanceStatus !== 'Absent'
          && (u.s.subjects || []).includes(sl.subjectCode)
          && this._canTake(u.s, sl).ok);
        if (match) {
          out.push({ slot: sl, from: o.s, to: match.s, fromLoad: o.load, toLoad: match.load });
          match.load += 1;
          o.load -= 1;
        }
      });
    });
    return out;
  },

  /** Why was this substitution chosen? Full score breakdown for trust. */
  _explainSubstitution(teacher) {
    const rec = this.data.substitutions.find((r) => r.absentTeacher === teacher.id && r.status !== 'reverted')
      || this.data.substitutions.find((r) => r.absentTeacher === teacher.id);
    if (!rec) return teacher.name + ' has no substitution records yet.';
    const sub = rec.substitute ? this.staffById(rec.substitute) : null;
    const sec = this.sectionById(rec.sectionId);
    let line = 'Most recent: ' + teacher.name + ' was absent ' + (rec.date || 'week-wide') + ' \u2014 ' + this.subjectName(rec.subjectCode) + ' (' + this.sectionName(rec.sectionId) + ', ' + rec.day + ' P' + rec.period + '). ';
    if (!sub) line += 'No eligible substitute was found (all experts busy or unavailable), so the slot was flagged critical.';
    else {
      const parts = [];
      if ((sub.subjects || []).includes(rec.subjectCode)) parts.push('subject expert (+50)');
      if (sub.dept === (sec ? sec.dept : null)) parts.push('same department (+20)');
      parts.push('free at that time (+30)');
      if (rec.mode === 'manual') line += sub.name + ' was chosen manually by the administrator. Recorded reason: ' + (rec.reason || 'manual assignment') + '.';
      else line += sub.name + ' was the top-ranked candidate \u2014 ' + parts.join(', ') + ', workload ' + this.slotLoad(sub.id) + 'h/week.';
    }
    return line;
  },

  /* ---------- assistant UI: floating widget, understated, professional ---------- */
  toggleAssistant(force) {
    const win = document.getElementById('assistantChat');
    const fab = document.getElementById('assistantFab');
    if (!win) return;
    const open = typeof force === 'boolean' ? force : !win.classList.contains('open');
    win.classList.toggle('open', open);
    if (fab) fab.classList.toggle('hidden', open);
    if (open) {
      if (win.children.length) this.renderAssistant();
      this.clearAssistDot();
      const inp = document.getElementById('assistantInput');
      if (inp) setTimeout(() => inp.focus(), 60);
    }
  },

  clearAssistant() {
    const el = document.getElementById('assistantMessages');
    if (el) el.innerHTML = '';
    this.renderAssistant(true);
  },

  toggleAssistDocs() {
    const d = document.getElementById('assistantDocs');
    if (d) d.classList.toggle('hidden');
  },

  clearAssistDot() {
    const dot = document.getElementById('assistantDot');
    if (dot) dot.classList.add('hidden');
  },
  notifyAssistant() {
    const win = document.getElementById('assistantChat');
    if (win && win.classList.contains('open')) return;
    const dot = document.getElementById('assistantDot');
    if (dot) dot.classList.remove('hidden');
  },

  /** Contextual one-tap suggestions shown above the input. */
  renderAssistSuggest() {
    const host = document.getElementById('assistSuggest');
    if (!host) return;
    const chips = [];
    const abs = this.data.staff.filter((s) => s.attendanceStatus === 'Absent');
    const unc = this.teachingSlots().filter((s) => !this.effTeacher(s)).length;
    if (this.data.schedule.length) {
      if (unc) chips.push('Who is not covered?');
      if (abs.length) chips.push('Who can cover them?');
      chips.push('Coverage risk', 'Is the workload balanced', 'Status');
    } else {
      chips.push('Load sample data', 'Generate timetable', 'Help');
    }
    host.innerHTML = chips.map((c) => `<button class="assist-chip" onclick="TT.assistAsk('${escapeAttr(c)}')">${escapeHtml(c)}</button>`).join('');
  },

  assistAsk(text) {
    const inp = document.getElementById('assistantInput');
    if (inp) inp.value = text;
    this.assistantAsk();
  },

  renderAssistant(forceGreet) {
    const messages = document.getElementById('assistantMessages');
    if (messages && (messages.children.length === 0 || forceGreet)) {
      const abs = this.data.staff.filter((s) => s.attendanceStatus === 'Absent').length;
      const unc = this.teachingSlots().filter((s) => !this.effTeacher(s)).length;
      const chatEl = document.getElementById('assistantChat');
      this._assistQuiet = !(chatEl && chatEl.classList.contains('open'));
      this.assistantAppend('bot', (forceGreet ? '' : 'Ready. ') + 'Ask about schedules, absences, substitutions, workload \u2014 or tap a suggestion.'
        + (abs || unc ? '\nCurrently: ' + abs + ' absent, ' + unc + ' uncovered slot(s).' : '\n' + (this.data.schedule.length ? 'Everything is covered.' : 'No timetable yet \u2014 try "load sample data".')));
      this._assistQuiet = false;
    }
    this.renderAssistSuggest();
    const docs = this.ragDocs();
    const list = document.getElementById('ragDocList');
    if (list) {
      list.innerHTML = docs.length
        ? docs.map((d) => `<div class="kv"><span>${escapeHtml(d.title)} (${(d.chunks || []).length} chunks)</span><button class="btn btn-sm danger" onclick="TT.ragDeleteDoc('${escapeAttr(d.id)}')">Del</button></div>`).join('')
        : '<div class="text-muted" style="font-size:0.82rem">No documents yet. Add a policy or handbook to search it here.</div>';
    }
  },

  assistantAsk() {
    const inp = document.getElementById('assistantInput');
    if (!inp) return;
    const q = inp.value.trim();
    if (!q) return;
    const messages = document.getElementById('assistantMessages');
    if (messages && messages.children.length === 0) this.renderAssistant();
    inp.value = '';
    this.assistantAppend('user', q);
    setTimeout(() => this.assistantReply(q), 120);
  },

  assistantAppend(role, text, actions) {
    const el = document.getElementById('assistantMessages');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.textContent = text;
    if (actions && actions.length) {
      const bar = document.createElement('div');
      bar.className = 'msg-actions';
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = 'btn btn-sm';
        b.textContent = a.label;
        b.onclick = () => { bar.remove(); this.assistAction(a.action, a.arg); };
        bar.appendChild(b);
      });
      d.appendChild(bar);
    }
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    if (role === 'bot' && !this._assistQuiet) this.notifyAssistant();
  },

  /** Inline actions from message buttons. */
  assistAction(action, arg) {
    const ctx = this.assistCtx();
    if (action === 'noop') return;
    if (action === 'rerun') {
      const inp = document.getElementById('assistantInput');
      if (inp) { inp.value = arg; this.assistantAsk(); }
      return;
    }
    if (action === 'clarify_pick') {
      const [sid, intent] = String(arg).split('|');
      const s = this.staffById(sid);
      if (!s) return;
      ctx.staffId = sid;
      if (intent === 'mark_absent') {
        const sim = this._simulateAbsence(s, ctx.date ? { date: ctx.date } : null);
        this.render();
        return this.assistantAppend('bot', s.name + ' \u2014 ' + sim.rows.length + ' class(es) affected. ' + sim.coverable + ' coverable, ' + sim.critical + ' critical. Apply?',
          [{ label: 'Yes, mark absent & cover', action: 'mark_absent', arg: sid }, { label: 'Cancel', action: 'noop' }]);
      }
      return this.assistantReply(s.name);
    }
    if (action === 'mark_absent') {
      const s = this.staffById(arg);
      if (!s) return;
      const date = ctx.date || null;
      const r = this.markAbsentStaff(s, { date, silent: true });
      this.render();
      this.assistantAppend('bot', s.name + ' marked absent' + (date ? ' on ' + date : ' for the week') + ' \u2014 ' + r.success + ' slot(s) auto-covered, ' + r.critical + ' critical.',
        r.success ? [{ label: 'Undo', action: 'undo_absent', arg: s.id }] : null);
    } else if (action === 'undo_absent') {
      const s = this.staffById(arg);
      if (!s) return;
      const r = this.markPresentStaff(s, { silent: true });
      this.render();
      this.assistantAppend('bot', s.name + ' restored \u2014 ' + r.restored + ' slot(s) back to ' + (s.name.split(' ')[0]) + '.');
    } else if (action === 'goto') {
      this.showPanel(arg);
      this.assistantAppend('bot', 'Opened ' + arg + '.');
    } else if (action === 'reassign') {
      const [slotId, toId] = String(arg).split('|');
      const r = this.assistReassign(slotId, toId);
      this.render();
      this.assistantAppend('bot', (r.ok ? 'Done \u2014 ' : 'Could not reassign \u2014 ') + r.msg);
    } else if (action === 'explain') {
      const s = this.staffById(arg);
      if (s) this.assistantAppend('bot', this._explainSubstitution(s));
    }
  },

  /* ---------- main dispatcher ---------- */
  assistantReply(q) {
    const ctx = this.assistCtx();
    const route = this._assistRoute(q);
    if (route.when) { ctx.date = route.when.date; ctx.day = route.when.day; }
    const whenLabel = route.when ? route.when.label : null;
    const t = route.text;

    const say = (text, actions) => this.assistantAppend('bot', text, actions);
    // resolve entities with memory fallback
    const staffRes = this._resolveStaff(q);
    if (staffRes && staffRes.item) ctx.staffId = staffRes.item.id;
    const section = this._resolveSection(q);
    if (section) ctx.sectionId = section.id;
    const subject = this._resolveSubject(q);
    if (subject) ctx.subjectCode = subject.code;

    // clarification on ambiguity — ask instead of guessing
    if (staffRes && staffRes.ambiguous) {
      return say('Which ' + (route.intent === 'mark_absent' ? 'person should I mark absent' : 'person do you mean') + '?\n'
        + staffRes.alternatives.map((s, i) => (i + 1) + ') ' + s.name + ' \u2014 ' + s.dept + ', ' + s.attendanceStatus.toLowerCase()).join('\n'),
        staffRes.alternatives.map((s) => ({ label: s.name + ' (' + s.dept + ')', action: 'clarify_pick', arg: s.id + '|' + (route.intent || 'info') })));
    }

    const person = (staffRes && staffRes.item) || null;
    ctx.lastIntent = route.intent;

    switch (route.intent) {
      case 'help':
        return say(
          'What I can do:\n'
          + '\u2022 Absences \u2014 "mark Priya absent tomorrow", "who is out", "what if Rajesh is absent on Monday" (preview, no changes)\n'
          + '\u2022 Cover \u2014 "who can cover DBMS Tuesday", "why was Anjali chosen"\n'
          + '\u2022 Risk \u2014 "coverage risk", "which classes have no backup"\n'
          + '\u2022 Balance \u2014 "is the workload balanced", "rebalance CSE"\n'
          + '\u2022 Lookups \u2014 "schedule of CSE Sec A", "who teaches Operating Systems", "workload of IT"\n'
          + '\u2022 Actions \u2014 "generate timetable", "check conflicts", "save backup", "go to reports"\n'
          + 'Names can be typed loosely \u2014 "Priva" finds Priya. Follow-ups work too: after asking about someone, just say "what about Tuesday?".');

      case 'greet': {
        const abs = this.data.staff.filter((s) => s.attendanceStatus === 'Absent');
        const unc = this.teachingSlots().filter((s) => !this.effTeacher(s)).length;
        const conflicts = this.validateSchedule().length;
        return say('Hello.' + (this.data.schedule.length
          ? ' Snapshot: ' + this.data.staff.length + ' faculty, ' + abs.length + ' absent, ' + unc + ' uncovered, ' + conflicts + ' conflict(s). Ask me anything.'
          : ' No timetable yet \u2014 say "generate timetable" or "load sample data" to get started.'));
      }

      case 'mark_absent': {
        if (!person) return say('Who should I mark absent? Give a name \u2014 e.g. "mark Priya absent tomorrow".', [{ label: 'Show today\u2019s attendance', action: 'goto', arg: 'attendance' }]);
        const date = route.when ? route.when.date : (ctx.date || null);
        const sim = this._simulateAbsence(person, route.when || (ctx.date ? { date: ctx.date } : null));
        if (!sim.rows.length) return say(person.name + ' has no classes ' + (whenLabel ? 'on ' + whenLabel : 'this week') + '. Marking absent has no timetable effect \u2014 want me to record it anyway?');
        return say(person.name + ' \u2014 ' + sim.rows.length + ' class(es) ' + (whenLabel ? 'on ' + whenLabel : 'this week')
          + '. ' + sim.coverable + ' coverable, ' + sim.critical + ' would be critical.\n'
          + sim.rows.slice(0, 5).map((r) => '  ' + r.slot.day + ' P' + r.slot.period + ' ' + this.subjectName(r.slot.subjectCode) + ' \u2192 ' + (r.best ? r.best.staff.name + ' (score ' + r.best.score + ')' : '\u26a0 no one available')).join('\n')
          + (sim.rows.length > 5 ? '\n  \u2026' : '')
          + '\nApply?',
          [{ label: 'Yes, mark absent & cover', action: 'mark_absent', arg: person.id },
           { label: 'No, cancel', action: 'noop' }]);
      }

      case 'undo_absent': {
        if (!person) return say('Who should I restore?');
        const r = this.markPresentStaff(person, { silent: true });
        this.render();
        return say(person.name + ' restored \u2014 ' + r.restored + ' slot(s) returned.');
      }

      case 'simulate': {
        if (!person) return say('Tell me who to simulate \u2014 e.g. "what if Priya is absent tomorrow".');
        const sim = this._simulateAbsence(person, route.when || (ctx.date ? { date: ctx.date } : null));
        if (!sim.rows.length) return say('Simulation: ' + person.name + ' has no classes ' + (whenLabel ? 'on ' + whenLabel : 'this week') + '. Nothing would be affected.');
        return say('Preview (nothing changed): if ' + person.name + ' is ' + (whenLabel ? 'absent ' + whenLabel : 'absent for the week') + ', ' + sim.rows.length + ' class(es) are affected.\n'
          + sim.rows.map((r) => '  ' + r.slot.day + ' P' + r.slot.period + ' ' + this.sectionName(r.slot.sectionId) + ' ' + this.subjectName(r.slot.subjectCode)
            + ' \u2192 ' + (r.best ? r.best.staff.name + ' [' + r.best.tags.join(', ') + ']' + (r.runnerUp ? ' (next: ' + r.runnerUp.staff.name + ')' : '') : '\u26a0 CRITICAL \u2014 nobody available')).join('\n')
          + (sim.critical ? '\n' + sim.critical + ' slot(s) would need manual attention.' : '\nAll covered automatically.'),
          person.attendanceStatus === 'Absent'
            ? [{ label: 'Restore ' + person.name.split(' ')[0], action: 'undo_absent', arg: person.id }]
            : [{ label: 'Mark absent & apply', action: 'mark_absent', arg: person.id }, { label: 'Go to substitution panel', action: 'goto', arg: 'substitution' }]);
      }

      case 'who_cover': {
        if (!person) return say('Who do you need a replacement for? e.g. "who can cover Operating Systems on Wednesday".');
        const slots = this.slotsToCover(person, route.when ? route.when.date : (ctx.date || null))
          .filter((sl) => this.effTeacher(sl) === person.id);
        if (!slots.length) return say(person.name + ' has no uncovered classes ' + (whenLabel ? 'on ' + whenLabel : 'right now') + '.');
        const head = 'Best replacements for ' + person.name + (whenLabel ? ' \u2014 ' + whenLabel : '') + ':\n';
        const body = slots.slice(0, 6).map((sl) => {
          const cands = this.candidatesForSlot(sl, person.id, new Set()).filter((c) => c.eligible);
          const best = cands[0];
          return '  ' + sl.day + ' P' + sl.period + ' ' + this.subjectName(sl.subjectCode) + ' (' + this.sectionName(sl.sectionId) + ') \u2192 '
            + (best ? best.staff.name + ' [' + best.tags.join(', ') + ']' + (cands[1] ? ', then ' + cands[1].staff.name : '') : '\u26a0 nobody eligible');
        }).join('\n');
        return say(head + body + (slots.length > 6 ? '\n  \u2026' : ''), [{ label: 'Open substitution planner', action: 'goto', arg: 'substitution' }]);
      }

      case 'mark_present': {
        if (!person) return say('Who is back? e.g. "Priya is back".');
        const r = this.markPresentStaff(person, { silent: true });
        this.render();
        return say(person.name + ' marked present \u2014 ' + r.restored + ' slot(s) restored.');
      }

      case 'absent_list': {
        const abs = this.data.staff.filter((s) => s.attendanceStatus === 'Absent');
        if (!abs.length) return say('Nobody is absent. All ' + this.data.staff.length + ' faculty are present.');
        return say('Absent (' + abs.length + '):\n' + abs.map((s) => {
          const unc = this.slotsToCover(s, null).filter((sl) => !this.effTeacher(sl) || this.effTeacher(sl) === s.id).length;
          return '  ' + s.name + ' (' + s.dept + ') \u2014 ' + unc + ' uncovered';
        }).join('\n'), abs.length === 1 ? [{ label: 'Restore', action: 'undo_absent', arg: abs[0].id }] : null);
      }

      case 'uncovered': {
        const unc = this.teachingSlots().filter((s) => !this.effTeacher(s));
        if (!unc.length) return say('All classes are covered.');
        return say(unc.length + ' uncovered slot(s):\n' + unc.slice(0, 8).map((s) => '  ' + s.day + ' P' + s.period + ' ' + this.sectionName(s.sectionId) + ' ' + this.subjectName(s.subjectCode) + ' (' + this.staffName(s.originalTeacherId || s.teacherId) + ')').join('\n')
          + (unc.length > 8 ? '\n  \u2026' : ''),
          [{ label: 'Open substitution panel', action: 'goto', arg: 'substitution' }]);
      }

      case 'risk': {
        if (!this.data.schedule.length) return say('No timetable generated yet \u2014 risk analysis needs a schedule.');
        const fragile = this._fragileSlots();
        const uncovered = this.teachingSlots().filter((s) => !this.effTeacher(s)).length;
        if (!fragile.length && !uncovered) return say('Coverage risk: none. Every class has at least two qualified, available replacements.');
        return say('Coverage risk report:\n'
          + (uncovered ? '  \u26a0 ' + uncovered + ' slot(s) currently uncovered (critical)\n' : '')
          + (fragile.length ? fragile.slice(0, 6).map((f) => {
            const sl = f.slot;
            return '  \u26a0 ' + sl.day + ' P' + sl.period + ' ' + this.subjectName(sl.subjectCode) + ' (' + this.sectionName(sl.sectionId) + ') \u2014 '
              + (f.count === 0 ? 'NO available replacement if ' + this.staffName(this.effTeacher(sl)) + ' is absent'
                : 'only ' + f.best.staff.name + ' can cover');
          }).join('\n') + (fragile.length > 6 ? '\n  \u2026' : '') : '')
          + '\nRecommendation: cross-train faculty on these subjects or designate additional backups.',
          fragile.length ? [{ label: 'Go to staff', action: 'goto', arg: 'staff' }] : null);
      }

      case 'balance': {
        if (!this.data.schedule.length) return say('No timetable to analyze yet.');
        const maxW = this.config.maxWeekly;
        const rows = this.data.staff.map((s) => ({ s, load: this.ownLoad(s.id) + this.coverLoad(s.id) })).sort((a, b) => b.load - a.load);
        const over = rows.filter((r) => r.load > (r.s.maxHoursPerWeek || maxW));
        const under = rows.filter((r) => r.load <= maxW - 6);
        const avg = rows.length ? (rows.reduce((a, r) => a + r.load, 0) / rows.length).toFixed(1) : 0;
        const moves = this._rebalanceSuggestions(3);
        let out = 'Workload balance \u2014 average ' + avg + 'h, limit ' + maxW + 'h. '
          + over.length + ' overloaded, ' + under.length + ' with room spare.\n'
          + 'Most loaded: ' + rows.slice(0, 3).map((r) => r.s.name + ' (' + r.load + 'h)').join(', ') + '.\n'
          + 'Lightest: ' + rows.slice(-3).map((r) => r.s.name + ' (' + r.load + 'h)').join(', ') + '.';
        if (moves.length) {
          out += '\nSuggested moves:\n' + moves.map((m, i) => '  ' + (i + 1) + ') ' + this.subjectName(m.slot.subjectCode) + ' ' + this.sectionName(m.slot.sectionId) + ' ' + m.slot.day + ' P' + m.slot.period
            + ': ' + m.from.name + ' (' + m.fromLoad + 'h) \u2192 ' + m.to.name + ' (' + m.toLoad + 'h)').join('\n');
          return say(out, moves.map((m, i) => ({ label: 'Apply move ' + (i + 1), action: 'reassign', arg: m.slot.id + '|' + m.to.id })));
        }
        return say(out + (over.length ? '\nNo safe automatic moves found \u2014 department-aware shuffling would be needed.' : '\nLoad looks healthy.'));
      }

      case 'explain': {
        if (person) return say(this._explainSubstitution(person));
        const recs = this.data.substitutions.filter((r) => r.status !== 'reverted');
        if (!recs.length) return say('No substitutions recorded yet \u2014 nothing to explain.');
        const r0 = recs[0];
        return say('Most recent substitution: ' + this.staffName(r0.absentTeacher) + ' \u2192 ' + (r0.substitute ? this.staffName(r0.substitute) : 'nobody (critical)')
          + ' on ' + (r0.date || 'week-wide') + ', ' + this.subjectName(r0.subjectCode) + '.\nAsk about a specific person, e.g. "why was ' + this.staffName(r0.absentTeacher) + ' covered by ' + (r0.substitute ? this.staffName(r0.substitute) : 'nobody') + '".');
      }

      case 'conflicts': {
        const c = this.validateSchedule();
        if (!c.length) return say(this.data.schedule.length ? 'No conflicts. The timetable is clean.' : 'No timetable generated yet.');
        return say(c.length + ' conflict(s):\n' + c.slice(0, 6).map((x) => '  \u26a0 ' + x.type + ': ' + (x.detail || '')).join('\n') + (c.length > 6 ? '\n  \u2026' : ''),
          [{ label: 'Open generator', action: 'goto', arg: 'generator' }]);
      }

      case 'workload': {
        const dept = route.text.match(/\b(cse|ece|eee|it|mech|civil|aiml|aids|csds|biomed)\b/);
        let rows = this.data.staff.map((s) => ({ s, own: this.ownLoad(s.id), cov: this.coverLoad(s.id) }));
        if (dept) rows = rows.filter((r) => r.s.dept === dept[1].toUpperCase());
        if (person) rows = rows.filter((r) => r.s.id === person.id);
        rows.sort((a, b) => (b.own + b.cov) - (a.own + a.cov));
        if (!rows.length) return say('No matching faculty found.');
        return say('Workload' + (dept ? ' \u2014 ' + dept[1].toUpperCase() : person ? ' \u2014 ' + person.name : '') + ':\n'
          + rows.slice(0, 8).map((r) => '  ' + r.s.name + ': ' + r.own + ' own + ' + r.cov + ' cover = ' + (r.own + r.cov) + '/' + (r.s.maxHoursPerWeek || this.config.maxWeekly) + 'h').join('\n')
          + (rows.length > 8 ? '\n  \u2026' : ''));
      }

      case 'schedule': {
        let slots = [];
        let label = '';
        if (section) { slots = this.teachingSlots().filter((s) => s.sectionId === section.id); label = section.name; }
        else if (person) { slots = this.slotsToCover(person, route.when ? route.when.date : null); label = person.name; }
        else if (subject) { slots = this.teachingSlots().filter((s) => s.subjectCode === subject.code); label = subject.code + ' ' + subject.name; }
        else if (route.when && route.when.day) {
          const day = route.when.day;
          slots = this.teachingSlots().filter((s) => s.day === day);
          label = 'All classes on ' + day;
          const byTeacher = new Map();
          slots.forEach((s) => { const e = this.effTeacher(s); byTeacher.set(e, (byTeacher.get(e) || 0) + 1); });
          return say(label + ': ' + slots.length + ' classes, ' + byTeacher.size + ' faculty teaching. Ask about a specific person or section for details.');
        }
        else return say('Whose schedule? e.g. "schedule of CSE Sec A", "my schedule Tuesday", "when is DBMS".');
        if (!slots.length) return say('No classes found for ' + label + (route.when ? ' on ' + route.when.label : '') + '.');
        return say(label + ' \u2014 ' + slots.length + ' slot(s):\n'
          + slots.slice(0, 10).map((s) => '  ' + s.day + ' P' + s.period + ': ' + this.subjectName(s.subjectCode) + ' (' + this.staffName(this.effTeacher(s)) + (s.isSubstituted && this.effTeacher(s) !== (s.originalTeacherId || s.teacherId) ? ' \u21c4 sub' : '') + ')').join('\n')
          + (slots.length > 10 ? '\n  \u2026' : ''));
      }

      case 'who_teaches': {
        const sub = subject || (person ? this.data.subjects.find((s) => (person.subjects || []).includes(s.code)) : null);
        if (!sub) return say('Which subject? e.g. "who teaches Database Management Systems".');
        const experts = this.data.staff.filter((s) => (s.subjects || []).includes(sub.code));
        return say(sub.code + ' ' + sub.name + ' \u2014 qualified: '
          + (experts.length ? experts.map((e) => e.name + ' (' + e.attendanceStatus.toLowerCase() + ', ' + this.slotLoad(e.id) + 'h)').join(', ') : 'nobody yet')
          + (experts.length === 1 ? '\nSingle point of failure \u2014 see "coverage risk".' : ''));
      }

      case 'generate':
        this.showPanel('generator');
        this.generateTimetable();
        return say('Generation started \u2014 progress is shown in the Generator panel.');

      case 'goto': {
        const panels = ['dashboard', 'departments', 'generator', 'staff', 'subjects', 'attendance', 'calendar', 'reports', 'substitution', 'settings', 'regulations', 'audit'];
        const p = panels.find((x) => t.includes(' ' + x));
        if (p) { this.showPanel(p); return say('Opened ' + p + '.'); }
        return say('Which panel? I know: ' + panels.join(', ') + '.');
      }

      case 'backup':
        this.downloadBackup();
        return say('Backup downloaded to your device.');

      case 'sample':
        this.loadSampleData();
        return say('Loading the sample campus \u2014 this replaces current data (a version snapshot is kept).');

      case 'holiday': {
        const dm = q.match(/\d{4}-\d{2}-\d{2}/);
        if (!dm) return say('Which date? e.g. "add holiday 2026-11-01 Diwali".');
        const nm = q.replace(/add holiday/i, '').replace(dm[0], '').trim() || 'Holiday';
        if (this.data.holidays.find((h) => h.date === dm[0])) return say('There is already a holiday on ' + dm[0] + '.');
        this.data.holidays.push({ date: dm[0], name: nm });
        this.saveAll();
        this.audit('Holiday added (assistant)', dm[0] + ' ' + nm);
        return say('Holiday "' + nm + '" added on ' + dm[0] + '.');
      }

      case 'insights': {
        if (!this.data.schedule.length) return say('No timetable yet. Say "generate timetable" or "load sample data" first.');
        const abs = this.data.staff.filter((s) => s.attendanceStatus === 'Absent');
        const unc = this.teachingSlots().filter((s) => !this.effTeacher(s)).length;
        const conflicts = this.validateSchedule().length;
        const fragile = this._fragileSlots().length;
        const rows = this.data.staff.map((s) => this.ownLoad(s.id) + this.coverLoad(s.id));
        const over = rows.filter((x) => x > this.config.maxWeekly).length;
        const lines = [
          '  Faculty: ' + this.data.staff.length + ' \u2022 sections: ' + this.data.sections.length + ' \u2022 slots: ' + this.teachingSlots().length,
          '  Attendance: ' + abs.length + ' absent' + (abs.length ? ' (' + abs.slice(0, 3).map((s) => s.name).join(', ') + ')' : ''),
          '  Coverage: ' + (unc ? unc + ' uncovered \u26a0' : 'fully covered') + ' \u2022 ' + fragile + ' fragile slot(s)',
          '  Quality: ' + conflicts + ' conflict(s) \u2022 ' + over + ' overloaded faculty',
          '  Substitutions so far: ' + this.data.substitutions.filter((s) => s.status !== 'reverted').length
        ];
        return say('Status:\n' + lines.join('\n'),
          [{ label: 'Coverage risk', action: 'rerun', arg: 'coverage risk' }, { label: 'Balance', action: 'rerun', arg: 'is the workload balanced' }, { label: 'Conflicts', action: 'rerun', arg: 'check conflicts' }]);
      }
    }

    // ---- fallbacks: person card, subject card, then document search ----
    if (person) {
      const next = this.teachingSlots().filter((s) => this.effTeacher(s) === person.id).slice(0, 3)
        .map((s) => s.day + ' P' + s.period + ' ' + this.subjectName(s.subjectCode)).join(', ');
      return say(person.name + ' (' + person.id + ') \u2014 ' + person.dept + ' \u2022 ' + person.attendanceStatus.toLowerCase()
        + ' \u2022 load ' + this.ownLoad(person.id) + ' own + ' + this.coverLoad(person.id) + ' cover'
        + '\nExpertise: ' + (person.subjects || []).map((c) => this.subjectName(c)).join(', ')
        + (next ? '\nNext classes: ' + next : '')
        + (person.attendanceStatus === 'Absent' ? '' : ''),
        [{ label: 'Simulate absence', action: 'rerun', arg: 'what if ' + person.name },
         { label: 'Schedule', action: 'rerun', arg: 'schedule of ' + person.name },
         person.attendanceStatus === 'Absent' ? { label: 'Restore', action: 'undo_absent', arg: person.id } : { label: 'Mark absent', action: 'rerun', arg: 'mark absent ' + person.name }]);
    }
    if (subject) {
      const experts = this.data.staff.filter((s) => (s.subjects || []).includes(subject.code));
      return say(subject.code + ' ' + subject.name + ' \u2014 ' + subject.dept + ', ' + subject.type + ', ' + subject.hoursPerWeek + 'h/week. Experts: '
        + (experts.map((e) => e.name).join(', ') || 'none assigned') + '.');
    }
    const rag = this.ragAnswer(q);
    if (rag && rag.answer && !/No relevant information found|No documents indexed/.test(rag.answer)) {
      return say(rag.answer + (rag.sources ? '\nSources: ' + rag.sources.join(', ') : ''));
    }
    return say('I did not catch that. I understand schedules, absences, substitutions, workload and risk \u2014 type "help" for examples, or name a person/subject and I will look them up.');
  },

  /* ---------- Compact local RAG (BM25 over app data + uploaded docs) ---------- */
  ragDocs() { return LS('tt_rag_documents') || []; },
  ragSaveDocs(d) { LS('tt_rag_documents', d); },
  ragTokens(text) {
    const stop = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'by', 'at', 'from', 'this', 'that', 'it', 'be']);
    return String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w)).map((w) => w.replace(/ing$|ed$|s$/, ''));
  },
  ragChunks() {
    const out = [];
    this.ragDocs().forEach((doc) => (doc.chunks || []).forEach((c) => out.push({ text: c, title: doc.title, docId: doc.id })));
    // auto-index live app data
    this.data.staff.forEach((s) => out.push({ text: 'Staff ' + s.name + ' ' + s.id + ' dept ' + s.dept + ' subjects ' + (s.subjects || []).join(' ') + ' status ' + s.attendanceStatus + ' load ' + this.slotLoad(s.id), title: 'App data (staff)', docId: 'auto' }));
    this.data.subjects.forEach((s) => out.push({ text: 'Subject ' + s.code + ' ' + s.name + ' dept ' + s.dept + ' type ' + s.type + ' hours ' + s.hoursPerWeek + ' credits ' + s.credits, title: 'App data (subjects)', docId: 'auto' }));
    this.data.sections.forEach((s) => out.push({ text: 'Section ' + s.id + ' ' + s.name + ' dept ' + s.dept, title: 'App data (sections)', docId: 'auto' }));
    this.teachingSlots().forEach((s) => out.push({ text: 'Slot ' + s.day + ' P' + s.period + ' section ' + this.sectionName(s.sectionId) + ' subject ' + this.subjectName(s.subjectCode) + ' teacher ' + this.staffName(this.effTeacher(s)) + ' room ' + (s.roomName || ''), title: 'App data (schedule)', docId: 'auto' }));
    this.data.holidays.forEach((h) => out.push({ text: 'Holiday ' + h.date + ' ' + h.name, title: 'App data (calendar)', docId: 'auto' }));
    return out;
  },
  ragAnswer(query) {
    const chunks = this.ragChunks();
    if (!chunks.length) return { answer: 'No documents indexed.' };
    const qTokens = this.ragTokens(query);
    const docs = chunks.map((c) => ({ ...c, toks: this.ragTokens(c.text) }));
    const N = docs.length, k1 = 1.5, b = 0.75;
    const df = {};
    docs.forEach((d) => new Set(d.toks).forEach((tk) => { df[tk] = (df[tk] || 0) + 1; }));
    const avgLen = docs.reduce((a, d) => a + d.toks.length, 0) / N;
    const scored = docs.map((d) => {
      const tf = {};
      d.toks.forEach((tk) => { tf[tk] = (tf[tk] || 0) + 1; });
      let score = 0;
      qTokens.forEach((qt) => {
        if (!tf[qt]) return;
        const idf = Math.log((N - (df[qt] || 0) + 0.5) / ((df[qt] || 0) + 0.5) + 1);
        score += idf * (tf[qt] * (k1 + 1)) / (tf[qt] + k1 * (1 - b + b * (d.toks.length / avgLen)));
      });
      return { d, score };
    }).sort((x, y) => y.score - x.score).slice(0, 4).filter((x) => x.score > 0);
    if (!scored.length) return { answer: 'No relevant information found. Try rephrasing, or upload documents (policy PDFs, regulations) in this panel.' };
    return {
      answer: 'Best matches:\n' + scored.map((x) => '• [' + x.d.title + '] ' + x.d.text.slice(0, 220)).join('\n'),
      sources: [...new Set(scored.map((x) => x.d.title))]
    };
  },
  async ragIngestFile(event) {
    const f = event.target.files && event.target.files[0];
    if (!f) return;
    try {
      const name = f.name.toLowerCase();
      let text = '';
      if (name.endsWith('.pdf')) {
        await this.ragLoadPdf();
        const buf = await f.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        for (let i = 1; i <= pdf.numPages; i++) { const p = await pdf.getPage(i); const c = await p.getTextContent(); text += c.items.map((x) => x.str).join(' ') + '\n'; }
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        if (!window.XLSX) throw new Error('SheetJS not loaded');
        text = XLSX.utils.sheet_to_csv(XLSX.read(await f.arrayBuffer(), { type: 'array' }).Sheets[XLSX.read(await f.arrayBuffer(), { type: 'array' }).SheetNames[0]]);
      } else {
        text = await f.text();
      }
      const chunks = [];
      for (let i = 0; i < text.length; i += 400) chunks.push(text.slice(i, i + 400));
      const docs = this.ragDocs();
      docs.push({ id: uid(), title: f.name, chunks, ts: new Date().toISOString() });
      this.ragSaveDocs(docs);
      this.audit('RAG document ingested', f.name + ' (' + chunks.length + ' chunks)');
      toast('Ingested ' + chunks.length + ' chunks from ' + f.name, 'success');
      this.renderAssistant();
    } catch (e) { toast('Ingest failed: ' + e.message, 'error'); }
    event.target.value = '';
  },
  async ragLoadPdf() {
    if (window.pdfjsLib) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(); };
      s.onerror = () => rej(new Error('Could not load PDF library (offline?)'));
      document.head.appendChild(s);
    });
  },
  ragDeleteDoc(id) {
    this.ragSaveDocs(this.ragDocs().filter((d) => d.id !== id));
    toast('Document removed', 'success');
    this.renderAssistant();
  },
  ragSearch() {
    const q = document.getElementById('ragQuery')?.value.trim();
    const out = document.getElementById('ragResults');
    if (!q || !out) return;
    const r = this.ragAnswer(q);
    out.textContent = r.answer + (r.sources ? '\nSources: ' + r.sources.join(', ') : '');
  }

};

/* ---------- Boot & compatibility globals ---------- */
window.TT = TT;
window.addEventListener('DOMContentLoaded', () => { if (window.TT && TT.init) TT.init(); });
