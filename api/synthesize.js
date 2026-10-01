const VOICES = {
  "Aoede": "Aoede",
  "Fenrir": "Fenrir"
};

function voiceCharacter(voice) {
  if (voice === "Fenrir") {
    return [
      "Karakter suara pria Indonesia yang dewasa, tenang, hangat, dan percaya diri.",
      "Jangan terlalu berat atau terlalu dibuat-buat.",
      "Biarkan perubahan intonasi muncul secara alami seperti pria yang benar-benar sedang berbicara."
    ].join(" ");
  }

  return [
    "Karakter suara wanita Indonesia yang dewasa, hangat, natural, dan ekspresif.",
    "Jangan terlalu manis atau dibuat-buat.",
    "Biarkan intonasi terasa spontan seperti wanita yang benar-benar sedang berbicara."
  ].join(" ");
}

function stylePrompt(style = "natural") {
  const styles = {
    natural: [
      "Berbicaralah seperti manusia Indonesia yang sedang berbicara langsung kepada satu orang, bukan seperti membaca naskah.",
      "Gunakan gaya percakapan yang spontan, hangat, santai, dan meyakinkan.",
      "Jangan mengucapkan setiap kata dengan bobot yang sama.",
      "Biarkan sebagian kata mengalir ringan dan hanya kata atau gagasan penting yang mendapat penekanan."
    ].join(" "),

    formal: [
      "Berbicaralah seperti seorang profesional Indonesia yang sedang menjelaskan sesuatu secara langsung kepada orang lain.",
      "Suara tenang, matang, jelas, dan berwibawa, tetapi tetap terasa manusiawi.",
      "Gunakan penekanan hanya pada kata atau gagasan yang memang penting.",
      "Jangan terdengar seperti membaca naskah berita."
    ].join(" "),

    friendly: [
      "Berbicaralah seperti orang Indonesia yang ramah sedang berbicara langsung dengan orang yang dikenalnya.",
      "Gunakan nada hangat, akrab, ringan, dan ekspresif.",
      "Boleh ada sedikit energi dan variasi nada ketika menyampaikan sesuatu yang menarik.",
      "Hindari gaya announcer dan suara yang terlalu dibuat-buat."
    ].join(" "),

    announcer: [
      "Berbicaralah seperti pembawa acara Indonesia yang profesional dan berpengalaman.",
      "Jelas, mantap, energik, dan mudah diikuti.",
      "Berikan penekanan yang wajar pada informasi penting dan ubah intonasi ketika berpindah gagasan.",
      "Tetap terdengar seperti manusia yang sedang berbicara, bukan mesin pembaca teks."
    ].join(" ")
  };

  return styles[style] || styles.natural;
}

function buildPrompt(text, style, rate = 1, pitch = 1, voice = "Aoede") {
  const speedHint =
    rate < 0.9 ? "sedikit lebih lambat dari percakapan biasa" :
    rate > 1.1 ? "sedikit lebih cepat dari percakapan biasa" :
    "pada tempo percakapan yang alami";

  const pitchHint =
    pitch < 0.9 ? "dengan nada suara sedikit lebih rendah" :
    pitch > 1.1 ? "dengan nada suara sedikit lebih tinggi" :
    "dengan nada suara percakapan alami";

  return [
    "PERAN:",
    "Anda adalah pengisi suara manusia berbahasa Indonesia.",
    voiceCharacter(voice),
    "",
    "CARA BERBICARA:",
    stylePrompt(style),
    `Gunakan ${speedHint} dan ${pitchHint}.`,
    "Anggap Anda sedang berbicara kepada seseorang yang benar-benar berada di depan Anda.",
    "Jangan terdengar seperti sedang membaca teks dari layar.",
    "Buat ritme sedikit tidak seragam secara alami; manusia tidak mengucapkan setiap kalimat dengan pola yang identik.",
    "Gunakan jeda mikro hanya ketika membantu pemahaman, bukan setelah setiap kelompok kata.",
    "Beri jeda yang lebih terasa ketika satu gagasan selesai atau ketika tanda baca memang membutuhkannya.",
    "Jangan berhenti terlalu lama di tengah kalimat tanpa alasan.",
    "Naikkan atau turunkan intonasi sesuai makna dan struktur kalimat.",
    "Pada kalimat tanya, buat benar-benar terdengar seperti sedang bertanya.",
    "Pada kalimat pernyataan, biarkan akhir gagasan turun dan selesai secara alami.",
    "Gunakan penekanan melalui perubahan intonasi, ritme, dan durasi secara halus; jangan berteriak.",
    "Jangan memberi penekanan pada terlalu banyak kata.",
    "Jika kalimat pendek, jangan membuatnya terdengar dramatis secara berlebihan.",
    "Jika kalimat panjang, pertahankan aliran bicara dan pecah secara alami berdasarkan makna.",
    "Jangan terburu-buru menyelesaikan akhir kalimat.",
    "Hindari suara yang terlalu datar, terlalu sempurna, terlalu seragam, atau seperti robot.",
    "Jangan menambahkan tawa, desahan, suara mulut, atau kata-kata yang tidak ada di teks.",
    "",
    "ATURAN TEKS:",
    "Bacakan teks persis sesuai isinya.",
    "Jangan membacakan instruksi di atas.",
    "Jangan menambahkan pembuka, penutup, komentar, atau kalimat lain.",
    "",
    "TEKS YANG HARUS DIUCAPKAN:",
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
          text: buildPrompt(text, style, rate, pitch, voice)
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
