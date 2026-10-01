import { loadEngine, loadStyle, wavBlob } from "./supertonic-engine.js";

const $ = (s) => document.querySelector(s);
const text = $("#text");
const voice = $("#voice");
const rate = $("#rate");
const steps = $("#steps");
const status = $("#status");
const audio = $("#audio");
const download = $("#download");
const speak = $("#speak");
const stop = $("#stop");
const loader = $("#loader");
const loaderBar = $("#loaderBar");
const loaderText = $("#loaderText");
const backend = $("#backend");
let engine = null;
let currentUrl = null;
let stopped = false;

function setLoader(pct, msg) {
  loaderBar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  loaderText.textContent = msg;
}

async function boot() {
  speak.disabled = true;
  setLoader(2, "Menyiapkan mesin Supertonic 3…");
  try {
    let result;
    try {
      setLoader(8, "Mencoba WebGPU…");
      result = await loadEngine("webgpu", (name, i, total) => {
        setLoader(10 + (i / total) * 72, "Memuat " + name + "…");
      });
    } catch (webgpuError) {
      console.warn("WebGPU gagal, mencoba WASM:", webgpuError);
      setLoader(12, "WebGPU tidak tersedia. Beralih ke WASM…");
      result = await loadEngine("wasm", (name, i, total) => {
        setLoader(15 + (i / total) * 68, "Memuat " + name + "…");
      });
    }
    engine = result.tts;
    backend.textContent = result.backend === "webgpu" ? "WebGPU" : "WASM";
    setLoader(90, "Memuat suara " + voice.value + "…");
    await loadStyle(voice.value);
    setLoader(100, "Supertonic 3 siap digunakan.");
    setTimeout(() => loader.classList.add("done"), 500);
    speak.disabled = false;
    status.textContent = "Siap. Mesin berjalan langsung di perangkat.";
  } catch (e) {
    console.error(e);
    setLoader(100, "Gagal memuat mesin: " + (e?.message || e));
    status.textContent = "Gagal memuat Supertonic. Coba Chrome terbaru dan koneksi stabil.";
  }
}

async function generate() {
  const raw = text.value.trim();
  if (!raw) {
    status.textContent = "Masukkan teks terlebih dahulu.";
    return;
  }
  if (!engine) {
    status.textContent = "Mesin masih dimuat.";
    return;
  }

  stopped = false;
  speak.disabled = true;
  stop.disabled = false;
  audio.hidden = true;
  download.hidden = true;
  status.textContent = "Menghasilkan suara di perangkat…";

  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }

  try {
    const style = await loadStyle(voice.value);
    const started = performance.now();
    const result = await engine.synthesize(
      window.ID_PROSODY?.addProsody(raw, "natural") || raw,
      "id",
      style,
      Number(steps.value),
      Number(rate.value),
      (step, total) => {
        if (!stopped) status.textContent = "Sintesis lokal… langkah " + step + "/" + total;
      }
    );

    if (stopped) return;

    const blob = wavBlob(result.wav, engine.sampleRate);
    currentUrl = URL.createObjectURL(blob);
    audio.src = currentUrl;
    audio.hidden = false;
    download.href = currentUrl;
    download.download = "tts-khas-indonesia-supertonic.wav";
    download.hidden = false;

    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    status.textContent = "Selesai • " + result.duration.toFixed(1) + " detik audio • proses " + elapsed + " detik • " + backend.textContent;
  } catch (e) {
    console.error(e);
    status.textContent = "Gagal membuat suara: " + (e?.message || e);
  } finally {
    speak.disabled = false;
    stop.disabled = false;
  }
}

speak.addEventListener("click", generate);
stop.addEventListener("click", () => {
  stopped = true;
  audio.pause();
  status.textContent = "Dihentikan.";
  speak.disabled = false;
});

voice.addEventListener("change", () => {
  if (engine) status.textContent = "Suara " + voice.value + " dipilih.";
});

text.addEventListener("input", () => {
  $("#count").textContent = text.value.length.toLocaleString("id-ID") + " karakter";
});
rate.addEventListener("input", () => $("#ratev").textContent = Number(rate.value).toFixed(2) + "×");
steps.addEventListener("input", () => $("#stepsv").textContent = steps.value);

$("#clear").addEventListener("click", () => {
  text.value = "";
  text.dispatchEvent(new Event("input"));
});

text.dispatchEvent(new Event("input"));
rate.dispatchEvent(new Event("input"));
steps.dispatchEvent(new Event("input"));

boot();
