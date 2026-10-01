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

// Speech planner v3: turn Indonesian prose into human-sized speaking units.
// The goal is not to add commas everywhere; it is to create a few meaningful
// breaths and subtle changes of delivery between semantic units.
function splitLongSentence(sentence) {
  const clean = sentence.trim();
  if (clean.length <= 95) return [clean];

  // Prefer natural Indonesian clause boundaries.
  const re = /\s+(?=(tetapi|namun|sedangkan|karena|sehingga|supaya|agar|meskipun|walaupun|sementara|lalu|kemudian|dan kemudian|oleh karena itu|karena itu)\b)/i;
  const words = clean.split(/\s+/);
  const chunks = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (current.length >= 48 && re.test(" " + word)) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current.trim());

  // Only keep the split when it produces sensible chunks.
  if (chunks.length > 1 && chunks.every(x => x.length >= 28)) {
    return chunks;
  }
  return [clean];
}

function planSegments(text, style) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const units = [];
  for (const sentence of sentences) {
    units.push(...splitLongSentence(sentence));
  }

  return units.map((s, i) => {
    let rate = 0;
    let pitch = 0;
    let role = "body";

    // Opening: welcoming, slightly slower and warmer.
    if (/^(assalamualaikum|selamat (pagi|siang|sore|malam))\b/i.test(s)) {
      role = "opening";
      rate -= 3;
      pitch += 1;
    }

    // Questions naturally carry a small upward movement.
    if (/\?$/.test(s)) {
      role = "question";
      pitch += 2;
    }

    // Important discourse transitions should breathe, not rush.
    if (/^(baik|nah|jadi|sekarang|selanjutnya|kemudian|perhatian|harap diperhatikan)\b/i.test(s)) {
      role = "transition";
      rate -= 2;
    }

    // Closing language is calmer and slightly slower.
    if (/(terima kasih|semoga|sampai jumpa|selamat jalan)[.!?]?$/i.test(s)) {
      role = "closing";
      rate -= 3;
      pitch -= 1;
    }

    // Long information units are eased slightly to improve intelligibility.
    if (s.length > 125) rate -= 2;

    if (style === "formal") rate -= 1;
    if (style === "friendly") {
      rate += role === "opening" ? 0 : 1;
      pitch += role === "closing" ? 0 : 1;
    }
    if (style === "announcer") {
      rate -= 1;
      if (role === "transition") pitch += 1;
    }

    return { text: s, rate, pitch, role, index: i };
  });
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
