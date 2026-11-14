import type {
  BotDifficulty,
  ChallengeArchetype,
  ChallengeMode,
  ChallengeSubmission,
} from '../types.js';
import { SeededRng, hashSeed } from '../rng.js';
import { QUIZ_BANK } from './quizBank.js';
import {
  GIFT_TRAP_VARIANTS,
  SCRAMBLE_WORDS,
  SHADOW_ITEMS,
  STROOP_COLORS,
} from './wordBank.js';

export interface ValidationOutcome {
  success: boolean;
  score: number;
  reason?: string;
}

export interface ArchetypeSpec {
  id: ChallengeArchetype;
  displayName: string;
  instruction: string;
  baseDurationMs: number;
  allowedModes: ChallengeMode[];
  buildParams: (rng: SeededRng, difficulty: number, tileId: number) => Record<string, unknown>;
  validate: (
    params: Record<string, unknown>,
    submission: ChallengeSubmission,
    seed: number,
  ) => ValidationOutcome;
  simulateBot: (
    params: Record<string, unknown>,
    botDifficulty: BotDifficulty,
    rng: SeededRng,
  ) => ChallengeSubmission['inputLog'] & { claimedSuccess: boolean; score: number };
}

const MIN_REACTION_MS = 120;

const WHEEL_SLICES = [
  { id: 'jackpot', label: '+4 ★ & Maju 2!', kind: 'big_win', stars: 4, advance: 2 },
  { id: 'item', label: 'Dapat Item Acak!', kind: 'item', stars: 1, advance: 0 },
  { id: 'shield', label: 'Perisai Anti-Ular!', kind: 'shield', stars: 1, advance: 0 },
  { id: 'stars', label: 'Bonus +3 ★', kind: 'small_win', stars: 3, advance: 0 },
  { id: 'zonk', label: 'Zonk Lucu (0 ★)', kind: 'nothing', stars: 0, advance: 0 },
  { id: 'slip', label: 'Kepeleset (-1 Kotak)', kind: 'slip', stars: 0, advance: -1 },
] as const;

const TRACE_SHAPES = ['zigzag', 'wave', 'loop', 'spiral'] as const;

const MEMORY_POOL = [
  { id: 'star', label: 'Bintang' },
  { id: 'candy', label: 'Permen' },
  { id: 'cat', label: 'Mochi' },
  { id: 'cloud', label: 'Awan' },
  { id: 'mushroom', label: 'Jamur' },
  { id: 'crown', label: 'Mahkota' },
];

function botSuccessRate(botDifficulty: BotDifficulty, challengeDifficulty: number): number {
  const base = botDifficulty === 'juara' ? 0.86 : botDifficulty === 'pintar' ? 0.68 : 0.48;
  const penalty = (challengeDifficulty - 1) * 0.05;
  return Math.max(0.25, Math.min(0.92, base - penalty));
}

function buildMathExpression(rng: SeededRng, difficulty: number): {
  expression: string;
  options: number[];
  correctIndex: number;
  correctAnswer: number;
} {
  let a = 2;
  let b = 3;
  let op = '+';
  let ans = 5;

  if (difficulty <= 1) {
    a = rng.nextInt(3, 15);
    b = rng.nextInt(2, 12);
    op = rng.chance(0.6) ? '+' : '-';
    if (op === '-' && b > a) [a, b] = [b, a];
    ans = op === '+' ? a + b : a - b;
  } else if (difficulty === 2) {
    if (rng.chance(0.5)) {
      a = rng.nextInt(10, 35);
      b = rng.nextInt(8, 25);
      op = rng.chance(0.5) ? '+' : '-';
      if (op === '-' && b > a) [a, b] = [b, a];
      ans = op === '+' ? a + b : a - b;
    } else {
      a = rng.nextInt(3, 9);
      b = rng.nextInt(3, 9);
      op = '×';
      ans = a * b;
    }
  } else if (difficulty === 3) {
    a = rng.nextInt(6, 14);
    b = rng.nextInt(4, 12);
    op = '×';
    ans = a * b;
  } else {
    const x = rng.nextInt(5, 12);
    const y = rng.nextInt(4, 9);
    const z = rng.nextInt(3, 15);
    const add = rng.chance(0.5);
    ans = add ? x * y + z : x * y - z;
    const expression = `${x} × ${y} ${add ? '+' : '-'} ${z}`;
    const distractors = new Set<number>([ans]);
    while (distractors.size < 4) {
      const offset = rng.pick([-10, -4, -2, -1, 1, 2, 4, 6, 10]);
      const cand = Math.max(0, ans + offset);
      distractors.add(cand);
    }
    const options = rng.shuffle([...distractors]);
    return {
      expression,
      options,
      correctIndex: options.indexOf(ans),
      correctAnswer: ans,
    };
  }

  const expression = `${a} ${op} ${b}`;
  const distractors = new Set<number>([ans]);
  while (distractors.size < 4) {
    const offset = rng.pick([-5, -3, -2, -1, 1, 2, 3, 5, 10]);
    const cand = Math.max(0, ans + offset);
    distractors.add(cand);
  }
  const options = rng.shuffle([...distractors]);
  return {
    expression,
    options,
    correctIndex: options.indexOf(ans),
    correctAnswer: ans,
  };
}

export const ARCHETYPE_REGISTRY: Record<ChallengeArchetype, ArchetypeSpec> = {
  start: {
    id: 'start',
    displayName: 'Kotak Mulai',
    instruction: 'Tarik napas, petualangan dimulai!',
    baseDurationMs: 0,
    allowedModes: ['solo'],
    buildParams: () => ({}),
    validate: () => ({ success: true, score: 100 }),
    simulateBot: () => ({
      startedAt: 0,
      completedAt: 100,
      claimedSuccess: true,
      score: 100,
    }),
  },

  tap_timing: {
    id: 'tap_timing',
    displayName: 'Tap Timing',
    instruction: 'Ketuk tepat saat jarum berada di area hijau!',
    baseDurationMs: 9000,
    allowedModes: ['solo', 'all_play'],
    buildParams: (rng, difficulty) => {
      const widths = [0.34, 0.28, 0.23, 0.19];
      const speeds = [0.76, 0.92, 1.08, 1.24];
      const zoneWidth = widths[Math.min(3, Math.max(0, difficulty - 1))];
      const speed = speeds[Math.min(3, Math.max(0, difficulty - 1))];
      const zoneCenter = Number(rng.nextFloat(0.24, 0.76).toFixed(2));
      return { zoneCenter, zoneWidth, speed, difficulty };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      const needlePos = sub.inputLog.needlePos ?? -1;
      const center = Number(params.zoneCenter ?? 0.5);
      const width = Number(params.zoneWidth ?? 0.25);
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Terlalu cepat (<120ms)' };
      }
      if (needlePos < 0 || needlePos > 1) {
        return { success: false, score: 0, reason: 'Posisi jarum tidak valid' };
      }
      const dist = Math.abs(needlePos - center);
      const success = dist <= width / 2 + 0.035;
      const score = Math.max(0, Math.round(100 - dist * 160));
      return { success, score };
    },
    simulateBot: (params, botDiff, rng) => {
      const center = Number(params.zoneCenter ?? 0.5);
      const width = Number(params.zoneWidth ?? 0.2);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const offset = win
        ? rng.nextFloat(-width * 0.42, width * 0.42)
        : rng.pick([-1, 1]) * rng.nextFloat(width * 0.65, width * 1.3);
      const needlePos = Math.max(0.02, Math.min(0.98, center + offset));
      const reactionMs = rng.nextInt(450, 2200);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        needlePos,
        claimedSuccess: win,
        score: win ? 85 : 20,
      };
    },
  },

  quick_quiz: {
    id: 'quick_quiz',
    displayName: 'Kuis Kilat',
    instruction: 'Pilih jawaban yang paling tepat sebelum waktu habis!',
    baseDurationMs: 11500,
    allowedModes: ['solo', 'all_play'],
    buildParams: (rng, difficulty, tileId) => {
      const pool = QUIZ_BANK.filter((q) => q.difficulty === difficulty);
      const fallbackPool = pool.length > 0 ? pool : QUIZ_BANK;
      const q = fallbackPool[(tileId * 7 + rng.nextInt(0, fallbackPool.length - 1)) % fallbackPool.length];
      return {
        questionId: q.id,
        category: q.category,
        question: q.question,
        options: q.options,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      const answerIndex = sub.inputLog.answerIndex;
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Waktu reaksi tidak wajar' };
      }
      const q = QUIZ_BANK.find((item) => item.id === Number(params.questionId));
      if (!q || typeof answerIndex !== 'number') {
        return { success: false, score: 0, reason: 'Jawaban tidak valid' };
      }
      const success = answerIndex === q.correctIndex;
      const speedBonus = Math.max(0, Math.round((8500 - reactionMs) / 100));
      return { success, score: success ? 60 + speedBonus : 0 };
    },
    simulateBot: (params, botDiff, rng) => {
      const q = QUIZ_BANK.find((item) => item.id === Number(params.questionId)) ?? QUIZ_BANK[0];
      const win = rng.chance(botSuccessRate(botDiff, q.difficulty));
      let answerIndex = q.correctIndex;
      if (!win) {
        const wrongs = [0, 1, 2, 3].filter((i) => i !== q.correctIndex);
        answerIndex = rng.pick(wrongs) as 0 | 1 | 2 | 3;
      }
      const reactionMs = rng.nextInt(900, 4200);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        answerIndex,
        claimedSuccess: win,
        score: win ? 90 : 0,
      };
    },
  },

  memory_doodle: {
    id: 'memory_doodle',
    displayName: 'Memory Doodle',
    instruction: 'Perhatikan urutan gambar lucu, lalu ketuk ulang persis sama!',
    baseDurationMs: 12500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const seqLength = [3, 3, 4, 5][Math.min(3, Math.max(0, difficulty - 1))];
      const poolSize = difficulty >= 3 ? 5 : 4;
      const pool = rng.shuffle(MEMORY_POOL).slice(0, poolSize);
      const sequence: number[] = [];
      for (let i = 0; i < seqLength; i++) {
        sequence.push(rng.nextInt(0, pool.length - 1));
      }
      return { pool, sequence, difficulty };
    },
    validate: (params, sub) => {
      const expected = params.sequence as number[];
      const got = sub.inputLog.sequenceIndices ?? [];
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      if (!Array.isArray(expected) || reactionMs < MIN_REACTION_MS * expected.length) {
        return { success: false, score: 0, reason: 'Input terlalu cepat' };
      }
      if (!Array.isArray(got) || got.length !== expected.length) {
        return { success: false, score: 0 };
      }
      const exact = expected.every((val, idx) => got[idx] === val);
      return { success: exact, score: exact ? 100 : 10 };
    },
    simulateBot: (params, botDiff, rng) => {
      const expected = params.sequence as number[];
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const sequenceIndices = win
        ? [...expected]
        : expected.map((v, i) => (i === expected.length - 1 ? (v + 1) % 4 : v));
      const reactionMs = rng.nextInt(1200, 4000);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        sequenceIndices,
        claimedSuccess: win,
        score: win ? 100 : 10,
      };
    },
  },

  spam_tap: {
    id: 'spam_tap',
    displayName: 'Spam Tap',
    instruction: 'Ketuk tombol (atau tekan Spasi) sampai target tercapai!',
    baseDurationMs: 8000,
    allowedModes: ['solo', 'all_play'],
    buildParams: (_rng, difficulty) => {
      const targets = [10, 13, 16, 19];
      const targetTaps = targets[Math.min(3, Math.max(0, difficulty - 1))];
      return { targetTaps, windowMs: 7000, difficulty };
    },
    validate: (params, sub) => {
      const targetTaps = Number(params.targetTaps ?? 13);
      const windowMs = Number(params.windowMs ?? 7000);
      const timestamps = sub.inputLog.tapTimestamps ?? [];
      if (!Array.isArray(timestamps)) {
        return { success: false, score: 0, reason: 'Log ketukan tidak valid' };
      }
      // Realistic human tap cap within windowMs
      if (timestamps.length > 95) {
        return { success: false, score: 0, reason: 'Laju ketukan melebihi batas manusia' };
      }
      let validCount = 0;
      let prev = -50;
      let rapidViolations = 0;
      for (const ts of timestamps) {
        if (typeof ts !== 'number' || ts < 0 || ts > windowMs + 900 || ts < prev) {
          return { success: false, score: 0, reason: 'Timestamp ketukan tidak valid' };
        }
        if (prev >= 0 && ts - prev < 35) {
          rapidViolations++;
        }
        prev = ts;
        validCount++;
      }
      if (rapidViolations > 4) {
        return { success: false, score: 0, reason: 'Auto-clicker terdeteksi' };
      }
      return { success: validCount >= targetTaps, score: validCount };
    },
    simulateBot: (params, botDiff, rng) => {
      const targetTaps = Number(params.targetTaps ?? 14);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const taps = win
        ? rng.nextInt(targetTaps, targetTaps + 8)
        : rng.nextInt(Math.max(4, targetTaps - 5), targetTaps - 1);
      const tapTimestamps: number[] = [];
      let t = 150;
      const step = Math.floor(4600 / Math.max(1, taps));
      for (let i = 0; i < taps; i++) {
        t += Math.max(55, step + rng.nextInt(-15, 15));
        tapTimestamps.push(Math.min(4950, t));
      }
      return {
        startedAt: 0,
        completedAt: 5000,
        reactionMs: tapTimestamps[0] ?? 200,
        tapTimestamps,
        claimedSuccess: win,
        score: taps,
      };
    },
  },

  swipe_dodge: {
    id: 'swipe_dodge',
    displayName: 'Geser & Hindari',
    instruction: 'Geser kiri/kanan untuk menghindari batu tinta yang jatuh!',
    baseDurationMs: 8500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const count = 3 + difficulty * 2; // 5, 7, 9, 11 obstacles
      const obstacles: Array<{ lane: number; timeMs: number }> = [];
      const durationMs = 6500;
      const spacing = Math.floor(5000 / count);
      for (let i = 0; i < count; i++) {
        obstacles.push({
          lane: rng.nextInt(0, 2),
          timeMs: 1100 + i * spacing + rng.nextInt(-50, 50),
        });
      }
      const maxHitsAllowed = difficulty <= 1 ? 2 : 1;
      return { obstacles, durationMs, maxHitsAllowed, difficulty };
    },
    validate: (params, sub) => {
      const hitsTaken = sub.inputLog.hitsTaken ?? 99;
      const maxHitsAllowed = Number(params.maxHitsAllowed ?? 1);
      const elapsed = sub.inputLog.completedAt - sub.inputLog.startedAt;
      if (elapsed < 3000 || hitsTaken < 0) {
        return { success: false, score: 0, reason: 'Durasi hindar tidak valid' };
      }
      const success = hitsTaken <= maxHitsAllowed;
      const score = Math.max(0, 100 - hitsTaken * 40);
      return { success, score };
    },
    simulateBot: (params, botDiff, rng) => {
      const maxHitsAllowed = Number(params.maxHitsAllowed ?? 1);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const hitsTaken = win ? rng.nextInt(0, maxHitsAllowed) : maxHitsAllowed + rng.nextInt(1, 2);
      return {
        startedAt: 0,
        completedAt: 5500,
        reactionMs: 500,
        hitsTaken,
        claimedSuccess: win,
        score: Math.max(0, 100 - hitsTaken * 40),
      };
    },
  },

  shadow_match: {
    id: 'shadow_match',
    displayName: 'Tebak Bayangan',
    instruction: 'Cocokkan bayangan hitam dengan gambar doodle aslinya!',
    baseDurationMs: 10000,
    allowedModes: ['solo', 'all_play'],
    buildParams: (rng, difficulty) => {
      const chosen = rng.shuffle(SHADOW_ITEMS).slice(0, 4);
      const correctIndex = rng.nextInt(0, 3);
      return {
        targetId: chosen[correctIndex].id,
        targetShape: chosen[correctIndex].shape,
        options: chosen.map((c) => ({ id: c.id, label: c.label, shape: c.shape })),
        correctIndex,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Terlalu cepat (<120ms)' };
      }
      const success = sub.inputLog.answerIndex === Number(params.correctIndex);
      return { success, score: success ? Math.max(50, 100 - Math.floor(reactionMs / 100)) : 0 };
    },
    simulateBot: (params, botDiff, rng) => {
      const correctIndex = Number(params.correctIndex ?? 0);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const answerIndex = win ? correctIndex : (correctIndex + rng.nextInt(1, 3)) % 4;
      const reactionMs = rng.nextInt(600, 3200);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        answerIndex,
        claimedSuccess: win,
        score: win ? 85 : 0,
      };
    },
  },

  quick_math: {
    id: 'quick_math',
    displayName: 'Hitung Cepat',
    instruction: 'Selesaikan hitungan doodle ini sebelum waktu habis!',
    baseDurationMs: 10500,
    allowedModes: ['solo', 'all_play'],
    buildParams: (rng, difficulty) => {
      const math = buildMathExpression(rng, difficulty);
      return { ...math, difficulty };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Terlalu cepat (<120ms)' };
      }
      const success = sub.inputLog.answerIndex === Number(params.correctIndex);
      return { success, score: success ? Math.max(50, 100 - Math.floor(reactionMs / 100)) : 0 };
    },
    simulateBot: (params, botDiff, rng) => {
      const correctIndex = Number(params.correctIndex ?? 0);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const answerIndex = win ? correctIndex : (correctIndex + rng.nextInt(1, 3)) % 4;
      const reactionMs = rng.nextInt(700, 3600);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        answerIndex,
        claimedSuccess: win,
        score: win ? 85 : 0,
      };
    },
  },

  word_scramble: {
    id: 'word_scramble',
    displayName: 'Susun Kata',
    instruction: 'Susun huruf acak menjadi kata Bahasa Indonesia yang tepat!',
    baseDurationMs: 14500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const pool = SCRAMBLE_WORDS.filter((w) => w.difficulty === difficulty);
      const item = rng.pick(pool.length ? pool : SCRAMBLE_WORDS);
      const letters = item.word.split('');
      let scrambled = rng.shuffle(letters);
      if (scrambled.join('') === item.word && letters.length > 1) {
        scrambled = [...letters.slice(1), letters[0]];
      }
      return {
        word: item.word,
        hint: item.hint,
        scrambledLetters: scrambled,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      const word = String(params.word ?? '').toUpperCase();
      const answerText = String(sub.inputLog.answerText ?? '').trim().toUpperCase();
      if (reactionMs < 240) {
        return { success: false, score: 0, reason: 'Terlalu cepat' };
      }
      const success = answerText === word;
      return { success, score: success ? Math.max(50, 100 - Math.floor(reactionMs / 140)) : 0 };
    },
    simulateBot: (params, botDiff, rng) => {
      const word = String(params.word ?? 'DADU');
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const reactionMs = rng.nextInt(1400, 5200);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        answerText: win ? word : 'SALAH',
        claimedSuccess: win,
        score: win ? 80 : 0,
      };
    },
  },

  trace_line: {
    id: 'trace_line',
    displayName: 'Telusuri Garis',
    instruction: 'Ikuti garis putus-putus dari titik awal sampai bintang!',
    baseDurationMs: 12000,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const shape = rng.pick(TRACE_SHAPES);
      const minAccuracy = [0.55, 0.62, 0.68, 0.74][Math.min(3, Math.max(0, difficulty - 1))];
      const waypoints: Array<{ x: number; y: number }> = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let x = 0.12 + t * 0.76;
        let y = 0.5;
        if (shape === 'zigzag') {
          y = i % 2 === 0 ? 0.3 : 0.7;
        } else if (shape === 'wave') {
          y = 0.5 + Math.sin(t * Math.PI * 2.5) * 0.25;
        } else if (shape === 'loop') {
          const angle = t * Math.PI * 2;
          x = 0.5 + Math.cos(angle - Math.PI / 2) * 0.3;
          y = 0.5 + Math.sin(angle - Math.PI / 2) * 0.28;
        } else {
          const angle = t * Math.PI * 3;
          const r = 0.08 + t * 0.28;
          x = 0.5 + Math.cos(angle) * r;
          y = 0.5 + Math.sin(angle) * r;
        }
        waypoints.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
      }
      return { shape, waypoints, minAccuracy, difficulty };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      const accuracy = sub.inputLog.pathAccuracy ?? 0;
      const minAccuracy = Number(params.minAccuracy ?? 0.7);
      const pointsCount = Number(sub.inputLog.extra?.pointsCount ?? 0);
      if (reactionMs < 350 || pointsCount < 6 || accuracy < 0 || accuracy > 1) {
        return { success: false, score: 0, reason: 'Jejak garis tidak valid' };
      }
      const success = accuracy >= minAccuracy;
      return { success, score: Math.round(accuracy * 100) };
    },
    simulateBot: (params, botDiff, rng) => {
      const minAccuracy = Number(params.minAccuracy ?? 0.7);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const pathAccuracy = win
        ? rng.nextFloat(minAccuracy + 0.04, 0.96)
        : rng.nextFloat(0.35, minAccuracy - 0.06);
      const reactionMs = rng.nextInt(1500, 4200);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        pathAccuracy: Number(pathAccuracy.toFixed(2)),
        extra: { pointsCount: 24 },
        claimedSuccess: win,
        score: Math.round(pathAccuracy * 100),
      };
    },
  },

  lucky_wheel: {
    id: 'lucky_wheel',
    displayName: 'Roda Keberuntungan',
    instruction: 'Putar roda keberuntungan! Hasilnya ditentukan takdir server!',
    baseDurationMs: 8500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      // Server-deterministic wheel slice derived strictly from seeded RNG
      const weights = difficulty >= 3 ? [1, 2, 2, 3, 2, 2] : [2, 2, 2, 3, 2, 1];
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = rng.nextInt(0, total - 1);
      let serverOutcomeIndex = 0;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll < 0) {
          serverOutcomeIndex = i;
          break;
        }
      }
      return {
        slices: WHEEL_SLICES,
        serverOutcomeIndex,
        difficulty,
      };
    },
    validate: (params, _sub, seed) => {
      // Strictly server-authoritative: ignore client's claimed result, read serverOutcomeIndex
      const idx = Number(params.serverOutcomeIndex ?? 0);
      const slice = WHEEL_SLICES[idx] ?? WHEEL_SLICES[0];
      void seed;
      const success = slice.kind !== 'slip' && slice.kind !== 'nothing';
      return {
        success,
        score: slice.stars * 25 + (slice.advance > 0 ? 30 : 0),
        reason: slice.label,
      };
    },
    simulateBot: (params) => {
      const idx = Number(params.serverOutcomeIndex ?? 0);
      const slice = WHEEL_SLICES[idx] ?? WHEEL_SLICES[0];
      return {
        startedAt: 0,
        completedAt: 2200,
        reactionMs: 500,
        claimedSuccess: slice.kind !== 'slip' && slice.kind !== 'nothing',
        score: slice.stars * 25,
      };
    },
  },

  stroop_color: {
    id: 'stroop_color',
    displayName: 'Tebak Warna (Stroop)',
    instruction: 'Pilih WARNA TINTA tulisannya, bukan arti katanya!',
    baseDurationMs: 10000,
    allowedModes: ['solo', 'all_play'],
    buildParams: (rng, difficulty) => {
      const chosen = rng.shuffle([...STROOP_COLORS]).slice(0, 4);
      const inkIdx = rng.nextInt(0, 3);
      const inkColor = chosen[inkIdx];
      // Ensure word label differs from ink color!
      const wordCandidates = chosen.filter((c) => c.id !== inkColor.id);
      const wordColor = rng.pick(wordCandidates);
      return {
        wordLabel: wordColor.label,
        inkColorId: inkColor.id,
        inkLabel: inkColor.label,
        inkHex: inkColor.hex,
        inkPattern: inkColor.pattern,
        options: chosen.map((c) => ({
          id: c.id,
          label: c.label,
          hex: c.hex,
          pattern: c.pattern,
        })),
        correctIndex: inkIdx,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Terlalu cepat (<120ms)' };
      }
      const success = sub.inputLog.answerIndex === Number(params.correctIndex);
      return { success, score: success ? Math.max(50, 100 - Math.floor(reactionMs / 90)) : 0 };
    },
    simulateBot: (params, botDiff, rng) => {
      const correctIndex = Number(params.correctIndex ?? 0);
      const diff = Number(params.difficulty ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, diff));
      const answerIndex = win ? correctIndex : (correctIndex + rng.nextInt(1, 3)) % 4;
      const reactionMs = rng.nextInt(650, 3100);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        answerIndex,
        claimedSuccess: win,
        score: win ? 85 : 0,
      };
    },
  },

  quick_duel: {
    id: 'quick_duel',
    displayName: 'Duel Kilat 1v1',
    instruction: 'Pilih lawan duel! Tunggu tanda "TANGKAP!" lalu ketuk duluan!',
    baseDurationMs: 11500,
    allowedModes: ['duel'],
    buildParams: (rng, difficulty) => {
      const signalDelayMs = rng.nextInt(1100, 2600);
      return { signalDelayMs, difficulty };
    },
    validate: (_params, sub) => {
      const reactionMs = sub.inputLog.reactionMs;
      if (typeof reactionMs !== 'number') {
        return { success: false, score: 0, reason: 'Tidak mengetuk' };
      }
      if (reactionMs < 0) {
        return { success: false, score: 0, reason: 'Curang start lebih awal!' };
      }
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Reaksi <120ms tidak sah' };
      }
      const score = Math.max(10, 1500 - reactionMs);
      return { success: true, score };
    },
    simulateBot: (_params, botDiff, rng) => {
      const range =
        botDiff === 'juara'
          ? [290, 450]
          : botDiff === 'pintar'
            ? [360, 620]
            : [500, 880];
      const falseStart = rng.chance(botDiff === 'santai' ? 0.12 : 0.04);
      const reactionMs = falseStart ? -150 : rng.nextInt(range[0], range[1]);
      return {
        startedAt: 0,
        completedAt: Math.max(200, 1800 + reactionMs),
        reactionMs,
        claimedSuccess: reactionMs >= MIN_REACTION_MS,
        score: reactionMs >= MIN_REACTION_MS ? Math.max(10, 1500 - reactionMs) : 0,
      };
    },
  },

  gift_trap: {
    id: 'gift_trap',
    displayName: 'Kotak Kejutan Papan',
    instruction: 'Kotak spontan! Lihat kejutan apa yang menunggumu di sini!',
    baseDurationMs: 6500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty, tileId) => {
      const variant = GIFT_TRAP_VARIANTS[(tileId + rng.nextInt(0, GIFT_TRAP_VARIANTS.length - 1)) % GIFT_TRAP_VARIANTS.length];
      return { variant, difficulty };
    },
    validate: (params) => {
      const variant = params.variant as (typeof GIFT_TRAP_VARIANTS)[number] | undefined;
      const isGift = variant?.kind === 'gift';
      return {
        success: Boolean(isGift),
        score: isGift ? 100 : 25,
        reason: variant?.title ?? 'Kejutan!',
      };
    },
    simulateBot: (params) => {
      const variant = params.variant as (typeof GIFT_TRAP_VARIANTS)[number] | undefined;
      return {
        startedAt: 0,
        completedAt: 600,
        reactionMs: 400,
        claimedSuccess: variant?.kind === 'gift',
        score: variant?.kind === 'gift' ? 100 : 25,
      };
    },
  },

  boss_doodle: {
    id: 'boss_doodle',
    displayName: 'Tantangan Final: Bos Doodle!',
    instruction: 'Selesaikan minimal 2 dari 3 ujian santai Bos Doodle untuk jadi JUARA!',
    baseDurationMs: 18500,
    allowedModes: ['solo'],
    buildParams: (rng) => {
      const math = buildMathExpression(rng, 2);
      const zoneCenter = Number(rng.nextFloat(0.3, 0.7).toFixed(2));
      return {
        math,
        timing: { zoneCenter, zoneWidth: 0.3, speed: 0.96 },
        targetTaps: 6,
        difficulty: 3,
      };
    },
    validate: (params, sub) => {
      const extra = sub.inputLog.extra ?? {};
      const math = params.math as { correctIndex: number };
      const timing = params.timing as { zoneCenter: number; zoneWidth: number };
      const targetTaps = Number(params.targetTaps ?? 6);

      let passed = 0;
      if (typeof extra.mathIndex === 'number' && extra.mathIndex === math.correctIndex) {
        passed++;
      }
      if (
        typeof extra.needlePos === 'number' &&
        Math.abs(extra.needlePos - timing.zoneCenter) <= timing.zoneWidth / 2 + 0.035
      ) {
        passed++;
      }
      const taps = Array.isArray(sub.inputLog.tapTimestamps) ? sub.inputLog.tapTimestamps.length : 0;
      if (taps >= targetTaps && taps <= 60) {
        passed++;
      }
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Terlalu cepat (<120ms)' };
      }
      return {
        success: passed >= 2,
        score: passed * 40,
        reason: `Lulus ${passed}/3 tahap Bos Doodle`,
      };
    },
    simulateBot: (params, botDiff, rng) => {
      const math = params.math as { correctIndex: number };
      const timing = params.timing as { zoneCenter: number };
      const targetTaps = Number(params.targetTaps ?? 8);
      const win = rng.chance(botSuccessRate(botDiff, 3));
      const tapTimestamps = Array.from(
        { length: win ? targetTaps + 2 : 3 },
        (_, i) => 200 + i * 180,
      );
      return {
        startedAt: 0,
        completedAt: 5200,
        reactionMs: 900,
        tapTimestamps,
        extra: {
          mathIndex: win ? math.correctIndex : (math.correctIndex + 1) % 4,
          needlePos: win ? timing.zoneCenter : 0.02,
        },
        claimedSuccess: win,
        score: win ? 120 : 40,
      };
    },
  },

  bubble_pop: {
    id: 'bubble_pop',
    displayName: 'Pecahkan Gelembung',
    instruction: 'Klik gelembung bintang sesuai warna target, hindari bom tinta hitam!',
    baseDurationMs: 10500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const targetColors = [
        { id: 'pink', label: 'Merah Muda', hex: '#ff6b8b' },
        { id: 'biru', label: 'Biru Langit', hex: '#4ea8de' },
        { id: 'mint', label: 'Hijau Mint', hex: '#38b000' },
        { id: 'kuning', label: 'Kuning Cerah', hex: '#f4a261' },
      ];
      const targetColor = rng.pick(targetColors);
      const goodCount = 6 + difficulty;
      const bombCount = 2 + difficulty;
      const targetPops = Math.min(goodCount - 1, 3 + Math.min(3, difficulty));
      const maxBombHits = difficulty >= 4 ? 1 : 2;

      const rawKinds: Array<'good' | 'bomb'> = [
        ...Array.from({ length: goodCount }, () => 'good' as const),
        ...Array.from({ length: bombCount }, () => 'bomb' as const),
      ];
      const shuffled = rng.shuffle(rawKinds);
      const bubbles = shuffled.map((kind, id) => ({
        id,
        kind,
        xPct: rng.nextInt(12, 88),
        yPct: rng.nextInt(16, 84),
        sizePx: kind === 'good' ? rng.nextInt(44, 56) : rng.nextInt(40, 50),
        colorHex: kind === 'good' ? targetColor.hex : '#2b2d42',
        delayMs: id * 180,
      }));

      return {
        targetColor,
        targetPops,
        maxBombHits,
        bubbles,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const targetPops = Number(params.targetPops ?? 5);
      const maxBombHits = Number(params.maxBombHits ?? 1);
      const extra = sub.inputLog.extra ?? {};
      const goodPopped = typeof extra.goodPopped === 'number' ? extra.goodPopped : 0;
      const hitsTaken = sub.inputLog.hitsTaken ?? 0;
      const taps = sub.inputLog.tapTimestamps ?? [];
      if (taps.length > 45) {
        return { success: false, score: 0, reason: 'Klik tidak wajar terdeteksi' };
      }
      const elapsed = sub.inputLog.completedAt - sub.inputLog.startedAt;
      if (elapsed < 300) {
        return { success: false, score: 0, reason: 'Durasi terlalu singkat' };
      }
      const validTaps = taps.filter((t, i) => i === 0 || t - taps[i - 1] >= 40).length;
      if (validTaps < Math.min(goodPopped, targetPops)) {
        return { success: false, score: 0, reason: 'Jejak ketukan gelembung tidak valid' };
      }
      const ok = goodPopped >= targetPops && hitsTaken <= maxBombHits;
      return {
        success: ok,
        score: Math.max(0, goodPopped * 20 - hitsTaken * 25),
        reason: `Pecah ${goodPopped}/${targetPops} gelembung (bom: ${hitsTaken})`,
      };
    },
    simulateBot: (params, botDiff, rng) => {
      const difficulty = Number(params.difficulty ?? 2);
      const targetPops = Number(params.targetPops ?? 5);
      const maxBombHits = Number(params.maxBombHits ?? 1);
      const win = rng.chance(botSuccessRate(botDiff, difficulty));
      const goodPopped = win ? targetPops + rng.nextInt(0, 1) : Math.max(1, targetPops - 2);
      const hitsTaken = win ? 0 : maxBombHits + 1;
      const tapTimestamps = Array.from(
        { length: goodPopped + hitsTaken },
        (_, i) => 450 + i * 310,
      );
      return {
        startedAt: 0,
        completedAt: 3600,
        reactionMs: 450,
        tapTimestamps,
        hitsTaken,
        extra: { goodPopped },
        claimedSuccess: win,
        score: win ? goodPopped * 20 : 20,
      };
    },
  },

  rhythm_clap: {
    id: 'rhythm_clap',
    displayName: 'Tepuk Irama',
    instruction: 'Ketuk drum tepat saat lingkaran beat menyentuh target tengah!',
    baseDurationMs: 9500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const beatCount = difficulty >= 4 ? 5 : 4;
      const baseGap = difficulty >= 3 ? 820 : difficulty === 2 ? 900 : 980;
      const beatTargetsMs: number[] = [];
      let cursor = 1150;
      for (let i = 0; i < beatCount; i++) {
        beatTargetsMs.push(cursor);
        const jitter = difficulty >= 2 ? rng.nextInt(-45, 60) : 0;
        cursor += baseGap + jitter;
      }
      const toleranceMs = Math.max(260, 400 - difficulty * 30);
      const requiredHits = Math.max(2, beatCount - 1);
      return {
        beatTargetsMs,
        toleranceMs,
        requiredHits,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const beatTargetsMs = Array.isArray(params.beatTargetsMs)
        ? (params.beatTargetsMs as number[])
        : [1050, 1900, 2750, 3600];
      const toleranceMs = Number(params.toleranceMs ?? 280);
      const requiredHits = Number(params.requiredHits ?? 3);
      const taps = sub.inputLog.tapTimestamps ?? [];
      if (taps.length > 24) {
        return { success: false, score: 0, reason: 'Terlalu banyak ketukan spam' };
      }

      const used = new Set<number>();
      let matched = 0;
      for (const target of beatTargetsMs) {
        let bestIdx = -1;
        let bestDiff = Infinity;
        for (let i = 0; i < taps.length; i++) {
          if (used.has(i)) continue;
          const diff = Math.abs(taps[i] - target);
          if (diff <= toleranceMs && diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          used.add(bestIdx);
          matched++;
        }
      }

      const ok = matched >= requiredHits;
      return {
        success: ok,
        score: matched * 25 + (matched === beatTargetsMs.length ? 20 : 0),
        reason: `Pas irama ${matched}/${beatTargetsMs.length} beat`,
      };
    },
    simulateBot: (params, botDiff, rng) => {
      const difficulty = Number(params.difficulty ?? 2);
      const beatTargetsMs = Array.isArray(params.beatTargetsMs)
        ? (params.beatTargetsMs as number[])
        : [1050, 1900, 2750, 3600];
      const toleranceMs = Number(params.toleranceMs ?? 280);
      const requiredHits = Number(params.requiredHits ?? 3);
      const win = rng.chance(botSuccessRate(botDiff, difficulty));
      const hitCount = win ? rng.nextInt(requiredHits, beatTargetsMs.length) : Math.max(0, requiredHits - 2);
      const tapTimestamps = beatTargetsMs.map((t, idx) =>
        idx < hitCount
          ? t + rng.nextInt(-Math.floor(toleranceMs * 0.55), Math.floor(toleranceMs * 0.55))
          : t + toleranceMs + 280,
      );
      return {
        startedAt: 0,
        completedAt: (beatTargetsMs[beatTargetsMs.length - 1] ?? 3600) + 500,
        reactionMs: tapTimestamps[0] ?? 1000,
        tapTimestamps,
        claimedSuccess: win,
        score: hitCount * 25,
      };
    },
  },

  color_count: {
    id: 'color_count',
    displayName: 'Hitung Cepat Warna',
    instruction: 'Hitung jumlah stiker sesuai warna & bentuk yang ditanyakan!',
    baseDurationMs: 10500,
    allowedModes: ['all_play', 'solo'],
    buildParams: (rng, difficulty) => {
      const shapes = [
        { id: 'bintang', label: 'Bintang', symbol: '★' },
        { id: 'hati', label: 'Hati', symbol: '♥' },
        { id: 'awan', label: 'Awan', symbol: '☁' },
        { id: 'kancing', label: 'Lingkaran', symbol: '●' },
      ];
      const colors = [
        { id: 'pink', label: 'Merah Muda', hex: '#ff6b8b' },
        { id: 'biru', label: 'Biru', hex: '#4ea8de' },
        { id: 'kuning', label: 'Kuning', hex: '#f4a261' },
        { id: 'mint', label: 'Hijau Mint', hex: '#38b000' },
      ];

      const targetShape = rng.pick(shapes);
      const targetColor = rng.pick(colors);
      const totalItems = 8 + difficulty * 2;
      const targetCount = rng.nextInt(3, Math.min(6, Math.floor(totalItems / 2)));

      const items: Array<{
        shapeId: string;
        symbol: string;
        colorId: string;
        colorHex: string;
        rotDeg: number;
      }> = [];

      for (let i = 0; i < targetCount; i++) {
        items.push({
          shapeId: targetShape.id,
          symbol: targetShape.symbol,
          colorId: targetColor.id,
          colorHex: targetColor.hex,
          rotDeg: rng.nextInt(-18, 18),
        });
      }

      while (items.length < totalItems) {
        const s = rng.pick(shapes);
        const c = rng.pick(colors);
        if (s.id === targetShape.id && c.id === targetColor.id) continue;
        items.push({
          shapeId: s.id,
          symbol: s.symbol,
          colorId: c.id,
          colorHex: c.hex,
          rotDeg: rng.nextInt(-18, 18),
        });
      }

      const shuffledItems = rng.shuffle(items);
      const optSet = new Set<number>([targetCount]);
      while (optSet.size < 4) {
        const candidate = Math.max(1, targetCount + rng.nextInt(-3, 3));
        optSet.add(candidate);
      }
      const options = rng.shuffle(Array.from(optSet));
      const correctIndex = options.indexOf(targetCount);

      return {
        questionText: `Berapa jumlah ${targetShape.label} berwarna ${targetColor.label}?`,
        targetShape,
        targetColor,
        items: shuffledItems,
        options,
        correctIndex,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const reactionMs = sub.inputLog.reactionMs ?? 0;
      if (reactionMs < MIN_REACTION_MS) {
        return { success: false, score: 0, reason: 'Jawaban terlalu cepat (<120ms)' };
      }
      const correctIndex = Number(params.correctIndex ?? 0);
      const ok = sub.inputLog.answerIndex === correctIndex;
      const speedBonus = ok ? Math.max(10, Math.round((7500 - Math.min(7500, reactionMs)) / 100)) : 0;
      return {
        success: ok,
        score: ok ? 60 + speedBonus : 0,
        reason: ok ? 'Hitungan tepat!' : 'Salah hitung jumlah stiker',
      };
    },
    simulateBot: (params, botDiff, rng) => {
      const difficulty = Number(params.difficulty ?? 2);
      const correctIndex = Number(params.correctIndex ?? 0);
      const win = rng.chance(botSuccessRate(botDiff, difficulty));
      const reactionMs =
        botDiff === 'juara' ? rng.nextInt(1200, 2600) : rng.nextInt(2000, 4600);
      return {
        startedAt: 0,
        completedAt: reactionMs,
        reactionMs,
        answerIndex: win ? correctIndex : (correctIndex + 1) % 4,
        claimedSuccess: win,
        score: win ? 85 : 0,
      };
    },
  },

  balance_bar: {
    id: 'balance_bar',
    displayName: 'Jaga Keseimbangan',
    instruction: 'Ketuk Kiri / Kanan agar pensil tetap seimbang di zona hijau!',
    baseDurationMs: 9500,
    allowedModes: ['solo'],
    buildParams: (rng, difficulty) => {
      const safeWidthPct = Math.max(32, 46 - difficulty * 3);
      const targetRatio = Number((0.48 + difficulty * 0.03).toFixed(2));
      const maxDrops = difficulty >= 4 ? 1 : 2;
      const windPattern = rng.nextInt(1, 9999);
      return {
        durationSec: 5.5,
        safeWidthPct,
        targetRatio,
        maxDrops,
        windPattern,
        difficulty,
      };
    },
    validate: (params, sub) => {
      const targetRatio = Number(params.targetRatio ?? 0.6);
      const maxDrops = Number(params.maxDrops ?? 1);
      const extra = sub.inputLog.extra ?? {};
      const balanceRatio = typeof extra.balanceRatio === 'number' ? extra.balanceRatio : 0;
      const hitsTaken = sub.inputLog.hitsTaken ?? 0;
      const taps = sub.inputLog.tapTimestamps ?? [];
      const elapsed = sub.inputLog.completedAt - sub.inputLog.startedAt;
      if (elapsed < 1200 || taps.length < 2 || taps.length > 90) {
        return { success: false, score: 0, reason: 'Kontrol keseimbangan tidak valid' };
      }
      const ok = balanceRatio >= targetRatio && hitsTaken <= maxDrops;
      return {
        success: ok,
        score: Math.round(Math.max(0, balanceRatio) * 100),
        reason: `Seimbang ${Math.round(balanceRatio * 100)}% (target ${Math.round(targetRatio * 100)}%)`,
      };
    },
    simulateBot: (params, botDiff, rng) => {
      const difficulty = Number(params.difficulty ?? 2);
      const targetRatio = Number(params.targetRatio ?? 0.6);
      const win = rng.chance(botSuccessRate(botDiff, difficulty));
      const balanceRatio = win
        ? Number(Math.min(0.95, targetRatio + rng.nextFloat(0.06, 0.24)).toFixed(2))
        : Number(Math.max(0.2, targetRatio - 0.18).toFixed(2));
      const hitsTaken = win ? 0 : 2;
      const tapTimestamps = Array.from({ length: rng.nextInt(6, 13) }, (_, i) => 420 + i * 330);
      return {
        startedAt: 0,
        completedAt: 5000,
        reactionMs: 420,
        tapTimestamps,
        hitsTaken,
        extra: { balanceRatio },
        claimedSuccess: win,
        score: Math.round(balanceRatio * 100),
      };
    },
  },
};

export const PLAYABLE_TILE_ARCHETYPES: ChallengeArchetype[] = [
  'tap_timing',
  'quick_quiz',
  'memory_doodle',
  'spam_tap',
  'swipe_dodge',
  'shadow_match',
  'quick_math',
  'word_scramble',
  'trace_line',
  'lucky_wheel',
  'stroop_color',
  'quick_duel',
  'gift_trap',
  'bubble_pop',
  'rhythm_clap',
  'color_count',
  'balance_bar',
];

export function deriveChallengeRuntimeSeed(matchSeed: number, eventSeq: number, tileId: number): number {
  return hashSeed(matchSeed, eventSeq, tileId, 'challenge');
}
