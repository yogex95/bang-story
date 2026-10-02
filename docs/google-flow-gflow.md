# Google Flow di Bang Story (via gflow, tidak resmi)

Bang Story bisa memakai **kredit langganan Google AI Pro/Ultra** milikmu untuk membuat gambar (Imagen,
Nano Banana) dan video (Veo) — tanpa API key Higgsfield. Karena Google **tidak menyediakan API publik
untuk Flow**, caranya memakai jembatan tidak resmi bernama **gflow** yang dijalankan di komputermu sendiri.

## Cara kerjanya (penjelasan metode gflow)

Bayangkan gflow sebagai "asisten" yang duduk di depan browser Chrome dan mengoperasikan situs Flow
untukmu, lewat pintu belakang yang biasa dipakai aplikasi web Flow itu sendiri:

1. **Kamu menjalankan server kecil di komputermu** (`gflow-openai serve`). Server ini menyediakan API
   web lokal di `http://127.0.0.1:8000` dengan format mirip API-nya OpenAI (`/v1/images/generations`,
   `/v1/videos`, dll). Server ini tidak bisa diakses dari internet — hanya dari komputermu.
2. **Kamu login sekali** dengan akun Google yang punya langganan AI Pro/Ultra
   (`gflow auth login --browser chrome`). gflow membuka Chrome asli, kamu login seperti biasa, dan sesi
   login itu disimpan di profil khusus di komputermu. Bang Story **tidak pernah** melihat email atau
   password Googlemu.
3. **Bang Story bicara ke server lokal itu**, bukan ke Google langsung. Saat kamu menekan "Buat gambar",
   Bang Story mengirim prompt ke `http://127.0.0.1:8000`, gflow meneruskannya ke API privat Flow memakai
   sesi loginmu, lalu mengembalikan hasilnya.
4. **Kredit yang terpotong adalah kredit langganan Flow-mu**, sama seperti kalau kamu generate manual di
   situs Flow. Bang Story tidak bisa melihat sisa kreditmu — pemakaiannya tercatat di akun Google-mu.

```
Bang Story ──HTTP lokal──► gflow-openai serve ──API privat──► Google Flow
(127.0.0.1:8000)              (Chrome + login akunmu)         (kredit Pro/Ultra)
```

Proyek yang dipakai adalah [haizhuflow2api](https://github.com/liuhaizhu996/haizhuflow2api) (turunan dari
`gflow-cli`): server API yang kompatibel OpenAI untuk gambar dan video di atas Google Flow.

> ⚠️ **Tidak resmi.** Ini reverse-engineer API privat Flow. Google bisa mengubahnya kapan saja tanpa
> pemberitahuan, dan kalau itu terjadi integrasinya bisa rusak mendadak sampai gflow diperbarui.
> Memakainya juga berarti mengotomatiskan akun Googlemu — ada risiko pembatasan dari sisi Google,
> walau selama ini dipakai wajar umumnya aman.

## Yang kamu butuhkan

- Komputer Windows/macOS/Linux dengan **Python 3.11+** dan **Google Chrome asli** terpasang
  (bukan Chromium biasa — login Google menolak banyak browser headless).
- Akun Google dengan **langganan Google AI Pro atau Ultra** (Flow butuh langganan berbayar).
- `gflow-openai serve` **harus menyala** setiap kali kamu mau generate via Flow di Bang Story.

## Instalasi (sekali saja)

Buka terminal (di Windows: PowerShell), lalu:

```bash
git clone https://github.com/Liuhaizhu996/haizhuflow2api.git
cd haizhuflow2api
python -m venv .venv
```

Aktifkan virtual environment, lalu pasang:

```bash
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

python -m pip install -e .
python -m playwright install chromium
```

Login sekali dengan akun Google-mu (Chrome asli akan terbuka):

```bash
gflow auth login --profile server --browser chrome
```

Ikuti proses login Google di jendela Chrome sampai selesai, lalu tutup.

## Menjalankan server (setiap mau dipakai)

Di terminal yang sama (venv aktif), jalankan dengan **kunci rahasia buatanmu sendiri**
(bebas, misalnya hasil `openssl rand -hex 32` — cukup sekali tentukan, lalu pakai terus):

```bash
# macOS/Linux:
GFLOW_OPENAI_API_KEY=kunci-rahasia-kamu GFLOW_OPENAI_PROFILE=server GFLOW_CLI_HEADLESS=false \
  gflow-openai serve --host 127.0.0.1 --port 8000
```

```powershell
# Windows (PowerShell):
$env:GFLOW_OPENAI_API_KEY="kunci-rahasia-kamu"
$env:GFLOW_OPENAI_PROFILE="server"
$env:GFLOW_CLI_HEADLESS="false"
gflow-openai serve --host 127.0.0.1 --port 8000
```

Biarkan terminal ini terbuka selama memakai Bang Story. Tes cepat di terminal lain:

```bash
curl http://127.0.0.1:8000/health/ready
# → {"status":"ready"} berarti server jalan DAN sudah login
```

## Menghubungkan ke Bang Story

1. Buka **Pengaturan › Layanan AI dan kunci**, bagian **Google Flow (tidak resmi)**.
2. Tempel **kunci yang sama persis** dengan `GFLOW_OPENAI_API_KEY` di atas ke kolom API key.
3. Klik **Tes koneksi**. Hasil "Terhubung · gflow siap" berarti semuanya beres — tanpa memotong kredit.

## Memakai di proyek

1. Di langkah **Ide cerita**, bagian **Model AI**, pilih model berlabel **Flow**:
   - Gambar: Imagen 4, Nano Banana 2, Nano Banana Pro.
   - Video: Veo Quality, Veo Fast, Veo Lite, Omni Flash.
2. Model Higgsfield dan Flow bisa dicampur bebas per proyek (misal gambar via Flow, video via
   Higgsfield) — Bang Story memilih jalur yang benar otomatis dari model yang kamu pilih.
3. Karena ini memakai langgananmu, **tidak ada perkiraan kredit** seperti di Higgsfield; yang tampil
   hanya pengingat bahwa server gflow harus menyala.

## Keterbatasan yang perlu kamu tahu

- **Tanpa lembar karakter.** API HTTP gflow belum bisa menerima gambar referensi, jadi untuk model
  gambar Flow, ciri tokoh dijaga lewat deskripsi kata-kata saja. Kalau konsistensi wajah/kostum sangat
  penting, pakai model Higgsfield yang mendukung lembar karakter.
- **Durasi video tetap:** 4, 6, atau 8 detik (10 detik hanya untuk Omni Flash). Bang Story otomatis
  memilih durasi terdekat yang menutupi panjang klip.
- **Satu per satu.** Server gflow hanya mengerjakan satu generate dalam satu waktu; antrean di Bang
  Story menyesuaikan (maks 2 job Flow berjalan).
- **Batal tidak menghentikan server.** Menekan batal menghentikan Bang Story menunggu, tapi generate
  yang sudah jalan di sisi gflow biasanya terus sampai selesai (kredit tetap terpotong).
- **Gambar Flow tidak bisa dilanjutkan setelah restart** (endpoint-nya sinkron), tapi **video Flow
  bisa** — Bang Story akan melanjutkan polling-nya saat aplikasi dibuka lagi.
- gflow memakai **Chrome asli yang terlihat** (headed). Jangan tutup jendela Chrome-nya selama generate.

## Kalau ada masalah

| Gejala | Artinya | Solusi |
|---|---|---|
| "Server gflow belum jalan" | `gflow-openai serve` tidak menyala | Jalankan server (lihat di atas) |
| "Terhubung · tapi gflow belum login" | Server jalan, sesi Google kedaluwarsa | Ulangi `gflow auth login --profile server --browser chrome` |
| "API key gflow salah" | Kunci di Bang Story beda dengan `GFLOW_OPENAI_API_KEY` | Samakan persis |
| Tiba-tiba semua generate gagal | Google mengubah API privatnya | Perbarui repo (`git pull`), atau tunggu update gflow; sementara pakai Higgsfield |
| Video macet di "Mengantre" | gflow masih mengerjakan job sebelumnya | Tunggu — server hanya satu per satu |

Detail teknis untuk pengembang ada di [layanan-ai.md](layanan-ai.md#google-flow-tidak-resmi-servicesflow-bridgets-sharedflowts).
