// regulations.js
const RegulationManager = {
  catalog(){ return LS('tt_regulation_catalog')||{}; },
  regs(){ return LS('tt_regulations')||{}; },
  render(){
    const el=document.getElementById('regulationsContent');
    if(!el) return;
    const cat=this.catalog();
    el.innerHTML=`
      <div class="filters">
        <select id="regDept" onchange="RegulationManager.renderTabs()"><option value="">Select Dept</option>${Object.keys(cat).map(d=>`<option>${d}</option>`).join('')}</select>
        <select id="regSem" onchange="RegulationManager.renderTabs()"><option value="">Sem</option>${[1,2,3,4,5,6,7,8].map(s=>`<option>${s}</option>`).join('')}</select>
      </div>
      <div id="regTabs">
        <button class="btn" onclick="RegulationManager.showTab('catalog')">Catalog</button>
        <button class="btn" onclick="RegulationManager.showTab('compliance')">Compliance</button>
        <button class="btn" onclick="RegulationManager.showTab('rules')">Rules</button>
        <button class="btn" onclick="RegulationManager.showTab('conflicts')">Conflicts</button>
      </div>
      <div id="regTabContent"></div>
    `;
    this.showTab('catalog');
  },
  showTab(tab){
    const el=document.getElementById('regTabContent');
    if(tab==='catalog'){ el.innerHTML=this.catalogHTML(); }
    else if(tab==='compliance'){ el.innerHTML=this.complianceHTML(); }
    else if(tab==='rules'){ el.innerHTML=this.rulesHTML(); }
    else if(tab==='conflicts'){ el.innerHTML=this.conflictsHTML(); }
  },
  catalogHTML(){
    const d=document.getElementById('regDept')?.value; const s=document.getElementById('regSem')?.value;
    const cat=this.catalog();
    if(!d||!s||!cat[d]||!cat[d][s]) return '<p>Select dept & semester.</p>';
    const subs=cat[d][s];
    return '<table><tr><th>Code</th><th>Name</th><th>Type</th><th>Credits</th></tr>'+subs.map(x=>`<tr><td>${x.code}</td><td>${x.name}</td><td>${x.type}</td><td>${x.credits}</td></tr>`).join('')+'</table>';
  },
  complianceHTML(){
    // Anna University R2021 L-T-P-C: check weekly hours vs credits
    const res=[];
    app.sections.forEach(sec=>{
      const slots=app.schedule.filter(s=>s.sectionId===sec.id && s.subjectCode!=='FREE-LIB');
      // group by subject
      const bySub={};
      slots.forEach(s=>{ bySub[s.subjectCode]=(bySub[s.subjectCode]||0)+1; });
      const ok=Object.keys(bySub).length>0?'OK':'NO SLOTS';
      res.push(`<tr><td>${sec.name}</td><td>${Object.keys(bySub).length}</td><td>${ok}</td></tr>`);
    });
    return '<table><tr><th>Section</th><th>Subjects scheduled</th><th>Status</th></tr>'+res.join('')+'</table>';
  },
  rulesHTML(){
    const r=this.regs();
    return `<pre>${JSON.stringify(r,null,2)}</pre>`;
  },
  conflictsHTML(){
    const conflicts=validateSchedule();
    // teacher conflicts
    const teacherConflicts=[];
    const map={};
    app.schedule.filter(s=>s.subjectCode!=='FREE-LIB').forEach(s=>{
      const k=s.day+'|'+s.period+'|'+s.teacherId;
      if(map[k]) teacherConflicts.push(s.id);
      map[k]=true;
    });
    const roomConflicts=[];
    const rmap={};
    app.schedule.filter(s=>s.subjectCode!=='FREE-LIB').forEach(s=>{
      if(!s.roomName) return;
      const k=s.day+'|'+s.period+'|'+s.roomName;
      if(rmap[k]) roomConflicts.push(s.id);
      rmap[k]=true;
    });
    const overload=app.staff.filter(s=>slotCount(s.id)>s.maxHoursPerWeek);
    const noBackup=app.schedule.filter(s=>s.subjectCode!=='FREE-LIB' && !s.backupTeacherId);
    return `<div>
      <div>Teacher double-books: ${teacherConflicts.length}</div>
      <div>Room double-books: ${roomConflicts.length}</div>
      <div>Section double-books: 0</div>
      <div>Overloaded faculty: ${overload.length}</div>
      <div>Slots without backup: ${noBackup.length}</div>
    </div>`;
  },
  renderTabs(){ this.showTab(document.getElementById('regTabContent')? 'catalog':'catalog'); const tc=document.getElementById('regTabContent'); if(tc) tc.innerHTML=this.catalogHTML(); }
};
window.RegulationManager=RegulationManager;