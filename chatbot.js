// chatbot.js
const ChatBot = {
  intents:[
    {name:'help', patterns:['help','commands','what can you do'], action:()=> 'Commands: generate timetable, mark absent X, mark present X, who teaches Y, schedule section X, free staff, absent list, holiday import/add, voice toggle, export, navigate panel.'},
    {name:'generate', patterns:['generate timetable','create timetable','build timetable'], action:()=>{ generateTimetable(); return 'Generating timetable...'; }},
    {name:'markAbsent', patterns:['mark absent','absent'], entity:'staff', action:(e)=>{ if(e.staff){ AbsenceManager.markAbsent(e.staff); return e.staff+' marked absent.'; } return 'Specify staff name.'; }},
    {name:'markPresent', patterns:['mark present','present'], entity:'staff', action:(e)=>{ if(e.staff){ AbsenceManager.markPresent(e.staff); return e.staff+' marked present.'; } return 'Specify staff name.'; }},
    {name:'version', patterns:['create version','snapshot'], action:()=>{ if(window.VersionManager){ VersionManager.snapshot('chat'); return 'Version created.';} return 'version manager unavailable'; }},
    {name:'export', patterns:['export csv','export json','export excel'], action:(e,raw)=>{ ReportPDF.exportCSV && ReportPDF.exportCSV(); return 'Exported CSV.'; }},
    {name:'navigate', patterns:['go to','open panel','navigate'], entity:'panel', action:(e)=>{ if(e.panel){ showPanel(e.panel); return 'Navigated to '+e.panel; } return 'Which panel?'; }},
    {name:'whoTeaches', patterns:['who teaches','teaches at'], entity:'subject', action:(e)=>{
      if(!e.subject) return 'Specify subject.';
      const slots=app.schedule.filter(s=>s.subjectCode===e.subject||s.subjectCode.toLowerCase().includes(e.subject.toLowerCase()));
      if(!slots.length) return 'No slots found.';
      return slots.slice(0,5).map(s=>`${s.day} P${s.period} sec ${s.sectionId} by ${s.currentTeacherId||s.teacherId}`).join('\n');
    }},
    {name:'sectionSchedule', patterns:['schedule of','section schedule','timetable for section'], entity:'section', action:(e)=>{
      if(!e.section) return 'Specify section id/name.';
      const sec=app.sections.find(s=>s.id===e.section||s.name.toLowerCase().includes(e.section.toLowerCase()));
      if(!sec) return 'Section not found.';
      const slots=app.schedule.filter(s=>s.sectionId===sec.id && s.subjectCode!=='FREE-LIB');
      if(!slots.length) return 'No slots.';
      return slots.map(s=>`${s.day} P${s.period}: ${s.subjectCode} (${s.currentTeacherId||s.teacherId}) ${s.roomName||''}`).join('\n');
    }},
    {name:'staffSchedule', patterns:['schedule of staff','teacher schedule','faculty schedule'], entity:'staff', action:(e)=>{
      if(!e.staff) return 'Specify staff.';
      const s=app.staff.find(x=>x.name.toLowerCase().includes(e.staff.toLowerCase())||x.id===e.staff);
      if(!s) return 'Staff not found.';
      const slots=app.schedule.filter(sl=>(sl.currentTeacherId||sl.teacherId)===s.id);
      return slots.map(sl=>`${sl.day} P${sl.period}: sec ${sl.sectionId} ${sl.subjectCode}`).join('\n')||'No slots.';
    }},
    {name:'freeStaff', patterns:['free staff','available teachers','who is free'], entity:'period', action:(e)=>{
      // staff not booked at a given day/period
      const day=e.day||'Mon'; const period=e.period||1;
      const busy=new Set(app.schedule.filter(s=>s.day===day && s.period===period && s.subjectCode!=='FREE-LIB').map(s=>s.teacherId));
      const free=app.staff.filter(s=>!busy.has(s.id));
      return (free.length? free.map(s=>s.name).slice(0,20).join(', '):'None free.')+' (day '+day+' P'+period+')';
    }},
    {name:'roomUsage', patterns:['room usage','room schedule'], entity:'room', action:(e)=>{
      const room=e.room;
      const slots=app.schedule.filter(s=>!room||s.roomName===room);
      return slots.length+' slots'+(room?' in '+room:'')+'.';
    }},
    {name:'deptInfo', patterns:['department info','dept info'], entity:'dept', action:(e)=>{
      const d=e.dept;
      const secs=app.sections.filter(s=>!d||s.dept===d);
      const staff=app.staff.filter(s=>!d||s.dept===d);
      return `Sections: ${secs.length}, Staff: ${staff.length}, Subjects: ${app.subjects.filter(s=>!d||s.dept===d).length}`;
    }},
    {name:'workload', patterns:['workload','load'], entity:'staff', action:(e)=>{
      if(e.staff){
        const s=app.staff.find(x=>x.name.toLowerCase().includes(e.staff.toLowerCase())||x.id===e.staff);
        if(!s) return 'Staff not found.';
        return s.name+': '+slotCountByName(s.id)+' slots, max '+s.maxHoursPerWeek;
      }
      // top loaded
      return app.staff.map(s=>`${s.name}: ${slotCountByName(s.id)}`).sort().slice(0,10).join('\n');
    }},
    {name:'absentList', patterns:['absent list','who is absent','absent staff'], action:()=>{ const a=app.staff.filter(s=>s.attendanceStatus==='Absent'); return a.length? a.map(s=>s.name).join(', '):'No one absent.'; }},
    {name:'holidayImport', patterns:['import holiday','add holiday'], entity:'date', action:(e,raw)=>{
      const dates=raw.match(/\d{4}-\d{2}-\d{2}/g);
      if(dates && dates.length){
        const h=LS('tt_holidays')||[];
        dates.forEach(d=>{ if(!h.find(x=>x.date===d)) h.push({date:d,name:'Holiday'}); });
        LS('tt_holidays',h);
        if(window.AcademicCalendar) AcademicCalendar.render && AcademicCalendar.render();
        return 'Added holidays: '+dates.join(', ');
      }
      return 'Provide date YYYY-MM-DD.';
    }},
    {name:'holidayUpcoming', patterns:['upcoming holiday','next holiday'], action:()=>{
      const h=(LS('tt_holidays')||[]).sort((a,b)=>a.date.localeCompare(b.date));
      const today=new Date().toISOString().slice(0,10);
      const up=h.find(x=>x.date>=today);
      return up? up.name+' on '+up.date : 'No upcoming holidays.';
    }},
    {name:'voiceToggle', patterns:['voice','speech'], action:()=>{ const v=SpeechAssistant.toggle(); return 'Voice '+(v?'on':'off'); }},
    {name:'search', patterns:['search'], entity:'text', action:(e,raw)=>{ const q=raw.replace(/^search\s*/i,''); const subj=app.subjects.find(s=>s.name.toLowerCase().includes(q.toLowerCase())||s.code.toLowerCase().includes(q.toLowerCase())); if(subj) return subj.code+' '+subj.name+' ('+subj.dept+')'; const st=app.staff.find(s=>s.name.toLowerCase().includes(q.toLowerCase())); if(st) return st.id+' '+st.name+' ('+st.dept+')'; return 'No matches.'; }},
    {name:'rag', patterns:['rag ask','ask rag','search docs'], entity:'text', action:(e,raw)=>{ const q=raw.replace(/^.*(ask rag|search docs|rag ask)\s*/i,''); const r=DocumentRAG.answer(q); return r.answer+'\nSources: '+(r.sources||[]).join(', '); }},
    {name:'report', patterns:['workload report','regulation report','pdf report'], action:()=>{ if(window.ReportPDF) { ReportPDF.showReportModal && ReportPDF.showReportModal(); return 'Opening report...'; } return 'Report module unavailable.'; }},
    {name:'ragIngest', patterns:['ingest'], action:()=>{ toast('Use RAG panel to upload files.'); return 'Use RAG document upload panel.'; }},
    {name:'lock', patterns:['lock slot','unlock slot'], action:()=> 'Right-click a slot to lock/unlock.' },
    {name:'versions', patterns:['versions','compare versions'], action:()=>{ showPanel('settings'); return 'Open settings for versions.'; }},
    {name:'clear', patterns:['clear schedule'], action:()=>{ if(confirm('Clear schedule?')){ app.schedule=[]; LS('tt_schedule',[]); renderAll(); return 'Schedule cleared.';} return 'Cancelled.'; }},
    {name:'navigateAudit', patterns:['audit'], action:()=>{ showPanel('audit'); return 'Audit panel.'; }},
  ],
  findIntent(text){
    const t=text.toLowerCase();
    for(const it of this.intents){
      if(it.patterns.some(p=>t.includes(p))) return it;
    }
    return null;
  },
  parseEntities(text){
    const e={};
    // staff: match name contained
    const staff=app.staff.find(s=>text.toLowerCase().includes(s.name.toLowerCase()));
    if(staff) e.staff=staff.name;
    // subject code/name
    const subj=app.subjects.find(s=>text.toLowerCase().includes(s.code.toLowerCase())||text.toLowerCase().includes(s.name.toLowerCase()));
    if(subj) e.subject=subj.code;
    // section id/name
    const sec=app.sections.find(s=>text.toLowerCase().includes(s.id.toLowerCase())||text.toLowerCase().includes(s.name.toLowerCase()));
    if(sec) e.section=sec.id;
    // dept
    const dept=DEPTS.find(d=>text.toUpperCase().includes(d));
    if(dept) e.dept=dept;
    // room
    const room=app.rooms.find(r=>text.toLowerCase().includes(r.name.toLowerCase()));
    if(room) e.room=room.name;
    // day
    const dayMatch=DAYS.find(d=>text.toLowerCase().includes(d.toLowerCase()));
    if(dayMatch) e.day=dayMatch;
    // period
    const pm=text.match(/p(?:eriod)?\s*(\d)/i); if(pm) e.period=parseInt(pm[1]);
    // date
    const dm=text.match(/\d{4}-\d{2}-\d{2}/); if(dm) e.date=dm[0];
    // panel keyword
    const panels=['dashboard','departments','ttdashboard','staff','subjects','attendance','calendar','reports','settings','substitution','regulations','audit'];
    const pk=panels.find(p=>text.toLowerCase().includes(p)); if(pk) e.panel=pk;
    return e;
  },
  async send(text){
    this.appendMsg('user',text);
    SpeechAssistant.speak && SpeechAssistant.speak(''); // no
    let reply='I did not understand. Type help.';
    const intent=this.findIntent(text);
    const entities=this.parseEntities(text);
    if(intent){
      try { reply = intent.action(entities,text) || reply; }
      catch(err){ reply='Error: '+err.message; }
    } else {
      // fallback RAG
      const r=DocumentRAG.answer(text);
      reply=r.answer + (r.sources&&r.sources.length? '\n(Sources: '+r.sources.join(', ')+')':'');
    }
    this.appendMsg('bot',reply);
    SpeechAssistant.speak(String(reply).slice(0,300));
  },
  appendMsg(role,text){
    const div=document.createElement('div');
    div.className='msg '+role;
    // XSS-safe text nodes
    div.textContent=text;
    document.getElementById('chatMessages').appendChild(div);
    const c=document.getElementById('chatMessages'); c.scrollTop=c.scrollHeight;
  }
};
window.ChatBot=ChatBot;
function toggleChat(){ document.getElementById('chatWindow').classList.toggle('open'); }
function sendChat(){ const inp=document.getElementById('chatInput'); const t=inp.value.trim(); if(!t) return; inp.value=''; ChatBot.send(t); }
window.toggleChat=toggleChat; window.sendChat=sendChat;

// helper
function slotCountByName(id){ return app.schedule.filter(s=>(s.currentTeacherId||s.teacherId)===id && s.subjectCode!=='FREE-LIB').length; }