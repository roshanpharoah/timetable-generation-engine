// absence-scheduler.js
const LeaveScheduler = {
  getLog(){ return LS('tt_leave_log')||[]; },
  getSchedule(){ return LS('tt_leave_schedule')||[]; },
  saveSchedule(v){ LS('tt_leave_schedule',v); },
  getLimits(){ return LS('tt_leave_limits')||{casual:12,sick:10}; },
  applyForDate(staffId, start, end, type, reason){
    const rec={id:uid(),staffId,start,end,type,reason,status:'approved',ts:new Date().toISOString()};
    const sched=this.getSchedule(); sched.push(rec); this.saveSchedule(sched);
    audit('Leave applied',`${staffId} ${start} to ${end}`);
    toast('Leave scheduled','success');
  },
  apply(staffId,date,type){
    // single day
    this.applyForDate(staffId,date,date,type,'');
  },
  runDue(){
    // apply leaves for today
    const today=new Date().toISOString().slice(0,10);
    const due=this.getSchedule().filter(l=>l.start<=today && l.end>=today && l.status==='approved');
    due.forEach(l=>{
      const s=app.staff.find(x=>x.id===l.staffId);
      if(s && s.attendanceStatus!=='Absent') AbsenceManager.markAbsent(s.name);
    });
    return due.length;
  },
  monthlyBalance(staffId, month){
    const limits=this.getLimits();
    const logs=this.getLog();
    const used=logs.filter(l=>l.staffId===staffId && l.date && l.date.startsWith(month)).length;
    return {used, limit:limits.casual, remaining:limits.casual-used};
  },
  render(){
    const el=document.getElementById('leavePanel') || document.getElementById('substitutionContent');
    // rendered inside substitution panel if container exists
    const container=document.getElementById('leaveSchedulerHost');
    if(!container) return;
    const sched=this.getSchedule();
    container.innerHTML=`
      <div class="section-title">Leave Scheduler</div>
      <div><button class="btn primary" onclick="LeaveScheduler.showForm()">Apply Leave</button></div>
      <table><tr><th>Staff</th><th>Start</th><th>End</th><th>Type</th><th>Status</th></tr>
      ${sched.map(l=>`<tr><td>${l.staffId}</td><td>${l.start}</td><td>${l.end}</td><td>${l.type}</td><td>${l.status}</td></tr>`).join('')}
      </table>
    `;
  },
  showForm(){
    const body=document.getElementById('genericBody');
    body.innerHTML=`
      <h3>Apply Leave</h3>
      <select id="lv_staff">${app.staff.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select>
      <input type="date" id="lv_start"/> <input type="date" id="lv_end"/>
      <select id="lv_type"><option>casual</option><option>sick</option></select>
      <input id="lv_reason" placeholder="reason"/>
      <button class="btn primary" onclick="LeaveScheduler._submit()">Submit</button>
    `;
    openModal('modalGeneric');
  },
  _submit(){
    const sid=document.getElementById('lv_staff').value;
    const s=document.getElementById('lv_start').value;
    const e=document.getElementById('lv_end').value;
    const t=document.getElementById('lv_type').value;
    const r=document.getElementById('lv_reason').value;
    this.applyForDate(sid,s,e,t,r);
    closeModal('modalGeneric');
    this.render();
  }
};
window.LeaveScheduler=LeaveScheduler;
// render hooks
setInterval(()=>{ try{ LeaveScheduler.runDue(); }catch(e){} }, 60000);