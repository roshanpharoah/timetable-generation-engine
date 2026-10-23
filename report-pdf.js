// report-pdf.js
const ReportPDF = {
  buildWorkloadHTML(){
    const deptCounts={};
    app.staff.forEach(s=>{ deptCounts[s.dept]=(deptCounts[s.dept]||0)+slotCountByName(s.id); });
    return `<div style="font-family:serif;padding:20px">
      <h2 style="text-align:center">Anna University - Workload & Utilization Report</h2>
      <h4 style="text-align:center">Academic Year ${ (LS('tt_semester_config')||{}).academicYear||'2025-26' }</h4>
      <div><b>Total staff:</b> ${app.staff.length} &nbsp; <b>Total slots:</b> ${app.schedule.filter(s=>s.subjectCode!=='FREE-LIB').length}</div>
      <h3>Department-wise Load</h3>
      <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse">
        <tr><th>Dept</th><th>Load (slots)</th></tr>
        ${Object.entries(deptCounts).map(([d,n])=>`<tr><td>${d}</td><td>${n}</td></tr>`).join('')}
      </table>
      <h3>Faculty Load</h3>
      <table border="1" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:11px">
        <tr><th>Name</th><th>Dept</th><th>Slots</th><th>Max</th></tr>
        ${app.staff.map(s=>`<tr><td>${s.name}</td><td>${s.dept}</td><td>${slotCountByName(s.id)}</td><td>${s.maxHoursPerWeek}</td></tr>`).join('')}
      </table>
      <div style="margin-top:30px;display:flex;justify-content:space-between">
        <div>_________________<br/>HOD</div>
        <div>_________________<br/>Principal</div>
      </div>
    </div>`;
  },
  buildRegulationHTML(){
    const conflicts=validateSchedule();
    return `<div style="font-family:serif;padding:20px">
      <h2 style="text-align:center">Regulation Compliance Report (Anna University R2021)</h2>
      <div>Conflicts detected: ${conflicts.length}</div>
      <div>Overloaded faculty: ${app.staff.filter(s=>slotCountByName(s.id)>s.maxHoursPerWeek).length}</div>
      <div>Slots without backup: ${app.schedule.filter(s=>s.subjectCode!=='FREE-LIB'&&!s.backupTeacherId).length}</div>
    </div>`;
  },
  showReportModal(){
    const body=document.getElementById('reportBody');
    body.innerHTML=this.buildWorkloadHTML()+`<div style="margin-top:12px"><button class="btn" onclick="window.print()">Print/Save PDF</button></div>`;
    openModal('modalReport');
  },
  exportCSV(){
    const rows=[['Name','Dept','Slots','Max']];
    app.staff.forEach(s=>rows.push([s.name,s.dept,slotCountByName(s.id),s.maxHoursPerWeek]));
    const csv=rows.map(r=>r.join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='workload.csv'; a.click();
  },
  exportJSON(){
    const blob=new Blob([JSON.stringify({staff:app.staff,subjects:app.subjects,sections:app.sections,schedule:app.schedule},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='data.json'; a.click();
  },
  exportExcel(){
    if(!window.XLSX){ toast('SheetJS unavailable offline','error'); return; }
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(app.staff.map(s=>({name:s.name,dept:s.dept,slots:slotCountByName(s.id),max:s.maxHoursPerWeek})));
    XLSX.utils.book_append_sheet(wb,ws,'Staff');
    XLSX.writeFile(wb,'workload.xlsx');
  }
};
window.ReportPDF=ReportPDF;