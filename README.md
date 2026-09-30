# TTS Khas Indonesia

PWA Text-to-Speech dengan pemrosesan Bahasa Indonesia.

## V1
- PWA responsif
- Normalisasi angka dan beberapa singkatan Indonesia
- Jeda berbasis tanda baca
- Preset Natural, Formal, Ramah, Penyiar
- Pemilihan voice Bahasa Indonesia yang tersedia di perangkat/browser
- Voice engine dipisahkan dari pemrosesan teks agar dapat diganti dengan engine server yang lebih realistis

## Roadmap
1. Indonesian prosody engine
2. Server TTS adapter
3. Export MP3/WAV
4. Voice presets dan ekspresi
5. Pengujian kalimat Bahasa Indonesia nyata


## Server TTS

Production synthesis uses Google Cloud Text-to-Speech with Indonesian Chirp 3: HD voices. The browser must call the server endpoint; the Google API key must never be placed in frontend JavaScript.

### Environment variable

Set `GOOGLE_TTS_API_KEY` in the hosting provider's server environment. Do not commit the real key.

The current server endpoint is `/api/synthesize`. It returns base64 MP3 audio.

### Current architecture

`PWA → Indonesian text normalization/prosody → /api/synthesize → Google Chirp 3: HD → MP3`

Chirp 3: HD supports Indonesian `id-ID` voices and MP3 output. It does not accept the normal `speakingRate` and `pitch` audio parameters, so the server intentionally does not send those fields.
