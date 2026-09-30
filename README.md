# TTS Khas Indonesia

PWA Text-to-Speech dengan pemrosesan Bahasa Indonesia.

## V1
- PWA responsif
- Normalisasi angka dan beberapa singkatan Indonesia
- Jeda berbasis tanda baca
- Preset Natural, Formal, Ramah, Penyiar
- Voice engine dipisahkan dari pemrosesan teks
- Output audio MP3

## Mesin TTS gratis

Versi server saat ini memakai **TTS.ai + Piper voice Indonesia**. TTS.ai menyediakan akses gratis untuk model open-source seperti Piper; halaman Indonesian TTS mereka mencantumkan voice **News (Indonesian)** sebagai voice gratis. Untuk penggunaan tanpa login, batas yang terdokumentasi saat ini adalah 500 karakter per permintaan. 

API key tidak diperlukan untuk jalur anonymous yang digunakan proyek ini.

### Arsitektur

`PWA → normalisasi Bahasa Indonesia → /api/synthesize → TTS.ai → Piper Indonesian → MP3`

Endpoint `/api/synthesize` bertugas sebagai proxy server agar frontend tidak perlu mengetahui detail provider.

## Catatan

- Batas anonymous saat ini: 500 karakter per permintaan.
- Jika nanti diperlukan teks lebih panjang, kita dapat menambahkan akun gratis TTS.ai atau membuat sistem pemotongan teks dan penggabungan audio.
- Jangan memasukkan API key provider ke JavaScript frontend.
- Kualitas suara harus diuji dengan kalimat Bahasa Indonesia nyata sebelum kita menyebutnya sebagai engine final.

## Roadmap

1. Uji suara Piper Indonesia dengan berbagai kalimat nyata.
2. Perbaiki normalisasi angka, tanggal, jam, rupiah, persen, gelar, dan istilah Arab/Indonesia.
3. Buat preset Natural, Formal, Ramah, Penyiar benar-benar memengaruhi prosody.
4. Tambahkan pemrosesan teks panjang.
5. Bandingkan engine gratis lain bila diperlukan.
