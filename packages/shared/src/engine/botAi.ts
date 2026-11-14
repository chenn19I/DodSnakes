import { getPlayerShopCost, type GameState, type Player } from '../types.js';
import type { SeededRng } from '../rng.js';
import {
  computeEffectiveDiceSteps,
  computeMove,
  findLadderAt,
  findSnakeAt,
  getBoardSpecialTile,
} from './boardUtils.js';

function scoreLandingTile(state: GameState, player: Player, diceFace: number, usedTurbo: boolean): number {
  const steps = computeEffectiveDiceSteps(diceFace, usedTurbo, player.pawn);
  const move = computeMove(player.position, steps, state.board.size);
  let score = move.to * 2;

  if (move.to === state.board.size) {
    return 10000;
  }

  if (move.bounced) {
    score -= 12;
  }

  const ladder = findLadderAt(state.board, move.to);
  if (ladder) {
    score += (ladder.to - ladder.from) * 2.5 + 35;
  }

  const snake = findSnakeAt(state.board, move.to);
  if (snake) {
    const hasShield = player.shields > 0 || player.items.includes('shield');
    score -= hasShield ? 8 : (snake.from - snake.to) * 2.2 + 30;
  }

  if (getBoardSpecialTile(move.to)) {
    score += 18;
  }

  if (diceFace === 6 && player.consecutiveSixes < 2) {
    score += 10;
  }

  return score;
}

/**
 * Picks at most one item index for a bot to activate before rolling dice, or null.
 */
export function decideBotPreRollItemIndex(
  state: GameState,
  player: Player,
  rng: SeededRng,
): number | null {
  if (player.items.length === 0) return null;

  const isSmart = player.botDifficulty === 'juara' || player.botDifficulty === 'pintar';
  const activationGate = player.botDifficulty === 'juara' ? 0.92 : isSmart ? 0.72 : 0.4;

  const maxDistTo100 = state.board.size - player.position;
  const nearLadderClose = state.board.ladders.some(
    (l) => l.from > player.position && l.from - player.position <= 3,
  );
  const nearLadderSix = state.board.ladders.some(
    (l) => l.from > player.position && l.from - player.position <= 6,
  );
  const nearSnakeAhead = state.board.snakes.some(
    (s) => s.from > player.position && s.from - player.position <= 6,
  );

  for (let i = 0; i < player.items.length; i++) {
    const item = player.items[i];

    if (item === 'shield' && player.shields === 0) {
      if (nearSnakeAhead || player.items.length >= 2 || rng.chance(0.45)) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'brake' && !player.activeBrake && !player.activeTurbo) {
      if (maxDistTo100 <= 3 || nearLadderClose) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'golden_dice' && !player.activeGoldenDice) {
      if (maxDistTo100 <= 8 || nearLadderSix || (isSmart && nearSnakeAhead) || rng.chance(0.45)) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'swap_turbo' && !player.activeTurbo && !player.activeBrake) {
      if (maxDistTo100 >= 7 && (player.position < 90 || player.items.length >= 2)) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'magnet_star') {
      const anyRivalHasStars = state.players.some((p) => p.id !== player.id && p.stars > 0);
      if (anyRivalHasStars || player.items.length >= 2) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'surprise' && player.position < 96) {
      if (rng.chance(0.55) || player.items.length >= 2) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'star_multiplier' && !player.activeDoubleStars) {
      if (!nearSnakeAhead || nearLadderSix || player.items.length >= 2) {
        return rng.chance(activationGate) ? i : null;
      }
    }

    if (item === 'rival_brake') {
      const anyFrontRival = state.players.some(
        (p) => p.id !== player.id && !p.activeBrake && p.position >= player.position,
      );
      if (anyFrontRival || player.items.length >= 2) {
        return rng.chance(activationGate) ? i : null;
      }
    }
  }

  return null;
}

/**
 * Chooses the best golden dice outcome index (0 or 1) for a bot player.
 */
export function chooseBotGoldenDiceIndex(
  state: GameState,
  player: Player,
  diceValues: number[],
): 0 | 1 {
  const v0 = diceValues[0] ?? 1;
  const v1 = diceValues[1] ?? v0;
  const usedTurbo = Boolean(state.pendingRoll?.usedTurbo);

  if (player.botDifficulty === 'santai') {
    const m0 = computeMove(player.position, v0 + (usedTurbo ? 2 : 0), state.board.size).to;
    const m1 = computeMove(player.position, v1 + (usedTurbo ? 2 : 0), state.board.size).to;
    if (m0 === state.board.size) return 0;
    if (m1 === state.board.size) return 1;
    return m1 > m0 ? 1 : 0;
  }

  const s0 = scoreLandingTile(state, player, v0, usedTurbo);
  const s1 = scoreLandingTile(state, player, v1, usedTurbo);
  return s1 > s0 ? 1 : 0;
}

/**
 * Decides if a smart bot wants to spend stars on the Star Shop for an item.
 */
export function shouldBotBuyStarItem(
  state: GameState,
  player: Player,
  rng: SeededRng,
): boolean {
  if (player.botDifficulty === 'santai') return false;
  const shopCost = getPlayerShopCost(player.pawn);
  if (player.stars < shopCost || player.items.length >= 2) return false;
  const nearSnakeAhead = state.board.snakes.some(
    (s) => s.from > player.position && s.from - player.position <= 6,
  );
  if (nearSnakeAhead && player.shields === 0) {
    return rng.chance(player.botDifficulty === 'juara' ? 0.78 : 0.55);
  }
  if (player.stars >= shopCost + 3) {
    return rng.chance(player.botDifficulty === 'juara' ? 0.55 : 0.35);
  }
  return false;
}
