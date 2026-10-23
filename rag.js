// rag.js
const DocumentRAG = {
  docs(){ return LS('tt_rag_documents')||[]; },
  saveDocs(d){ 
    let json=JSON.stringify(d);
    if(json.length>2.5*1024*1024){ toast('RAG storage cap reached','error'); }
    LS('tt_rag_documents',d);
  },
  chunks(){ // flatten
    const out=[];
    this.docs().forEach(doc=> (doc.chunks||[]).forEach((c,i)=>out.push({docId:doc.id,title:doc.title,text:c})));
    // auto-index app data
    const auto = this.autoChunks();
    auto.forEach(c=>out.push({docId:'auto',title:'App data',text:c}));
    return out;
  },
  autoChunks(){
    const cs=[];
    const push=(t)=>{ if(t&&t.length) cs.push(t.slice(0,450)); };
    app.staff.forEach(s=>push(`Staff ${s.name} ${s.id} dept ${s.dept} subjects ${(s.subjects||[]).join(' ')} max ${s.maxHoursPerWeek} status ${s.attendanceStatus}`));
    app.subjects.forEach(s=>push(`Subject ${s.code} ${s.name} dept ${s.dept} type ${s.type} hours ${s.hoursPerWeek}`));
    app.sections.forEach(s=>push(`Section ${s.id} ${s.name} dept ${s.dept}`));
    app.schedule.forEach(s=>push(`Slot ${s.day} P${s.period} section ${s.sectionId} subject ${s.subjectCode} teacher ${s.currentTeacherId||s.teacherId} room ${s.roomName}`));
    (LS('tt_holidays')||[]).forEach(h=>push(`Holiday ${h.date} ${h.name}`));
    return cs;
  },
  STOP:new Set(['the','a','an','and','or','but','is','are','was','were','of','to','in','on','for','with','as','by','at','from','this','that','it','be']),
  stem(w){ return w.replace(/ing$|ed$|s$/,''); },
  tokenize(text){
    return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2 && !this.STOP.has(w)).map(w=>this.stem(w));
  },
  chunkText(text,size=450){
    const chunks=[]; let i=0;
    while(i<text.length){ chunks.push(text.slice(i,i+size)); i+=size-50; }
    return chunks;
  },
  ingestText(title,text,source='text'){
    const chunks=this.chunkText(text);
    const docs=this.docs();
    docs.push({id:uid(),title,source,chunks,ts:new Date().toISOString()});
    // cap 2.5MB total
    this.saveDocs(docs);
    return chunks.length;
  },
  async ingestFile(file){
    const name=file.name.toLowerCase();
    if(name.endsWith('.pdf')){
      await this.loadPdfJs();
      const buf=await file.arrayBuffer();
      const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
      let text='';
      for(let i=1;i<=pdf.numPages;i++){ const p=await pdf.getPage(i); const c=await p.getTextContent(); text+=c.items.map(x=>x.str).join(' ')+'\n'; }
      return this.ingestText(file.name,text,'pdf');
    }
    if(name.endsWith('.json')){
      const t=await file.text(); return this.ingestText(file.name,t,'json');
    }
    if(name.endsWith('.csv')||name.endsWith('.txt')||name.endsWith('.md')){
      const t=await file.text(); return this.ingestText(file.name,t,name.split('.').pop());
    }
    if(name.endsWith('.xlsx')||name.endsWith('.xls')){
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const t=XLSX.utils.sheet_to_csv(ws); return this.ingestText(file.name,t,'xlsx');
    }
    throw new Error('Unsupported format');
  },
  async loadPdfJs(){
    if(window.pdfjsLib) return;
    await new Promise((res,rej)=>{
      const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload=()=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(); }; s.onerror=rej; document.head.appendChild(s); });
  },
  bm25(query,chunks,k1=1.5,b=0.75,topK=4){
    const qTokens=this.tokenize(query);
    // compute idf
    const N=chunks.length;
    const df={};
    chunks.forEach(c=>{
      const toks=new Set(this.tokenize(c.text));
      toks.forEach(t=>{ df[t]=(df[t]||0)+1; });
    });
    const idf={};
    Object.keys(df).forEach(t=>{ idf[t]=Math.log((N-df[t]+0.5)/(df[t]+0.5)+1); });
    // avg doc len
    const lens=chunks.map(c=>this.tokenize(c.text).length);
    const avg=lens.reduce((a,b)=>a+b,0)/Math.max(1,N);
    const scored=chunks.map((c,idx)=>{
      const toks=this.tokenize(c.text);
      const tf={};
      toks.forEach(t=>{ tf[t]=(tf[t]||0)+1; });
      let score=0;
      qTokens.forEach(qt=>{
        if(tf[qt]){
          const numerator=tf[qt]*(k1+1);
          const denom=tf[qt]+k1*(1-b+b*(lens[idx]/avg));
          score += (idf[qt]||0)*numerator/denom;
        }
      });
      return {chunk:c,score};
    }).sort((a,b)=>b.score-a.score);
    return scored.slice(0,topK).filter(x=>x.score>0);
  },
  answer(query){
    const chunks=this.chunks();
    if(!chunks.length) return {answer:'No documents indexed.',sources:[]};
    const res=this.bm25(query, chunks.map(c=>({text:c.text,_c:c})).map(x=>x), 4);
    // fix: bm25 expects chunks with .text
    const r2=this.bm25(query, chunks.map(c=>({text:c.text})), 4);
    // need map back; redo properly
    const scored=chunks.map(c=>{
      const toks=this.tokenize(c.text);
      return {c,toks};
    });
    // simpler: reuse bm25 on objects with text, then find original
    const top=this.bm25(query, chunks.map(c=>({text:c.text,_ref:c})),4);
    const sources=top.map(t=>t.chunk._ref);
    const answer = sources.length? sources.map(s=>s.text.slice(0,200)).join(' ') : 'No relevant info found.';
    return {answer, sources: sources.map(s=>s.title||s.docId)};
  },
  search(query){ return this.answer(query); }
};
window.DocumentRAG=DocumentRAG;