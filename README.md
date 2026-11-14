# Ular Tangga Doodle Dash

Game web multiplayer 3D bergaya **Semi-Doodle** di atas kertas buku catatan: 100 kotak dengan tantangan unik di setiap kotak (kotak 2–99 + Bos Doodle di kotak 100), lengkap dengan animasi lucu, mode Online Multiplayer, Mode Lokal (Hot-Seat), dan Lawan Bot!

## Struktur Monorepo

- `packages/shared` (`@doodle-dash/shared`): aturan murni (deterministik, tanpa DOM), RNG berbasis seed, state machine, registry archetype tantangan, generator `data/tiles.json`, skema protokol Zod, simulasi massal, dan unit test Vitest.
- `apps/server` (`@doodle-dash/server`): server otoritatif Node.js + TypeScript + Socket.IO + Zod (room 4 huruf, validasi tantangan anti-cheat, reconnect 60 detik dengan takeover bot otomatis, emote, penonton).
- `apps/client` (`@doodle-dash/client`): web app Vite + TypeScript + Three.js + GSAP dengan toon shading 3-band, outline doodle bergetar (boiling line ~9 fps), papan diorama 4 zona, audio prosedural Web Audio, dan UI mobile portrait-first.
- `data/board.json` & `data/tiles.json`: konfigurasi papan (ular, tangga, zona) dan 100 definisi kotak deterministik.

## Cara Menjalankan

```bash
npm install
npm run generate:tiles   # opsional: regenerasi data/tiles.json secara deterministik
npm run dev              # menyalakan server dan client bersamaan
```

## Pengujian & Debug

```bash
npm test                 # jalankan unit test Vitest
npm run sim              # simulasi 1.000 pertandingan bot-vs-bot
npm run build            # kompilasi shared, server, dan client
```

- **Panel Debug**: Buka client dengan query `?debug=1` (mis. `http://localhost:5173/?debug=1`) saat bermain di mode Lokal/Bot untuk memaksa angka dadu, lompat ke kotak tertentu (`1–100`), atau memicu archetype tantangan apa pun secara langsung, sekaligus memantau FPS & draw call.

## Aturan Gameplay

1. **Gerak & Dadu**: Lempar 1d6 (atau tekan **Spasi**). Angka 6 mendapat lemparan tambahan (maksimal 2 kali beruntun). Mendarat di kotak 100 harus pas; jika berlebih, pion memantul mundur sejumlah sisa langkah.
2. **Preset Aturan**:
   - **Klasik Seru**: aturan standar 100 petak seimbang.
   - **Mode Kilat**: mulai dengan 1 item + 2 bintang serta bonus langkah ekstra lebih cepat.
   - **Pesta Item**: mulai dengan 1 item dan peluang drop item jauh lebih tinggi.
3. **Urutan Resolusi Mendarat**:
   - Jalankan **17 variasi mini-game** unik pada kotak 2–99 (`tap_timing`, `quick_quiz`, `memory_doodle`, `spam_tap`, `swipe_dodge`, `shadow_match`, `quick_math`, `word_scramble`, `trace_line`, `lucky_wheel`, `stroop_color`, `quick_duel`, `gift_trap`, `bubble_pop`, `rhythm_clap`, `color_count`, `balance_bar`), kecuali kotak 1.
   - Terapkan hasil tantangan (bintang ★, bonus maju/perisai/dadu ekstra, atau penalti mundur/lewat giliran).
   - Cek tangga/ular pada kotak mendarat:
     - **Pangkal tangga**: pion memanjat ke puncak tangga.
     - **Kepala ular**: ular menggigit turun ke ekor, **KECUALI** pemain menang tantangan kotak tersebut (ular tertawa!) atau memiliki **Perisai Anti-Ular**.
   - **Tanpa rantai efek**: kotak tujuan tangga/ular atau bonus/penalti gerak tidak memicu tantangan ataupun tangga/ular lagi di giliran yang sama.
4. **Item (Maksimal 2 di Inventaris)**:
   - **Perisai Anti-Ular**: menangkis 1 gigitan ular (otomatis terpakai jika masih tersimpan di inventaris, atau diaktifkan sebelum melempar).
   - **Dadu Emas**: melempar 2 dadu emas 3D dan memilih salah satu angka.
   - **Rem Mendadak**: membatasi lemparan dadu berikutnya maksimal angka 3 (1–3).
   - **Kotak Kejutan**: memicu salah satu dari 4 efek acak lucu secara deterministik.
   - **Magnet Bintang**: menarik 1 bintang dari pemimpin klasemen (atau +1 bintang bonus).
   - **Sepatu Turbo**: menambahkan +2 langkah ekstra pada lemparan dadu berikutnya.
5. **Anti-Frustrasi**:
   - Pemain di posisi paling belakang mendapat peluang drop item lebih besar saat menang tantangan.
   - Maksimal 2 penalti giliran berturut-turut; penalti ke-3 berturut-turut otomatis diselamatkan (*Kartu Kasihan*).
6. **Kemenangan**: Pemain pertama yang mendarat tepat di kotak 100 dan lulus tantangan final **Bos Doodle** menjadi juara. Bintang ★ menjadi skor sekunder dan penentu peringkat podium beserta gelar superlatif & rekor lokal.

## Cara Menambah Tantangan Baru (Registry Archetype)

1. Tambahkan nama archetype ke union `ChallengeArchetype` di `packages/shared/src/types.ts`.
2. Daftarkan spesifikasi archetype baru di `ARCHETYPE_REGISTRY` pada `packages/shared/src/content/archetypes.ts` (lengkapi `displayName`, `instruction`, `baseDurationMs`, `allowedModes`, `buildParams`, `validate`, dan `simulateBot`), lalu masukkan ID-nya ke `PLAYABLE_TILE_ARCHETYPES`.
3. Tambahkan template judul di `ARCHETYPE_TITLE_TEMPLATES` pada `packages/shared/src/generator/generateTiles.ts` dan jalankan `npm run generate:tiles`.
4. Tambahkan renderer mini-game interaktifnya pada registry mini-game client di `apps/client/src/challenges/`.

## Asumsi yang Diambil

- **Kegagalan pada Bos Doodle (Kotak 100)**: Jika pemain gagal menaklukkan Bos Doodle, pion otomatis dipantulkan mundur 3 kotak (ke kotak 97) tanpa diselamatkan Kartu Kasihan agar pemain tidak terjebak diam di kotak 100.
- **Bonus `advance` pada Kotak Biasa/Tangga**: Bonus maju dibatasi maksimal hingga kotak 99 sehingga garis finish kotak 100 dan Bos Doodle tetap harus dimasuki lewat lemparan dadu yang pas.
- **Mode `all_play` di Mode Lokal (Hot-Seat)**: Pada satu perangkat, tantangan `all_play` dijalankan bergiliran cepat antar pemain manusia atau langsung oleh pemain aktif + simulasi bot agar kontrol satu jari di ponsel tetap nyaman.
- **Mode Ramah Buta Warna pada Stroop**: Selain membedakan warna kontras tinggi, mode aksesibilitas menampilkan ikon bentuk penanda di tiap tombol warna agar pemain tetap dapat bermain adil.
