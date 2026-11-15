import { z } from 'zod';
import {
  USERNAME_POLICY_ERROR,
  isUsernameAllowed,
  sanitizeUsernameRaw,
} from './moderation/usernameFilter.js';

export const SafePlayerNameSchema = z
  .string()
  .transform((val) => sanitizeUsernameRaw(val))
  .refine((val) => val.length >= 1 && val.length <= 18, {
    message: 'Nama pemain harus 1-18 karakter.',
  })
  .refine((val) => /[a-zA-Z0-9]/.test(val), {
    message: 'Nama pemain harus mengandung huruf atau angka.',
  })
  .refine((val) => isUsernameAllowed(val), {
    message: USERNAME_POLICY_ERROR,
  });

export const PawnIdSchema = z.enum(['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur']);
export const PlayerColorIdSchema = z.enum(['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu']);
export const AccessoryIdSchema = z.enum([
  'none',
  'crown',
  'glasses',
  'scarf',
  'headset',
  'flower',
  'backpack',
]);
export const BotDifficultySchema = z.enum(['santai', 'pintar', 'juara']);
export const GameModePresetSchema = z.enum(['klasik', 'kilat', 'pesta_item']);
export const EmoteIdSchema = z.enum(['jempol', 'ketawa', 'kaget', 'nangis', 'api', 'mahkota']);

export const RoomCreateSchema = z.object({
  playerName: SafePlayerNameSchema,
  pawn: PawnIdSchema,
  color: PlayerColorIdSchema,
  accessory: AccessoryIdSchema.optional(),
});

export const RoomJoinSchema = z.object({
  roomCode: z.string().trim().toUpperCase().length(4).regex(/^[A-Z0-9]+$/),
  playerName: SafePlayerNameSchema,
  pawn: PawnIdSchema,
  color: PlayerColorIdSchema,
  accessory: AccessoryIdSchema.optional(),
  reconnectToken: z.string().max(128).optional(),
  asSpectator: z.boolean().optional(),
});

export const PlayerReadySchema = z.object({
  ready: z.boolean(),
});

export const PlayerCustomizeSchema = z.object({
  playerName: SafePlayerNameSchema.optional(),
  pawn: PawnIdSchema.optional(),
  color: PlayerColorIdSchema.optional(),
  accessory: AccessoryIdSchema.optional(),
});

export const RoomAddBotSchema = z.object({
  botDifficulty: BotDifficultySchema.default('pintar'),
});

export const RoomRemoveBotSchema = z.object({
  botId: z.string().min(1).max(64),
});

export const RoomSettingsSchema = z.object({
  rulePreset: GameModePresetSchema,
});

export const TurnRollSchema = z.object({
  forcedDice: z.number().int().min(1).max(6).optional(),
});

export const TurnSelectDiceSchema = z.object({
  choiceIndex: z.union([z.literal(0), z.literal(1)]),
});

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const SafeChallengeExtraValueSchema = z.union([
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.string().max(64),
  z.boolean(),
]);

const SafeChallengeExtraSchema = z
  .record(z.string().min(1).max(32), SafeChallengeExtraValueSchema)
  .refine(
    (obj) => {
      const ownKeys = Object.getOwnPropertyNames(obj);
      return ownKeys.length <= 12 && ownKeys.every((k) => !FORBIDDEN_OBJECT_KEYS.has(k));
    },
    { message: 'Extra challenge log contains invalid or excessive keys' },
  );

export const ChallengeInputLogSchema = z.object({
  startedAt: z.number().finite().min(0).max(86_400_000),
  completedAt: z.number().finite().min(0).max(86_400_000),
  reactionMs: z.number().finite().min(-5000).max(60_000).optional(),
  tapTimestamps: z.array(z.number().finite().min(0).max(60_000)).max(120).optional(),
  answerIndex: z.number().int().min(0).max(10).optional(),
  answerText: z.string().max(40).optional(),
  sequenceIndices: z.array(z.number().int().min(0).max(10)).max(24).optional(),
  pathAccuracy: z.number().finite().min(0).max(1).optional(),
  hitsTaken: z.number().int().min(0).max(50).optional(),
  needlePos: z.number().finite().min(0).max(1).optional(),
  duelOpponentId: z.string().max(64).optional(),
  bossStagesPassed: z.number().int().min(0).max(3).optional(),
  extra: SafeChallengeExtraSchema.optional(),
});

export const ChallengeSubmitSchema = z.object({
  tileId: z.number().int().min(1).max(100),
  claimedSuccess: z.boolean(),
  score: z.number().finite().min(0).max(5000),
  inputLog: ChallengeInputLogSchema,
});

export const ChallengeChooseOpponentSchema = z.object({
  opponentId: z.string().min(1).max(64),
});

export const ItemUseSchema = z.object({
  itemIndex: z.number().int().min(0).max(1),
});

export const EmoteSendSchema = z.object({
  emoteId: EmoteIdSchema,
});

export type RoomCreatePayload = z.infer<typeof RoomCreateSchema>;
export type RoomJoinPayload = z.infer<typeof RoomJoinSchema>;
export type PlayerReadyPayload = z.infer<typeof PlayerReadySchema>;
export type PlayerCustomizePayload = z.infer<typeof PlayerCustomizeSchema>;
export type RoomAddBotPayload = z.infer<typeof RoomAddBotSchema>;
export type RoomRemoveBotPayload = z.infer<typeof RoomRemoveBotSchema>;
export type RoomSettingsPayload = z.infer<typeof RoomSettingsSchema>;
export type TurnRollPayload = z.infer<typeof TurnRollSchema>;
export type TurnSelectDicePayload = z.infer<typeof TurnSelectDiceSchema>;
export type ChallengeSubmitPayload = z.infer<typeof ChallengeSubmitSchema>;
export type ChallengeChooseOpponentPayload = z.infer<typeof ChallengeChooseOpponentSchema>;
export type ItemUsePayload = z.infer<typeof ItemUseSchema>;
export type EmoteSendPayload = z.infer<typeof EmoteSendSchema>;

export interface LobbyPlayerInfo {
  id: string;
  name: string;
  pawn: z.infer<typeof PawnIdSchema>;
  color: z.infer<typeof PlayerColorIdSchema>;
  accessory?: z.infer<typeof AccessoryIdSchema>;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  botDifficulty: z.infer<typeof BotDifficultySchema>;
}

export interface RoomStatePayload {
  roomCode: string;
  hostId: string;
  inGame: boolean;
  rulePreset: z.infer<typeof GameModePresetSchema>;
  players: LobbyPlayerInfo[];
  spectatorCount: number;
}
