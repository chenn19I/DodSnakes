import {
  BOARD_LAYOUT,
  SeededRng,
  TILES,
  applyChallengeResult,
  applyItem,
  chooseBotGoldenDiceIndex,
  chooseDice,
  createInitialGameState,
  decideBotPreRollItemIndex,
  nextTurn,
  recordChallengeSubmission,
  resolveTile,
  rollDice,
  simulateBotChallengeSubmission,
  startGame,
  type BotDifficulty,
} from '../index.js';

export interface SimulationSummary {
  matches: number;
  completed: number;
  deadlocks: number;
  avgTurns: number;
  minTurns: number;
  maxTurns: number;
  avgEstimatedMinutes: number;
  avgRollsPerMatch: number;
  elapsedMs: number;
}

export function runBotSimulation(matchCount = 1000, baseSeed = 900000): SimulationSummary {
  const startWall = Date.now();
  let completed = 0;
  let deadlocks = 0;
  let totalTurns = 0;
  let totalEstimatedSeconds = 0;
  let totalRolls = 0;
  let minTurns = Infinity;
  let maxTurns = 0;

  const difficulties: BotDifficulty[] = ['santai', 'pintar', 'juara', 'pintar'];
  const pawns = ['kucing', 'kodok', 'bebek', 'panda'] as const;
  const colors = ['pink', 'kuning', 'mint', 'biru'] as const;

  for (let m = 0; m < matchCount; m++) {
    const seed = baseSeed + m * 17;
    const rng = new SeededRng(seed);

    let state = createInitialGameState({
      matchSeed: seed,
      board: BOARD_LAYOUT,
      players: [0, 1, 2, 3].map((i) => ({
        id: `bot-${i + 1}`,
        name: `Bot ${i + 1}`,
        pawn: pawns[i],
        color: colors[i],
        isBot: true,
        botDifficulty: difficulties[i],
      })),
    });

    state = startGame(state).state;

    let stepLimit = 600;
    let matchSeconds = 4; // starting fanfare
    let matchRolls = 0;

    while (state.phase !== 'GAME_OVER' && stepLimit > 0) {
      stepLimit--;
      const activeId = state.turnOrder[state.currentTurnIndex];
      const active = state.players.find((p) => p.id === activeId)!;

      // Smart shared bot item usage
      if (active.items.length > 0 && state.phase === 'TURN_BEGIN') {
        const chosenItemIdx = decideBotPreRollItemIndex(state, active, rng);
        if (chosenItemIdx !== null) {
          state = applyItem(state, activeId, chosenItemIdx).state;
          matchSeconds += 1.1;
        }
      }

      const rolled = rollDice(state, activeId);
      state = rolled.state;
      matchRolls++;
      matchSeconds += 1.1; // dice animation

      if (state.phase === 'ROLL' && state.pendingRoll) {
        const choiceIdx = chooseBotGoldenDiceIndex(state, active, state.pendingRoll.diceValues);
        state = chooseDice(state, activeId, choiceIdx).state;
        matchSeconds += 1.2;
      }

      const movedEvent = rolled.events.find((e) => e.type === 'PawnMoved');
      const steps = movedEvent && movedEvent.type === 'PawnMoved' ? movedEvent.path.length : 3;
      matchSeconds += steps * 0.28 + 0.3;

      const tileRes = resolveTile(state, TILES);
      state = tileRes.state;

      if (state.phase === 'CHALLENGE' && state.activeChallenge) {
        const ch = state.activeChallenge;
        for (const pid of ch.participantIds) {
          const p = state.players.find((x) => x.id === pid)!;
          const sub = simulateBotChallengeSubmission(
            ch,
            pid,
            p.botDifficulty,
            new SeededRng(seed + state.eventSeq + pid.charCodeAt(4)),
          );
          state = recordChallengeSubmission(state, sub);
        }
        const applied = applyChallengeResult(state);
        state = applied.state;

        // Realistic human play time per challenge + result stamp + snake/ladder animation
        matchSeconds += ch.archetype === 'gift_trap' ? 3.2 : 7.0;
        if (applied.events.some((e) => e.type === 'LadderClimbed' || e.type === 'SnakeBitten')) {
          matchSeconds += 1.8;
        }
      }

      if (state.phase === 'TURN_END' || state.phase === 'EXTRA_ROLL') {
        state = nextTurn(state).state;
        // Turn banner (~1.6s) + player notice/click pacing
        matchSeconds += 1.5;
      }
    }

    if (state.phase === 'GAME_OVER' && state.winnerId) {
      completed++;
      totalTurns += state.turnNumber;
      totalEstimatedSeconds += matchSeconds;
      totalRolls += matchRolls;
      minTurns = Math.min(minTurns, state.turnNumber);
      maxTurns = Math.max(maxTurns, state.turnNumber);
    } else {
      deadlocks++;
    }
  }

  return {
    matches: matchCount,
    completed,
    deadlocks,
    avgTurns: completed > 0 ? Number((totalTurns / completed).toFixed(2)) : 0,
    minTurns: completed > 0 ? minTurns : 0,
    maxTurns,
    avgEstimatedMinutes:
      completed > 0 ? Number((totalEstimatedSeconds / completed / 60).toFixed(2)) : 0,
    avgRollsPerMatch: completed > 0 ? Number((totalRolls / completed).toFixed(2)) : 0,
    elapsedMs: Date.now() - startWall,
  };
}

// Run directly when executed as CLI script
const isMain = process.argv[1]?.includes('runSimulation');
if (isMain) {
  const count = Number(process.argv[2] ?? 1000);
  const summary = runBotSimulation(count);
  console.log('=== Hasil Simulasi Bot-vs-Bot ===');
  console.log(JSON.stringify(summary, null, 2));
  if (summary.deadlocks > 0) {
    process.exitCode = 1;
  }
}
