import type {
  ActiveChallenge,
  BotDifficulty,
  ChallengeSubmission,
  GameState,
} from '../types.js';
import { SeededRng } from '../rng.js';
import { ARCHETYPE_REGISTRY, type ValidationOutcome } from '../content/archetypes.js';

export interface RedactChallengeOptions {
  stripAnswerParams?: boolean;
}

export function redactChallengeForClient(
  challenge: ActiveChallenge,
  options?: RedactChallengeOptions,
): ActiveChallenge {
  const redactedSubmissions: Record<string, ChallengeSubmission> = {};
  for (const [pid, sub] of Object.entries(challenge.submissions ?? {})) {
    redactedSubmissions[pid] = {
      playerId: sub?.playerId ?? pid,
      claimedSuccess: false,
      score: 0,
      inputLog: {
        startedAt: 0,
        completedAt: 0,
      },
    };
  }

  let redactedParams: Record<string, unknown> = { ...challenge.params };
  if (options?.stripAnswerParams) {
    delete redactedParams.correctAnswer;
    delete redactedParams.validPair;
    if (challenge.archetype === 'word_scramble' && typeof redactedParams.word === 'string') {
      redactedParams.wordLength = redactedParams.word.length;
      delete redactedParams.word;
    }
  }

  return {
    ...challenge,
    params: redactedParams,
    submissions: redactedSubmissions,
  };
}

export function redactGameStateForClient(
  state: GameState,
  options?: RedactChallengeOptions,
): GameState {
  return {
    ...state,
    matchSeed: 0,
    activeChallenge: state.activeChallenge
      ? redactChallengeForClient(state.activeChallenge, options)
      : null,
  };
}

export function validateChallengeSubmission(
  challenge: ActiveChallenge,
  submission: ChallengeSubmission,
): ValidationOutcome {
  const spec = ARCHETYPE_REGISTRY[challenge.archetype];
  if (!spec) {
    return { success: false, score: 0, reason: `Unknown archetype: ${challenge.archetype}` };
  }
  const log = submission?.inputLog;
  if (
    !log ||
    !Number.isFinite(log.startedAt) ||
    !Number.isFinite(log.completedAt) ||
    log.completedAt < log.startedAt ||
    log.completedAt - log.startedAt > Math.max(30_000, (challenge.durationMs || 15_000) + 15_000)
  ) {
    return { success: false, score: 0, reason: 'Durasi tantangan tidak valid' };
  }
  if (log.reactionMs !== undefined && !Number.isFinite(log.reactionMs)) {
    return { success: false, score: 0, reason: 'Waktu reaksi tidak valid' };
  }
  const outcome = spec.validate(challenge.params, submission, challenge.seed);
  const safeScore = Number.isFinite(outcome.score)
    ? Math.max(0, Math.min(1500, Math.round(outcome.score)))
    : 0;
  return {
    ...outcome,
    score: safeScore,
  };
}

export function buildChallengeRuntimeParams(
  challengeArchetype: ActiveChallenge['archetype'],
  tileParams: Record<string, unknown>,
  runtimeSeed: number,
  difficulty: number,
  tileId: number,
  alwaysRegenerate = false,
): Record<string, unknown> {
  if (
    alwaysRegenerate ||
    challengeArchetype === 'lucky_wheel' ||
    challengeArchetype === 'quick_duel' ||
    challengeArchetype === 'gift_trap'
  ) {
    const rng = new SeededRng(runtimeSeed);
    return ARCHETYPE_REGISTRY[challengeArchetype].buildParams(rng, difficulty, tileId);
  }
  return { ...tileParams };
}

export function simulateBotChallengeSubmission(
  challenge: ActiveChallenge,
  botId: string,
  botDifficulty: BotDifficulty,
  rng: SeededRng,
): ChallengeSubmission {
  const spec = ARCHETYPE_REGISTRY[challenge.archetype];
  const sim = spec.simulateBot(challenge.params, botDifficulty, rng);
  const { claimedSuccess, score, ...inputLog } = sim;
  return {
    playerId: botId,
    claimedSuccess,
    score,
    inputLog,
  };
}
