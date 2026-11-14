import type {
  ActiveChallenge,
  BotDifficulty,
  ChallengeSubmission,
} from '../types.js';
import { SeededRng } from '../rng.js';
import { ARCHETYPE_REGISTRY, type ValidationOutcome } from '../content/archetypes.js';

export function validateChallengeSubmission(
  challenge: ActiveChallenge,
  submission: ChallengeSubmission,
): ValidationOutcome {
  const spec = ARCHETYPE_REGISTRY[challenge.archetype];
  if (!spec) {
    return { success: false, score: 0, reason: `Unknown archetype: ${challenge.archetype}` };
  }
  return spec.validate(challenge.params, submission, challenge.seed);
}

export function buildChallengeRuntimeParams(
  challengeArchetype: ActiveChallenge['archetype'],
  tileParams: Record<string, unknown>,
  runtimeSeed: number,
  difficulty: number,
  tileId: number,
): Record<string, unknown> {
  if (challengeArchetype === 'lucky_wheel' || challengeArchetype === 'quick_duel' || challengeArchetype === 'gift_trap') {
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
