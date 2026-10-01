const VOICES = {
  "Aoede": "Aoede",
  "Fenrir": "Fenrir"
};

function stylePrompt(style = "natural") {
  const styles = {
    natural: [
      "Berbicaralah dalam bahasa Indonesia secara natural dan percakapan.",
      "Jangan terdengar seperti membaca naskah.",
      "Gunakan intonasi, ritme, dan jeda yang mengikuti makna kalimat."
    ].join(" "),

    formal: [
      "Berbicaralah dalam bahasa Indonesia dengan gaya profesional, tenang, jelas, dan berwibawa.",
      "Tetap terdengar seperti manusia yang sedang berbicara, bukan membaca berita."
    ].join(" "),

    friendly: [
      "Berbicaralah dalam bahasa Indonesia dengan gaya ramah, hangat, akrab, dan ringan.",
      "Tetap natural dan tidak dibuat-buat."
    ].join(" "),

    announcer: [
      "Berbicaralah dalam bahasa Indonesia seperti pembawa acara profesional.",
      "Jelas, mantap, energik, tetapi tetap natural dan manusiawi."
    ].join(" ")
  };

  return styles[style] || styles.natural;
}

function buildPrompt(text, style, rate = 1, pitch = 1) {
  const speedHint =
    rate < 0.9 ? "sedikit lebih lambat dari percakapan biasa" :
    rate > 1.1 ? "sedikit lebih cepat dari percakapan biasa" :
    "pada tempo percakapan alami";

  const pitchHint =
    pitch < 0.9 ? "sedikit lebih rendah" :
    pitch > 1.1 ? "sedikit lebih tinggi" :
    "alami";

  return [
    "TUGAS:",
    "Bacakan teks berikut dalam bahasa Indonesia.",
    "",
    "GAYA:",
    stylePrompt(style),
    `Gunakan tempo ${speedHint} dan nada suara ${pitchHint}.`,
    "Bayangkan Anda sedang berbicara langsung kepada satu orang.",
    "Biarkan intonasi naik dan turun sesuai makna.",
    "Gunakan jeda yang wajar pada tanda baca dan perpindahan gagasan.",
    "Jangan membuat setiap kalimat memiliki pola intonasi yang sama.",
    "Jangan memberi tekanan pada semua kata; hanya bagian penting yang perlu sedikit penekanan.",
    "Akhiri kalimat pernyataan secara natural dan buat kalimat tanya benar-benar terdengar seperti pertanyaan.",
    "Hindari suara datar, monoton, terlalu sempurna, atau seperti robot.",
    "Jangan menambahkan kata, komentar, tawa, atau suara lain yang tidak ada dalam teks.",
    "",
    "BACA TEKS INI PERSIS:",
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
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent";

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

    // Voice is controlled ONLY by the UI value -> server allowlist -> Gemini voiceName.
    // The prompt deliberately contains no gender/voice-character instruction.
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
