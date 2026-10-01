import { EdgeTTS } from "edge-tts-universal";

const VOICES = {
  "id-ID-ArdiNeural": "id-ID-ArdiNeural",
  "id-ID-GadisNeural": "id-ID-GadisNeural"
};

function toPercent(rate) {
  const n = Math.min(1.4, Math.max(0.6, Number(rate) || 1));
  return Math.round((n - 1) * 100);
}

function toPitch(pitch) {
  const n = Math.min(1.4, Math.max(0.6, Number(pitch) || 1));
  return Math.round((n - 1) * 30);
}

function styleAdjust(style = "natural") {
  if (style === "formal") return { rate: -4, pitch: -1 };
  if (style === "friendly") return { rate: 2, pitch: 1 };
  if (style === "announcer") return { rate: -3, pitch: 0 };
  return { rate: 0, pitch: 0 };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const input = String(body.text || "").trim();
    const voice = VOICES[String(body.voice)] || "id-ID-GadisNeural";
    const rawRate = Number(body.rate) || 1;
    const rawPitch = Number(body.pitch) || 1;
    const style = String(body.style || "natural");
    const adjust = styleAdjust(style);

    if (!input) return res.status(400).json({ error: "Text is required" });
    if (input.length > 3000) {
      return res.status(400).json({ error: "Maksimal 3.000 karakter per permintaan." });
    }

    const rate = Math.max(-50, Math.min(50, toPercent(rawRate) + adjust.rate));
    const pitch = Math.max(-15, Math.min(15, toPitch(rawPitch) + adjust.pitch));

    const tts = new EdgeTTS(input, voice, {
      rate: (rate >= 0 ? "+" : "") + rate + "%",
      volume: "+0%",
      pitch: (pitch >= 0 ? "+" : "") + pitch + "Hz"
    });

    const result = await tts.synthesize();
    const bytes = Buffer.from(await result.audio.arrayBuffer());

    if (!bytes.length) {
      throw new Error("Microsoft Edge TTS tidak mengembalikan audio.");
    }

    return res.status(200).json({
      audioContent: bytes.toString("base64"),
      voice,
      provider: "Microsoft Edge Neural TTS",
      format: "mp3"
    });
  } catch (e) {
    console.error("TTS synthesis error:", e);
    return res.status(502).json({
      error: "Sintesis suara gagal: " + (e?.message || "kesalahan provider")
    });
  }
}
