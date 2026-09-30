export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try{
    const {text,voice="id_ID-news_tts-medium",rate=1}=req.body||{};
    const input=String(text||"").trim();
    if(!input)return res.status(400).json({error:"Text is required"});
    if(input.length>500)return res.status(400).json({error:"Maksimal 500 karakter per permintaan pada akses gratis tanpa login."});

    const payload={
      model:"piper",
      text:input,
      voice:String(voice||"id_ID-news_tts-medium"),
      format:"mp3",
      speed:Math.min(2,Math.max(.5,Number(rate)||1))
    };

    const r=await fetch("https://api.tts.ai/v1/tts/",{
      method:"POST",
      headers:{"Content-Type":"application/json","Accept":"application/json, audio/mpeg"},
      body:JSON.stringify(payload)
    });

    const contentType=r.headers.get("content-type")||"";
    if(!r.ok){
      const raw=await r.text();
      let message=raw;
      try{const j=JSON.parse(raw);message=j.error?.message||j.error||j.detail||raw}catch{}
      return res.status(r.status).json({error:"TTS.ai: "+String(message)});
    }

    if(contentType.includes("audio/")){
      const bytes=Buffer.from(await r.arrayBuffer());
      return res.status(200).json({audioContent:bytes.toString("base64"),voice:payload.voice,provider:"TTS.ai Piper"});
    }

    const job=await r.json();
    if(!job.uuid)return res.status(502).json({error:"TTS.ai tidak mengembalikan UUID pekerjaan."});

    const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,1200));
      const pr=await fetch("https://api.tts.ai/v1/speech/results/?uuid="+encodeURIComponent(job.uuid));
      const result=await pr.json();
      if(result.status==="completed"&&result.result_url){
        const audio=await fetch(result.result_url);
        if(!audio.ok)throw new Error("Audio hasil TTS.ai tidak dapat diambil.");
        const bytes=Buffer.from(await audio.arrayBuffer());
        return res.status(200).json({audioContent:bytes.toString("base64"),voice:payload.voice,provider:"TTS.ai Piper"});
      }
      if(result.status==="failed"){
        return res.status(502).json({error:"TTS.ai gagal melakukan sintesis: "+String(result.error||result.message||"synthesis-failed")});
      }
    }
    return res.status(504).json({error:"TTS.ai belum selesai setelah 25 detik. Silakan coba lagi."});
  }catch(e){
    return res.status(500).json({error:e.message||"Unexpected error"});
  }
}