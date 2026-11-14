import {
  ACCESSORY_META,
  ARCHETYPE_REGISTRY,
  GAME_MODE_META,
  ITEM_META,
  PAWN_META,
  PLAYER_COLORS,
  STAR_SHOP_COST,
  type AccessoryId,
  type ChallengeArchetype,
  type EmoteId,
  type GameEvent,
  type GameModePreset,
  type GameState,
  type ItemType,
  type PawnId,
  type PlayerColorId,
  type ZoneId,
} from '@doodle-dash/shared';
import { EN_QUIZ_BANK } from './quizTranslationsEn.js';

export type AppLanguage = 'id' | 'en';

export const COLORBLIND_SHAPES: Record<PlayerColorId, string> = {
  pink: '●',
  kuning: '▲',
  mint: '■',
  biru: '★',
  oranye: '◆',
  ungu: '✚',
};

export const COLORBLIND_CHALLENGE_CODES: Record<string, { code: string; pattern: string; en: string }> = {
  pink: { code: 'PK', pattern: 'diamond', en: 'Pink' },
  biru: { code: 'BR', pattern: 'triangle', en: 'Blue' },
  kuning: { code: 'KN', pattern: 'star', en: 'Yellow' },
  mint: { code: 'HJ', pattern: 'square', en: 'Mint Green' },
  hijau: { code: 'HJ', pattern: 'square', en: 'Green' },
  merah: { code: 'MR', pattern: 'circle', en: 'Red' },
  ungu: { code: 'UN', pattern: 'diamond', en: 'Purple' },
};

const PAWN_META_EN: Record<
  PawnId,
  { name: string; shortName: string; title: string; perkTitle: string; perkDesc: string }
> = {
  kucing: {
    name: 'Mochi the Cat',
    shortName: 'Mochi',
    title: 'Ladder Chaser',
    perkTitle: 'Nimble Paws',
    perkDesc: '+1 ★ extra every time you climb a ladder.',
  },
  kodok: {
    name: 'Koko the Frog',
    shortName: 'Koko',
    title: 'Lily Jumper',
    perkTitle: 'Frog Leap',
    perkDesc: 'Rolling a 1 automatically hops +1 extra tile.',
  },
  bebek: {
    name: 'Wekwek the Duck',
    shortName: 'Wekwek',
    title: 'Party Star',
    perkTitle: 'Party Spirit',
    perkDesc: '+1 ★ bonus on every Duel or All-Play win.',
  },
  panda: {
    name: 'Boba the Panda',
    shortName: 'Boba',
    title: 'Focus Master',
    perkTitle: 'Calm Focus',
    perkDesc: '+1.5s bonus time during challenges on your turn.',
  },
  dino: {
    name: 'Roro the Dino',
    shortName: 'Roro',
    title: 'Canteen VIP',
    perkTitle: 'Canteen Discount',
    perkDesc: 'Buy a surprise item box at the Star Canteen for just 3 ★.',
  },
  jamur: {
    name: 'Toady the Mushroom',
    shortName: 'Toady',
    title: 'Lucky Charm',
    perkTitle: 'Lucky Aura',
    perkDesc: '+1 ★ bonus whenever you dodge or block a snake.',
  },
};

const ACCESSORY_META_EN: Record<AccessoryId, { name: string; shortName: string; description: string }> = {
  none: { id: 'none', name: 'Classic Look', shortName: 'Classic', description: 'Original character styling with no extra gear.' } as never,
  crown: { name: 'Mini Crown', shortName: 'Crown', description: 'Shiny golden mini-crown for future board champions.' },
  glasses: { name: 'Round Glasses', shortName: 'Glasses', description: 'Cozy smart specs for quiz & puzzle lovers.' },
  scarf: { name: 'Knit Scarf', shortName: 'Scarf', description: 'Warm striped knit scarf for smooth hopping.' },
  headset: { name: 'Pastel Headset', shortName: 'Headset', description: 'Cute gaming headset for rhythm & sound challenges.' },
  flower: { name: 'Flower Clip', shortName: 'Flower', description: 'Cheerful blooming flower clip perched on top.' },
  backpack: { name: 'Star Backpack', shortName: 'Pack', description: 'Tiny adventure pack with a lucky star charm.' },
};

const ITEM_META_EN: Record<ItemType, { name: string; description: string }> = {
  shield: { name: 'Snake Shield', description: 'Automatically blocks 1 snake bite without sliding down!' },
  golden_dice: { name: 'Golden Dice', description: 'Roll 2 dice at once and pick your favorite number.' },
  brake: { name: 'Quick Brake', description: 'Cap your next dice roll between 1 and 3 for precision.' },
  surprise: { name: 'Mystery Box', description: 'Triggers a random playful boost or twist before rolling!' },
  magnet_star: { name: 'Star Magnet', description: 'Pull 1 ★ from the race leader (or gain +1 ★ bonus)!' },
  swap_turbo: { name: 'Turbo Boots', description: 'Add +2 extra steps onto your next dice roll!' },
};

const COLOR_NAMES_EN: Record<PlayerColorId, string> = {
  pink: 'Candy Pink',
  kuning: 'Butter Yellow',
  mint: 'Fresh Mint',
  biru: 'Sky Blue',
  oranye: 'Tangerine',
  ungu: 'Grape Purple',
};

const MODE_META_EN: Record<GameModePreset, { name: string; shortLabel: string; description: string }> = {
  klasik: {
    name: 'Classic Fun',
    shortLabel: 'Classic',
    description: 'Balanced 100-tile Snakes & Ladders adventure.',
  },
  kilat: {
    name: 'Blitz Mode',
    shortLabel: 'Blitz',
    description: 'Start with 1 item + 2 stars and +1 bonus step on challenge wins!',
  },
  pesta_item: {
    name: 'Item Party',
    shortLabel: 'Party',
    description: 'Start with 1 item and doubled drop rates for chaotic fun!',
  },
};

const ZONE_NAMES_EN: Record<ZoneId, string> = {
  taman_permen: 'Candy Garden',
  hutan_ngantuk: 'Sleepy Forest',
  gunung_es: 'Frosted Peaks',
  kastil_awan: 'Cloud Castle',
};

const ARCHETYPE_EN: Record<ChallengeArchetype, { name: string; instruction: string }> = {
  start: { name: 'Start', instruction: 'Get ready to roll!' },
  tap_timing: { name: 'Tap Timing', instruction: 'Hit the button when the needle enters the green target zone!' },
  quick_quiz: { name: 'Quick Quiz', instruction: 'Pick the correct answer before time runs out!' },
  memory_doodle: { name: 'Memory Doodle', instruction: 'Watch the doodle sequence carefully, then repeat it!' },
  spam_tap: { name: 'Speed Tap', instruction: 'Tap fast (or press Space) until you reach the target!' },
  swipe_dodge: { name: 'Swipe & Dodge', instruction: 'Move left or right to dodge falling ink rocks!' },
  shadow_match: { name: 'Shadow Match', instruction: 'Match the black silhouette to its colorful doodle!' },
  quick_math: { name: 'Quick Math', instruction: 'Solve the playful math problem fast!' },
  word_scramble: { name: 'Word Scramble', instruction: 'Unscramble the tiles to spell the matching word!' },
  trace_line: { name: 'Trace the Line', instruction: 'Trace smoothly along the dashed guide to the star!' },
  lucky_wheel: { name: 'Lucky Wheel', instruction: 'Spin the fortune wheel and see what fate gives you!' },
  stroop_color: { name: 'Ink Color (Stroop)', instruction: 'Pick the INK COLOR of the word, not what the word reads!' },
  quick_duel: { name: 'Quick Reflex Duel', instruction: 'Wait for the signal flash, then react faster than your rival!' },
  gift_trap: { name: 'Gift or Trap Box', instruction: 'Tap the mystery box to reveal a surprise or prank!' },
  bubble_pop: { name: 'Bubble Pop', instruction: 'Pop target star bubbles and avoid dark ink bombs!' },
  rhythm_clap: { name: 'Rhythm Beat', instruction: 'Tap the drum right as each note hits the beat zone!' },
  color_count: { name: 'Color Count', instruction: 'Count how many stickers match the target shape & color!' },
  balance_bar: { name: 'Balance Bar', instruction: 'Steer left & right to keep the pen inside the green zone!' },
  boss_doodle: { name: 'Boss Doodle Finale', instruction: 'Clear all 3 stages at Tile 100 to claim victory!' },
};

const SHADOW_EN: Record<string, string> = {
  cat: 'Mochi the Cat',
  duck: 'Wekwek the Duck',
  lollipop: 'Sweet Lollipop',
  cloud: 'Fluffy Cloud',
  mushroom: 'Polka Mushroom',
  crown: 'Royal Crown',
  star: 'Doodle Star',
  icecream: 'Scoop Cone',
  tree: 'Sleepy Tree',
  rocket: 'Paper Rocket',
  fish: 'Puffy Fish',
  banana: 'Slippery Banana',
};

const MEMORY_EN: Record<string, string> = {
  star: 'Star',
  candy: 'Candy',
  cat: 'Mochi',
  cloud: 'Cloud',
  mushroom: 'Mushroom',
  crown: 'Crown',
};

const STROOP_EN: Record<string, string> = {
  merah: 'RED',
  biru: 'BLUE',
  hijau: 'GREEN',
  kuning: 'YELLOW',
  ungu: 'PURPLE',
};

const WHEEL_EN: Record<string, string> = {
  jackpot: '+4 ★ & Advance 2!',
  item: 'Random Item!',
  shield: 'Snake Shield!',
  stars: 'Bonus +3 ★',
  zonk: 'Silly Blank (0 ★)',
  slip: 'Slipped (-1 Tile)',
};

const GIFT_EN: Record<string, { title: string; flavorText: string }> = {
  trampolin_karet: { title: 'Bouncy Trampoline!', flavorText: 'Boing! You stepped on a hand-drawn trampoline and bounced ahead!' },
  traktiran_permen: { title: 'Cotton Candy Shower', flavorText: 'Yum! Sweet clouds dropped extra stars & a surprise item!' },
  kulit_pisang: { title: 'Slippery Banana Peel!', flavorText: 'Whoops! Slipped on a doodle banana peel and slid back 1 tile.' },
  bantal_ngantuk: { title: 'Cozy Guard Pillow', flavorText: 'Earned a magic blanket that turns into a Snake Shield!' },
  angin_puyuh: { title: 'Giant Paper Fan', flavorText: 'Whoosh! A gust of paper wind blew your pawn back 2 tiles!' },
  kue_bintang: { title: 'Warm Starry Cake', flavorText: 'Fresh out of the sketchbook oven! +3 ★ and advance 1 tile.' },
  tinta_tumpah: { title: 'Spilled Ink Puddle', flavorText: 'Sticky shoes! At least you only stepped back 1 tile (+1 ★).' },
  roket_origami: { title: 'Paper Plane Boost', flavorText: 'Zoom! An origami jet carried you 3 tiles forward!' },
  kantin_voucher: { title: 'Star Canteen Voucher', flavorText: 'Sweet! Found a piggy bank packed with +4 ★!' },
  teh_boba_hangat: { title: 'Fresh Boba Milk Tea', flavorText: 'Refreshing boost! Earned a Random Item & +1 ★!' },
};

const SHAPE_EN: Record<string, string> = {
  bintang: 'Stars',
  hati: 'Hearts',
  awan: 'Clouds',
  kancing: 'Circles',
};

const COLOR_COUNT_EN: Record<string, string> = {
  pink: 'Pink',
  biru: 'Blue',
  kuning: 'Yellow',
  mint: 'Mint Green',
};

export function getPawnMeta(pawnId: PawnId, lang: AppLanguage) {
  const base = PAWN_META[pawnId];
  if (lang === 'id') return base;
  return { ...base, ...PAWN_META_EN[pawnId] };
}

export function getAccessoryMeta(accId: AccessoryId, lang: AppLanguage) {
  const base = ACCESSORY_META[accId];
  if (lang === 'id') return base;
  const en = ACCESSORY_META_EN[accId];
  return { ...base, name: en.name, shortName: en.shortName, description: en.description };
}

export function getItemMeta(itemId: ItemType, lang: AppLanguage) {
  const base = ITEM_META[itemId];
  if (lang === 'id') return base;
  return { ...base, ...ITEM_META_EN[itemId] };
}

export function getColorName(colorId: PlayerColorId, lang: AppLanguage): string {
  return lang === 'id' ? PLAYER_COLORS[colorId].name : COLOR_NAMES_EN[colorId];
}

export function getModeMeta(preset: GameModePreset, lang: AppLanguage) {
  const base = GAME_MODE_META[preset];
  if (lang === 'id') {
    const shortLabel = preset === 'klasik' ? 'Klasik' : preset === 'kilat' ? 'Kilat' : 'Pesta';
    return { ...base, shortLabel };
  }
  return MODE_META_EN[preset];
}

export function getArchetypeMeta(arch: ChallengeArchetype, lang: AppLanguage) {
  if (lang === 'id') {
    return {
      name: ARCHETYPE_REGISTRY[arch].displayName,
      instruction: ARCHETYPE_REGISTRY[arch].instruction,
    };
  }
  return ARCHETYPE_EN[arch];
}

export function getZoneName(zoneId: ZoneId, lang: AppLanguage): string {
  if (lang === 'en') return ZONE_NAMES_EN[zoneId];
  switch (zoneId) {
    case 'taman_permen':
      return 'Taman Permen';
    case 'hutan_ngantuk':
      return 'Hutan Ngantuk';
    case 'gunung_es':
      return 'Gunung Es';
    case 'kastil_awan':
      return 'Kastil Awan';
  }
}

export function getLocalizedQuiz(
  questionId: number,
  fallbackQuestion: string,
  fallbackOptions: string[],
  lang: AppLanguage,
): { question: string; options: string[] } {
  if (lang === 'en') {
    const en = EN_QUIZ_BANK[questionId];
    if (en) return { question: en.question, options: en.options };
  }
  return { question: fallbackQuestion, options: fallbackOptions };
}

export function getLocalizedShadowLabel(id: string, fallback: string, lang: AppLanguage): string {
  return lang === 'en' ? (SHADOW_EN[id] ?? fallback) : fallback;
}

export function getLocalizedMemoryLabel(id: string, fallback: string, lang: AppLanguage): string {
  return lang === 'en' ? (MEMORY_EN[id] ?? fallback) : fallback;
}

export function getLocalizedStroopLabel(colorIdOrLabel: string, fallback: string, lang: AppLanguage): string {
  if (lang === 'id') return fallback;
  const key = colorIdOrLabel.toLowerCase();
  if (STROOP_EN[key]) return STROOP_EN[key];
  return STROOP_EN[fallback.toLowerCase()] ?? fallback;
}

export function getLocalizedWheelLabel(id: string, fallback: string, lang: AppLanguage): string {
  return lang === 'en' ? (WHEEL_EN[id] ?? fallback) : fallback;
}

export function getLocalizedGiftVariant(
  id: string | undefined,
  fallbackTitle: string,
  fallbackFlavor: string,
  lang: AppLanguage,
): { title: string; flavorText: string } {
  if (lang === 'en' && id && GIFT_EN[id]) return GIFT_EN[id];
  return { title: fallbackTitle, flavorText: fallbackFlavor };
}

export function getLocalizedColorCountQuestion(
  params: Record<string, unknown>,
  lang: AppLanguage,
): string {
  const fallback = String(params.questionText ?? 'Count matching stickers!');
  if (lang === 'id') return fallback;
  const shape = params.targetShape as { id?: string; label?: string } | undefined;
  const color = params.targetColor as { id?: string; label?: string } | undefined;
  if (!shape?.id || !color?.id) return 'How many matching stickers are there?';
  const sEn = SHAPE_EN[shape.id] ?? shape.label ?? 'Stickers';
  const cEn = COLOR_COUNT_EN[color.id] ?? color.label ?? color.id;
  return `How many ${cEn} ${sEn} are there?`;
}

export function getLocalizedBubbleColorLabel(
  colorObj: { id?: string; label: string },
  lang: AppLanguage,
): string {
  if (lang === 'id') return colorObj.label;
  return (colorObj.id ? COLOR_COUNT_EN[colorObj.id] : undefined) ?? colorObj.label;
}

export function getBotDiffLabel(diff: string, lang: AppLanguage): string {
  if (lang === 'id') {
    return diff === 'juara' ? 'Juara' : diff === 'santai' ? 'Santai' : 'Pintar';
  }
  return diff === 'juara' ? 'Champ' : diff === 'santai' ? 'Chill' : 'Smart';
}

export function getEmoteLabel(emoteId: EmoteId, lang: AppLanguage): string {
  if (lang === 'id') {
    const map: Record<EmoteId, string> = {
      jempol: 'Mantap!',
      ketawa: 'Wkwk!',
      kaget: 'Waduh!',
      nangis: 'Huwaa!',
      api: 'Gass!',
      mahkota: 'Juara!',
    };
    return map[emoteId];
  }
  const mapEn: Record<EmoteId, string> = {
    jempol: 'Nice!',
    ketawa: 'Haha!',
    kaget: 'Whoa!',
    nangis: 'Oh no!',
    api: 'Let’s go!',
    mahkota: 'Crown!',
  };
  return mapEn[emoteId];
}

export function formatEventFeedText(
  ev: GameEvent,
  state: GameState,
  lang: AppLanguage,
): { text: string; toast?: string } | null {
  const playerOf = (id: string) => state.players.find((p) => p.id === id);
  const nameOf = (id: string) => playerOf(id)?.name ?? (lang === 'en' ? 'Player' : 'Pemain');

  if (ev.type === 'DiceRolled') {
    const vals = ev.diceValues.join(' & ');
    const tag = ev.usedTurbo
      ? lang === 'en'
        ? ' (+2 Turbo)'
        : ' (+2 Turbo)'
      : ev.usedBrake
        ? lang === 'en'
          ? ' (Brake)'
          : ' (Rem)'
        : '';
    const p = playerOf(ev.playerId);
    const hopNote =
      p?.pawn === 'kodok' && ev.diceValues.length === 1 && ev.diceValues[0] === 1
        ? lang === 'en'
          ? ' (+1 Frog Leap)'
          : ' (+1 Kodok)'
        : '';
    return {
      text:
        lang === 'en'
          ? `${nameOf(ev.playerId)} rolled ${vals}${tag}${hopNote}`
          : `${nameOf(ev.playerId)} lempar ${vals}${tag}${hopNote}`,
    };
  }

  if (ev.type === 'LadderClimbed') {
    const p = playerOf(ev.playerId);
    const bonus =
      p?.pawn === 'kucing'
        ? lang === 'en'
          ? ' (+1★ Nimble Paws)'
          : ' (+1★ Kaki Gesit)'
        : '';
    const msg =
      lang === 'en'
        ? `${nameOf(ev.playerId)} climbed ladder ${ev.from}→${ev.to}${bonus}`
        : `${nameOf(ev.playerId)} naik tangga ${ev.from}→${ev.to}${bonus}`;
    return { text: msg, toast: msg };
  }

  if (ev.type === 'SnakeBitten') {
    const p = playerOf(ev.playerId);
    const luckyNote =
      p?.pawn === 'jamur'
        ? lang === 'en'
          ? ' (+1★ Lucky Aura)'
          : ' (+1★ Aura Hoki)'
        : '';
    if (ev.dodgedByChallenge) {
      const msg =
        lang === 'en'
          ? `Challenge won! ${nameOf(ev.playerId)} tamed the snake on tile ${ev.from}${luckyNote}`
          : `Menang tantangan! ${nameOf(ev.playerId)} jinakkan ular di ${ev.from}${luckyNote}`;
      return { text: msg, toast: msg };
    }
    if (ev.blockedByShield) {
      const msg =
        lang === 'en'
          ? `Snake Shield saved ${nameOf(ev.playerId)} on tile ${ev.from}${luckyNote}`
          : `Perisai selamatkan ${nameOf(ev.playerId)} di petak ${ev.from}${luckyNote}`;
      return { text: msg, toast: msg };
    }
    const msg =
      lang === 'en'
        ? `${nameOf(ev.playerId)} bitten by snake ${ev.from}→${ev.to}`
        : `${nameOf(ev.playerId)} kena ular ${ev.from}→${ev.to}`;
    return { text: msg, toast: msg };
  }

  if (ev.type === 'ItemUsed') {
    return { text: lang === 'en' ? localizeText(ev.effectDescription, lang) : ev.effectDescription };
  }

  if (ev.type === 'ItemGained') {
    const shopTag = ev.source === 'star_shop' ? ` (-${ev.starsCost ?? STAR_SHOP_COST}★)` : '';
    const itemName = getItemMeta(ev.item, lang).name;
    return {
      text:
        lang === 'en'
          ? `${nameOf(ev.playerId)} got ${itemName}${shopTag}`
          : `${nameOf(ev.playerId)} dapat ${itemName}${shopTag}`,
    };
  }

  if (ev.type === 'ChallengeResolved' && ev.serverSummaryText.includes('Kombo')) {
    return { text: lang === 'en' ? localizeText(ev.serverSummaryText, lang) : ev.serverSummaryText };
  }

  if (ev.type === 'TurnSkipped') {
    return {
      text:
        lang === 'en'
          ? `${nameOf(ev.playerId)} skipped 1 turn`
          : `${nameOf(ev.playerId)} lewat 1 giliran`,
    };
  }

  if (ev.type === 'GameWon') {
    return {
      text: lang === 'en' ? `${nameOf(ev.winnerId)} WINS!` : `${nameOf(ev.winnerId)} MENANG!`,
    };
  }

  return null;
}

export function localizeText(msg: string, lang: AppLanguage): string {
  if (lang === 'id' || !msg) return msg;
  const direct: Record<string, string> = {
    'Username tidak boleh kosong.': 'Username cannot be empty.',
    'Username harus mengandung huruf atau angka.': 'Username must contain letters or numbers.',
    'Username terlalu panjang (maksimal 18 karakter).': 'Username is too long (max 18 characters).',
    'Nama tidak boleh mengandung kata kasar, porno, SARA, atau penghinaan.':
      'Name cannot contain profanity, NSFW terms, hate speech, or insults.',
    'Username tidak diizinkan.': 'Username is not allowed.',
    'Masukkan kode room 4 huruf ya!': 'Enter a 4-letter room code!',
    'Minimal 2 pemain untuk memulai (boleh tambah bot!).': 'Need at least 2 players to start (you can add bots!).',
    'Tunggu semua pemain menekan tombol Siap!': 'Wait for all players to press Ready!',
    'Room sudah penuh (maksimal 6 pemain).': 'Room is full (max 6 players).',
    'Link undangan disalin ke clipboard!': 'Invite link copied to clipboard!',
    'Gagal menyalin link undangan.': 'Failed to copy invite link.',
    'Perisai Anti-Ular aktif! Siap menahan 1 gigitan ular.': 'Snake Shield active! Ready to block 1 snake bite.',
    'Dadu Emas siap! Lempar 2 dadu sekaligus pada giliran ini.': 'Golden Dice ready! Roll 2 dice and pick one this turn.',
    'Rem Mendadak aktif! Dadu maksimal angka 3 pada lemparan ini.': 'Quick Brake active! Max die roll capped at 3.',
    'Sepatu Turbo aktif! +2 langkah ekstra pada lemparan berikutnya!': 'Turbo Boots active! +2 extra steps on your next roll!',
    'Magnet Bintang menemukan +1 ★ berkilau!': 'Star Magnet found +1 sparkling ★!',
    'Kartu Kasihan aktif! Tidak kena penalti.': 'Mercy Card active! Penalty skipped.',
    'Lewat 1 giliran': 'Skip 1 turn',
    'Tunggu sebentar sebelum kirim stiker lagi!': 'Wait a moment before sending another sticker!',
    'Tas itemmu sudah penuh (maksimal 2 item)!': 'Your item bag is full (max 2 items)!',
    'Server online belum terhubung.': 'Online server not connected.',
    'Host menutup room.': 'Host closed the room.',
    'Kode room harus tepat 4 huruf.': 'Room code must be exactly 4 letters.',
    'Butuh minimal 2 pemain atau bot untuk memulai.': 'Need at least 2 players or bots to start.',
    'Gagal terhubung ke server.': 'Failed to connect to the server.',
    'Hanya host yang bisa menambah bot.': 'Only the host can add bots.',
    'Hanya host yang bisa menghapus bot.': 'Only the host can remove bots.',
    'Hanya host yang bisa mengubah aturan.': 'Only the host can change rules.',
    'Hanya host yang bisa memulai game.': 'Only the host can start the game.',
    'Hanya host yang bisa mulai ulang.': 'Only the host can start a rematch.',
  };
  if (direct[msg]) return direct[msg];
  return msg
    .replace(/^Room "?(\S+?)"? tidak ditemukan atau host sedang offline\.$/, 'Room "$1" was not found or the host is offline.')
    .replace(/^Room "?(\S+?)"? tidak ditemukan\.$/, 'Room "$1" was not found.')
    .replace(/^(.+) belum menekan Siap\.$/, '$1 has not pressed Ready yet.')
    .replace(/^BERHASIL! (.+) dapat (\+\d+ ★)(?: \((.+)\))?!$/, 'SUCCESS! $1 earned $2!')
    .replace(/^YAAH\.\.\. (.+) gagal tantangan\.(?: \((.+)\))?$/, 'OOPS... $1 missed the challenge.')
    .replace(/^Roda berhenti di: (.+)$/, 'Wheel landed on: $1')
    .replace(/^Magnet Bintang menarik 1 ★ dari (.+)!$/, 'Star Magnet pulled 1 ★ from $1!')
    .replace(/^Kotak Kejutan memberi (.+)!$/, 'Mystery Box gave $1!')
    .replace(/^Pemain (\d+): /, 'Player $1: ');
}

export type UiKey =
  | 'langLabel'
  | 'tagline'
  | 'careerLabel'
  | 'playOnline'
  | 'playLocal'
  | 'playBot'
  | 'howToPlay'
  | 'settings'
  | 'rejoinRoom'
  | 'dismiss'
  | 'back'
  | 'save'
  | 'close'
  | 'understood'
  | 'yourName'
  | 'studio3dBtn'
  | 'accessories'
  | 'modeRules'
  | 'createRoom'
  | 'roomCodePlaceholder'
  | 'join'
  | 'joinSpectator'
  | 'relayNote'
  | 'serverConnectedNote'
  | 'localHotSeat'
  | 'playersCount'
  | 'styleBtn'
  | 'startGame'
  | 'vsBotTitle'
  | 'botCount'
  | 'botDiff'
  | 'lobbyTitle'
  | 'spectators'
  | 'copyInvite'
  | 'hostAddBot'
  | 'startMatch'
  | 'readyDone'
  | 'pressReady'
  | 'spectatorWait'
  | 'leaveRoom'
  | 'connectingRoom'
  | 'cancel'
  | 'readyTag'
  | 'notReadyTag'
  | 'hostWaitShort'
  | 'chooseCharacterTitle'
  | 'studioTitle'
  | 'studioPlayerTitle'
  | 'studioSubtitle'
  | 'dragHint3d'
  | 'pickCharStep'
  | 'pickAccStep'
  | 'charNamePlaceholder'
  | 'turnYou'
  | 'turnBot'
  | 'turnOther'
  | 'spectatorMode'
  | 'animating'
  | 'chooseDice'
  | 'rollDice'
  | 'rollAgain'
  | 'waitingTurn'
  | 'bagLabel'
  | 'empty'
  | 'shopCost'
  | 'needStars'
  | 'bagFull'
  | 'buyTooltip'
  | 'hideLog'
  | 'logCount'
  | 'speed2x'
  | 'skip'
  | 'sticker'
  | 'emote'
  | 'settingsTitle'
  | 'muteLabel'
  | 'musicLabel'
  | 'volumeLabel'
  | 'colorblindLabel'
  | 'largeTextLabel'
  | 'reducedMotionLabel'
  | 'languageSettingLabel'
  | 'howtoTitle'
  | 'howtoTurnTitle'
  | 'howtoTurnDesc'
  | 'howtoTileTitle'
  | 'howtoTileDesc'
  | 'howtoSnakeTitle'
  | 'howtoSnakeDesc'
  | 'howtoShopTitle'
  | 'howtoShopDesc'
  | 'howtoItemTitle'
  | 'winnerBanner'
  | 'podiumTitle'
  | 'tileShort'
  | 'challengesWon'
  | 'laddersClimbed'
  | 'snakesBitten'
  | 'snakesDodged'
  | 'playAgain'
  | 'mainMenu'
  | 'tileLabel'
  | 'reward'
  | 'penalty'
  | 'ladderTileBanner'
  | 'snakeTileBanner'
  | 'pickDuelRival'
  | 'duelVsTitle'
  | 'opponentReady'
  | 'youWinChallenge'
  | 'youMissChallenge'
  | 'watchingChallenge'
  | 'botPlaying';

const ID_STRINGS: Record<UiKey, string> = {
  langLabel: 'ID',
  tagline: 'Papan Ular Tangga 3D Crayon & 100 Kotak Tantangan!',
  careerLabel: 'Karier:',
  playOnline: 'Main Online',
  playLocal: 'Main Lokal (1 Layar)',
  playBot: 'Lawan Bot',
  howToPlay: 'Cara Main',
  settings: 'Pengaturan',
  rejoinRoom: 'Lanjut Room',
  dismiss: 'Tutup',
  back: 'Kembali',
  save: 'Simpan',
  close: 'Tutup',
  understood: 'Siap Mengerti!',
  yourName: 'Nama Kamu',
  studio3dBtn: 'Studio 3D',
  accessories: 'Aksesoris:',
  modeRules: 'Mode Aturan:',
  createRoom: 'Buat Room Baru',
  roomCodePlaceholder: 'KODE (4 HURUF)',
  join: 'Gabung',
  joinSpectator: 'Masuk Penonton',
  relayNote: 'Online Realtime Aktif! Bagikan kode 4 huruf agar teman bisa gabung dari HP atau laptop mana saja.',
  serverConnectedNote: 'Terhubung ke server multiplayer realtime.',
  localHotSeat: 'Main Lokal (Hot-Seat)',
  playersCount: 'Pemain',
  styleBtn: 'Gaya',
  startGame: 'Mulai Main!',
  vsBotTitle: 'Lawan Bot',
  botCount: 'Jumlah Lawan Bot:',
  botDiff: 'Tingkat Kepintaran Bot:',
  lobbyTitle: 'Lobby Room',
  spectators: 'Penonton:',
  copyInvite: 'Salin',
  hostAddBot: '+ Bot',
  startMatch: 'Mulai!',
  readyDone: 'Sudah Siap',
  pressReady: 'Tekan Siap!',
  spectatorWait: 'Kamu masuk sebagai penonton. Menunggu host memulai...',
  leaveRoom: 'Keluar Room',
  connectingRoom: 'Menghubungkan ke room...',
  cancel: 'Batal',
  readyTag: 'Siap!',
  notReadyTag: 'Belum',
  hostWaitShort: 'Menunggu pemain lain...',
  chooseCharacterTitle: 'Studio Karakter & Aksesoris',
  studioTitle: 'Studio Karakter & Aksesoris',
  studioPlayerTitle: 'Studio Pemain',
  studioSubtitle: 'Pilih karakter favorit, warna pastel, dan aksesoris lucunya',
  dragHint3d: 'Geser kiri / kanan untuk memutar model 3D',
  pickCharStep: '1. Pilih Karakter Unik',
  pickAccStep: '2. Pasang Aksesoris',
  charNamePlaceholder: 'Nama Karakter',
  turnYou: 'GILIRANMU!',
  turnBot: 'Giliran Bot...',
  turnOther: 'Giliran',
  spectatorMode: 'Mode Penonton — duduk santai menikmati pertandingan!',
  animating: 'Pion sedang beraksi...',
  chooseDice: 'Pilih salah satu dadu emas:',
  rollDice: 'LEMPAR DADU',
  rollAgain: 'LEMPAR LAGI!',
  waitingTurn: 'Menunggu Giliran',
  bagLabel: 'TAS:',
  empty: 'Kosong',
  shopCost: 'Kantin',
  needStars: 'Butuh bintang',
  bagFull: 'Tas Penuh!',
  buyTooltip: 'Beli 1 item acak di Kantin Bintang!',
  hideLog: 'Sembunyikan Log',
  logCount: 'Log',
  speed2x: '2x Cepat',
  skip: 'Lewati',
  sticker: 'Stiker',
  emote: 'Stiker!',
  settingsTitle: 'Pengaturan',
  muteLabel: 'Bisu (Mute)',
  musicLabel: 'Musik Latar Tabletop',
  volumeLabel: 'Volume',
  colorblindLabel: 'Mode Ramah Buta Warna',
  largeTextLabel: 'Teks Besar',
  reducedMotionLabel: 'Kurangi Gerakan (Reduced Motion)',
  languageSettingLabel: 'Bahasa / Language',
  howtoTitle: 'Cara Main DodSnake',
  howtoTurnTitle: '1. Lempar Dadu & Kemampuan Karakter',
  howtoTurnDesc: 'Setiap giliran lempar dadu (angka 6 dapat bonus lempar lagi!). Tiap karakter punya perk pasif unik.',
  howtoTileTitle: '2. Kotak Tantangan & Kotak 100',
  howtoTileDesc: 'Hampir semua kotak menyimpan mini-game seru (< 15 detik). Untuk menang, mendarat pas di Kotak 100 dan taklukkan Bos Doodle!',
  howtoSnakeTitle: '3. Tangga, Ular & Kartu Kasihan',
  howtoSnakeDesc: 'Di petak Tangga, pion naik otomatis setelah tantangan! Di petak Ular, MENANG tantangan atau punya Perisai = lolos; KALAH = meluncur turun! (Jika gagal 2x beruntun, penalti dilewati.)',
  howtoShopTitle: '4. Kantin Bintang (Item Taktis)',
  howtoShopDesc: 'Kumpulkan Bintang dari mini-game lalu tukar 4 Bintang (3 Bintang khusus Roro Dino) untuk membeli Kotak Item sebelum melempar dadu!',
  howtoItemTitle: 'Koleksi Item Taktis:',
  winnerBanner: 'Pemenang Papan Crayon!',
  podiumTitle: 'Podium & Penghargaan Seru',
  tileShort: 'Kt.',
  challengesWon: 'Menang tantangan',
  laddersClimbed: 'Naik tangga',
  snakesBitten: 'Kena ular',
  snakesDodged: 'Lolos ular',
  playAgain: 'Main Lagi!',
  mainMenu: 'Menu Utama',
  tileLabel: 'KOTAK',
  reward: 'Hadiah:',
  penalty: 'Penalti:',
  ladderTileBanner: 'Petak Tangga ({from} → {to}): Setelah tantangan, pion otomatis NAIK!',
  snakeTileBanner: 'Petak Ular ({from} → {to}): Menang tantangan atau pakai Perisai agar TIDAK turun!',
  pickDuelRival: 'Pilih Lawan Duel!',
  duelVsTitle: 'DUEL!',
  opponentReady: 'Lawan siap bertanding',
  youWinChallenge: 'BERHASIL!',
  youMissChallenge: 'YAAH... COBA LAGI!',
  watchingChallenge: 'Menonton teman menyelesaikan tantangan...',
  botPlaying: 'Bot sedang memainkan tantangan secara otomatis...',
};

const EN_STRINGS: Record<UiKey, string> = {
  langLabel: 'EN',
  tagline: '3D Pastel Crayon Snakes & Ladders with 100 Mini-Game Tiles!',
  careerLabel: 'Career:',
  playOnline: 'Play Online',
  playLocal: 'Local Pass & Play',
  playBot: 'Vs Bots',
  howToPlay: 'How To Play',
  settings: 'Settings',
  rejoinRoom: 'Rejoin Room',
  dismiss: 'Dismiss',
  back: 'Back',
  save: 'Save',
  close: 'Close',
  understood: 'Got It!',
  yourName: 'Your Name',
  studio3dBtn: '3D Studio',
  accessories: 'Accessory:',
  modeRules: 'Rule Preset:',
  createRoom: 'Create Room',
  roomCodePlaceholder: 'CODE (4 CHARS)',
  join: 'Join',
  joinSpectator: 'Watch as Spectator',
  relayNote: 'Live Online Multiplayer Ready! Share the 4-letter room code so friends can join from any phone or computer.',
  serverConnectedNote: 'Connected to realtime multiplayer server.',
  localHotSeat: 'Local Game (Hot-Seat)',
  playersCount: 'Players',
  styleBtn: 'Style',
  startGame: 'Start Game!',
  vsBotTitle: 'Play Vs Bots',
  botCount: 'Number of Bots:',
  botDiff: 'Bot Difficulty:',
  lobbyTitle: 'Room Lobby',
  spectators: 'Spectators:',
  copyInvite: 'Copy Link',
  hostAddBot: '+ Bot',
  startMatch: 'Start Match!',
  readyDone: 'Ready!',
  pressReady: 'Ready Up!',
  spectatorWait: 'You joined as a spectator. Waiting for the host to start...',
  leaveRoom: 'Leave Room',
  connectingRoom: 'Connecting to room...',
  cancel: 'Cancel',
  readyTag: 'Ready!',
  notReadyTag: 'Not Ready',
  hostWaitShort: 'Waiting for other players...',
  chooseCharacterTitle: 'Character & Gear Studio',
  studioTitle: 'Character & Gear Studio',
  studioPlayerTitle: 'Player Studio',
  studioSubtitle: 'Pick your favorite doodle buddy, pastel coat, and cute gear',
  dragHint3d: 'Drag left / right to rotate 3D model',
  pickCharStep: '1. Choose Character',
  pickAccStep: '2. Equip Accessory',
  charNamePlaceholder: 'Character Name',
  turnYou: 'YOUR TURN!',
  turnBot: 'Bot Thinking...',
  turnOther: 'Turn:',
  spectatorMode: 'Spectator Mode — sit back and enjoy the race!',
  animating: 'Pawns are moving...',
  chooseDice: 'Choose one Golden Die:',
  rollDice: 'ROLL DICE',
  rollAgain: 'ROLL AGAIN!',
  waitingTurn: 'Waiting for Turn',
  bagLabel: 'BAG:',
  empty: 'Empty',
  shopCost: 'Shop',
  needStars: 'Need stars',
  bagFull: 'Bag Full!',
  buyTooltip: 'Buy 1 random tactical item at the Star Canteen!',
  hideLog: 'Hide Log',
  logCount: 'Log',
  speed2x: '2x Speed',
  skip: 'Skip',
  sticker: 'Sticker',
  emote: 'Emotes!',
  settingsTitle: 'Settings',
  muteLabel: 'Mute Sound',
  musicLabel: 'Tabletop Background Music',
  volumeLabel: 'Volume',
  colorblindLabel: 'Colorblind-Friendly Mode',
  largeTextLabel: 'Large Text',
  reducedMotionLabel: 'Reduced Motion',
  languageSettingLabel: 'Language / Bahasa',
  howtoTitle: 'How to Play DodSnake',
  howtoTurnTitle: '1. Roll Dice & Unique Perks',
  howtoTurnDesc: 'Roll on your turn (rolling a 6 grants an extra roll!). Every doodle character brings a passive perk.',
  howtoTileTitle: '2. Challenge Tiles & Tile 100',
  howtoTileDesc: 'Almost every tile holds a snappy mini-game (< 15s). Land cleanly on Tile 100 and defeat Boss Doodle to win!',
  howtoSnakeTitle: '3. Ladders, Snakes & Mercy Rule',
  howtoSnakeDesc: 'Ladder tiles automatically climb UP after the tile check! On Snake heads, WINNING the mini-game or holding a Shield keeps you safe; failing slides you down!',
  howtoShopTitle: '4. Star Canteen (Tactical Shop)',
  howtoShopDesc: 'Earn Stars from mini-games and spend 4 Stars (only 3 Stars for Roro the Dino) before rolling to grab a tactical item!',
  howtoItemTitle: 'Tactical Items:',
  winnerBanner: 'Board Champion!',
  podiumTitle: 'Podium & Superlative Awards',
  tileShort: 'Tile',
  challengesWon: 'Challenges won',
  laddersClimbed: 'Ladders climbed',
  snakesBitten: 'Snakes hit',
  snakesDodged: 'Snakes dodged',
  playAgain: 'Play Again!',
  mainMenu: 'Main Menu',
  tileLabel: 'TILE',
  reward: 'Reward:',
  penalty: 'Penalty:',
  ladderTileBanner: 'Ladder Tile ({from} → {to}): After this challenge, your pawn climbs UP!',
  snakeTileBanner: 'Snake Tile ({from} → {to}): Win this challenge or use a Shield to avoid sliding!',
  pickDuelRival: 'Pick Your Duel Rival!',
  duelVsTitle: 'DUEL!',
  opponentReady: 'Rival ready',
  youWinChallenge: 'SUCCESS!',
  youMissChallenge: 'MISSED!',
  watchingChallenge: 'Watching friend play the challenge...',
  botPlaying: 'Bot is playing this challenge automatically...',
};

export function tr(lang: AppLanguage, key: UiKey, vars?: Record<string, string | number>): string {
  const dict = lang === 'en' ? EN_STRINGS : ID_STRINGS;
  let str = dict[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
