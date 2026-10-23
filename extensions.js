// extensions.js
// TimetableSettings
const TimetableSettings = {
  render(){
    const el=document.getElementById('settingsContent'); if(!el) return;
    el.innerHTML=`
      <div class="section-title">Templates</div>
      <div><button class="btn" onclick="TimetableSettings.saveTemplate()">Save Current as Template</button></div>
      <div id="templateList"></div>
      <div class="section-title">Workload Rules</div>
      <div>Max weekly <input type="number" id="wr_weekly" value="${app.workloadRules.maxWeekly}"/> Max daily <input type="number" id="wr_daily" value="${app.workloadRules.maxDaily}"/> Max consec <input type="number" id="wr_consec" value="${app.workloadRules.maxConsec}"/> <button class="btn" onclick="TimetableSettings.saveRules()">Save</button></div>
      <div class="section-title">Rule Profiles</div>
      <div id="profileList"></div>
      <div class="section-title">Departments & Sections</div>
      <div id="deptSectionList"></div>
      <div class="section-title">Versions</div>
      <div id="versionListHost"></div>
    `;
    this.renderTemplates(); this.renderProfiles(); this.renderDeptSections();
    if(window.VersionManager) VersionManager.renderInto && VersionManager.renderInto('versionListHost');
  },
  saveTemplate(){ const t=LS('tt_timetable_templates')||[]; t.push({id:uid(),name:'Template '+(t.length+1),schedule:app.schedule}); LS('tt_timetable_templates',t); toast('Template saved'); this.renderTemplates(); },
  renderTemplates(){
    const t=LS('tt_timetable_templates')||[];
    const el=document.getElementById('templateList'); if(el) el.innerHTML=t.map(x=>`<div class="kv"><span>${x.name} (${(x.schedule||[]).length} slots)</span><button class="btn" onclick="TimetableSettings.applyTemplate('${x.id}')">Apply</button></div>`).join('')||'No templates.';
  },
  applyTemplate(id){ const t=(LS('tt_timetable_templates')||[]).find(x=>x.id===id); if(t){ app.schedule=t.schedule; LS('tt_schedule',app.schedule); audit('Template applied',id); toast('Applied'); renderAll(); } },
  saveRules(){ app.workloadRules={maxWeekly:+document.getElementById('wr_weekly').value,maxDaily:+document.getElementById('wr_daily').value,maxConsec:+document.getElementById('wr_consec').value}; LS('tt_workload_rules',app.workloadRules); toast('Rules saved'); },
  renderProfiles(){
    const p=LS('tt_rule_profiles')||[]; const el=document.getElementById('profileList'); if(el) el.innerHTML=p.map(x=>`<div class="kv"><span>${x.name}</span><button class="btn" onclick="TimetableSettings.activateProfile('${x.id}')">Activate</button></div>`).join('');
  },
  activateProfile(id){ LS('tt_active_profile',id); toast('Profile activated'); },
  renderDeptSections(){
    const el=document.getElementById('deptSectionList'); if(!el) return;
    el.innerHTML=app.departments.map(d=>`<div><b>${d.name||d.id||d}</b> sections: ${app.sections.filter(s=>s.dept===d.id||s.dept===d).length}</div>`).join('');
  }
};
window.TimetableSettings=TimetableSettings;

// FacultyPreferences
const FacultyPreferences = {
  render(){
    const el=document.getElementById('settingsContent'); // maybe separate? We'll inject into settings bottom
    // create host if not
    let host=document.getElementById('facultyPrefsHost');
    if(!host){ host=document.createElement('div'); host.id='facultyPrefsHost'; if(el) el.appendChild(host); }
    const fp=LS('tt_faculty_preferences')||{};
    host.innerHTML=`<div class="section-title">Faculty Preferences</div>
      <select id="fp_staff" onchange="FacultyPreferences.renderGrid()">${app.staff.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
      <div id="fp_grid"></div>`;
    this.renderGrid();
  },
  renderGrid(){
    const id=document.getElementById('fp_staff')?.value;
    const avail=LS('tt_faculty_availability')||[];
    const rec=avail.find(x=>x.staffId===id)||{unavailable:[],preferred:[],avoid:[]};
    const grid=document.getElementById('fp_grid'); if(!grid) return;
    let html='<table><tr><th>Day/Period</th>'+PERIODS.map(p=>`<th>P${p}</th>`).join('')+'</tr>';
    DAYS.forEach(day=>{
      html+=`<tr><td>${day}</td>`+PERIODS.map(p=>{
        const key=day+'|'+p;
        const isUn=rec.unavailable.some(u=>u.day===day&&u.period===p);
        const isPr=rec.preferred.some(u=>u.day===day&&u.period===p);
        const isAv=rec.avoid.some(u=>u.day===day&&u.period===p);
        const val=isUn? 'U' : isPr? 'P' : isAv? 'A' : '';
        return `<td><select data-day="${day}" data-period="${p}" class="fp-cell" style="width:60px"><option ${!val?'selected':''}></option><option value="U" ${val==='U'?'selected':''}>Unavail</option><option value="P" ${val==='P'?'selected':''}>Pref</option><option value="A" ${val==='A'?'selected':''}>Avoid</option></select></td>`;
      }).join('')+'</tr>';
    });
    html+='</table><button class="btn primary" onclick="FacultyPreferences.save()">Save</button>';
    grid.innerHTML=html;
  },
  save(){
    const id=document.getElementById('fp_staff').value;
    const rec={staffId:id,unavailable:[],preferred:[],avoid:[]};
    document.querySelectorAll('.fp-cell').forEach(sel=>{
      const v=sel.value; if(!v) return;
      const day=sel.dataset.day; const period=+sel.dataset.period;
      if(v==='U') rec.unavailable.push({day,period});
      if(v==='P') rec.preferred.push({day,period});
      if(v==='A') rec.avoid.push({day,period});
    });
    const avail=LS('tt_faculty_availability')||[];
    const idx=avail.findIndex(x=>x.staffId===id);
    if(idx>=0) avail[idx]=rec; else avail.push(rec);
    LS('tt_faculty_availability',avail);
    toast('Preferences saved');
  }
};
window.FacultyPreferences=FacultyPreferences;

// SubstitutionManager
const SubstitutionManager = {
  render(){
    const el=document.getElementById('substitutionContent'); if(!el) return;
    const logs=LS('tt_substitution_logs')||[];
    const records=LS('tt_substitution_records')||[];
    el.innerHTML=`
      <div class="section-title">Faculty Substitution</div>
      <div><button class="btn" onclick="SubstitutionManager.renderAbsent()">Mark Absent (panel)</button></div>
      <h4>Substitution Logs</h4>
      <div class="table-wrap"><table>${logs.slice(0,50).map(l=>`<tr><td>${l.ts}</td><td>${l.status}</td><td>${l.absentTeacher}->${l.substitute||'NONE'}</td></tr>`).join('')}</table></div>
      <h4>SMS/Critical Alerts</h4>
      <div class="table-wrap"><table>${records.slice(0,50).map(r=>`<tr><td>${r.ts}</td><td>${r.text}</td></tr>`).join('')}</table></div>
      <div id="leaveSchedulerHost"></div>
      <div id="leavePanel" style="display:none"></div>
    `;
    if(window.LeaveScheduler) LeaveScheduler.render();
  },
  renderAbsent(){ showPanel('attendance'); }
};
window.SubstitutionManager=SubstitutionManager;

// VersionManager
const VersionManager = {
  KEY:'tt_timetable_versions',
  snapshot(label){
    const v=LS(this.KEY)||[];
    v.unshift({id:uid(),label:label||'Snapshot',ts:new Date().toISOString(),schedule:JSON.parse(JSON.stringify(app.schedule))});
    if(v.length>20) v.length=20;
    LS(this.KEY,v);
    toast('Version saved');
  },
  render(){ this.renderInto('versionListHost'); },
  renderInto(hostId){
    const host=document.getElementById(hostId); if(!host) return;
    const v=LS(this.KEY)||[];
    host.innerHTML=`<div>${v.length} versions saved</div>`+v.map(x=>`<div class="kv"><span>${x.label} - ${new Date(x.ts).toLocaleString()}</span>
      <span><button class="btn" onclick="VersionManager.restore('${x.id}')">Restore</button>
      <button class="btn" onclick="VersionCompare.compare('${x.id}')">Compare</button></span></div>`).join('');
  },
  restore(id){
    const v=(LS(this.KEY)||[]).find(x=>x.id===id); if(v){ app.schedule=v.schedule; LS('tt_schedule',app.schedule); toast('Restored'); renderAll(); }
  },
  init(){ /* auto snapshot 3.5s after gen handled in app */ }
};
window.VersionManager=VersionManager;

// TimetablePreview (also named preview for side)
const TimetablePreview = {
  render(){ renderTimetablePreview(); }
};
window.TimetablePreview=TimetablePreview;
// ensure a host in ttdashboard
function ensureTTPreviewHost(){
  const el=document.getElementById('ttDashContent'); if(!el) return;
  if(!document.getElementById('ttPreviewArea')){
    el.innerHTML=`<div class="grid" id="ttGenStats"></div>
      <div><button class="btn primary" onclick="simulateCSPGeneration()">Simulate CSP Generation</button>
      <button class="btn" onclick="generateTimetable()">Generate</button>
      <button class="btn" onclick="VersionManager.snapshot('manual')">Snapshot Version</button>
      <select id="viewSection" onchange="renderTimetablePreview()"><option value="">Preview (first section)</option>${app.sections.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
      </div>
      <div id="ttPreviewArea"></div>`;
  }
}
function updateTTStats(){
  const el=document.getElementById('ttGenStats'); if(!el) return;
  const conflicts=validateSchedule().length;
  const backupCov=app.schedule.filter(s=>s.subjectCode!=='FREE-LIB'&&s.backupTeacherId).length;
  const total=app.schedule.filter(s=>s.subjectCode!=='FREE-LIB').length;
  el.innerHTML=`
    <div class="card"><div class="num">${total}</div><div class="label">Teaching slots</div></div>
    <div class="card"><div class="num">${app.schedule.filter(s=>s.subjectCode==='FREE-LIB').length}</div><div class="label">Free-lib slots</div></div>
    <div class="card"><div class="num">${conflicts}</div><div class="label">Conflicts</div></div>
    <div class="card"><div class="num">${total?Math.round(backupCov/total*100):0}%</div><div class="label">Backup coverage</div></div>
  `;
}
// Override renderTimetablePreview to use selected section
const _rtp=renderTimetablePreview;
renderTimetablePreview=function(){
  ensureTTPreviewHost();
  const sel=document.getElementById('viewSection')?.value || document.getElementById('previewSection')?.value;
  // set previewSection
  // build into ttPreviewArea directly
  const el=document.getElementById('ttPreviewArea'); if(!el) return;
  const secId=sel || (app.sections[0]&&app.sections[0].id);
  const sec=app.sections.find(s=>s.id===secId)||app.sections[0];
  let html=`<div class="section-title">${sec.name}</div><div style="overflow:auto"><table style="border-collapse:collapse">`;
  html+=`<tr><th></th>`+PERIODS.map(p=>`<th>P${p}</th>`).join('')+'</tr>';
  DAYS.forEach(day=>{
    html+=`<tr><td><b>${day}</b></td>`;
    for(let p=1;p<=8;p++){
      const slot=app.schedule.find(s=>s.sectionId===sec.id&&s.day===day&&s.period===p);
      const locked=slot&&app.lockedSlots.has(slot.id);
      let text='—';
      if(slot){
        if(slot.subjectCode==='FREE-LIB') text='FREE';
        else { const subj=app.subjects.find(x=>x.code===slot.subjectCode); text=(subj?subj.name:slot.subjectCode)+'<br><small>'+ (slot.currentTeacherId||'')+'</small>'; if(slot.roomName) text+='<br><small>'+slot.roomName+'</small>'; }
      }
      html+=`<td class="tt-cell ${locked?'locked':''}" style="min-width:90px;vertical-align:top" onclick="editSlot('${slot?slot.id:''}')" oncontextmenu="lockSlot(event,'${slot?slot.id:''}')">${text}</td>`;
    }
    html+='</tr>';
  });
  html+='</table></div>';
  html+=qualityReportHTML();
  el.innerHTML=html;
  updateTTStats();
};
window.renderTimetablePreview=renderTimetablePreview;
// hook panel activation: showPanel calls module.render; TimetablePreview.render exists
TimetablePreview.render=function(){ renderTimetablePreview(); };

// AuditLogViewer (audit-plus handles)
const AuditLogViewer = {
  page:0, pageSize:100, filter:'',
  render(){ renderAuditPanel(); }
};
function renderAuditPanel(){
  const el=document.getElementById('auditContent'); if(!el) return;
  const logs=LS('tt_audit_logs')||[];
  const filtered=AuditLogViewer.filter? logs.filter(l=>JSON.stringify(l).toLowerCase().includes(AuditLogViewer.filter.toLowerCase())):logs;
  const start=AuditLogViewer.page*AuditLogViewer.pageSize;
  const pageLogs=filtered.slice(start,start+AuditLogViewer.pageSize);
  el.innerHTML=`
    <div class="filters">
      <input placeholder="filter" oninput="AuditLogViewer.filter=this.value; AuditLogViewer.page=0; renderAuditPanel();"/>
      <button class="btn" onclick="AuditLogExportCSV()">Export CSV</button>
    </div>
    <div class="table-wrap"><table>
      <tr><th>Time</th><th>Action</th><th>Detail</th><th>User</th></tr>
      ${pageLogs.map(l=>`<tr><td>${new Date(l.ts).toLocaleString()}</td><td>${l.action}</td><td>${l.detail}</td><td>${l.user}</td></tr>`).join('')}
    </table></div>
    <div>Page ${AuditLogViewer.page+1} of ${Math.ceil(filtered.length/AuditLogViewer.pageSize)} 
      <button class="btn" onclick="AuditLogViewer.page=Math.max(0,AuditLogViewer.page-1);renderAuditPanel();">Prev</button>
      <button class="btn" onclick="AuditLogViewer.page++;renderAuditPanel();">Next</button>
    </div>
  `;
}
function AuditLogExportCSV(){ const logs=LS('tt_audit_logs')||[]; const csv=['Time,Action,Detail,User'].concat(logs.map(l=>`"${l.ts}","${l.action}","${l.detail}","${l.user}"`)).join('\n'); const b=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='audit.csv';a.click(); }
window.AuditLogExportCSV=AuditLogExportCSV;
window.renderAuditPanel=renderAuditPanel;

// ExtendedImport
const ExtendedImport = {
  render(){
    // add import zone in subjects already; nothing
  }
};
window.ExtendedImport=ExtendedImport;

// AcademicCalendar
const AcademicCalendar = {
  render(){
    const el=document.getElementById('calendarContent'); if(!el) return;
    const h=LS('tt_holidays')||[];
    const c=LS('tt_compensatory_days')||[];
    el.innerHTML=`
      <div class="section-title">Academic Calendar</div>
      <div><input type="date" id="hol_date"/><input id="hol_name" placeholder="Holiday name"/><button class="btn primary" onclick="AcademicCalendar.addHoliday()">Add Holiday</button></div>
      <h4>Holidays</h4>
      <div class="table-wrap"><table>${h.map(x=>`<tr><td>${x.date}</td><td>${x.name}</td><td><button class="btn danger" onclick="AcademicCalendar.removeHoliday('${x.date}')">Del</button></td></tr>`).join('')}</table></div>
      <h4>Compensatory Days</h4>
      <div><input type="date" id="comp_date"/><button class="btn" onclick="AcademicCalendar.addComp()">Add</button></div>
      <div class="table-wrap"><table>${c.map(x=>`<tr><td>${x}</td></tr>`).join('')}</table></div>
    `;
  },
  addHoliday(){
    const d=document.getElementById('hol_date').value; const n=document.getElementById('hol_name').value||'Holiday';
    if(!d) return;
    const h=LS('tt_holidays')||[];
    if(!h.find(x=>x.date===d)) h.push({date:d,name:n});
    LS('tt_holidays',h);
    toast('Holiday added'); this.render();
  },
  removeHoliday(d){
    let h=LS('tt_holidays')||[]; h=h.filter(x=>x.date!==d); LS('tt_holidays',h); this.render();
  },
  addComp(){
    const d=document.getElementById('comp_date').value; if(!d) return;
    const c=LS('tt_compensatory_days')||[]; if(!c.includes(d)) c.push(d); LS('tt_compensatory_days',c); this.render();
  }
};
window.AcademicCalendar=AcademicCalendar;

// SemesterManager
const SemesterManager = {
  render(){
    const el=document.getElementById('settingsContent'); // append
    // not critical; add host
  }
};
window.SemesterManager=SemesterManager;

// DepartmentsPanel
const DepartmentsPanel = {
  render(){
    const el=document.getElementById('departmentsContent'); if(!el) return;
    el.innerHTML=`
      <div class="section-title">Departments Overview</div>
      <div class="grid">${app.departments.map(d=>`<div class="card"><div class="num">${app.sections.filter(s=>s.dept===(d.id||d.name||d)).length}</div><div class="label">${d.name||d} sections</div></div>`).join('')}</div>
      <h4>Subject-wise</h4>
      ${app.departments.map(d=>`<div><b>${d.name||d}</b>: ${app.subjects.filter(s=>s.dept===(d.id||d.name||d)).length} subjects</div>`).join('')}
      <h4>Bulk customizations</h4>
      <div><textarea id="bulksubj" rows="3" placeholder="code,dept,type,hours" style="width:100%"></textarea><button class="btn" onclick="DepartmentsPanel.bulk()">Apply</button></div>
    `;
  },
  bulk(){
    const txt=document.getElementById('bulksubj').value.trim();
    if(!txt) return;
    txt.split('\n').forEach(line=>{
      const c=line.split(',').map(x=>x.trim());
      if(c.length<4) return;
      const code=c[0],dept=c[1],type=c[2],hours=+c[3];
      if(!app.subjects.find(x=>x.code===code)) app.subjects.push({code,name:code,dept,type,hoursPerWeek:hours,backupFacultyId:null});
      else { const s=app.subjects.find(x=>x.code===code); s.dept=dept; s.type=type; s.hoursPerWeek=hours; }
    });
    LS('tt_subjects',app.subjects); toast('Bulk applied'); this.render();
  }
};
window.DepartmentsPanel=DepartmentsPanel;

// StaffCRUD / SubjectCRUD alias to app modals
const StaffCRUD = { render(){ /* table already in staff panel */ } };
const SubjectCRUD = { render(){} };
window.StaffCRUD=StaffCRUD; window.SubjectCRUD=SubjectCRUD;

// NotificationManager
const NotificationManager = {
  items:[],
  notify(msg){ this.items.unshift({msg,ts:Date.now()}); const n=document.getElementById('bellCount'); if(n) n.textContent=this.items.length; toast(msg); },
  render(){ const b=document.getElementById('bellCount'); if(b) b.textContent=this.items.length; }
};
window.NotificationManager=NotificationManager;

// TimetableKeyboardNav
const TimetableKeyboardNav = {
  init(){
    document.addEventListener('keydown',e=>{
      if(e.target.tagName==='INPUT') return;
      if(e.key==='g'){ generateTimetable(); }
      if(e.key==='?'){ toast('Shortcuts: G generate'); }
    });
  }
};
window.TimetableKeyboardNav=TimetableKeyboardNav;
TimetableKeyboardNav.init();

// TimetableDragDrop placeholder (drag already in app)
const TimetableDragDrop = { init(){} };
window.TimetableDragDrop=TimetableDragDrop;

// PDFExporter
const PDFExporter = { export(){ window.print(); } };
window.PDFExporter=PDFExporter;

// Departments panel also displayed by showPanel('departments') -> DepartmentsPanel.render called in showPanel? Need call. Add to showPanel already? We call global render functions in app.showPanel (DepartmentsPanel.render included). Good.
// ttdashboard host creation: override showPanel for ttdashboard
const _origShow=window.showPanel;
// wrap
const __sp=showPanel;
// redefine showPanel is in app.js closure? It's global function. We can wrap by reassigning window.showPanel.
const originalShowPanel=window.showPanel;
window.showPanel=function(name){
  originalShowPanel(name);
  if(name==='ttdashboard'){ ensureTTPreviewHost(); }
  if(name==='departments'){ DepartmentsPanel.render(); }
  if(name==='settings'){ TimetableSettings.render(); FacultyPreferences.render(); }
  if(name==='audit'){ renderAuditPanel(); }
  if(name==='calendar'){ AcademicCalendar.render(); }
  if(name==='reports'){ renderReportsPanel(); }
  if(name==='substitution'){ SubstitutionManager.render(); }
};
// reports panel content
function renderReportsPanel(){
  const el=document.getElementById('reportsContent'); if(!el) return;
  el.innerHTML=`
    <div class="section-title">Reports & Load</div>
    <button class="btn" onclick="ReportPDF.showReportModal()">Workload PDF</button>
    <button class="btn" onclick="ReportPDF.exportCSV()">CSV</button>
    <button class="btn" onclick="ReportPDF.exportJSON()">JSON</button>
    <button class="btn" onclick="ReportPDF.exportExcel()">Excel</button>
    <button class="btn" onclick="window.print()">Print</button>
    <div id="reportCharts"></div>
  `;
  // simple chart
  if(window.Chart){
    const canvas=document.createElement('canvas'); canvas.id='loadChart'; 
    document.getElementById('reportCharts').appendChild(canvas);
    new Chart(canvas,{type:'bar',data:{labels:app.staff.slice(0,12).map(s=>s.name),datasets:[{label:'Slots',data:app.staff.slice(0,12).map(s=>slotCountByName(s.id)),backgroundColor:'hsl(250,70%,55%)'}]}});
  }
}
window.renderReportsPanel=renderReportsPanel;// ---- Professional Import Engine ----
const ImportEngine = {
  templates(){
    const host=document.getElementById('importCenter'); if(!host) return;
    host.innerHTML=`
      <div class="card" style="margin-top:12px">
        <h3>Import Center (Excel split tabs / CSV / JSON)</h3>
        <p class="label">Use templates, load sample data, or upload a multi-sheet workbook. Sheets are detected by name/columns (Staff, Subjects, Sections, Rooms, Departments, Holidays).</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">
          <button class="btn" onclick="ImportEngine.downloadJSONTemplate()">JSON Template</button>
          <button class="btn" onclick="ImportEngine.downloadCSV('subjects')">Subjects CSV</button>
          <button class="btn" onclick="ImportEngine.downloadCSV('staff')">Staff CSV</button>
          <button class="btn" onclick="ImportEngine.downloadExcelTemplate()">Excel Template (split tabs)</button>
          <button class="btn success" onclick="ImportEngine.loadSampleData()">Load Sample Data</button>
        </div>
        <label class="btn primary">Choose File <input type="file" id="importEngineFile" style="display:none" accept=".json,.csv,.xlsx,.xls,.txt" onchange="ImportEngine.importFile(event)"/></label>
        <div id="importStatus" style="margin-top:8px;font-size:13px"></div>
      </div>`;
  },
  setStatus(msg){ const el=document.getElementById('importStatus'); if(el) el.textContent=msg; toast(msg); },
  downloadJSONTemplate(){
    const data={departments:app.departments,sections:app.sections.slice(0,4),staff:app.staff.slice(0,4),subjects:app.subjects.slice(0,4),rooms:app.rooms.slice(0,4),holidays:[]};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tt_template.json'; a.click();
  },
  downloadCSV(kind){
    let rows=[], header=[];
    if(kind==='subjects'){ header=['code','name','dept','type','hoursPerWeek']; rows=app.subjects.slice(0,4).map(s=>[s.code,s.name,s.dept,s.type,s.hoursPerWeek]); }
    else { header=['id','name','dept','subjects','maxHoursPerWeek']; rows=app.staff.slice(0,4).map(s=>[s.id,s.name,s.dept,(s.subjects||[]).join(';'),s.maxHoursPerWeek]); }
    const csv=[header.join(',')].concat(rows.map(r=>r.join(','))).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=kind+'_template.csv'; a.click();
  },
  downloadExcelTemplate(){
    if(!window.XLSX){ this.setStatus('SheetJS unavailable offline'); return; }
    const wb=XLSX.utils.book_new();
    const sheets={
      'Departments': app.departments.map(d=>({id:d.id||d,name:d.name||d})),
      'Sections': app.sections.slice(0,6).map(s=>({id:s.id,name:s.name,dept:s.dept})),
      'Staff': app.staff.slice(0,6).map(s=>({id:s.id,name:s.name,dept:s.dept,subjects:(s.subjects||[]).join(';'),maxHoursPerWeek:s.maxHoursPerWeek})),
      'Subjects': app.subjects.slice(0,6).map(s=>({code:s.code,name:s.name,dept:s.dept,type:s.type,hoursPerWeek:s.hoursPerWeek})),
      'Rooms': app.rooms.slice(0,6).map(r=>({name:r.name,type:r.type,capacity:r.capacity,dept:r.dept})),
      'Holidays': [{date:new Date().toISOString().slice(0,10),name:'Sample Holiday'}]
    };
    Object.keys(sheets).forEach(name=>{
      const ws=XLSX.utils.json_to_sheet(sheets[name]);
      XLSX.utils.book_append_sheet(wb,ws,name);
    });
    XLSX.writeFile(wb,'tt_template_split_tabs.xlsx');
    this.setStatus('Excel template downloaded');
  },
  loadSampleData(){
    app.staff = app.staff.slice(0,8);
    app.subjects = app.subjects.slice(0,12);
    app.sections = app.sections.slice(0,8);
    app.rooms = app.rooms.slice(0,8);
    LS('tt_staff',app.staff); LS('tt_subjects',app.subjects); LS('tt_sections',app.sections); LS('tt_rooms',app.rooms);
    this.setStatus('Sample data loaded');
    renderAll();
  },
  importFile(event){
    const file=(event && event.target && event.target.files)? event.target.files[0]:event;
    if(!file){ return; }
    const name=file.name.toLowerCase();
    const reader=new FileReader();
    if(name.endsWith('.xlsx')||name.endsWith('.xls')){
      reader.onload=e=>{
        const wb=XLSX.read(e.target.result,{type:'array'});
        let counts={};
        wb.SheetNames.forEach(sheetName=>{
          const ws=wb.Sheets[sheetName];
          const rows=XLSX.utils.sheet_to_json(ws);
          if(!rows.length) return;
          const detected=this.detectType(sheetName, rows, counts);
          this.upsertRows(detected, rows, counts);
        });
        this.finishImport(counts);
      };
      reader.readAsArrayBuffer(file);
    } else if(name.endsWith('.csv')){
      reader.onload=e=>{
        const rows=this.parseCSV(e.target.result);
        const type=this.detectType(file.name, rows, {});
        const counts={}; this.upsertRows(type, rows, counts); this.finishImport(counts);
      };
      reader.readAsText(file);
    } else if(name.endsWith('.json')){
      reader.onload=e=>{
        try{
          const data=JSON.parse(e.target.result); let counts={};
          if(Array.isArray(data.subjects)){ data.subjects.forEach(r=>this.upsertSubject(r)); counts.subjects=(counts.subjects||0)+data.subjects.length; }
          if(Array.isArray(data.staff)){ data.staff.forEach(r=>this.upsertStaff(r)); counts.staff=(counts.staff||0)+data.staff.length; }
          if(Array.isArray(data.sections)){ data.sections.forEach(r=>this.upsertSection(r)); counts.sections=(counts.sections||0)+data.sections.length; }
          if(Array.isArray(data.rooms)){ data.rooms.forEach(r=>this.upsertRoom(r)); counts.rooms=(counts.rooms||0)+data.rooms.length; }
          if(Array.isArray(data.departments)){ data.departments.forEach(d=>{ if(!app.departments.find(x=>(x.id||x)=== (d.id||d))) { app.departments.push(d); } }); counts.departments=(counts.departments||0)+data.departments.length; }
          if(Array.isArray(data.holidays)){ const h=LS('tt_holidays')||[]; data.holidays.forEach(hh=>{ if(!h.find(x=>x.date===hh.date)) { h.push(hh); } }); LS('tt_holidays',h); counts.holidays=(counts.holidays||0)+data.holidays.length; }
          LS('tt_departments',app.departments);
          this.finishImport(counts);
        }catch(err){ this.setStatus('Bad JSON: '+err.message); }
      };
      reader.readAsText(file);
    } else {
      this.setStatus('Unsupported file type');
    }
  },
  parseCSV(text){
    const lines=text.trim().split(/\r?\n/); if(!lines.length) return [];
    const header=lines[0].split(',').map(h=>h.trim());
    return lines.slice(1).filter(Boolean).map(l=>{ const cols=l.split(','); const o={}; header.forEach((h,i)=>o[h]= (cols[i]||'').trim()); return o; });
  },
  detectType(name, rows, counts){
    const n=name.toLowerCase(); const keys=Object.keys(rows[0]||{}).map(k=>k.toLowerCase());
    if(n.includes('subject')|| (keys.includes('code')&&keys.includes('type')&&keys.includes('hoursperweek'))) return 'subjects';
    if(n.includes('staff')||keys.includes('maxhoursperweek')) return 'staff';
    if(n.includes('section')|| (keys.includes('id')&&keys.includes('dept')&&!keys.includes('code'))) return 'sections';
    if(n.includes('room')|| (keys.includes('capacity')&&keys.includes('type'))) return 'rooms';
    if(n.includes('holiday')||keys.includes('date')) return 'holidays';
    if(keys.includes('code')&&keys.includes('name')) return 'subjects';
    if(keys.includes('id')&&keys.includes('maxhoursperweek')) return 'staff';
    return 'unknown';
  },
  upsertRows(type, rows, counts){
    const t = type.includes('subject')?'subjects': type.includes('staff')?'staff': type.includes('section')?'sections': type.includes('room')?'rooms': type.includes('holiday')?'holidays': type;
    (rows||[]).forEach(r=>this.upsertByType(t, r));
    counts[t]=(counts[t]||0)+ (rows||[]).length;
  },
  upsertByType(type,row){
    if(type==='subjects') this.upsertSubject(row);
    else if(type==='staff') this.upsertStaff(row);
    else if(type==='sections') this.upsertSection(row);
    else if(type==='rooms') this.upsertRoom(row);
    else if(type==='holidays') this.upsertHoliday(row);
  },
  upsertSubject(row){
    const sub={code:row.code||row.SubjectCode||row.Code, name:row.name||row.Subject||row.Name, dept:row.dept||row.Dept||row.department, type:row.type||row.Type||'Theory', hoursPerWeek:parseInt(row.hoursPerWeek||row.Hours||row.hours||3), backupFacultyId:null};
    if(!sub.code) return;
    const idx=app.subjects.findIndex(s=>s.code===sub.code);
    if(idx>=0) app.subjects[idx]=Object.assign(app.subjects[idx],sub); else app.subjects.push(sub);
  },
  upsertStaff(row){
    const st={id:row.id||row.StaffId||uid(), name:row.name||row.Name||row.staff, dept:row.dept||row.Dept, subjects:String(row.subjects||row.Subjects||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean), maxHoursPerWeek:parseInt(row.maxHoursPerWeek||row.MaxHours||18), attendanceStatus:'Normal'};
    if(!st.name) return;
    const idx=app.staff.findIndex(s=>s.id===st.id);
    if(idx>=0) app.staff[idx]=Object.assign(app.staff[idx],st); else app.staff.push(st);
  },
  upsertSection(row){
    const sec={id:row.id||row.SectionId||uid(), name:row.name||row.Name||row.section, dept:row.dept||row.Dept};
    if(!sec.name) return;
    const idx=app.sections.findIndex(s=>s.id===sec.id);
    if(idx>=0) app.sections[idx]=Object.assign(app.sections[idx],sec); else app.sections.push(sec);
  },
  upsertRoom(row){
    const room={name:row.name||row.Name||row.Room, type:row.type||row.Type||'Classroom', capacity:parseInt(row.capacity||row.Capacity||60), dept:row.dept||row.Dept};
    if(!room.name) return;
    const idx=app.rooms.findIndex(r=>r.name===room.name);
    if(idx>=0) app.rooms[idx]=Object.assign(app.rooms[idx],room); else app.rooms.push(room);
  },
  upsertHoliday(row){
    if(!row.date) return;
    const h=LS('tt_holidays')||[];
    if(!h.find(x=>x.date===row.date)) h.push({date:row.date, name:row.name||'Holiday'});
    LS('tt_holidays',h);
  },
  finishImport(counts){
    LS('tt_staff',app.staff); LS('tt_subjects',app.subjects); LS('tt_sections',app.sections); LS('tt_rooms',app.rooms); LS('tt_departments',app.departments);
    audit('Import', JSON.stringify(counts));
    this.setStatus('Imported: '+JSON.stringify(counts));
    renderAll();
    if(window.ExtendedImport && window.ExtendedImport.render) window.ExtendedImport.render();
  }
};
window.ImportEngine=ImportEngine;

const _hi = window.handleImport;
window.handleImport = function(event){ ImportEngine.importFile(event); };

const _ExtendedImportOld = window.ExtendedImport;
window.ExtendedImport = {
  render(){ ImportEngine.templates(); }
};

// ---- AI Assistant Panel (local RAG inside app) ----
const AssistantPanel = {
  render(){
    const el=document.getElementById('assistantContent'); if(!el) return;
    el.innerHTML=`
      <div class="card">
        <h3>Local AI Assistant (RAG + Intents)</h3>
        <p class="label">Ask questions or issue commands. Documents are stored locally; BM25 search runs client-side.</p>
        <div style="display:flex;gap:8px;margin:8px 0">
          <input id="assistantInput" style="flex:1" placeholder="Ask about timetable/staff/rag..." onkeydown="if(event.key==='Enter')AssistantPanel.ask()"/>
          <button class="btn primary" onclick="AssistantPanel.ask()">Ask</button>
          <button class="btn" onclick="SpeechAssistant.toggle()">Voice ${SpeechAssistant.enabled()?'On':'Off'}</button>
        </div>
        <div id="assistantChat" style="max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--surface-2)"></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h3>Knowledge Base (RAG)</h3>
        <label class="btn">Upload Document <input type="file" id="ragFile" style="display:none" accept=".txt,.md,.json,.csv,.xlsx,.xls,.pdf" onchange="AssistantPanel.ingestFile(event)"/></label>
        <div id="ragDocList" style="margin-top:8px"></div>
        <div class="filters" style="margin-top:8px">
          <input id="ragQuery" placeholder="Search documents..." style="flex:1"/>
          <button class="btn" onclick="AssistantPanel.searchDocs()">Search</button>
        </div>
        <div id="ragResults" style="margin-top:8px;font-size:13px"></div>
      </div>`;
    this.refreshDocs();
  },
  append(role,text){
    const d=document.createElement('div'); d.className='msg '+role; d.textContent=text;
    document.getElementById('assistantChat').appendChild(d);
  },
  ask(){
    const inp=document.getElementById('assistantInput'); const q=inp.value.trim(); if(!q) return;
    inp.value=''; this.append('user',q);
    let reply='';
    const intent=ChatBot.findIntent(q);
    const ents=ChatBot.parseEntities(q);
    if(intent){ try{ reply=intent.action(ents,q)||'Done.';}catch(e){reply='Error: '+e.message;} }
    else { const r=DocumentRAG.answer(q); reply=r.answer+'\nSources: '+(r.sources||[]).join(', '); }
    this.append('bot',reply);
    SpeechAssistant.speak(String(reply).slice(0,400));
  },
  async ingestFile(event){
    const f=event.target.files[0]; if(!f) return;
    try{
      const n=await DocumentRAG.ingestFile(f);
      toast('Ingested '+n+' chunks from '+f.name);
      this.refreshDocs();
    }catch(e){ toast('Ingest failed: '+e.message); }
  },
  refreshDocs(){
    const el=document.getElementById('ragDocList'); if(!el) return;
    const docs=DocumentRAG.docs();
    el.innerHTML= docs.length? docs.map(d=>`<div class="kv"><span>${d.title} (${(d.chunks||[]).length} chunks)</span><button class="btn danger" onclick="AssistantPanel.deleteDoc('${d.id}')">Del</button></div>`).join('') : 'No documents uploaded. Auto-indexed app data is used automatically.';
  },
  deleteDoc(id){
    const docs=DocumentRAG.docs().filter(d=>d.id!==id); DocumentRAG.saveDocs(docs); this.refreshDocs(); toast('Document removed');
  },
  searchDocs(){
    const q=document.getElementById('ragQuery').value.trim(); if(!q) return;
    const r=DocumentRAG.answer(q);
    document.getElementById('ragResults').textContent = r.answer+'\nSources: '+(r.sources||[]).join(', ');
    SpeechAssistant.speak(String(r.answer).slice(0,400));
  }
};
window.AssistantPanel=AssistantPanel;

const _showPanel3 = window.showPanel;
window.showPanel = function(name){
  _showPanel3(name);
  if(name==='assistant') AssistantPanel.render();
  if(name==='subjects') (window.ExtendedImport&&window.ExtendedImport.render) && window.ExtendedImport.render();
};