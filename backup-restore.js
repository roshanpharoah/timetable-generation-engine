// backup-restore.js
const BackupRestore = {
  download(){
    const snap={};
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); snap[k]=localStorage.getItem(k); }
    const blob=new Blob([JSON.stringify(snap)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='backup.json'; a.click();
    audit('Backup downloaded','');
  },
  restore(file){
    const reader=new FileReader();
    reader.onload=e=>{
      const snap=JSON.parse(e.target.result);
      if(!confirm('Restore backup? Overwrites current data.')) return;
      localStorage.clear();
      Object.keys(snap).forEach(k=>localStorage.setItem(k,snap[k]));
      toast('Restored. Reloading...'); setTimeout(()=>location.reload(),1000);
    };
    reader.readAsText(file);
  },
  autoSnapshot(){
    const snap={};
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); snap[k]=localStorage.getItem(k); }
    LS('tt_autosnapshot',snap);
  },
  undoLastClear(){
    const snap=LS('tt_autosnapshot');
    if(!snap){ toast('No snapshot','error'); return; }
    localStorage.clear();
    Object.keys(snap).forEach(k=>localStorage.setItem(k,snap[k]));
    toast('Undo restored'); setTimeout(()=>location.reload(),1000);
  }
};
window.BackupRestore=BackupRestore;
// auto snapshot every 5 min
setInterval(()=>BackupRestore.autoSnapshot(), 5*60*1000);
// add restore input handler
window.handleRestoreFile=function(e){ if(e.target.files[0]) BackupRestore.restore(e.target.files[0]); };