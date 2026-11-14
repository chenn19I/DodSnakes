import type {
  BoardLayout,
  ChallengeArchetype,
  ChallengeMode,
  ChallengePenalty,
  ChallengeReward,
  Tile,
  ZoneId,
} from '../types.js';
import { SeededRng, hashSeed } from '../rng.js';
import {
  ARCHETYPE_REGISTRY,
  PLAYABLE_TILE_ARCHETYPES,
} from '../content/archetypes.js';
import { ZONE_FLAVOR_PREFIXES } from '../content/wordBank.js';
import { getZoneForTile } from '../engine/boardUtils.js';

export const DEFAULT_TILE_GENERATOR_SEED = 20261113;

const ARCHETYPE_TITLE_TEMPLATES: Record<ChallengeArchetype, string[]> = {
  start: ['Garis Start Ceria'],
  tap_timing: [
    'Jarum Lincah',
    'Ketuk Pas Sasaran',
    'Tepat di Hijau!',
    'Refleks Jarum Kertas',
    'Bidik Zona Aman',
    'Detak Jantung Doodle',
    'Ketukan Sepersekian Detik',
    'Stop Jarum Nakal!',
  ],
  quick_quiz: [
    'Kuis Kilat Cerdas',
    'Tanya Jawab Dadakan',
    'Tes Otak Santai',
    'Cerdas Cermat Kertas',
    'Tebak Pintar!',
    'Kuis Warung Kopi',
    'Ujian Kilat Papan',
    'Soal Receh Bermutu',
  ],
  memory_doodle: [
    'Ingatan Super',
    'Urutan Gambar Lucu',
    'Jangan Lupa Urutannya!',
    'Memori Kertas Gambar',
    'Simpan di Kepala!',
    'Jejak Stiker Rahasia',
    'Tebak Ulang Pola',
    'Catatan Ingatan Mini',
  ],
  spam_tap: [
    'Jari Turbo!',
    'Ketuk Tanpa Ampun',
    'Tepuk Kilat 5 Detik',
    'Lomba Ketuk Papan',
    'Palu Kertas Ngebut',
    'Serbuan Jari Jempol',
    'Pompa Balon Doodle',
    'Kebut Ketukan Maksimal',
  ],
  swipe_dodge: [
    'Awas Tinta Jatuh!',
    'Geser Lincah 3 Jalur',
    'Hindari Batu Coretan',
    'Slalom Pensil Cepat',
    'Lompat Kiri Kanan!',
    'Jalan Licin Berbahaya',
    'Zigzag Selamatkan Pion',
    'Tarian Anti Kepentok',
  ],
  shadow_match: [
    'Siluet Misterius',
    'Siapa di Balik Bayangan?',
    'Cocokkan Bayangan',
    'Detektif Sketsa Hitam',
    'Bayangan Menggeliat',
    'Tebak Bentuk Asli!',
    'Lampu Senter Doodle',
    'Kenali Sosok Gelap',
  ],
  quick_math: [
    'Hitung Cepat Ceria',
    'Matematika Jajanan',
    'Kalkulator Kertas',
    'Tambah Kali Kilat',
    'Angka Melompat!',
    'Otak Encer 7 Detik',
    'Berhitung Sambil Jalan',
    'Teka-Teki Angka Lucu',
  ],
  word_scramble: [
    'Huruf Acak-Adul',
    'Susun Kata Nusantara',
    'Merangkai Kata Doodle',
    'Anagram Kertas Kusut',
    'Rapiin Hurufnya!',
    'Tebak Kata Tersembunyi',
    'Kamus Mini Melompat',
    'Puzzle Kata Santai',
  ],
  trace_line: [
    'Ikuti Garis Putus',
    'Menelusuri Tinta Halus',
    'Jalur Pensil Ajaib',
    'Jangan Keluar Jalur!',
    'Lukis Jejak Bintang',
    'Tarik Garis Mulus',
    'Peta Harta Kertas',
    'Coretan Tangan Rapi',
  ],
  lucky_wheel: [
    'Roda Nasib Doodle',
    'Putar Roda Keberuntungan',
    'Siap-Siap Deg-Degan!',
    'Roda Kejutan Papan',
    'Undian Tinta Emas',
    'Putaran Takdir Ceria',
    'Bintang atau Kepeleset?',
    'Roda Gacha Kertas',
  ],
  stroop_color: [
    'Awas Ketipu Kata!',
    'Baca Tinta Bukan Tulisan',
    'Tebak Warna Asli',
    'Uji Fokus Pelangi',
    'Mata Jeli Doodle',
    'Warna Penuh Tipuan',
    'Fokus Tinta Warna!',
    'Trik Otak Warna-Warni',
  ],
  quick_duel: [
    'Duel Kilat 1v1!',
    'Tantang Lawanmu!',
    'Adu Cepat Reaksi',
    'Siapa Paling Sigap?',
    'Tanding Refleks Papan',
    'Tatap-Tatapan Dulu!',
    'Duel Stiker Cepat',
    'Tangkap Duluan Menang!',
  ],
  gift_trap: [
    'Kotak Kejutan Spontan',
    'Eh, Ada Sesuatu!',
    'Buka Bingkisan Papan',
    'Hadiah atau Jebakan?',
    'Kejutan Tanpa Peringatan',
    'Misteri Sudut Kertas',
    'Bonus atau Kepeleset?',
    'Kotak Iseng Beraksi',
  ],
  bubble_pop: [
    'Pecahkan Gelembung!',
    'Letupkan Tinta Ceria',
    'Gelembung Sabun Doodle',
    'Awas Gelembung Bom!',
    'Jari Gesit Pencet Balon',
    'Hujan Gelembung Warna',
    'Klik Sebelum Meletus!',
    'Festival Gelembung Papan',
  ],
  rhythm_clap: [
    'Tepuk Irama Doodle',
    'Ikuti Ketukan Drum!',
    'Konser Kertas Ceria',
    'Detak Musik Santai',
    'Jangan Kelewatan Beat!',
    'Harmoni Stiker Musik',
    'Ketuk Pas Irama!',
    'Band Mini Papan',
  ],
  color_count: [
    'Hitung Cepat Warna!',
    'Brankas Bentuk Lucu',
    'Mata Jeli Penghitung',
    'Cari & Hitung Stiker',
    'Sensus Gambar Kertas',
    'Berapa Jumlahnya Hayo?',
    'Survei Kilat Doodle',
    'Detektif Angka & Bentuk',
  ],
  balance_bar: [
    'Jaga Keseimbangan Pensil!',
    'Tali Goyang Kertas',
    'Jangan Sampai Oleng!',
    'Akrobat Penggaris Mini',
    'Stabil di Zona Hijau',
    'Angin Kencang Menerpa!',
    'Tahan Posisi Tengah!',
    'Juara Keseimbangan Papan',
  ],
  pair_flip: [
    'Cari Pasangan Kartu!',
    'Memori Kartu Stiker',
    'Cocokkan 2 Gambar Sama',
    'Tebak Kartu Tertutup',
    'Ingatan Cepat Doodle',
    'Buka & Jodohkan!',
    'Kembar Identik Papan',
    'Pasangan Kilat Sketchbook',
  ],
  number_order: [
    'Urutkan Angka Cepat!',
    'Tangga Angka Berurutan',
    'Susun Nilai yang Tepat',
    'Kecil ke Besar atau Sebaliknya!',
    'Ketuk Angka Berantai',
    'Tes Fokus Bilangan',
    'Balapan Urutan Angka',
    'Antrean Angka Ajaib',
  ],
  odd_one_out: [
    'Cari Yang Beda Sendiri!',
    'Mana Stiker Penyusup?',
    'Mata Elang Papan!',
    'Satu Gambar Tak Sama',
    'Tebak Yang Paling Unik',
    'Detektif Perbedaan Kilat',
    'Temukan Anomali Doodle!',
    'Fokus! Cari Si Nyeleneh',
  ],
  pattern_next: [
    'Lanjutkan Polanya!',
    'Tebak Stiker Berikutnya',
    'Irama Gambar Berulang',
    'Kunci Pola Sketchbook',
    'Apa Setelah Ini?',
    'Puzzle Seri Doodle',
    'Lengkapi Barisan Stiker',
    'Detektif Pola Pintar',
  ],
  math_compare: [
    'Mana Paling Besar/Kecil?',
    'Timbangan Hitung Cepat!',
    'Adu Nilai Matematika',
    'Bandingkan 3 Kartu!',
    'Tebak Hasil Ekstrem!',
    'Siapa Jawabannya Tertinggi?',
    'Kalkulator Crayon Kilat',
    'Jagoan Perbandingan Angka',
  ],
  target_sum: [
    'Kombinasi Angka Pas!',
    'Cari 2 Kartu Target',
    'Pasangan Penjumlahan Kilat',
    'Cocokkan Total Target!',
    'Teka-Teki Dua Angka',
    'Tambah Jadi Pas!',
    'Rumus Dua Kartu Ceria',
    'Kombo Angka Rahasia',
  ],
  arrow_blitz: [
    'Panah Kilat Beruntun!',
    'Ikuti Arah Panah',
    'Kompas Crayon Cepat',
    'Arah Mata Angin Mini',
    'Tes Refleks 4 Arah',
    'Panah Zigzag Kertas',
    'Navigasi Cepat Doodle',
    'Balapan Panah Akurat',
  ],
  boss_doodle: ['Bos Doodle: Raja Coretan!'],
};

const ZONE_ADJECTIVES: Record<ZoneId, string[]> = {
  taman_permen: ['Gula Kapas', 'Lolipop', 'Stroberi', 'Wafel', 'Permen Karet', 'Biskuit'],
  hutan_ngantuk: ['Jamur Menguap', 'Lumut Empuk', 'Tupai Molor', 'Daun Gugur', 'Kunang-Kunang', 'Bantal Kayu'],
  gunung_es: ['Salju Vanila', 'Es Serut', 'Penguin Imut', 'Kristal Dingin', 'Sirup Biru', 'Gletser Mini'],
  kastil_awan: ['Pelangi Emas', 'Menara Kapas', 'Bintang Jatuh', 'Mahkota Awan', 'Langit Senja', 'Kertas Terbang'],
};

function distributeArchetypes(rng: SeededRng, count: number): ChallengeArchetype[] {
  const n = PLAYABLE_TILE_ARCHETYPES.length;
  const baseCount = Math.floor(count / n);
  const extraCount = count % n;

  const counts = new Map<ChallengeArchetype, number>();
  const shuffledOrder = rng.shuffle(PLAYABLE_TILE_ARCHETYPES);
  shuffledOrder.forEach((arch, idx) => {
    counts.set(arch, baseCount + (idx < extraCount ? 1 : 0));
  });

  const result: ChallengeArchetype[] = [];
  let prev: ChallengeArchetype | null = null;

  for (let i = 0; i < count; i++) {
    const candidates = PLAYABLE_TILE_ARCHETYPES.filter(
      (a) => a !== prev && (counts.get(a) ?? 0) > 0,
    );
    if (candidates.length === 0) {
      // Fallback: pick any with count > 0 and swap backward if needed
      const fallback = PLAYABLE_TILE_ARCHETYPES.find((a) => (counts.get(a) ?? 0) > 0)!;
      result.push(fallback);
      counts.set(fallback, (counts.get(fallback) ?? 1) - 1);
      prev = fallback;
      continue;
    }

    // Prefer archetypes with highest remaining count to prevent getting stuck at the end
    let maxRem = 0;
    for (const c of candidates) {
      maxRem = Math.max(maxRem, counts.get(c) ?? 0);
    }
    const topCandidates = candidates.filter((c) => (counts.get(c) ?? 0) >= maxRem - 1);
    const chosen = rng.pick(topCandidates);
    result.push(chosen);
    counts.set(chosen, (counts.get(chosen) ?? 1) - 1);
    prev = chosen;
  }

  // Verify and repair any accidental adjacent duplicates at the tail
  for (let i = 1; i < result.length; i++) {
    if (result[i] === result[i - 1]) {
      for (let j = 0; j < result.length; j++) {
        if (
          j !== i &&
          result[j] !== result[i] &&
          (j === 0 || result[j - 1] !== result[i]) &&
          (j === result.length - 1 || result[j + 1] !== result[i]) &&
          result[j] !== result[i - 1] &&
          (i === result.length - 1 || result[j] !== result[i + 1])
        ) {
          [result[i], result[j]] = [result[j], result[i]];
          break;
        }
      }
    }
  }

  return result;
}

export function generateTiles(board: BoardLayout, seed = DEFAULT_TILE_GENERATOR_SEED): Tile[] {
  const rng = new SeededRng(seed);
  const ladderStarts = new Set(board.ladders.map((l) => l.from));
  const snakeHeads = new Set(board.snakes.map((s) => s.from));

  const assignedArchetypes = distributeArchetypes(rng, 98); // tiles 2..99
  const archCounters = new Map<ChallengeArchetype, number>();
  const usedTitles = new Set<string>();

  const tiles: Tile[] = [];

  // Tile 1: Start
  tiles.push({
    id: 1,
    zone: 'taman_permen',
    archetype: 'start',
    mode: 'solo',
    difficulty: 1,
    title: 'Garis Start Ceria',
    flavorText: 'Semua pion berbaris rapi di sudut halaman buku catatan!',
    params: {},
    reward: { stars: 0, bonusType: 'none' },
    penalty: { type: 'none' },
  });

  // Tiles 2..99
  for (let tileId = 2; tileId <= 99; tileId++) {
    const zone = getZoneForTile(tileId);
    const difficulty =
      zone === 'taman_permen' ? 1 : zone === 'hutan_ngantuk' ? 2 : zone === 'gunung_es' ? 3 : 4;

    const archetype = assignedArchetypes[tileId - 2];
    const spec = ARCHETYPE_REGISTRY[archetype];
    const tileRng = new SeededRng(hashSeed(seed, tileId, archetype));

    const occIndex = archCounters.get(archetype) ?? 0;
    archCounters.set(archetype, occIndex + 1);

    // Choose mode: quick_duel is duel, all other tiles are strictly solo
    const mode: ChallengeMode = archetype === 'quick_duel' ? 'duel' : 'solo';

    // Build unique title
    const templates = ARCHETYPE_TITLE_TEMPLATES[archetype];
    const baseTitle = templates[occIndex % templates.length];
    const zoneTag = ZONE_ADJECTIVES[zone][(tileId + occIndex) % ZONE_ADJECTIVES[zone].length];
    let title = `${baseTitle}: ${zoneTag}`;
    if (usedTitles.has(title)) {
      title = `${title} #${tileId}`;
    }
    usedTitles.add(title);

    // Build unique flavor text
    const prefixes = ZONE_FLAVOR_PREFIXES[zone];
    const prefix = prefixes[(tileId * 3 + occIndex) % prefixes.length];
    const modeNote =
      mode === 'duel'
        ? 'Saatnya pilih satu rival untuk adu cepat!'
        : spec.instruction;
    const specialNote = snakeHeads.has(tileId)
      ? ' Hati-hati, kepala ular mengintip. Menanglah supaya dia cuma ketawa!'
      : ladderStarts.has(tileId)
        ? ' Ada pangkal tangga emas menantimu naik!'
        : '';
    const flavorText = `${prefix} ${modeNote}${specialNote} (Kotak ${tileId})`;

    const params = spec.buildParams(tileRng, difficulty, tileId);

    // Reward & Penalty (safe around ladders & snakes)
    const stars = difficulty === 1 ? 2 : difficulty === 2 ? 2 : difficulty === 3 ? 3 : 4;
    let reward: ChallengeReward;
    const bonusRoll = tileRng.next();
    if (!ladderStarts.has(tileId) && bonusRoll < 0.36) {
      reward = {
        stars,
        bonusType: 'advance',
        bonusValue: tileRng.nextInt(1, difficulty >= 3 ? 3 : 2),
      };
    } else if (bonusRoll < 0.56) {
      reward = { stars, bonusType: 'shield', bonusValue: 1 };
    } else if (bonusRoll < 0.72) {
      reward = { stars, bonusType: 'extra_dice', bonusValue: 1 };
    } else {
      reward = { stars: stars + 1, bonusType: 'none' };
    }

    let penalty: ChallengePenalty;
    if (snakeHeads.has(tileId) || ladderStarts.has(tileId)) {
      // Snake head already carries snake bite risk; ladder should remain rewarding
      penalty = tileRng.chance(0.25) ? { type: 'skip_turn', value: 1 } : { type: 'none' };
    } else {
      const penRoll = tileRng.next();
      if (penRoll < 0.45) {
        penalty = { type: 'retreat', value: tileRng.nextInt(1, Math.min(3, difficulty)) };
      } else if (penRoll < 0.68) {
        penalty = { type: 'skip_turn', value: 1 };
      } else {
        penalty = { type: 'none' };
      }
    }

    // Gift/trap tiles derive reward/penalty directly from variant in engine, set clean defaults
    if (archetype === 'gift_trap') {
      reward = { stars: 2, bonusType: 'none' };
      penalty = { type: 'none' };
    }

    tiles.push({
      id: tileId,
      zone,
      archetype,
      mode,
      difficulty,
      title,
      flavorText,
      params,
      reward,
      penalty,
    });
  }

  // Tile 100: Bos Doodle
  const bossRng = new SeededRng(hashSeed(seed, 100, 'boss_doodle'));
  tiles.push({
    id: 100,
    zone: 'kastil_awan',
    archetype: 'boss_doodle',
    mode: 'solo',
    difficulty: 4,
    title: 'Bos Doodle: Raja Coretan!',
    flavorText:
      'Garis finish sudah di depan mata! Kalahkan Bos Doodle dengan lulus minimal 2 dari 3 ujian cepat untuk naik podium juara!',
    params: ARCHETYPE_REGISTRY.boss_doodle.buildParams(bossRng, 4, 100),
    reward: { stars: 10, bonusType: 'none' },
    penalty: { type: 'retreat', value: 3 },
  });

  return tiles;
}
