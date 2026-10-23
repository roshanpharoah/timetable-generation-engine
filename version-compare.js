// version-compare.js
const VersionCompare = {
  compare(id){
    const versions=LS('tt_timetable_versions')||[];
    const v=versions.find(x=>x.id===id); if(!v) return;
    // compare to current
    const cur=app.schedule;
    const old=v.schedule||[];
    const key=s=>s.day+'|'+s.period+'|'+s.sectionId;
    const oldMap=new Map(old.map(s=>[key(s),s]));
    const curMap=new Map(cur.map(s=>[key(s),s]));
    const added=[], removed=[], changed=[];
    curMap.forEach((s,k)=>{ if(!oldMap.has(k)) added.push(s); else { const o=oldMap.get(k); if(o.subjectCode!==s.subjectCode||o.teacherId!==s.teacherId) changed.push({old:o,new:s}); } });
    oldMap.forEach((s,k)=>{ if(!curMap.has(k)) removed.push(s); });
    const body=document.getElementById('genericBody');
    body.innerHTML=`<h3>Version Diff: ${v.label}</h3>
      <div>Added: ${added.length}</div><ul>${added.map(s=>`<li>${s.day} P${s.period} ${s.sectionId} ${s.subjectCode}</li>`).join('')}</ul>
      <div>Removed: ${removed.length}</div><ul>${removed.map(s=>`<li>${s.day} P${s.period} ${s.sectionId} ${s.subjectCode}</li>`).join('')}</ul>
      <div>Changed: ${changed.length}</div><ul>${changed.map(c=>`<li>${c.new.day} P${c.new.period} ${c.new.sectionId}: ${c.old.subjectCode}->${c.new.subjectCode}</li>`).join('')}</ul>`;
    openModal('modalGeneric');
  }
};
window.VersionCompare=VersionCompare;