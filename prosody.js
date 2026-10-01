// Indonesian Prosody Engine v2
// Prepares Indonesian text for Microsoft Neural TTS.
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

function humanizePhrasing(s, style = "natural") {
  // Greetings should sound like a spoken opening, not a sentence fragment.
  s = s
    .replace(/\b(assalamualaikum(?: warahmatullahi wabarakatuh)?)\s*/gi, "$1. ")
    .replace(/\b(selamat pagi|selamat siang|selamat sore|selamat malam)\s+/gi, "$1, ")
    .replace(/\b(terima kasih)\s+(atas|untuk)\b/gi, "$1, $2");

  // Discourse markers get a light boundary, but only when they introduce
  // a clause. This avoids the "comma after every few words" effect.
  s = s
    .replace(/\b(baik|nah|jadi|sekarang|kemudian|selanjutnya),?\s+(?=[A-Za-zÀ-ÿ])/gi, "$1, ");

  // Only split long clauses. Short sentences sound more natural without
  // an artificial conjunction pause.
  s = s.replace(
    /([^.!?]{42,})\s+(tetapi|namun|sedangkan|sehingga|karena itu|oleh karena itu)\s+/gi,
    "$1, $2 "
  );

  // Natural Indonesian closings: a slightly stronger boundary before a
  // concluding phrase can improve cadence without changing the words.
  if (style === "formal") {
    s = s.replace(/\s+(dengan demikian|pada akhirnya)\s+/gi, ". $1, ");
  } else if (style === "announcer") {
    s = s.replace(/\s+(perhatian|harap diperhatikan)\s+/gi, ". $1, ");
  }

  return s.replace(/\s+/g, " ").trim();
}

function planSpeech(s, style = "natural") {
  // Keep the Neural engine in one synthesis request. We only improve the
  // text's clause boundaries; we never split the audio into multiple calls.
  const sentences = s.split(/(?<=[.!?])\s+/);

  return sentences.map(sentence => {
    if (sentence.length < 95) return sentence;

    let out = sentence.replace(
      /^(.{40,85}?)\s+(tetapi|namun|sedangkan|sehingga|karena|agar|supaya|sementara|kemudian|selanjutnya)\s+/i,
      "$1, $2 "
    );

    // For very long sentences, a single comma before a natural transition
    // is enough. Never add several artificial pauses to the same sentence.
    if (out === sentence && sentence.length >= 125) {
      out = sentence.replace(
        /^(.{45,95}?)\s+(dan)\s+/i,
        "$1, $2 "
      );
    }

    if (style === "announcer" && /^.{70,}\b(perhatian|harap diperhatikan)\b/i.test(out)) {
      out = out.replace(/\s+(perhatian|harap diperhatikan)\s+/i, ". $1, ");
    }

    return out;
  }).join(" ");
}

function addProsody(text, style = "natural") {
  let s = normalizeBase(text);
  s = expandAbbreviations(s);
  s = expandNumbers(s);
  s = s.replace(FILLERS, "");
  s = normalizePunctuation(s);
  s = humanizePhrasing(s, style);
  s = planSpeech(s, style);

  // A single explicit sentence-ending pause is preferable to many commas.
  // Keep punctuation as the main prosody signal for the Neural voice.
  s = s.replace(/\s*\.\s*/g, ". ");
  s = s.replace(/\s*,\s*/g, ", ");

  return s.replace(/\s+/g, " ").trim();
}

const ID_PROSODY = { addProsody, numberToIndonesian };

if (typeof window !== "undefined") {
  window.ID_PROSODY = ID_PROSODY;
}
