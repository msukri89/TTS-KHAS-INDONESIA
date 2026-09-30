export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try{
    const {text,voice="id_ID-news_tts-medium",rate=1}=req.body||{};
    const input=String(text||"").trim();
    if(!input)return res.status(400).json({error:"Text is required"});
    if(input.length>500)return res.status(400).json({error:"Versi gratis tanpa login membatasi 500 karakter per permintaan. Pendekkan teks terlebih dahulu."});

    const r=await fetch("https://api.tts.ai/v1/tts/",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"piper",
        voice,
        text:input,
        format:"mp3",
        speed:Math.min(2,Math.max(.5,Number(rate)||1)),
        language:"id"
      })
    });

    const contentType=r.headers.get("content-type")||"";
    if(!r.ok){
      const raw=await r.text();
      let message=raw;
      try{const j=JSON.parse(raw);message=j.error?.message||j.error||raw}catch{}
      return res.status(r.status).json({error:String(message)});
    }

    if(contentType.includes("audio/")){
      const bytes=Buffer.from(await r.arrayBuffer());
      return res.status(200).json({
        audioContent:bytes.toString("base64"),
        voice,
        provider:"tts.ai/piper"
      });
    }

    const job=await r.json();
    if(!job.uuid)return res.status(502).json({error:"TTS.ai tidak mengembalikan job UUID."});

    const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,1200));
      const pr=await fetch("https://api.tts.ai/v1/speech/results/?uuid="+encodeURIComponent(job.uuid));
      const result=await pr.json();
      if(result.status==="completed"&&result.result_url){
        const audio=await fetch(result.result_url);
        if(!audio.ok)throw new Error("Gagal mengambil audio hasil TTS.ai.");
        const bytes=Buffer.from(await audio.arrayBuffer());
        return res.status(200).json({
          audioContent:bytes.toString("base64"),
          voice,
          provider:"tts.ai/piper"
        });
      }
      if(result.status==="failed")return res.status(502).json({error:result.error||"TTS.ai gagal membuat suara."});
    }
    return res.status(504).json({error:"TTS.ai terlalu lama memproses suara. Silakan coba lagi."});
  }catch(e){
    return res.status(500).json({error:e.message||"Unexpected error"});
  }
}