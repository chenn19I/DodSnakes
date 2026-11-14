import type { ZoneId } from '../types.js';

export interface ScrambleWord {
  word: string;
  hint: string;
  difficulty: 1 | 2 | 3 | 4;
}

export const SCRAMBLE_WORDS: ScrambleWord[] = [
  // Diff 1 (4-5 huruf)
  { word: 'DADU', hint: 'Dikocok buat tentuin langkah', difficulty: 1 },
  { word: 'ULAR', hint: 'Panjang, licin, suka bikin merosot', difficulty: 1 },
  { word: 'PION', hint: 'Karakter imut kamu di papan', difficulty: 1 },
  { word: 'KUE', hint: 'Manis lembut bikin ngiler', difficulty: 1 },
  { word: 'KOPI', hint: 'Minuman bikin melek pagi-pagi', difficulty: 1 },
  { word: 'AWAN', hint: 'Empuk putih melayang di langit', difficulty: 1 },
  { word: 'PENA', hint: 'Teman tinta untuk menggambar', difficulty: 1 },
  { word: 'BUKU', hint: 'Tempat halaman catatan berada', difficulty: 1 },
  { word: 'KODOK', hint: 'Hijau suka melompat "krok krok"', difficulty: 1 },
  { word: 'BEBEK', hint: 'Kwek kwek jalannya goyang', difficulty: 1 },
  { word: 'JAMUR', hint: 'Bertopi bulat di hutan lembap', difficulty: 1 },
  { word: 'PANDA', hint: 'Hitam putih pecinta bambu', difficulty: 1 },
  { word: 'SATE', hint: 'Ditusuk-tusuk lalu dibakar', difficulty: 1 },
  { word: 'NASI', hint: 'Makanan pokok hangat di piring', difficulty: 1 },
  { word: 'GULA', hint: 'Putih manis kesukaan semut', difficulty: 1 },
  { word: 'BALON', hint: 'Terbang kalau diisi udara ringan', difficulty: 1 },

  // Diff 2 (5-6 huruf)
  { word: 'TANGGA', hint: 'Jalan pintas naik ke atas!', difficulty: 2 },
  { word: 'KUCING', hint: 'Mochi menggemaskan suka ngeong', difficulty: 2 },
  { word: 'PERMEN', hint: 'Manis warna-warni di zona awal', difficulty: 2 },
  { word: 'KERTAS', hint: 'Latar tempat semua doodle hidup', difficulty: 2 },
  { word: 'PENSIL', hint: 'Untuk sketsa sebelum ditebalkan', difficulty: 2 },
  { word: 'DONAT', hint: 'Roti goreng bolong tengahnya', difficulty: 2 },
  { word: 'BAKSO', hint: 'Bulat kenyal berkuah gurih', difficulty: 2 },
  { word: 'HUJAN', hint: 'Air turun dari langit bikin adem', difficulty: 2 },
  { word: 'TIDUR', hint: 'Hobi beruang di hutan ngantuk', difficulty: 2 },
  { word: 'TINTA', hint: 'Cairan gelap pembentuk garis', difficulty: 2 },
  { word: 'MANTUL', hint: 'Terpental balik kalau lewat 100', difficulty: 2 },
  { word: 'KILAT', hint: 'Secepat cahaya di langit mendung', difficulty: 2 },
  { word: 'EMOTE', hint: 'Stiker ekspresi buat goda teman', difficulty: 2 },
  { word: 'WARNA', hint: 'Merah kuning hijau di pelangi', difficulty: 2 },
  { word: 'PISANG', hint: 'Kulitnya licin sering bikin kepeleset', difficulty: 2 },
  { word: 'BINTANG', hint: 'Skor ★ berkilau yang dikumpulkan', difficulty: 2 },

  // Diff 3 (6-7 huruf)
  { word: 'PERISAI', hint: 'Pelindung sakti penangkal ular', difficulty: 3 },
  { word: 'KASTIL', hint: 'Istana tinggi di negeri awan', difficulty: 3 },
  { word: 'PELANGI', hint: 'Tujuh warna melengkung habis hujan', difficulty: 3 },
  { word: 'KLEPON', hint: 'Kue hijau isi gula merah meletus', difficulty: 3 },
  { word: 'CEMONG', hint: 'Kotor belepotan es krim atau tinta', difficulty: 3 },
  { word: 'NGANTUK', hint: 'Rasanya pengen merem terus', difficulty: 3 },
  { word: 'LONCAT', hint: 'Gerakan pion dari kotak ke kotak', difficulty: 3 },
  { word: 'GUNUNG', hint: 'Menjulang tinggi berselimut salju', difficulty: 3 },
  { word: 'CERIA', hint: 'Suasana hati senang penuh tawa', difficulty: 3 },
  { word: 'JUARA', hint: 'Pemain teratas di podium kemenangan', difficulty: 3 },
  { word: 'TEKA', hint: 'Awalan dari teka-teki seru', difficulty: 3 },
  { word: 'MENANG', hint: 'Rasanya saat lulus Bos Doodle!', difficulty: 3 },
  { word: 'RENDANG', hint: 'Olahan daging empuk khas Minang', difficulty: 3 },
  { word: 'ANGKLUNG', hint: 'Alat musik bambu digoyang merdu', difficulty: 3 },
  { word: 'KELINCI', hint: 'Bertelinga panjang suka wortel', difficulty: 3 },
  { word: 'KERETA', hint: 'Panjang berjalan di atas rel', difficulty: 3 },

  // Diff 4 (7-9 huruf)
  { word: 'TRAMPOLIN', hint: 'Memantul tinggi ke udara', difficulty: 4 },
  { word: 'KONFETI', hint: 'Kertas warna-warni pesta kemenangan', difficulty: 4 },
  { word: 'MAHKOTA', hint: 'Hiasan kepala sang pemenang', difficulty: 4 },
  { word: 'PENGHAPUS', hint: 'Penyelamat saat coretan salah', difficulty: 4 },
  { word: 'NUSANTARA', hint: 'Sebutan indah kepulauan Indonesia', difficulty: 4 },
  { word: 'SEMANGAT', hint: 'Energi pantang menyerah sampai finish', difficulty: 4 },
  { word: 'SERULING', hint: 'Ditiup menghasilkan nada merdu', difficulty: 4 },
  { word: 'KEJUTAN', hint: 'Kotak misteri penuh efek tak terduga', difficulty: 4 },
  { word: 'SILUET', hint: 'Bayangan gelap bentuk suatu objek', difficulty: 4 },
  { word: 'SKETSA', hint: 'Gambar rancangan kasar bertangan', difficulty: 4 },
  { word: 'FANTASI', hint: 'Dunia imajinasi penuh keajaiban', difficulty: 4 },
  { word: 'MISTERI', hint: 'Sesuatu yang bikin penasaran', difficulty: 4 },
  { word: 'MOCHI', hint: 'Nama kucing lincah berpita merah muda', difficulty: 1 },
  { word: 'BOBA', hint: 'Nama panda berkacamata pintar', difficulty: 1 },
  { word: 'TOADY', hint: 'Nama jamur polkadot pembawa hoki', difficulty: 2 },
  { word: 'TERATAI', hint: 'Daun topi bundar favorit Koko si Kodok', difficulty: 2 },
  { word: 'WEKWEK', hint: 'Nama bebek ceria dengan syal mini', difficulty: 2 },
  { word: 'CENDOL', hint: 'Es segar manis dengan mutiara hijau', difficulty: 3 },
  { word: 'LONCENG', hint: 'Berbunyi ting-tong manis di leher', difficulty: 3 },
  { word: 'ORIGAMI', hint: 'Seni melipat kertas jadi bentuk lucu', difficulty: 4 },
];

export interface ShadowSpriteDef {
  id: string;
  label: string;
  shape: 'cat' | 'duck' | 'lollipop' | 'cloud' | 'mushroom' | 'crown' | 'star' | 'icecream' | 'tree' | 'rocket' | 'fish' | 'banana';
}

export const SHADOW_ITEMS: ShadowSpriteDef[] = [
  { id: 'cat', label: 'Kucing Mochi', shape: 'cat' },
  { id: 'duck', label: 'Bebek Wekwek', shape: 'duck' },
  { id: 'lollipop', label: 'Lolipop Manis', shape: 'lollipop' },
  { id: 'cloud', label: 'Awan Empuk', shape: 'cloud' },
  { id: 'mushroom', label: 'Jamur Polkadot', shape: 'mushroom' },
  { id: 'crown', label: 'Mahkota Raja', shape: 'crown' },
  { id: 'star', label: 'Bintang Doodle', shape: 'star' },
  { id: 'icecream', label: 'Es Krim Cemong', shape: 'icecream' },
  { id: 'tree', label: 'Pohon Ngantuk', shape: 'tree' },
  { id: 'rocket', label: 'Roket Kertas', shape: 'rocket' },
  { id: 'fish', label: 'Ikan Gembul', shape: 'fish' },
  { id: 'banana', label: 'Pisang Licin', shape: 'banana' },
];

export interface GiftTrapVariant {
  id: string;
  kind: 'gift' | 'trap';
  title: string;
  flavorText: string;
  starsDelta: number;
  moveDelta: number; // +advance or -retreat
  grantShield?: boolean;
  grantItem?: boolean;
}

export const GIFT_TRAP_VARIANTS: GiftTrapVariant[] = [
  {
    id: 'trampolin_karet',
    kind: 'gift',
    title: 'Trampolin Karet!',
    flavorText: 'Boiiing! Kamu menginjak trampolin gambar tangan dan terpental maju!',
    starsDelta: 2,
    moveDelta: 2,
  },
  {
    id: 'traktiran_permen',
    kind: 'gift',
    title: 'Hujan Permen Kapas',
    flavorText: 'Nyam! Permen manis jatuh dari langit memberi ★ ekstra!',
    starsDelta: 3,
    moveDelta: 0,
    grantItem: true,
  },
  {
    id: 'kulit_pisang',
    kind: 'trap',
    title: 'Kulit Pisang Licin!',
    flavorText: 'Waduh! Terpeleset kulit pisang doodle dan meluncur mundur 1 kotak.',
    starsDelta: 0,
    moveDelta: -1,
  },
  {
    id: 'bantal_ngantuk',
    kind: 'gift',
    title: 'Bantal Pelindung Empuk',
    flavorText: 'Dapat selimut ajaib yang berubah jadi Perisai Anti-Ular!',
    starsDelta: 1,
    moveDelta: 0,
    grantShield: true,
  },
  {
    id: 'angin_puyuh',
    kind: 'trap',
    title: 'Angin Kipas Raksasa',
    flavorText: 'Wuuush! Kipas kertas meniup pionmu mundur 2 langkah!',
    starsDelta: 0,
    moveDelta: -2,
  },
  {
    id: 'kue_bintang',
    kind: 'gift',
    title: 'Kue Bintang Hangat',
    flavorText: 'Baru keluar dari oven sketsa! Dapat +3 ★ dan maju 1 kotak.',
    starsDelta: 3,
    moveDelta: 1,
  },
  {
    id: 'tinta_tumpah',
    kind: 'trap',
    title: 'Tinta Tumpah di Kertas',
    flavorText: 'Ups, sepatumu lengket kena tinta! Untung cuma melangkah mundur 1 kotak.',
    starsDelta: 1,
    moveDelta: -1,
  },
  {
    id: 'roket_origami',
    kind: 'gift',
    title: 'Roket Pesawat Kertas',
    flavorText: 'Fiuuuh! Pesawat kertas mengantarmu terbang 3 kotak ke depan!',
    starsDelta: 2,
    moveDelta: 3,
  },
  {
    id: 'kantin_voucher',
    kind: 'gift',
    title: 'Kupon Jajan Bintang',
    flavorText: 'Asyiiik! Menemukan celengan bintang berisi +4 ★ manis!',
    starsDelta: 4,
    moveDelta: 0,
  },
  {
    id: 'teh_boba_hangat',
    kind: 'gift',
    title: 'Teh Susu Boba Segar',
    flavorText: 'Segaaar! Energi penuh bikin dapat Item Acak & +1 ★!',
    starsDelta: 1,
    moveDelta: 0,
    grantItem: true,
  },
];

export const ZONE_FLAVOR_PREFIXES: Record<ZoneId, string[]> = {
  taman_permen: [
    'Di antara permen lolipop raksasa,',
    'Sambil mengunyah gulali awan,',
    'Di jalan setapak penuh taburan meses,',
    'Dekat air mancur sirup stroberi,',
    'Saat mencium aroma wafel hangat,',
  ],
  hutan_ngantuk: [
    'Di bawah pohon yang lagi menguap lebar,',
    'Sambil berjingkat melewati tupai tidur,',
    'Di antara jamur empuk yang berdengkur,',
    'Saat kunang-kunang menyalakan lampu,',
    'Di hamparan lumut selembut kasur,',
  ],
  gunung_es: [
    'Di lereng es krim vanila yang licin,',
    'Sambil meniup uap napas dingin,',
    'Di jembatan kristal gula batu,',
    'Saat penguin doodle melambaikan sayap,',
    'Di gua salju berpendar biru,',
  ],
  kastil_awan: [
    'Di menara kapas setinggi langit,',
    'Sambil melompati pelangi tipis,',
    'Di dekat gerbang kastil Bos Doodle,',
    'Saat bintang-bintang berbisik semangat,',
    'Di balkon awan berkilau emas,',
  ],
};

export const STROOP_COLORS = [
  { id: 'merah', label: 'MERAH', hex: '#E63946', pattern: 'circle' },
  { id: 'biru', label: 'BIRU', hex: '#2B7FFF', pattern: 'triangle' },
  { id: 'hijau', label: 'HIJAU', hex: '#10B981', pattern: 'square' },
  { id: 'kuning', label: 'KUNING', hex: '#F59E0B', pattern: 'star' },
  { id: 'ungu', label: 'UNGU', hex: '#8B5CF6', pattern: 'diamond' },
] as const;
