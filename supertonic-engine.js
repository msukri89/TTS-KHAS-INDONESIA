import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort.webgpu.min.mjs";

export const MODEL_ROOT = "https://huggingface.co/Supertone/supertonic-3/resolve/main";
export const ONNX_ROOT = MODEL_ROOT + "/onnx";
export const VOICE_ROOT = MODEL_ROOT + "/voice_styles";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/";

const LANGS = new Set(["en","ko","ja","ar","bg","cs","da","de","el","es","et","fi","fr","hi","hr","hu","id","it","lt","lv","nl","pl","pt","ro","ru","sk","sl","sv","tr","uk","vi","na"]);

function cleanText(text, lang) {
  text = String(text || "").normalize("NFKD");
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+/gu, "");
  const replacements = {
    "–":"-", "‑":"-", "—":"-", "_":" ",
    "“":'"', "”":'"', "‘":"'", "’":"'", "´":"'",
    "[":" ", "]":" ", "|":" ", "/":" ", "#":" ", "→":" ", "←":" "
  };
  for (const [a,b] of Object.entries(replacements)) text = text.replaceAll(a,b);
  text = text.replace(/[♥☆♡©\\]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) text += ".";
  if (!LANGS.has(lang)) throw new Error("Bahasa tidak didukung: " + lang);
  return "<" + lang + ">" + text + "</" + lang + ">";
}

class UnicodeProcessor {
  constructor(indexer) { this.indexer = indexer; }
  call(textList, langList) {
    const processed = textList.map((t,i) => cleanText(t, langList[i]));
    const lengths = processed.map(t => Array.from(t).length);
    const maxLen = Math.max(...lengths);
    const ids = processed.map(t => {
      const row = new Array(maxLen).fill(0);
      let j = 0;
      for (const ch of t) row[j++] = this.indexer[ch.codePointAt(0)] ?? -1;
      return row;
    });
    return { textIds: ids, textMask: lengths.map(n => [Array.from({length:maxLen}, (_,i)=>i<n?1:0)]) };
  }
}

class Style {
  constructor(ttl, dp) { this.ttl = ttl; this.dp = dp; }
}

function chunkText(text, maxLen=300) {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if (!s.trim()) continue;
    if (current && current.length + s.length + 1 > maxLen) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += (current ? " " : "") + s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.length ? chunks : [text.trim()];
}

export class SupertonicTTS {
  constructor(cfgs, processor, dp, enc, vec, voc) {
    this.cfgs=cfgs; this.processor=processor; this.dp=dp;
    this.enc=enc; this.vec=vec; this.voc=voc;
    this.sampleRate=cfgs.ae.sample_rate;
  }

  async infer(text, lang, style, steps, speed, progress) {
    const {textIds,textMask}=this.processor.call([text],[lang]);
    const b=1, n=textIds[0].length;
    const ids=new ort.Tensor("int64",new BigInt64Array(textIds[0].map(x=>BigInt(x))),[b,n]);
    const mask=new ort.Tensor("float32",new Float32Array(textMask[0][0]),[b,1,n]);

    const dpo=await this.dp.run({text_ids:ids,style_dp:style.dp,text_mask:mask});
    const duration=Array.from(dpo.duration.data).map(d=>d/speed);

    const eco=await this.enc.run({text_ids:ids,style_ttl:style.ttl,text_mask:mask});
    const textEmb=eco.text_emb;

    const maxDur=Math.max(...duration);
    const wavMax=Math.floor(maxDur*this.sampleRate);
    const chunkSize=this.cfgs.ae.base_chunk_size*this.cfgs.ttl.chunk_compress_factor;
    const latentLen=Math.floor((wavMax+chunkSize-1)/chunkSize);
    const latentDim=this.cfgs.ttl.latent_dim*this.cfgs.ttl.chunk_compress_factor;
    const wavLen=Math.floor(duration[0]*this.sampleRate);
    const validLen=Math.floor((wavLen+chunkSize-1)/chunkSize);

    const xtData=new Float32Array(latentDim*latentLen);
    for(let i=0;i<xtData.length;i++){
      const u1=Math.max(0.0001,Math.random()),u2=Math.random();
      xtData[i]=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    }
    for(let d=0;d<latentDim;d++) for(let t=validLen;t<latentLen;t++) xtData[d*latentLen+t]=0;

    const latentMaskData=new Float32Array(latentLen);
    latentMaskData.fill(1,0,Math.min(validLen,latentLen));
    const latentMask=new ort.Tensor("float32",latentMaskData,[1,1,latentLen]);
    const totalStep=new ort.Tensor("float32",new Float32Array([steps]),[1]);

    for(let step=0;step<steps;step++){
      progress?.(step+1,steps);
      const xt=new ort.Tensor("float32",xtData,[1,latentDim,latentLen]);
      const current=new ort.Tensor("float32",new Float32Array([step]),[1]);
      const out=await this.vec.run({
        noisy_latent:xt,text_emb:textEmb,style_ttl:style.ttl,
        latent_mask:latentMask,text_mask:mask,current_step:current,total_step:totalStep
      });
      xtData.set(out.denoised_latent.data);
    }

    const finalXt=new ort.Tensor("float32",xtData,[1,latentDim,latentLen]);
    const vo=await this.voc.run({latent:finalXt});
    return {wav:Array.from(vo.wav_tts.data),duration:duration[0]};
  }

  async synthesize(text,lang,style,steps=8,speed=1.05,progress){
    const chunks=chunkText(text,300);
    let output=[], total=0;
    for(let i=0;i<chunks.length;i++){
      const r=await this.infer(chunks[i],lang,style,steps,speed,progress);
      const needed=Math.min(r.wav.length,Math.floor(r.duration*this.sampleRate));
      if(i) {
        const silence=new Array(Math.floor(this.sampleRate*0.28)).fill(0);
        output.push(...silence);
        total+=0.28;
      }
      output.push(...r.wav.slice(0,needed));
      total+=r.duration;
    }
    return {wav:output,duration:total};
  }
}

export async function loadStyle(id) {
  const r=await fetch(VOICE_ROOT+"/"+id+".json");
  if(!r.ok) throw new Error("Gagal memuat voice " + id);
  const j=await r.json();
  const ttl=j.style_ttl, dp=j.style_dp;
  return new Style(
    new ort.Tensor("float32",new Float32Array(ttl.data.flat(Infinity)),ttl.dims),
    new ort.Tensor("float32",new Float32Array(dp.data.flat(Infinity)),dp.dims)
  );
}

export async function loadEngine(provider,onProgress) {
  if(provider==="wasm"){
    ort.env.wasm.numThreads=1;
    ort.env.wasm.simd=true;
  }
  const options={executionProviders:[provider],graphOptimizationLevel:"all"};
  const cfg=await fetch(ONNX_ROOT+"/tts.json").then(r=>r.json());
  const indexer=await fetch(ONNX_ROOT+"/unicode_indexer.json").then(r=>r.json());
  const files=[
    ["duration_predictor.onnx","Duration Predictor"],
    ["text_encoder.onnx","Text Encoder"],
    ["vector_estimator.onnx","Vector Estimator"],
    ["vocoder.onnx","Vocoder"]
  ];
  const sessions=[];
  for(let i=0;i<files.length;i++){
    onProgress?.(files[i][1],i,files.length);
    sessions.push(await ort.InferenceSession.create(ONNX_ROOT+"/"+files[i][0],options));
  }
  return {
    tts:new SupertonicTTS(cfg,new UnicodeProcessor(indexer),sessions[0],sessions[1],sessions[2],sessions[3]),
    backend:provider
  };
}

export function wavBlob(samples,sampleRate){
  const data=new Int16Array(samples.length);
  for(let i=0;i<samples.length;i++) data[i]=Math.round(Math.max(-1,Math.min(1,samples[i]))*32767);
  const buffer=new ArrayBuffer(44+data.byteLength),v=new DataView(buffer);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF");v.setUint32(4,36+data.byteLength,true);ws(8,"WAVE");
  ws(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);
  v.setUint16(34,16,true);ws(36,"data");v.setUint32(40,data.byteLength,true);
  new Uint8Array(buffer,44).set(new Uint8Array(data.buffer));
  return new Blob([buffer],{type:"audio/wav"});
}
