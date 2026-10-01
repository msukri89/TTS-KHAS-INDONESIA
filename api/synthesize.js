const VOICES = {
  "Aoede": "Aoede",
  "Fenrir": "Fenrir"
};

function stylePrompt(style = "natural") {
  const styles = {
    natural: "Berbicaralah seperti orang Indonesia sungguhan yang sedang berbicara secara natural. Santai, hangat, tidak kaku, dengan intonasi yang hidup dan jeda napas yang wajar.",
    formal: "Berbicaralah sebagai pembicara profesional berbahasa Indonesia. Tenang, jelas, berwibawa, tetapi tetap manusiawi dan tidak terdengar seperti membaca mesin.",
    friendly: "Berbicaralah dengan gaya ramah, hangat, akrab, dan menyenangkan seperti berbicara langsung kepada seseorang. Gunakan intonasi yang hidup tetapi tetap natural.",
    announcer: "Berbicaralah seperti penyiar atau pembawa acara Indonesia yang profesional. Jelas dan tegas, dengan penekanan yang wajar pada informasi penting, tetapi jangan berlebihan."
  };
  return styles[style] || styles.natural;
}

function buildPrompt(text, style, rate = 1, pitch = 1) {
  const speedHint =
    rate < 0.9 ? "sedikit lebih lambat" :
    rate > 1.1 ? "sedikit lebih cepat" :
    "dengan tempo percakapan normal";

  const pitchHint =
    pitch < 0.9 ? "sedikit lebih rendah" :
    pitch > 1.1 ? "sedikit lebih tinggi" :
    "pada nada percakapan alami";

  return [
    "Anda adalah pengisi suara manusia berbahasa Indonesia.",
    stylePrompt(style),
    `Gunakan ${speedHint} dan ${pitchHint}.`,
    "Bacakan teks berikut persis sesuai isinya.",
    "Jangan membacakan instruksi ini dan jangan menambahkan kalimat apa pun.",
    "Gunakan ritme, jeda, penekanan, dan perubahan intonasi yang alami sesuai makna kalimat.",
    "Hindari tempo yang terlalu seragam, jeda yang terlalu mekanis, dan gaya membaca seperti robot.",
    "",
    "TEKS:",
    text
  ].join("\n");
}

function createWav(pcm) {
  const sampleRate = 24000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample / 8;
  const buffer = Buffer.alloc(44 + pcm.length);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcm.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcm.length, 40);
  pcm.copy(buffer, 44);

  return buffer;
}

async function generateGemini(text, voice, style, rate, pitch) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum dipasang di environment server.");
  }

  const model = "gemini-2.5-flash-preview-tts";
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    model + ":generateContent";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: buildPrompt(text, style, rate, pitch)
        }]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice
            }
          }
        }
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini TTS HTTP ${response.status}`;
    throw new Error(message);
  }

  const inlineData =
    data?.candidates?.[0]?.content?.parts?.find(
      part => part?.inlineData?.data
    )?.inlineData;

  if (!inlineData?.data) {
    throw new Error("Gemini tidak mengembalikan data audio.");
  }

  return createWav(Buffer.from(inlineData.data, "base64"));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const input = String(body.text || "").trim();
    const voice = VOICES[String(body.voice)] || "Aoede";
    const style = String(body.style || "natural");
    const rate = Math.min(1.4, Math.max(0.6, Number(body.rate) || 1));
    const pitch = Math.min(1.4, Math.max(0.6, Number(body.pitch) || 1));

    if (!input) {
      return res.status(400).json({ error: "Text is required" });
    }

    if (input.length > 3000) {
      return res.status(400).json({
        error: "Maksimal 3.000 karakter per permintaan."
      });
    }

    const audio = await generateGemini(input, voice, style, rate, pitch);

    return res.status(200).json({
      audioContent: audio.toString("base64"),
      voice,
      provider: "Google Gemini 2.5 Flash TTS",
      format: "wav",
      sampleRate: 24000
    });
  } catch (e) {
    console.error("Gemini TTS synthesis error:", e);

    return res.status(502).json({
      error: "Sintesis suara gagal: " +
        (e?.message || "kesalahan provider")
    });
  }
}
