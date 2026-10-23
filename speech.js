// speech.js
const SpeechAssistant = {
  enabled(){ return LS('tt_speech_enabled')!==false; },
  setEnabled(v){ LS('tt_speech_enabled',v); },
  speak(text){
    if(!this.enabled()||!('speechSynthesis' in window)) return;
    const u=new SpeechSynthesisUtterance(text); u.lang='en-IN';
    window.speechSynthesis.speak(u);
  },
  startRecognition(onResult){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ toast('Speech recognition not supported','error'); return null; }
    const rec=new SR(); rec.lang='en-IN'; rec.interimResults=false;
    rec.onresult=e=>{ const t=e.results[0][0].transcript; onResult(t); };
    rec.onerror=e=>toast('Speech error: '+e.error,'error');
    rec.start();
    return rec;
  },
  toggle(){
    const v=!this.enabled(); this.setEnabled(v); toast('Voice '+(v?'on':'off')); return v;
  }
};
window.SpeechAssistant=SpeechAssistant;
window.addEventListener('DOMContentLoaded',()=>{
  // add toggle button to topbar? optional
});