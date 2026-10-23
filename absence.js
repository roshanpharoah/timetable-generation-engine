// absence.js
const AbsenceManager = {
  markAbsent(name){
    const s=app.staff.find(x=>x.name===name);
    if(!s){ toast('Staff not found','error'); return; }
    s.attendanceStatus='Absent';
    LS('tt_staff',app.staff);
    // find slots
    const slots=app.schedule.filter(sl=> (sl.currentTeacherId||sl.teacherId)===s.id || sl.teacherId===s.id);
    let success=0, critical=0;
    slots.forEach(sl=>{
      const orig=sl.originalTeacherId||sl.teacherId;
      if(!sl.originalTeacherId) sl.originalTeacherId=sl.teacherId;
      // determine substitute
      let sub=null;
      // pre-assigned backup
      if(sl.backupTeacherId){ const b=app.staff.find(x=>x.id===sl.backupTeacherId && x.attendanceStatus!=='Absent'); if(b) sub=b; }
      // qualified staff
      if(!sub){
        const sec=app.sections.find(x=>x.id===sl.sectionId);
        const cands=app.staff.filter(x=>x.id!==s.id && x.dept===sec.dept && (x.subjects||[]).includes(sl.subjectCode) && x.attendanceStatus!=='Absent');
        if(cands.length) sub=cands[0];
      }
      // same-dept
      if(!sub){
        const sec=app.sections.find(x=>x.id===sl.sectionId);
        const cands=app.staff.filter(x=>x.id!==s.id && x.dept===sec.dept && x.attendanceStatus!=='Absent');
        if(cands.length) sub=cands[0];
      }
      if(sub){
        sl.currentTeacherId=sub.id; sl.isSubstituted=true; success++;
        (LS('tt_substitution_logs')||[]).push({id:uid(),ts:new Date().toISOString(),slotId:sl.id,absentTeacher:s.id,substitute:sub.id,status:'success'});
        LS('tt_substitution_logs',LS('tt_substitution_logs'));
      } else {
        critical++;
        sl.isSubstituted=true; sl.currentTeacherId=null;
        (LS('tt_substitution_logs')||[]).push({id:uid(),ts:new Date().toISOString(),slotId:sl.id,absentTeacher:s.id,substitute:null,status:'critical'});
        LS('tt_substitution_logs',LS('tt_substitution_logs'));
        // SMS notification text
        const txt='SMS to admin: No substitute for '+sl.sectionId+' '+sl.day+' P'+sl.period;
        (LS('tt_substitution_records')||[]).push({id:uid(),text:txt,ts:new Date().toISOString()});
        LS('tt_substitution_records',LS('tt_substitution_records'));
      }
    });
    LS('tt_schedule',app.schedule);
    LS('tt_staff',app.staff);
    audit('Marked absent',`${name}: ${success} substituted, ${critical} critical`);
    toast(`${name} absent. Substituted ${success}, critical ${critical}`, critical?'error':'success');
    if(window.NotificationManager) NotificationManager.notify && NotificationManager.notify(`${name} absent: ${success} ok, ${critical} critical`);
  },
  markPresent(name){
    const s=app.staff.find(x=>x.name===name);
    if(!s) return;
    s.attendanceStatus='Present';
    // restore originals for slots where absent teacher was original
    app.schedule.forEach(sl=>{
      if(sl.originalTeacherId===s.id){
        sl.currentTeacherId=s.id; sl.isSubstituted=false;
      }
    });
    LS('tt_staff',app.staff); LS('tt_schedule',app.schedule);
    audit('Marked present',name);
    toast(name+' present','success');
    renderAll();
  },
  markAbsentByName(name){ this.markAbsent(name); renderAll(); },
  markPresentByName(name){ this.markPresent(name); renderAll(); },
  autoProcessAbsences(){
    // auto-mark people still 'Normal' absent after 09:30
    const now=new Date();
    const cutoff=new Date(); cutoff.setHours(9,30,0,0);
    if(now < cutoff) { toast('Before 09:30, skipping'); return; }
    let cnt=0;
    app.staff.forEach(s=>{
      if(s.attendanceStatus==='Normal'){
        // Check if has slots today
        const todaySlots=app.schedule.filter(sl=> (sl.currentTeacherId||sl.teacherId)===s.id);
        if(todaySlots.length>0){ this.markAbsent(s.name); cnt++; }
      }
    });
    toast('Auto-processed '+cnt,'info');
    renderAll();
  }
};
// bind global
window.AbsenceManager=AbsenceManager;
// aliases used by app
window.AbsenceManager.markAbsentByName=AbsenceManager.markAbsentByName.bind(AbsenceManager);
window.AbsenceManager.markPresentByName=AbsenceManager.markPresentByName.bind(AbsenceManager);
setInterval(()=>{ try{ AbsenceManager.autoProcessAbsences(); }catch(e){} }, 60000);
// expose markAbsent(name) default
AbsenceManager.markAbsentByName = n=>{ AbsenceManager.markAbsent(n); renderAll(); };
AbsenceManager.markPresentByName = n=>{ AbsenceManager.markPresent(n); renderAll(); };