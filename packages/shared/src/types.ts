export type PawnId = 'kucing' | 'kodok' | 'bebek' | 'panda' | 'dino' | 'jamur';

export type PlayerColorId = 'pink' | 'kuning' | 'mint' | 'biru' | 'oranye' | 'ungu';

export const PLAYER_COLORS: Record<PlayerColorId, { name: string; hex: string }> = {
  pink: { name: 'Pink Permen', hex: '#FF8FB1' },
  kuning: { name: 'Kuning Mentega', hex: '#FFD166' },
  mint: { name: 'Mint Segar', hex: '#6EE7B7' },
  biru: { name: 'Biru Langit', hex: '#7CC6FE' },
  oranye: { name: 'Oranye Jeruk', hex: '#FF9F5A' },
  ungu: { name: 'Ungu Anggur', hex: '#B69CFF' },
};

export interface PawnMetaInfo {
  name: string;
  shortName: string;
  title: string;
  accessory: string;
  tagline: string;
  perkTitle: string;
  perkDesc: string;
}

export const PAWN_META: Record<PawnId, PawnMetaInfo> = {
  kucing: {
    name: 'Mochi si Kucing',
    shortName: 'Mochi',
    title: 'Pemburu Tangga',
    accessory: 'Pita Merah Muda & Lonceng',
    tagline: 'Meong gesit pencinta lonceng manis',
    perkTitle: 'Kaki Gesit',
    perkDesc: '+1 ★ ekstra setiap kali memanjat tangga.',
  },
  kodok: {
    name: 'Koko si Kodok',
    shortName: 'Koko',
    title: 'Pelompat Teratai',
    accessory: 'Topi Daun & Kuncup Kuning',
    tagline: 'Lompat jauh di atas daun teratai',
    perkTitle: 'Lompatan Kodok',
    perkDesc: 'Melempar dadu 1 langsung melompat +1 langkah tambahan.',
  },
  bebek: {
    name: 'Wekwek si Bebek',
    shortName: 'Wekwek',
    title: 'Jagoan Pesta',
    accessory: 'Syal Polka & Jambul Cerah',
    tagline: 'Kwek kwek ceria penuh semangat duel',
    perkTitle: 'Semangat Pesta',
    perkDesc: '+1 ★ bonus tiap menang di mode Duel atau Semua Main.',
  },
  panda: {
    name: 'Boba si Panda',
    shortName: 'Boba',
    title: 'Ahli Fokus Bambu',
    accessory: 'Kacamata Bulat & Tunas Bambu',
    tagline: 'Kalem menyeruput teh sambil mikir cepat',
    perkTitle: 'Santai Fokus',
    perkDesc: '+1.5 detik waktu ekstra untuk tantangan di gilirannya.',
  },
  dino: {
    name: 'Roro si Dino',
    shortName: 'Roro',
    title: 'Bos Kantin',
    accessory: 'Mahkota Emas & Ekor Spikes',
    tagline: 'Gahar tapi imut maksimal, langganan VIP kantin',
    perkTitle: 'Diskon Kantin',
    perkDesc: 'Beli kotak item di Kantin Bintang cukup 3 ★ saja.',
  },
  jamur: {
    name: 'Toady si Jamur',
    shortName: 'Toady',
    title: 'Pembawa Hoki',
    accessory: 'Topi Bintang Polkadot',
    tagline: 'Kecil-kecil bersinar bikin ular terpesona',
    perkTitle: 'Aura Hoki',
    perkDesc: '+1 ★ keberuntungan setiap berhasil menghindari ular.',
  },
};

export type AccessoryId = 'none' | 'crown' | 'glasses' | 'scarf' | 'headset' | 'flower' | 'backpack';

export interface AccessoryMetaInfo {
  id: AccessoryId;
  name: string;
  shortName: string;
  description: string;
}

export const ACCESSORY_META: Record<AccessoryId, AccessoryMetaInfo> = {
  none: {
    id: 'none',
    name: 'Gaya Asli',
    shortName: 'Asli',
    description: 'Tampil dengan ciri khas bawaan karakter tanpa tambahan.',
  },
  crown: {
    id: 'crown',
    name: 'Mahkota Mini',
    shortName: 'Mahkota',
    description: 'Mahkota keemasan mungil untuk calon juara papan.',
  },
  glasses: {
    id: 'glasses',
    name: 'Kacamata Bulat',
    shortName: 'Kacamata',
    description: 'Kacamata santai penuh gaya buat pecinta tantangan kuis.',
  },
  scarf: {
    id: 'scarf',
    name: 'Syal Rajut',
    shortName: 'Syal',
    description: 'Syal rajut hangat bergaris yang bikin langkah makin nyaman.',
  },
  headset: {
    id: 'headset',
    name: 'Headset Pastel',
    shortName: 'Headset',
    description: 'Headset gaming imut untuk fokus mendengarkan musik & ritme.',
  },
  flower: {
    id: 'flower',
    name: 'Jepit Bunga',
    shortName: 'Bunga',
    description: 'Kelopak bunga mekar ceria di atas kepala karakter.',
  },
  backpack: {
    id: 'backpack',
    name: 'Ransel Bintang',
    shortName: 'Ransel',
    description: 'Tas petualang mini dengan gantungan bintang keberuntungan.',
  },
};

export type ZoneId = 'taman_permen' | 'hutan_ngantuk' | 'gunung_es' | 'kastil_awan';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  startTile: number;
  endTile: number;
  accentColor: string;
  secondaryColor: string;
  description: string;
}

export interface LadderDef {
  id: string;
  from: number;
  to: number;
}

export type SnakePersonality = 'ngantuk' | 'usil' | 'kaget' | 'kenyang';

export interface SnakeDef {
  id: string;
  from: number; // head
  to: number;   // tail
  personality: SnakePersonality;
}

export interface BoardLayout {
  size: number;
  gridWidth: number;
  gridHeight: number;
  zones: ZoneDef[];
  ladders: LadderDef[];
  snakes: SnakeDef[];
}

export type ChallengeArchetype =
  | 'start'
  | 'tap_timing'
  | 'quick_quiz'
  | 'memory_doodle'
  | 'spam_tap'
  | 'swipe_dodge'
  | 'shadow_match'
  | 'quick_math'
  | 'word_scramble'
  | 'trace_line'
  | 'lucky_wheel'
  | 'stroop_color'
  | 'quick_duel'
  | 'gift_trap'
  | 'bubble_pop'
  | 'rhythm_clap'
  | 'color_count'
  | 'balance_bar'
  | 'pair_flip'
  | 'number_order'
  | 'odd_one_out'
  | 'pattern_next'
  | 'math_compare'
  | 'target_sum'
  | 'arrow_blitz'
  | 'boss_doodle';

export type ChallengeMode = 'solo' | 'duel' | 'all_play';

export type BonusType = 'advance' | 'extra_dice' | 'shield' | 'none';
export type PenaltyType = 'retreat' | 'skip_turn' | 'none';

export interface ChallengeReward {
  stars: number;
  bonusType: BonusType;
  bonusValue?: number;
}

export interface ChallengePenalty {
  type: PenaltyType;
  value?: number;
}

export interface Tile {
  id: number;
  zone: ZoneId;
  archetype: ChallengeArchetype;
  mode: ChallengeMode;
  difficulty: number; // 1..4
  title: string;
  flavorText: string;
  params: Record<string, unknown>;
  reward: ChallengeReward;
  penalty: ChallengePenalty;
}

export type ItemType =
  | 'shield'
  | 'golden_dice'
  | 'brake'
  | 'surprise'
  | 'magnet_star'
  | 'swap_turbo'
  | 'star_multiplier'
  | 'rival_brake';

export type BoardSpecialKind =
  | 'star_fountain'
  | 'supply_crate'
  | 'shield_shrine'
  | 'tailwind';

export interface BoardSpecialTile {
  tileId: number;
  kind: BoardSpecialKind;
  name: string;
  description: string;
}

export type MatchMissionKind = 'climb_2' | 'win_3' | 'streak_2' | 'use_2_items';

export interface MatchMission {
  kind: MatchMissionKind;
  progress: number;
  target: number;
  completed: boolean;
}

export type GameModePreset = 'klasik' | 'kilat' | 'pesta_item';

export const GAME_MODE_META: Record<GameModePreset, { name: string; description: string }> = {
  klasik: {
    name: 'Klasik Seru',
    description: 'Aturan standar Ular Tangga 100 petak yang adil dan seimbang.',
  },
  kilat: {
    name: 'Mode Kilat',
    description: 'Mulai dengan 1 item + 2 bintang dan langkah tantangan lebih ngebut!',
  },
  pesta_item: {
    name: 'Pesta Item',
    description: 'Mulai dengan 1 item & peluang dapat item ekstra berlipat ganda!',
  },
};

export const ITEM_META: Record<ItemType, { name: string; description: string; icon: string }> = {
  shield: {
    name: 'Perisai Anti-Ular',
    description: 'Menangkis 1 gigitan ular nakal secara otomatis!',
    icon: 'shield',
  },
  golden_dice: {
    name: 'Dadu Emas',
    description: 'Lempar 2 dadu sekaligus dan pilih angka favoritmu.',
    icon: 'golden_dice',
  },
  brake: {
    name: 'Rem Mendadak',
    description: 'Batasi lemparan dadu berikutnya maksimal angka 3.',
    icon: 'brake',
  },
  surprise: {
    name: 'Kotak Kejutan',
    description: 'Efek acak lucu sebelum melangkah!',
    icon: 'surprise',
  },
  magnet_star: {
    name: 'Magnet Bintang',
    description: 'Tarik 1 bintang dari pemimpin klasemen (atau +1 bintang bonus)!',
    icon: 'magnet_star',
  },
  swap_turbo: {
    name: 'Sepatu Turbo',
    description: 'Tambahkan +2 langkah ekstra pada lemparan dadu berikutnya!',
    icon: 'swap_turbo',
  },
  star_multiplier: {
    name: 'Jimat Ganda',
    description: 'Gandakan hadiah bintang (+2x) jika menang tantangan giliran ini!',
    icon: 'star_multiplier',
  },
  rival_brake: {
    name: 'Jebakan Rem',
    description: 'Pasang Rem ke lawan terdepan agar lemparan berikutnya maksimal angka 3!',
    icon: 'rival_brake',
  },
};

export const STAR_SHOP_COST = 4;

/** Returns the Kantin Bintang star cost for the given character pawn. */
export function getPlayerShopCost(pawn: PawnId): number {
  return pawn === 'dino' ? Math.max(1, STAR_SHOP_COST - 1) : STAR_SHOP_COST;
}

/** Returns extra challenge time budget (ms) granted by the character perk. */
export function getChallengeBonusDurationMs(pawn: PawnId): number {
  return pawn === 'panda' ? 1500 : 0;
}

export type BotDifficulty = 'santai' | 'pintar' | 'juara';

export type EmoteId = 'jempol' | 'ketawa' | 'kaget' | 'nangis' | 'api' | 'mahkota';

export interface PlayerStats {
  rolls: number;
  challengesWon: number;
  challengesTotal: number;
  laddersClimbed: number;
  snakesBitten: number;
  snakesDodged: number;
  itemsUsed: number;
}

export interface Player {
  id: string;
  name: string;
  pawn: PawnId;
  color: PlayerColorId;
  accessory?: AccessoryId;
  position: number; // 1..100
  stars: number;
  items: ItemType[]; // max 2
  shields: number;   // active snake shields
  skipTurns: number;
  consecutiveSixes: number;
  consecutivePenalties: number;
  challengeStreak: number;
  extraRollsPending: number;
  activeGoldenDice: boolean;
  activeBrake: boolean;
  activeTurbo: boolean;
  activeDoubleStars?: boolean;
  mission?: MatchMission;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  connected: boolean;
  ready: boolean;
  disconnectedAt?: number;
  stats: PlayerStats;
}

export type GamePhase =
  | 'LOBBY'
  | 'STARTING'
  | 'TURN_BEGIN'
  | 'ROLL'
  | 'MOVE'
  | 'TILE_CHECK'
  | 'CHALLENGE'
  | 'APPLY_RESULT'
  | 'EXTRA_ROLL'
  | 'TURN_END'
  | 'GAME_OVER';

export interface ChallengeInputLog {
  startedAt: number;
  completedAt: number;
  reactionMs?: number;
  tapTimestamps?: number[];
  answerIndex?: number;
  answerText?: string;
  sequenceIndices?: number[];
  pathAccuracy?: number;
  hitsTaken?: number;
  needlePos?: number;
  duelOpponentId?: string;
  bossStagesPassed?: number;
  extra?: Record<string, unknown>;
}

export interface ChallengeSubmission {
  playerId: string;
  claimedSuccess: boolean;
  score: number;
  inputLog: ChallengeInputLog;
}

export interface ActiveChallenge {
  tileId: number;
  archetype: ChallengeArchetype;
  mode: ChallengeMode;
  difficulty: number;
  title: string;
  flavorText: string;
  seed: number;
  params: Record<string, unknown>;
  reward: ChallengeReward;
  penalty: ChallengePenalty;
  ownerPlayerId: string;
  opponentId?: string; // for duel
  awaitingDuelPick?: boolean;
  participantIds: string[];
  submissions: Record<string, ChallengeSubmission>;
  deadlineAt: number;
  durationMs: number;
}

export interface PendingRoll {
  playerId: string;
  diceValues: number[]; // length 1 normally, length 2 if golden dice
  chosenValue?: number;
  usedBrake: boolean;
  usedGoldenDice: boolean;
  usedTurbo?: boolean;
}

export interface PodiumEntry {
  rank: number;
  playerId: string;
  name: string;
  pawn: PawnId;
  color: PlayerColorId;
  accessory?: AccessoryId;
  position: number;
  stars: number;
  isWinner: boolean;
}

export interface GameState {
  stateVersion: number;
  matchSeed: number;
  rulePreset: GameModePreset;
  eventSeq: number;
  turnNumber: number;
  phase: GamePhase;
  board: BoardLayout;
  players: Player[];
  turnOrder: string[];
  currentTurnIndex: number;
  pendingRoll: PendingRoll | null;
  activeChallenge: ActiveChallenge | null;
  turnDeadlineAt: number | null;
  winnerId: string | null;
  podium: PodiumEntry[];
}

export interface ChallengeParticipantOutcome {
  playerId: string;
  success: boolean;
  score: number;
  rank: number;
  reason?: string;
}

export type GameEvent =
  | {
      type: 'GameStarted';
      seq: number;
      matchSeed: number;
      turnOrder: string[];
      firstPlayerId: string;
    }
  | {
      type: 'TurnStarted';
      seq: number;
      playerId: string;
      turnNumber: number;
    }
  | {
      type: 'TurnSkipped';
      seq: number;
      playerId: string;
      reason: string;
    }
  | {
      type: 'DiceRolled';
      seq: number;
      playerId: string;
      diceValues: number[];
      needsChoice: boolean;
      usedGoldenDice: boolean;
      usedBrake: boolean;
      usedTurbo?: boolean;
    }
  | {
      type: 'DiceChosen';
      seq: number;
      playerId: string;
      value: number;
    }
  | {
      type: 'PawnMoved';
      seq: number;
      playerId: string;
      from: number;
      to: number;
      path: number[];
      bounced: boolean;
      reason: 'dice' | 'bonus_advance' | 'penalty_retreat' | 'surprise';
    }
  | {
      type: 'LadderClimbed';
      seq: number;
      playerId: string;
      ladderId: string;
      from: number;
      to: number;
    }
  | {
      type: 'SnakeBitten';
      seq: number;
      playerId: string;
      snakeId: string;
      from: number;
      to: number;
      blockedByShield: boolean;
      dodgedByChallenge: boolean;
    }
  | {
      type: 'ChallengeStarted';
      seq: number;
      challenge: ActiveChallenge;
    }
  | {
      type: 'ChallengeResolved';
      seq: number;
      tileId: number;
      archetype: ChallengeArchetype;
      ownerPlayerId: string;
      outcomes: ChallengeParticipantOutcome[];
      starsDelta: Record<string, number>;
      shieldsDelta?: Record<string, number>;
      bonusApplied?: string;
      penaltyApplied?: string;
      antiFrustrationSaved: boolean;
      serverSummaryText: string;
    }
  | {
      type: 'ItemGained';
      seq: number;
      playerId: string;
      item: ItemType;
      source: 'challenge' | 'trailing_bonus' | 'wheel' | 'gift' | 'starter' | 'star_shop' | 'board_event' | 'mission';
      starsCost?: number;
    }
  | {
      type: 'ItemUsed';
      seq: number;
      playerId: string;
      item: ItemType;
      effectDescription: string;
      targetPlayerId?: string;
      starsDelta?: number;
      shieldsDelta?: number;
    }
  | {
      type: 'BoardSpecialTriggered';
      seq: number;
      playerId: string;
      tileId: number;
      kind: BoardSpecialKind;
      starsDelta?: number;
      shieldsDelta?: number;
      grantedItem?: ItemType;
      movedTo?: number;
    }
  | {
      type: 'MissionCompleted';
      seq: number;
      playerId: string;
      kind: MatchMissionKind;
      starsDelta: number;
      grantedItem?: ItemType;
      shieldsDelta?: number;
    }
  | {
      type: 'ExtraRollGranted';
      seq: number;
      playerId: string;
      reason: 'rolled_six' | 'challenge_bonus';
    }
  | {
      type: 'TurnChanged';
      seq: number;
      previousPlayerId: string;
      nextPlayerId: string;
      turnNumber: number;
    }
  | {
      type: 'GameWon';
      seq: number;
      winnerId: string;
      podium: PodiumEntry[];
    };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
