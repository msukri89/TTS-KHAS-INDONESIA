// Indonesian Prosody Engine v4
// Prepares Indonesian text for Supertonic 3 with conservative, sentence-aware spoken-language boundaries.
// Important: output stays plain text because the Edge consumer service
// accepts its own generated prosody envelope, not arbitrary SSML.

const FILLERS = /\b(eee+|hmm+|umm+|em+|eh)\b/gi;
const UNITS = ["nol","satu","dua","tiga","empat","lima","enam","tujuh","delapan","sembilan"];
const MONTHS = {
  "01":"Januari","02":"Februari","03":"Maret","04":"April","05":"Mei","06":"Juni",
  "07":"Juli","08":"Agustus","09":"September","10":"Oktober","11":"November","12":"Desember"
};

function under1000(n) {
  if (n < 10) return UNITS[n];
  if (n < 20) return n === 10 ? "sepuluh" : n === 11 ? "sebelas" : UNITS[n - 10] + " belas";
  if (n < 100) return UNITS[Math.floor(n / 10)] + " puluh" + (n % 10 ? " " + UNITS[n % 10] : "");
  return UNITS[Math.floor(n / 100)] + " ratus" + (n % 100 ? " " + under1000(n % 100) : "");
}

function numberToIndonesian(n) {
  n = Number(n);
  if (!Number.isFinite(n) || n < 0 || n >= 1000000000) return String(n);
  if (n < 1000) return under1000(n);
  if (n < 1000000) return under1000(Math.floor(n / 1000)) + " ribu" + (n % 1000 ? " " + numberToIndonesian(n % 1000) : "");
  return under1000(Math.floor(n / 1000000)) + " juta" + (n % 1000000 ? " " + numberToIndonesian(n % 1000000) : "");
}

function normalizeBase(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\r?\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAbbreviations(s) {
  return s
    .replace(/\bDr\.?\s+/gi, "doktor ")
    .replace(/\bProf\.?\s+/gi, "profesor ")
    .replace(/\bKH\.?\s+/gi, "kiai haji ")
    .replace(/\bH\.?\s+(?=[A-Z])/g, "haji ")
    .replace(/\bHj\.?\s+/gi, "hajjah ")
    .replace(/\bNo\.?\s*/gi, "nomor ")
    .replace(/\bJl\.?\s+/gi, "jalan ")
    .replace(/\bYth\.?\s+/gi, "yang terhormat ")
    .replace(/\bdst\.?\b/gi, "dan seterusnya")
    .replace(/\bdll\.?\b/gi, "dan lain-lain")
    .replace(/\bdsb\.?\b/gi, "dan sebagainya")
    .replace(/\buntk\.?\b/gi, "untuk")
    .replace(/\bdgn\.?\b/gi, "dengan");
}

function expandNumbers(s) {
  // Currency: Rp 25.000 / Rp25.000
  s = s.replace(/\bRp\.?\s*([0-9][0-9.]*)/gi, (_, value) => {
    const n = Number(String(value).replace(/\./g, ""));
    return Number.isFinite(n) ? "rupiah " + numberToIndonesian(n) : value;
  });

  // Percentages: 25%
  s = s.replace(/\b([0-9]+(?:[.,][0-9]+)?)\s*%/g, (_, value) => {
    return value.replace(",", " koma ") + " persen";
  });

  // Clock times: 07.30 / 7:30
  s = s.replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g, (_, h, m) => {
    return numberToIndonesian(Number(h)) + " lewat " + numberToIndonesian(Number(m)) + " menit";
  });

  // Dates: 1/10/2026 or 01-10-2026
  s = s.replace(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g, (_, d, m, y) => {
    const month = MONTHS[String(m).padStart(2, "0")];
    return month ? numberToIndonesian(Number(d)) + " " + month + " " + numberToIndonesian(Number(y)) : _;
  });

  // Decimal numbers: 2,5 -> "dua koma lima"; 2.50 -> "dua koma lima nol".
  s = s.replace(/\b(\d+)[,](\d+)\b/g, (_, a, b) => {
    return numberToIndonesian(Number(a)) + " koma " +
      b.split("").map(d => UNITS[Number(d)]).join(" ");
  });

  // Decimal numbers with a dot: 2.5 / 2.50 -> "dua koma lima nol".
  // Three digits after a dot are intentionally left for the thousands rule below.
  s = s.replace(/\b(\d+)\.(\d{1,2})\b/g, (_, a, b) => {
    return numberToIndonesian(Number(a)) + " koma " +
      b.split("").map(d => UNITS[Number(d)]).join(" ");
  });

  // Indonesian thousands: 25.000 -> "dua puluh lima ribu".
  s = s.replace(/\b\d{1,3}(?:\.\d{3})+\b/g, value => {
    const n = Number(value.replace(/\./g, ""));
    return Number.isFinite(n) ? numberToIndonesian(n) : value;
  });

  // Remaining plain integers.
  s = s.replace(/\b\d{1,9}\b/g, (_, n) => numberToIndonesian(Number(n)));
  return s;
}

function normalizePunctuation(s) {
  s = s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*([,!?;:])\s*/g, "$1 ")
    .replace(/\s*\.\s*/g, ". ")
    .replace(/,{2,}/g, ",")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  // A colon usually works better as a short spoken pause than as a hard break.
  s = s.replace(/:\s*/g, ", ");

  return s;
}

function detectStyle(s) {
  const t = String(s || "").toLowerCase();
  const announcer = /\b(perhatian|harap diperhatikan|dimohon|diharapkan|kepada seluruh|diumumkan|pengumuman|diimbau)\b/.test(t);
  const narrative = /\b(pagi itu|siang itu|sore itu|malam itu|suasana|terasa|terdengar|sementara itu|di kejauhan|pada akhirnya)\b/.test(t);
  const question = /\?\s*$/.test(t);
  if (announcer) return "announcer";
  if (narrative) return "narrative";
  if (question) return "question";
  return "natural";
}

function humanizePhrasing(s, style = "natural") {
  s = s
    .replace(/\b(assalamualaikum(?: warahmatullahi wabarakatuh)?)\s*/gi, "$1. ")
    .replace(/\b(selamat pagi|selamat siang|selamat sore|selamat malam)\s+/gi, "$1, ")
    .replace(/\b(terima kasih)\s+(atas|untuk)\b/gi, "$1, $2");

  // Only preserve/introduce light boundaries at clear Indonesian discourse
  // openings. Do not add a comma after ordinary words such as "segera".
  s = s.replace(
    /\b(baik|nah|jadi|sekarang|kemudian|selanjutnya)\s+(?=[A-Za-zÀ-ÿ])/gi,
    "$1, "
  );

  // Long clauses get one boundary at a strong conjunction.
  s = s.replace(
    /([^.!?]{55,})\s+(tetapi|namun|sedangkan|sehingga|karena itu|oleh karena itu|meskipun)\s+/gi,
    "$1, $2 "
  );

  if (style === "announcer") {
    s = s.replace(/\b(kepada seluruh[^.!?]{10,80})\s+(dimohon|diharapkan)\b/gi, "$1, $2");
  }

  return s.replace(/\s+/g, " ").trim();
}

function addIndonesianCadence(s, style = "natural") {
  // v4 deliberately avoids global comma insertion. Supertonic already uses
  // punctuation as a prosody signal; excessive commas make speech chopped.
  // We add only one boundary for a long introductory context phrase.
  if (style === "narrative") {
    s = s.replace(
      /\b(pagi itu|siang itu|sore itu|malam itu|sementara itu|di kejauhan)\s+(?=[A-Za-zÀ-ÿ])/gi,
      "$1, "
    );
  }

  // In announcements, "Perhatian." remains a clean standalone callout.
  // Do not insert a pause after "segera" or "silakan"; that was too choppy.
  if (style === "announcer") {
    s = s.replace(/\b(perhatian)\s*\.\s*/gi, "$1. ");
  }

  return s.replace(/\s+/g, " ").trim();
}

function planSpeech(s, style = "natural") {
  // Human Prosody v4:
  // Keep ONE Edge TTS request. We guide the neural model with conservative
  // spoken-language boundaries instead of stitching multiple audio files.
  const sentences = s.split(/(?<=[.!?])\s+/);

  return sentences.map(sentence => {
    let out = sentence.trim();
    if (!out) return out;

    // Spoken openings: a short breath after a time/context phrase.
    out = out.replace(
      /^(pagi ini|siang ini|sore ini|malam ini|hari ini|saat ini|pada hari ini|dalam kesempatan ini|di kesempatan ini)\s+/i,
      "$1, "
    );

    // Natural introductory phrases. These are intentionally limited so the
    // engine does not acquire the "comma every few words" sound.
    out = out.replace(
      /^(setelah itu|setelah salat|setelah shalat|sebelum itu|selain itu|di sisi lain|pada akhirnya|dengan demikian)\s+/i,
      "$1, "
    );

    if (out.length >= 85) {
      out = out.replace(
        /^(.{42,88}?)\s+(tetapi|namun|sedangkan|sehingga|karena itu|oleh karena itu|agar|supaya|sementara|meskipun)\s+/i,
        "$1, $2 "
      );
    }

    // A long sentence often benefits from one additional boundary before
    // a clear transition. Never add more than one planner comma per sentence.
    if (out.length >= 125 && !/,/.test(out)) {
      out = out.replace(
        /^(.{48,100}?)\s+(kemudian|selanjutnya)\s+/i,
        "$1. $2, "
      );
    }

    // Questions are left intact so the neural model can preserve rising
    // question intonation from the final question mark.
    if (out.endsWith("?")) return out;

    if (style === "announcer") {
      out = out.replace(
        /\s+(perhatian|harap diperhatikan)\s+/i,
        ". $1, "
      );
    }

    return out;
  }).join(" ");
}

function addProsody(text, style = "auto") {
  let s = normalizeBase(text);
  s = expandAbbreviations(s);
  s = expandNumbers(s);
  s = s.replace(FILLERS, "");
  s = normalizePunctuation(s);
  const detectedStyle = style === "auto" ? detectStyle(s) : style;
  s = humanizePhrasing(s, detectedStyle);
  s = planSpeech(s, detectedStyle);
  s = addIndonesianCadence(s, detectedStyle);

  // A single explicit sentence-ending pause is preferable to many commas.
  // Keep punctuation as the main prosody signal for the Neural voice.
  s = s.replace(/\s*\.\s*/g, ". ");
  s = s.replace(/\s*,\s*/g, ", ");

  return s.replace(/\s+/g, " ").trim();
}

const ID_PROSODY = { addProsody, numberToIndonesian, detectStyle };

if (typeof window !== "undefined") {
  window.ID_PROSODY = ID_PROSODY;
}
