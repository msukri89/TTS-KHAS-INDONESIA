import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/ort.webgpu.min.mjs";

export const MODEL_ROOT = "https://huggingface.co/Supertone/supertonic-3/resolve/main";
export const ONNX_ROOT = MODEL_ROOT + "/onnx";
export const VOICE_ROOT = MODEL_ROOT + "/voice_styles";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/";

const AVAILABLE_LANGS = ["en","ko","ja","ar","bg","cs","da","de","el","es","et","fi","fr","hi","hr","hu","id","it","lt","lv","nl","pl","pt","ro","ru","sk","sl","sv","tr","uk","vi","na"];

function preprocessText(text, lang) {
  text = String(text || "").normalize("NFKD");
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu, "");
  const replacements = {
    "–":"-", "‑":"-", "—":"-", "_":" ",
    "“":"\"", "”":"\"", "‘":"'", "’":"'", "´":"'", "`":"'",
    "[":" ", "]":" ", "|":" ", "/":" ", "#":" ", "→":" ", "←":" "
  };
  for (const [k,v] of Object.entries(replacements)) text = text.replaceAll(k,v);
  text = text.replace(/[♥☆♡©\\]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) text += ".";
  if (!AVAILABLE_LANGS.includes(lang)) throw new Error("Bahasa tidak didukung: " + lang);
  return "<" + lang + ">" + text + "</" + lang + ">";
}

class UnicodeProcessor {
  constructor(indexer) { this.indexer = indexer; }
  call(textList, langList) {
    const processed = textList.map((t,i) => preprocessText(t, langList[i]));
    const lengths = processed.map(t => t.length);
    const maxLen = Math.max(...lengths);
    const ids = processed.map(t => {
      const row = new Array(maxLen).fill(0);
      for (let j=0; j<t.length; j++) {
        const cp = t.codePointAt(j);
        row[j] = cp < this.indexer.length ? this.indexer[cp] : -1;
      }
      return row;
    });
    const mask = lengths.map(len => [Array.from({length:maxLen}, (_,i) => i < len ? 1 : 0)]);
    return {textIds:ids, textMask:mask};
  }
}

class Style {
  constructor(ttl, dp) { this.ttl=ttl; this.dp=dp; }
}

function chunkText(text, maxLen=300) {
  if (typeof text !== "string") throw new Error("chunkText expects a string");
  const paragraphs = text.trim().split(/\n\s*\n+/).filter(p => p.trim());
  const chunks = [];
  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;
    const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/);
    let current = "";
    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 <= maxLen) {
        current += (current ? " " : "") + sentence;
      } else {
        if (current) chunks.push(current.trim());
        current = sentence;
      }
    }
    if (current) chunks.push(current.trim());
  }
  return chunks;
}

export class SupertonicTTS {
  constructor(cfgs, processor, dp, enc, vec, voc) {
    this.cfgs=cfgs; this.processor=processor; this.dp=dp;
    this.enc=enc; this.vec=vec; this.voc=voc;
    this.sampleRate=cfgs.ae.sample_rate;
  }

  async infer(text, lang, style, steps, speed, progress) {
    const {textIds,textMask}=this.processor.call([text],[lang]);
    const idsFlat=new BigInt64Array(textIds.flat().map(x=>BigInt(x)));
    const ids=new ort.Tensor("int64",idsFlat,[1,textIds[0].length]);
    const maskFlat=new Float32Array(textMask.flat(2));
    const mask=new ort.Tensor("float32",maskFlat,[1,1,textMask[0][0].length]);

    const dpo=await this.dp.run({text_ids:ids,style_dp:style.dp,text_mask:mask});
    const duration=Array.from(dpo.duration.data);
    for(let i=0;i<duration.length;i++) duration[i]/=speed;

    const eco=await this.enc.run({text_ids:ids,style_ttl:style.ttl,text_mask:mask});
    const textEmb=eco.text_emb;

    const sampled=this.sampleNoisyLatent(duration);
    const latentMask=new ort.Tensor(
      "float32",
      new Float32Array(sampled.latentMask.flat(2)),
      [1,1,sampled.latentMask[0][0].length]
    );

    const totalStepTensor=new ort.Tensor("float32",new Float32Array([steps]),[1]);

    let xt=sampled.xt;
    for(let step=0;step<steps;step++){
      progress?.(step+1,steps);
      const xtFlat=new Float32Array(xt.flat(2));
      const xtTensor=new ort.Tensor("float32",xtFlat,[1,xt[0].length,xt[0][0].length]);
      const currentStepTensor=new ort.Tensor("float32",new Float32Array([step]),[1]);
      const out=await this.vec.run({
        noisy_latent:xtTensor,text_emb:textEmb,style_ttl:style.ttl,
        latent_mask:latentMask,text_mask:mask,
        current_step:currentStepTensor,total_step:totalStepTensor
      });
      const data=out.denoised_latent.data;
      const latentDim=xt[0].length;
      const latentLen=xt[0][0].length;
      const next=[];
      let idx=0;
      for(let d=0;d<latentDim;d++){
        const row=[];
        for(let t=0;t<latentLen;t++) row.push(data[idx++]);
        next.push(row);
      }
      xt=[next];
    }

    const finalXt=new ort.Tensor("float32",new Float32Array(xt.flat(2)),[1,xt[0].length,xt[0][0].length]);
    const vo=await this.voc.run({latent:finalXt});
    return {wav:Array.from(vo.wav_tts.data),duration};
  }

  sampleNoisyLatent(duration) {
    const maxDur=Math.max(...duration);
    const sampleRate=this.sampleRate;
    const baseChunkSize=this.cfgs.ae.base_chunk_size;
    const chunkCompress=this.cfgs.ttl.chunk_compress_factor;
    const latentDim=this.cfgs.ttl.latent_dim;
    const wavLenMax=Math.floor(maxDur*sampleRate);
    const wavLengths=duration.map(d=>Math.floor(d*sampleRate));
    const chunkSize=baseChunkSize*chunkCompress;
    const latentLen=Math.floor((wavLenMax+chunkSize-1)/chunkSize);
    const latentDimVal=latentDim*chunkCompress;

    const xt=[[]];
    for(let d=0;d<latentDimVal;d++){
      const row=[];
      for(let t=0;t<latentLen;t++){
        const u1=Math.max(0.0001,Math.random()),u2=Math.random();
        row.push(Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2));
      }
      xt[0].push(row);
    }

    const latentLengths=wavLengths.map(len=>Math.floor((len+chunkSize-1)/chunkSize));
    const latentMask=[[]];
    const maskRow=[];
    for(let t=0;t<latentLen;t++) maskRow.push(t<latentLengths[0]?1:0);
    latentMask[0].push(maskRow);

    for(let d=0;d<latentDimVal;d++){
      for(let t=0;t<latentLen;t++) xt[0][d][t]*=maskRow[t];
    }
    return {xt,latentMask};
  }

  async synthesize(text,lang,style,steps=8,speed=1.05,progress){
    const chunks=chunkText(text,300);
    let wavCat=[], durCat=0;
    for(let i=0;i<chunks.length;i++){
      const r=await this.infer(chunks[i],lang,style,steps,speed,progress);
      if(i){
        const silenceLen=Math.floor(this.sampleRate*0.3);
        for(let s=0;s<silenceLen;s++) wavCat.push(0);
        durCat+=0.3;
      }
      for(let s=0;s<r.wav.length;s++) wavCat.push(r.wav[s]);
      durCat+=r.duration[0];
    }
    return {wav:wavCat,duration:durCat};
  }
}

export async function loadStyle(id) {
  const r=await fetch(VOICE_ROOT+"/"+id+".json");
  if(!r.ok) throw new Error("Gagal memuat voice " + id);
  const j=await r.json();
  return new Style(
    new ort.Tensor("float32",new Float32Array(j.style_ttl.data.flat(Infinity)),j.style_ttl.dims),
    new ort.Tensor("float32",new Float32Array(j.style_dp.data.flat(Infinity)),j.style_dp.dims)
  );
}

export async function loadEngine(provider,onProgress) {
  if(provider==="wasm"){ ort.env.wasm.numThreads=1; ort.env.wasm.simd=true; }
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
    onProgress?.(files[i][1],i+1,files.length);
    sessions.push(await ort.InferenceSession.create(ONNX_ROOT+"/"+files[i][0],options));
  }
  return {tts:new SupertonicTTS(cfg,new UnicodeProcessor(indexer),sessions[0],sessions[1],sessions[2],sessions[3]),backend:provider};
}

export function wavBlob(samples,sampleRate){
  const data=new Int16Array(samples.length);
  for(let i=0;i<samples.length;i++) data[i]=Math.floor(Math.max(-1,Math.min(1,samples[i]))*32767);
  const buffer=new ArrayBuffer(44+data.byteLength),v=new DataView(buffer);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF");v.setUint32(4,36+data.byteLength,true);ws(8,"WAVE");
  ws(12,"fmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);
  v.setUint16(34,16,true);ws(36,"data");v.setUint32(40,data.byteLength,true);
  new Uint8Array(buffer,44).set(new Uint8Array(data.buffer));
  return new Blob([buffer],{type:"audio/wav"});
}