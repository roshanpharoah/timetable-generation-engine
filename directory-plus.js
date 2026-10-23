// directory-plus.js
function openStaffProfile(id){
  const s=app.staff.find(x=>x.id===id); if(!s) return;
  const body=document.getElementById('genericBody');
  body.innerHTML=`<h3>${s.name}</h3>
    <div>Dept: ${s.dept}</div>
    <div>Subjects: ${(s.subjects||[]).join(', ')}</div>
    <div>Max hours: ${s.maxHoursPerWeek}</div>
    <div>Slots: ${slotCountByName(s.id)}</div>
    <div>Status: ${s.attendanceStatus}</div>`;
  openModal('modalGeneric');
}
window.openStaffProfile=openStaffProfile;
// enhance renderStaffTable rows? Already has Edit. Add profile link via onclick name.
// Monkeypatch renderStaffTable not needed; add quick search already.