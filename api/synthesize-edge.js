import { EdgeTTS } from "edge-tts-universal";

const VOICES = {
  "id-ID-GadisNeural": "id-ID-GadisNeural",
  "id-ID-ArdiNeural": "id-ID-ArdiNeural"
};

function toRate(value) {
  const n = Number(value);
  const pct = Math.round((n - 1) * 100);
  return (pct >= 0 ? "+" : "") + pct + "%";
}

function toPitch(value) {
  const n = Number(value);
  const hz = Math.round((n - 1) * 20);
  return (hz >= 0 ? "+" : "") + hz + "Hz";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const text = String(body.text || "").trim();
    const voice = VOICES[String(body.voice)] || "id-ID-GadisNeural";
    const rate = Math.min(1.4, Math.max(0.6, Number(body.rate) || 1));
    const pitch = Math.min(1.4, Math.max(0.6, Number(body.pitch) || 1));

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    if (text.length > 3000) {
      return res.status(400).json({
        error: "Maksimal 3.000 karakter per permintaan."
      });
    }

    const tts = new EdgeTTS(text, voice, {
      rate: toRate(rate),
      volume: "+0%",
      pitch: toPitch(pitch)
    });

    const result = await tts.synthesize();
    const audio = Buffer.from(await result.audio.arrayBuffer());

    return res.status(200).json({
      audioContent: audio.toString("base64"),
      voice,
      provider: "Microsoft Edge TTS",
      format: "mp3"
    });
  } catch (e) {
    console.error("Edge TTS synthesis error:", e);
    return res.status(502).json({
      error: "Sintesis suara gagal: " + (e?.message || "kesalahan provider")
    });
  }
}
