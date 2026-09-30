// Indonesian Prosody Engine — deterministic text preparation for natural speech.
const ID_PROSODY={punctuation:{",":" <break time="180ms"/> ",";":" <break time="260ms"/> ",":":" <break time="220ms"/> ",".":" <break time="520ms"/> ","!":" <break time="480ms"/> ","?":" <break time="560ms"/> "},fillers:/\b(eee+|hmm+|umm+|em+|eh)\b/gi};
function expandIndonesian(text){
  let s=text.normalize("NFC").replace(/\r?\n+/g," <break time="650ms"/> ").replace(/\s+/g," ").trim();
  s=s.replace(/\b(Dr|dr)\.?\b/g,"doktor").replace(/\b(No|no)\.?\b/g,"nomor").replace(/\b(Jl|jl)\.?\b/g,"jalan").replace(/\b(Yth|yth)\.?\b/g,"yang terhormat");
  s=s.replace(/\b(\d{1,9})\b/g,(_,n)=>numberToIndonesian(Number(n)));
  s=s.replace(ID_PROSODY.fillers,"");
  return s;
}
function numberToIndonesian(n){
  const u=["nol","satu","dua","tiga","empat","lima","enam","tujuh","delapan","sembilan"];
  const under1000=x=>x<10?u[x]:x<20?(x===10?"sepuluh":x===11?"sebelas":u[x-10]+" belas"):x<100?u[Math.floor(x/10)]+" puluh"+(x%10?" "+u[x%10]:""):u[Math.floor(x/100)]+" ratus"+(x%100?" "+under1000(x%100):"");
  if(n<1000)return under1000(n);if(n<1e6)return under1000(Math.floor(n/1000))+" ribu"+(n%1000?" "+under1000(n%1000):"");if(n<1e9)return under1000(Math.floor(n/1e6))+" juta"+(n%1e6?" "+numberToIndonesian(n%1e6):"");return String(n);
}
function addProsody(text,style="natural"){
  let s=expandIndonesian(text);
  if(style==="announcer")s=s.replace(/,/g,', <break time="260ms"/>').replace(/\?/g,'? <break time="700ms"/>');
  if(style==="formal")s=s.replace(/,/g,', <break time="220ms"/>');
  if(style==="friendly")s=s.replace(/,/g,', <break time="150ms"/>');
  return s;
}
if(typeof window!=="undefined")window.ID_PROSODY={addProsody,expandIndonesian,numberToIndonesian};