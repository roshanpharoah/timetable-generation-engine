// timetable-tools.js
const TimetableTools = {
  qualityReport(){
    const conflicts=validateSchedule();
    return {
      conflicts:conflicts.length,
      teachingSlots:app.schedule.filter(s=>s.subjectCode!=='FREE-LIB').length,
      freeLibSlots:app.schedule.filter(s=>s.subjectCode==='FREE-LIB').length,
      backupCoverage: app.schedule.filter(s=>s.subjectCode!=='FREE-LIB'&&s.backupTeacherId).length,
      overloaded: app.staff.filter(s=>slotCountByName(s.id)>s.maxHoursPerWeek).length
    };
  },
  curriculumCoverage(){
    const report={};
    app.sections.forEach(sec=>{
      const subs=app.subjects.filter(s=>s.dept===sec.dept);
      const sched=app.schedule.filter(s=>s.sectionId===sec.id && s.subjectCode!=='FREE-LIB');
      const bySub={};
      sched.forEach(s=>{ bySub[s.subjectCode]=(bySub[s.subjectCode]||0)+1; });
      report[sec.id]={section:sec.name,totalSubjects:subs.length,scheduledSubjects:Object.keys(bySub).length,slots:sched.length,coverage:subs.length? Math.round(Object.keys(bySub).length/subs.length*100):0};
    });
    return report;
  },
  exportICal(){
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TTManager//EN'];
    // map each slot to a weekly recurring event (not perfect but okay)
    app.schedule.filter(s=>s.subjectCode!=='FREE-LIB').forEach(sl=>{
      const dayIndex=DAYS.indexOf(sl.day);
      lines.push('BEGIN:VEVENT');
      lines.push('SUMMARY:'+sl.subjectCode+' '+sl.sectionId);
      lines.push('DESCRIPTION:Teacher '+(sl.currentTeacherId||sl.teacherId)+' Room '+(sl.roomName||''));
      lines.push('RRULE:FREQ=WEEKLY;BYDAY='+['MO','TU','WE','TH','FR'][dayIndex]);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='timetable.ics'; a.click();
  },
  coverageHTML(){
    const cov=this.curriculumCoverage();
    return Object.values(cov).map(c=>`<div class="kv"><span>${c.section}</span><span>${c.scheduledSubjects}/${c.totalSubjects} subjects, ${c.slots} slots, ${c.coverage}%</span></div>`).join('');
  }
};
window.TimetableTools=TimetableTools;
// quality report HTML already in app.js uses validateSchedule. Provide export iCal button in reports
// add to reports panel? renderReportsPanel already; monkeypatch to include
const _rrp=window.renderReportsPanel;
window.renderReportsPanel=function(){
  _rrp();
  const el=document.getElementById('reportsContent');
  if(el && !el.querySelector('.ical-btn')){
    const b=document.createElement('button'); b.className='btn ical-btn'; b.textContent='Export iCal'; b.onclick=()=>TimetableTools.exportICal(); el.appendChild(b);
    const c=document.createElement('div'); c.innerHTML='<h4>Curriculum Coverage</h4>'+TimetableTools.coverageHTML(); el.appendChild(c);
  }
};