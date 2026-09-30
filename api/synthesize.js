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

// Speech planner: split at real sentence boundaries and give each spoken
// unit a very small expressive adjustment. The adjustments are deliberately
// subtle so the result still sounds like one continuous speaker.
function planSegments(text, style) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const parts = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    let rate = 0;
    let pitch = 0;

    // Openings and greetings: slightly slower and warmer.
    if (/^(assalamualaikum|selamat (pagi|siang|sore|malam))/i.test(s)) {
      rate -= 3;
      pitch += 1;
    }

    // Questions: a tiny pitch lift. This is intentionally small because
    // consumer Edge TTS does not expose per-word pitch contours.
    if (/\?$/.test(s)) pitch += 2;

    // Short closing sentences: slightly calmer.
    if (/(terima kasih|semoga|selamat|sampai jumpa)[.!?]?$/i.test(s)) {
      rate -= 2;
    }

    // Announcer style keeps units deliberate; friendly is a little quicker.
    if (style === "announcer") rate -= 1;
    if (style === "friendly") rate += 1;

    segments.push({ text: s, rate, pitch });
  }

  return segments;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Remove an ID3v2 header when concatenating multiple MP3 segments.
// MPEG frames can then remain sequential in one response.
function stripId3v2(buffer) {
  if (buffer.length < 10 || buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) {
    return buffer;
  }

  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);

  const total = 10 + size;
  return total < buffer.length ? buffer.subarray(total) : buffer;
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

    const baseRate = toPercent(rawRate) + adjust.rate;
    const basePitch = toPitch(rawPitch) + adjust.pitch;
    const segments = planSegments(input, style);

    if (!segments.length) {
      return res.status(400).json({ error: "Teks tidak menghasilkan unit bicara." });
    }

    const audioParts = [];

    for (const segment of segments) {
      const rate = clamp(baseRate + segment.rate, -50, 50);
      const pitch = clamp(basePitch + segment.pitch, -15, 15);

      const tts = new EdgeTTS(segment.text, voice, {
        rate: (rate >= 0 ? "+" : "") + rate + "%",
        volume: "+0%",
        pitch: (pitch >= 0 ? "+" : "") + pitch + "Hz"
      });

      const result = await tts.synthesize();
      const bytes = Buffer.from(await result.audio.arrayBuffer());

      if (!bytes.length) {
        throw new Error("Microsoft Edge TTS tidak mengembalikan audio.");
      }

      audioParts.push(stripId3v2(bytes));
    }

    const bytes = Buffer.concat(audioParts);

    if (!bytes.length) {
      throw new Error("Audio hasil sintesis kosong.");
    }

    return res.status(200).json({
      audioContent: bytes.toString("base64"),
      voice,
      provider: "Microsoft Edge Neural TTS",
      format: "mp3",
      segments: segments.length
    });
  } catch (e) {
    console.error("TTS synthesis error:", e);
    return res.status(502).json({
      error: "Sintesis suara gagal: " + (e?.message || "kesalahan provider")
    });
  }
}
