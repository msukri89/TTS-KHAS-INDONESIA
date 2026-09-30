// Indonesian Prosody Engine — safe text preparation for the TTS server.
const ID_PROSODY = {
  fillers: /\b(eee+|hmm+|umm+|em+|eh)\b/gi
};

function numberToIndonesian(n) {
  const u = ["nol","satu","dua","tiga","empat","lima","enam","tujuh","delapan","sembilan"];
  function under1000(x) {
    if (x < 10) return u[x];
    if (x < 20) return x === 10 ? "sepuluh" : x === 11 ? "sebelas" : u[x - 10] + " belas";
    if (x < 100) return u[Math.floor(x / 10)] + " puluh" + (x % 10 ? " " + u[x % 10] : "");
    return u[Math.floor(x / 100)] + " ratus" + (x % 100 ? " " + under1000(x % 100) : "");
  }
  if (n < 1000) return under1000(n);
  if (n < 1000000) return under1000(Math.floor(n / 1000)) + " ribu" + (n % 1000 ? " " + under1000(n % 1000) : "");
  if (n < 1000000000) return under1000(Math.floor(n / 1000000)) + " juta" + (n % 1000000 ? " " + numberToIndonesian(n % 1000000) : "");
  return String(n);
}

function expandIndonesian(text) {
  let s = String(text || "").normalize("NFC")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  s = s
    .replace(/\b(Dr|dr)\.?\b/g, "doktor")
    .replace(/\b(No|no)\.?\b/g, "nomor")
    .replace(/\b(Jl|jl)\.?\b/g, "jalan")
    .replace(/\b(Yth|yth)\.?\b/g, "yang terhormat");

  s = s.replace(/\b(\d{1,9})\b/g, (_, n) => numberToIndonesian(Number(n)));
  s = s.replace(ID_PROSODY.fillers, "");
  return s.replace(/\s+/g, " ").trim();
}

function addProsody(text, style = "natural") {
  let s = expandIndonesian(text);
  // Keep output plain text: Piper should receive text, not SSML markup.
  if (style === "announcer") s = s.replace(/\s*,\s*/g, ", ");
  if (style === "formal") s = s.replace(/\s*,\s*/g, ", ");
  if (style === "friendly") s = s.replace(/\s*,\s*/g, ", ");
  return s;
}

if (typeof window !== "undefined") window.ID_PROSODY = { addProsody, expandIndonesian, numberToIndonesian };
