import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_META,
  ARCHETYPE_REGISTRY,
  BOARD_LAYOUT,
  PAWN_META,
  PLAYABLE_TILE_ARCHETYPES,
  QUIZ_BANK,
  STAR_SHOP_COST,
  SeededRng,
  TILES,
  applyChallengeResult,
  applyItem,
  buyStarItem,
  chooseBotGoldenDiceIndex,
  chooseDice,
  computeMove,
  computePodium,
  createInitialGameState,
  decideBotPreRollItemIndex,
  getChallengeBonusDurationMs,
  getPlayerShopCost,
  getTileGridCoord,
  nextTurn,
  previewDiceLanding,
  recordChallengeSubmission,
  resolveTile,
  rollDice,
  simulateBotChallengeSubmission,
  startGame,
  validateBoardLayout,
  validateChallengeSubmission,
  validateUsername,
  sanitizeUsernameOrFallback,
  type GameEvent,
  type GameState,
  type Tile,
} from '../src/index.js';

const SAMPLE_MATH_PARAMS = {
  expression: '2 + 2',
  options: [3, 4, 5, 6],
  correctIndex: 1,
  correctAnswer: 4,
  difficulty: 1,
};

function makeTestPlayers(count = 2) {
  const pawns = ['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur'] as const;
  const colors = ['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu'] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Pemain ${i + 1}`,
    pawn: pawns[i],
    color: colors[i],
    isBot: false,
  }));
}

function makeWinningSubmission(state: GameState, playerId: string) {
  const ch = state.activeChallenge!;
  const sim = ARCHETYPE_REGISTRY[ch.archetype].simulateBot(
    ch.params,
    'juara',
    new SeededRng(12345),
  );
  // Guarantee passing input for deterministic tests
  if (ch.archetype === 'tap_timing') {
    sim.needlePos = Number(ch.params.zoneCenter);
    sim.reactionMs = 500;
  } else if (ch.archetype === 'quick_quiz' || ch.archetype === 'shadow_match' || ch.archetype === 'quick_math' || ch.archetype === 'stroop_color' || ch.archetype === 'color_count' || ch.archetype === 'odd_one_out') {
    if (ch.archetype === 'quick_quiz') {
      const q = QUIZ_BANK.find((x) => x.id === Number(ch.params.questionId))!;
      sim.answerIndex = q.correctIndex;
    } else {
      sim.answerIndex = Number(ch.params.correctIndex);
    }
    sim.reactionMs = 600;
  } else if (ch.archetype === 'pair_flip') {
    const pairCount = Number(ch.params.pairCount ?? 3);
    sim.sequenceIndices = Array.from({ length: pairCount * 2 }, (_, i) => i);
    sim.extra = { pairsMatched: pairCount };
    sim.reactionMs = 2400;
  } else if (ch.archetype === 'number_order') {
    sim.sequenceIndices = [...((ch.params.expectedIndices as number[]) ?? [0, 1, 2, 3, 4])];
    sim.reactionMs = 1500;
  } else if (ch.archetype === 'memory_doodle') {
    sim.sequenceIndices = [...(ch.params.sequence as number[])];
    sim.reactionMs = 1500;
  } else if (ch.archetype === 'spam_tap') {
    const target = Number(ch.params.targetTaps);
    sim.tapTimestamps = Array.from({ length: target + 2 }, (_, i) => 100 + i * 120);
  } else if (ch.archetype === 'swipe_dodge') {
    sim.hitsTaken = 0;
  } else if (ch.archetype === 'word_scramble') {
    sim.answerText = String(ch.params.word);
    sim.reactionMs = 900;
  } else if (ch.archetype === 'trace_line') {
    sim.pathAccuracy = 0.95;
    sim.extra = { pointsCount: 20 };
    sim.reactionMs = 1000;
  } else if (ch.archetype === 'quick_duel') {
    sim.reactionMs = 180;
  } else if (ch.archetype === 'boss_doodle') {
    const math = ch.params.math as { correctIndex: number };
    const timing = ch.params.timing as { zoneCenter: number };
    sim.extra = { mathIndex: math.correctIndex, needlePos: timing.zoneCenter };
    sim.tapTimestamps = Array.from({ length: 10 }, (_, i) => 100 + i * 120);
    sim.reactionMs = 500;
  }

  return {
    playerId,
    claimedSuccess: true,
    score: 100,
    inputLog: {
      startedAt: 0,
      completedAt: Math.max(600, sim.reactionMs ?? 600),
      reactionMs: sim.reactionMs ?? 600,
      tapTimestamps: sim.tapTimestamps,
      answerIndex: sim.answerIndex,
      answerText: sim.answerText,
      sequenceIndices: sim.sequenceIndices,
      pathAccuracy: sim.pathAccuracy,
      hitsTaken: sim.hitsTaken,
      needlePos: sim.needlePos,
      extra: sim.extra,
    },
  };
}

function makeFailingSubmission(state: GameState, playerId: string) {
  const ch = state.activeChallenge!;
  return {
    playerId,
    claimedSuccess: false,
    score: 0,
    inputLog: {
      startedAt: 0,
      completedAt: 1500,
      reactionMs: 1500,
      answerIndex: 9,
      answerText: 'XXX',
      sequenceIndices: [9, 9],
      pathAccuracy: 0.1,
      hitsTaken: 9,
      needlePos: 0.01,
      tapTimestamps: [100],
      extra: { pointsCount: 1, mathIndex: 9, needlePos: 0.01 },
    },
  };
}

describe('Board & Tiles invariants', () => {
  it('validates board layout with no chains or overlaps', () => {
    const res = validateBoardLayout(BOARD_LAYOUT);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(BOARD_LAYOUT.ladders).toHaveLength(8);
    expect(BOARD_LAYOUT.snakes).toHaveLength(8);
  });

  it('computes boustrophedon grid coordinates correctly', () => {
    expect(getTileGridCoord(1)).toMatchObject({ row: 0, col: 0 });
    expect(getTileGridCoord(10)).toMatchObject({ row: 0, col: 9 });
    expect(getTileGridCoord(11)).toMatchObject({ row: 1, col: 9 });
    expect(getTileGridCoord(20)).toMatchObject({ row: 1, col: 0 });
    expect(getTileGridCoord(100)).toMatchObject({ row: 9, col: 0 });
  });

  it('has 100 tiles, 98 unique challenges (2-99) with no adjacent same archetype, and 120+ quiz questions', () => {
    expect(TILES).toHaveLength(100);
    expect(TILES[0].archetype).toBe('start');
    expect(TILES[99].archetype).toBe('boss_doodle');
    expect(QUIZ_BANK.length).toBeGreaterThanOrEqual(120);

    const titles = new Set<string>();
    const counts = new Map<string, number>();

    for (let i = 1; i <= 98; i++) {
      const tile = TILES[i];
      expect(tile.id).toBe(i + 1);
      expect(titles.has(tile.title)).toBe(false);
      titles.add(tile.title);
      counts.set(tile.archetype, (counts.get(tile.archetype) ?? 0) + 1);

      if (i > 1) {
        expect(tile.archetype).not.toBe(TILES[i - 1].archetype);
      }

      if (tile.id <= 25) expect(tile.difficulty).toBe(1);
      else if (tile.id <= 50) expect(tile.difficulty).toBe(2);
      else if (tile.id <= 75) expect(tile.difficulty).toBe(3);
      else expect(tile.difficulty).toBe(4);
    }

    const minExpected = Math.floor(98 / PLAYABLE_TILE_ARCHETYPES.length);
    const maxExpected = Math.ceil(98 / PLAYABLE_TILE_ARCHETYPES.length);
    for (const arch of PLAYABLE_TILE_ARCHETYPES) {
      const c = counts.get(arch) ?? 0;
      expect(c).toBeGreaterThanOrEqual(minExpected);
      expect(c).toBeLessThanOrEqual(maxExpected);
    }
  });
});

describe('Movement & Bounce rules', () => {
  it('moves forward normally and bounces back when overshooting 100', () => {
    expect(computeMove(1, 5)).toEqual({
      from: 1,
      to: 6,
      path: [2, 3, 4, 5, 6],
      bounced: false,
    });

    expect(computeMove(95, 5)).toEqual({
      from: 95,
      to: 100,
      path: [96, 97, 98, 99, 100],
      bounced: false,
    });

    expect(computeMove(97, 5)).toEqual({
      from: 97,
      to: 98,
      path: [98, 99, 100, 99, 98],
      bounced: true,
    });
  });

  it('clamps retreat penalties at tile 1 (never below 1)', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 42,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;

    const customTiles: Tile[] = TILES.map((t) =>
      t.id === 2
        ? {
            ...t,
            archetype: 'quick_quiz',
            mode: 'solo',
            penalty: { type: 'retreat', value: 5 },
          }
        : t,
    );

    state = rollDice(state, 'p1', 1).state; // 1 -> 2
    state = resolveTile(state, customTiles).state;
    state = recordChallengeSubmission(state, makeFailingSubmission(state, 'p1'));
    const res = applyChallengeResult(state);
    expect(res.state.players[0].position).toBe(1);
  });
});

describe('Snakes, Ladders, Shields & No-Chain Resolution', () => {
  it('runs challenge on ladder tile, then climbs ladder without triggering target tile challenge', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 99,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;

    const customTiles: Tile[] = TILES.map((t) =>
      t.id === 4
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            reward: { stars: 3, bonusType: 'none' },
            penalty: { type: 'none' },
          }
        : t,
    );

    state = rollDice(state, 'p1', 3).state; // 1 -> 4 (ladder 4->25)
    state = resolveTile(state, customTiles).state;
    expect(state.activeChallenge?.tileId).toBe(4);

    state = recordChallengeSubmission(state, makeWinningSubmission(state, 'p1'));
    const res = applyChallengeResult(state);
    expect(res.state.players[0].position).toBe(25);
    expect(res.state.phase).toBe('TURN_END');
    expect(res.events.some((e) => e.type === 'LadderClimbed' && e.from === 4 && e.to === 25)).toBe(true);
    // No second challenge on tile 25
    expect(res.state.activeChallenge).toBeNull();
  });

  it('dodges snake bite when winning challenge on snake head', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 77,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    state.players[0].position = 14;

    const customTiles: Tile[] = TILES.map((t) =>
      t.id === 17
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            reward: { stars: 2, bonusType: 'none' },
            penalty: { type: 'none' },
          }
        : t,
    );

    state = rollDice(state, 'p1', 3).state; // 14 -> 17 (snake 17->7)
    state = resolveTile(state, customTiles).state;
    state = recordChallengeSubmission(state, makeWinningSubmission(state, 'p1'));
    const res = applyChallengeResult(state);

    expect(res.state.players[0].position).toBe(17);
    const snakeEv = res.events.find((e) => e.type === 'SnakeBitten');
    expect(snakeEv).toMatchObject({ dodgedByChallenge: true, blockedByShield: false });
  });

  it('blocks snake bite with shield on challenge fail, otherwise bites down to tail', () => {
    const customTiles: Tile[] = TILES.map((t) =>
      t.id === 17
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            penalty: { type: 'none' },
          }
        : t,
    );

    // Case 1: has shield
    let stateShield = startGame(
      createInitialGameState({
        matchSeed: 77,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    stateShield.players[0].position = 14;
    stateShield.players[0].shields = 1;
    stateShield = rollDice(stateShield, 'p1', 3).state;
    stateShield = resolveTile(stateShield, customTiles).state;
    stateShield = recordChallengeSubmission(stateShield, makeFailingSubmission(stateShield, 'p1'));
    const shieldRes = applyChallengeResult(stateShield);
    expect(shieldRes.state.players[0].position).toBe(17);
    expect(shieldRes.state.players[0].shields).toBe(0);
    expect(shieldRes.events.find((e) => e.type === 'SnakeBitten')).toMatchObject({
      blockedByShield: true,
    });

    // Case 2: no shield -> bitten 17 -> 7
    let stateNoShield = startGame(
      createInitialGameState({
        matchSeed: 77,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    stateNoShield.players[0].position = 14;
    stateNoShield = rollDice(stateNoShield, 'p1', 3).state;
    stateNoShield = resolveTile(stateNoShield, customTiles).state;
    stateNoShield = recordChallengeSubmission(
      stateNoShield,
      makeFailingSubmission(stateNoShield, 'p1'),
    );
    const biteRes = applyChallengeResult(stateNoShield);
    expect(biteRes.state.players[0].position).toBe(7);
    expect(biteRes.events.find((e) => e.type === 'SnakeBitten')).toMatchObject({
      blockedByShield: false,
      dodgedByChallenge: false,
      to: 7,
    });
  });
});

describe('Extra rolls, Anti-frustration, Items & Boss Doodle', () => {
  it('caps consecutive 6 extra rolls at 2', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 12,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;

    const safeTiles: Tile[] = TILES.map((t) => ({
      ...t,
      archetype: 'quick_math',
      mode: 'solo',
      params: SAMPLE_MATH_PARAMS,
      reward: { stars: 1, bonusType: 'none' },
      penalty: { type: 'none' },
    }));

    // Roll 1: 6 -> extra roll 1
    state = rollDice(state, 'p1', 6).state;
    expect(state.players[0].consecutiveSixes).toBe(1);
    expect(state.players[0].extraRollsPending).toBe(1);
    state = resolveTile(state, safeTiles).state;
    state = recordChallengeSubmission(state, makeWinningSubmission(state, 'p1'));
    state = applyChallengeResult(state).state;
    expect(state.phase).toBe('EXTRA_ROLL');
    state = nextTurn(state).state;
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p1');

    // Roll 2: 6 -> extra roll 2
    state = rollDice(state, 'p1', 6).state;
    expect(state.players[0].consecutiveSixes).toBe(2);
    expect(state.players[0].extraRollsPending).toBe(1);
    state = resolveTile(state, safeTiles).state;
    state = recordChallengeSubmission(state, makeWinningSubmission(state, 'p1'));
    state = applyChallengeResult(state).state;
    expect(state.phase).toBe('EXTRA_ROLL');
    state = nextTurn(state).state;

    // Roll 3: 6 -> NO extra roll!
    state = rollDice(state, 'p1', 6).state;
    expect(state.players[0].consecutiveSixes).toBe(0);
    expect(state.players[0].extraRollsPending).toBe(0);
    state = resolveTile(state, safeTiles).state;
    state = recordChallengeSubmission(state, makeWinningSubmission(state, 'p1'));
    state = applyChallengeResult(state).state;
    expect(state.phase).toBe('TURN_END');
    state = nextTurn(state).state;
    expect(state.turnOrder[state.currentTurnIndex]).toBe('p2');
  });

  it('prevents more than 2 consecutive turn penalties (anti-frustration)', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 101,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    state.players[0].position = 20;
    state.players[0].consecutivePenalties = 2;

    const penTiles: Tile[] = TILES.map((t) =>
      t.id === 22
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            penalty: { type: 'retreat', value: 3 },
          }
        : t,
    );

    state = rollDice(state, 'p1', 2).state; // -> 22
    state = resolveTile(state, penTiles).state;
    state = recordChallengeSubmission(state, makeFailingSubmission(state, 'p1'));
    const res = applyChallengeResult(state);
    expect(res.state.players[0].position).toBe(22);
    const resolved = res.events.find((e) => e.type === 'ChallengeResolved');
    expect(resolved).toMatchObject({ antiFrustrationSaved: true });
  });

  it('supports golden dice choice and brake item', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 55,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    state.players[0].items = ['golden_dice', 'brake'];

    state = applyItem(state, 'p1', 0).state; // use golden_dice
    state = applyItem(state, 'p1', 0).state; // use brake
    state = rollDice(state, 'p1').state;
    expect(state.phase).toBe('ROLL');
    expect(state.pendingRoll?.diceValues).toHaveLength(2);
    for (const v of state.pendingRoll!.diceValues) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
    const chosenVal = state.pendingRoll!.diceValues[1];
    state = chooseDice(state, 'p1', 1).state;
    expect(state.phase).toBe('TILE_CHECK');
    expect(state.players[0].position).toBe(1 + chosenVal);
  });

  it('requires passing Bos Doodle at tile 100 to win', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 88,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    state.players[0].position = 97;

    // Fail Bos Doodle -> bounce back to 97
    let failState = rollDice(state, 'p1', 3).state;
    failState = resolveTile(failState, TILES).state;
    expect(failState.activeChallenge?.archetype).toBe('boss_doodle');
    failState = recordChallengeSubmission(failState, makeFailingSubmission(failState, 'p1'));
    const failRes = applyChallengeResult(failState);
    expect(failRes.state.winnerId).toBeNull();
    expect(failRes.state.players[0].position).toBe(97);

    // Win Bos Doodle -> GAME_OVER
    let winState = rollDice(state, 'p1', 3).state;
    winState = resolveTile(winState, TILES).state;
    winState = recordChallengeSubmission(winState, makeWinningSubmission(winState, 'p1'));
    const winRes = applyChallengeResult(winState);
    expect(winRes.state.winnerId).toBe('p1');
    expect(winRes.state.phase).toBe('GAME_OVER');
    expect(winRes.state.podium[0].playerId).toBe('p1');
  });
});

describe('Challenge validation & Replay determinism', () => {
  it('rejects <120ms anti-cheat reactions and relies on serverOutcomeIndex for lucky_wheel', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 777,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;

    const wheelTiles: Tile[] = TILES.map((t) =>
      t.id === 3
        ? { ...t, archetype: 'lucky_wheel', mode: 'solo' }
        : t.id === 4
          ? { ...t, archetype: 'quick_math', mode: 'solo', params: SAMPLE_MATH_PARAMS }
          : t,
    );

    const s1 = resolveTile(rollDice(state, 'p1', 3).state, wheelTiles).state; // tile 4 quick_math
    const cheatCheck = validateChallengeSubmission(s1.activeChallenge!, {
      playerId: 'p1',
      claimedSuccess: true,
      score: 100,
      inputLog: {
        startedAt: 0,
        completedAt: 50,
        reactionMs: 50,
        answerIndex: Number(s1.activeChallenge!.params.correctIndex),
      },
    });
    expect(cheatCheck.success).toBe(false);

    const sWheel = resolveTile(rollDice(state, 'p1', 2).state, wheelTiles).state; // tile 3 lucky_wheel
    const expectedIdx = Number(sWheel.activeChallenge!.params.serverOutcomeIndex);
    const slices = sWheel.activeChallenge!.params.slices as Array<{ kind: string }>;
    const expectedSuccess =
      slices[expectedIdx].kind !== 'slip' && slices[expectedIdx].kind !== 'nothing';

    const wheelCheck = validateChallengeSubmission(sWheel.activeChallenge!, {
      playerId: 'p1',
      claimedSuccess: !expectedSuccess, // client tries lying
      score: 999,
      inputLog: { startedAt: 0, completedAt: 1000, reactionMs: 500 },
    });
    expect(wheelCheck.success).toBe(expectedSuccess);
  });

  it('replays identical match from the same seed with identical events and final state', () => {
    const playMatch = (seed: number) => {
      const bots = makeTestPlayers(4).map((p) => ({ ...p, isBot: true as const }));
      let state = createInitialGameState({
        matchSeed: seed,
        board: BOARD_LAYOUT,
        players: bots,
      });
      const allEvents: GameEvent[] = [];
      const start = startGame(state);
      state = start.state;
      allEvents.push(...start.events);

      let safety = 0;
      while (state.phase !== 'GAME_OVER' && safety < 500) {
        safety++;
        const activeId = state.turnOrder[state.currentTurnIndex];
        const rolled = rollDice(state, activeId);
        state = rolled.state;
        allEvents.push(...rolled.events);

        if (state.phase === 'ROLL') {
          const chosen = chooseDice(state, activeId, 0);
          state = chosen.state;
          allEvents.push(...chosen.events);
        }

        const tileRes = resolveTile(state, TILES);
        state = tileRes.state;
        allEvents.push(...tileRes.events);

        if (state.phase === 'CHALLENGE' && state.activeChallenge) {
          for (const pid of state.activeChallenge.participantIds) {
            const p = state.players.find((x) => x.id === pid)!;
            const sub = simulateBotChallengeSubmission(
              state.activeChallenge,
              pid,
              p.botDifficulty,
              new SeededRng(seed + state.eventSeq + pid.charCodeAt(1)),
            );
            state = recordChallengeSubmission(state, sub);
          }
          const applied = applyChallengeResult(state);
          state = applied.state;
          allEvents.push(...applied.events);
        }

        if (state.phase === 'TURN_END' || state.phase === 'EXTRA_ROLL') {
          const nxt = nextTurn(state);
          state = nxt.state;
          allEvents.push(...nxt.events);
        }
      }

      return { state, allEvents };
    };

    const runA = playMatch(2026001);
    const runB = playMatch(2026001);

    expect(runA.state.phase).toBe('GAME_OVER');
    expect(runA.state).toEqual(runB.state);
    expect(runA.allEvents).toEqual(runB.allEvents);
  });

  it('validates and simulates the 4 new v2 challenge archetypes cleanly', () => {
    const newArchs = ['bubble_pop', 'rhythm_clap', 'color_count', 'balance_bar'] as const;
    const rng = new SeededRng(424242);

    for (const arch of newArchs) {
      const spec = ARCHETYPE_REGISTRY[arch];
      expect(spec).toBeDefined();
      const params = spec.buildParams(rng, 2, 12);

      // Valid simulated juara submission
      const botInput = spec.simulateBot(params, 'juara', new SeededRng(99));
      const { claimedSuccess: _cs, score: botScore, ...inputLog } = botInput;
      expect(typeof botScore).toBe('number');
      expect(inputLog.completedAt).toBeGreaterThanOrEqual(inputLog.startedAt);

      // Explicit pass & fail checks per archetype
      if (arch === 'bubble_pop') {
        const targetPops = Number(params.targetPops);
        const taps = Array.from({ length: targetPops }, (_, i) => 400 + i * 250);
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 3000, tapTimestamps: taps, hitsTaken: 0, extra: { goodPopped: targetPops } },
          },
          1,
        );
        expect(pass.success).toBe(true);
      } else if (arch === 'rhythm_clap') {
        const beats = params.beatTargetsMs as number[];
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 5000, tapTimestamps: beats },
          },
          1,
        );
        expect(pass.success).toBe(true);
      } else if (arch === 'color_count') {
        const correctIdx = Number(params.correctIndex);
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 1500, reactionMs: 1500, answerIndex: correctIdx },
          },
          1,
        );
        expect(pass.success).toBe(true);
        const cheat = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 40, reactionMs: 40, answerIndex: correctIdx },
          },
          1,
        );
        expect(cheat.success).toBe(false);
      } else if (arch === 'balance_bar') {
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 90,
            inputLog: {
              startedAt: 0,
              completedAt: 5000,
              tapTimestamps: [500, 1200, 2000, 3000],
              hitsTaken: 0,
              extra: { balanceRatio: 0.85 },
            },
          },
          1,
        );
        expect(pass.success).toBe(true);
      }
    }
  });

  it('supports magnet_star, swap_turbo, rulePresets (kilat/pesta_item), and shared botAi', () => {
    const kilatState = startGame(
      createInitialGameState({
        matchSeed: 7777,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
        rulePreset: 'kilat',
      }),
    ).state;

    expect(kilatState.rulePreset).toBe('kilat');
    expect(kilatState.players[0].stars).toBe(2);
    expect(kilatState.players[0].items.length).toBe(1);

    // Give p1 both new items explicitly to test them
    kilatState.players[0].items = ['magnet_star', 'swap_turbo'];
    kilatState.players[1].stars = 4;

    const afterMagnet = applyItem(kilatState, 'p1', 0);
    expect(afterMagnet.state.players[0].stars).toBe(3);
    expect(afterMagnet.state.players[1].stars).toBe(3);

    const afterTurbo = applyItem(afterMagnet.state, 'p1', 0);
    expect(afterTurbo.state.players[0].activeTurbo).toBe(true);

    const afterRoll = rollDice(afterTurbo.state, 'p1', 3);
    expect(afterRoll.state.players[0].position).toBe(6); // 1 + (3 + 2 turbo steps)
    expect(afterRoll.state.pendingRoll?.usedTurbo).toBe(true);

    // Shared botAi tests
    const botState = startGame(
      createInitialGameState({
        matchSeed: 888,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2).map((p) => ({ ...p, isBot: true, botDifficulty: 'juara' })),
      }),
    ).state;
    botState.players[0].position = 95;
    expect(chooseBotGoldenDiceIndex(botState, botState.players[0], [2, 5])).toBe(1); // 95 + 5 = 100!
    botState.players[0].position = 98;
    botState.players[0].items = ['brake'];
    expect(decideBotPreRollItemIndex(botState, botState.players[0], new SeededRng(1))).toBe(0);
  });

  it('supports Star Shop purchase, challenge win streak combos, and dice landing preview', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 1010,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;

    // Preview dice landing before rolling
    const firstLadder = BOARD_LAYOUT.ladders[0];
    if (firstLadder.from <= 7) {
      const prev = previewDiceLanding(BOARD_LAYOUT, 1, firstLadder.from - 1, false);
      expect(prev.to).toBe(firstLadder.from);
      expect(prev.ladderTo).toBe(firstLadder.to);
    }

    // Cannot buy without enough stars
    expect(() => buyStarItem(state, 'p1')).toThrow();

    // Grant stars and buy item
    state.players[0].stars = STAR_SHOP_COST + 1;
    const bought = buyStarItem(state, 'p1');
    expect(bought.state.players[0].stars).toBe(1);
    expect(bought.state.players[0].items.length).toBe(1);
    expect(bought.events[0].type).toBe('ItemGained');

    // Challenge streak: 2nd consecutive win grants Kombo bonus +1 star
    const customTiles: Tile[] = TILES.map((t) => ({
      ...t,
      archetype: t.id === 1 ? 'start' : 'quick_math',
      mode: 'solo',
      params: SAMPLE_MATH_PARAMS,
      reward: { stars: 2, bonusType: 'none' },
      penalty: { type: 'none' },
    }));

    let st = startGame(
      createInitialGameState({
        matchSeed: 2020,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;

    // Force deterministic math wins twice in a row for p1 (set p1 consecutive wins)
    st.players[0].challengeStreak = 1;
    st = rollDice(st, 'p1', 2).state;
    st = resolveTile(st, customTiles).state;
    st = recordChallengeSubmission(st, {
      playerId: 'p1',
      claimedSuccess: true,
      score: 90,
      inputLog: {
        startedAt: 0,
        completedAt: 500,
        reactionMs: 500,
        answerIndex: Number(st.activeChallenge!.params.correctIndex),
      },
    });
    const res = applyChallengeResult(st);
    expect(res.state.players[0].challengeStreak).toBe(2);
    expect(res.state.players[0].stars).toBe(3); // 2 base + 1 streak combo
  });

  it('grants distinct named character perks and extended fair challenge durations', () => {
    // Named character metadata check
    const pawnIds = Object.keys(PAWN_META) as Array<keyof typeof PAWN_META>;
    expect(pawnIds).toHaveLength(6);
    for (const pid of pawnIds) {
      expect(PAWN_META[pid].shortName.length).toBeGreaterThanOrEqual(4);
      expect(PAWN_META[pid].perkTitle.length).toBeGreaterThan(2);
      expect(PAWN_META[pid].perkDesc.length).toBeGreaterThan(8);
    }

    // Rebalanced challenge durations are generous (>= 6500ms for all playable archetypes)
    for (const arch of PLAYABLE_TILE_ARCHETYPES) {
      expect(ARCHETYPE_REGISTRY[arch].baseDurationMs).toBeGreaterThanOrEqual(6500);
    }
    expect(ARCHETYPE_REGISTRY.boss_doodle.baseDurationMs).toBeGreaterThanOrEqual(18000);

    // Koko si Kodok: dice 1 moves 2 tiles (+1 perk) & preview matches
    expect(previewDiceLanding(BOARD_LAYOUT, 1, 1, false, 'kodok').to).toBe(3);
    let kokoState = startGame(
      createInitialGameState({
        matchSeed: 404,
        board: BOARD_LAYOUT,
        players: [
          { id: 'koko', name: 'Koko', pawn: 'kodok', color: 'mint' },
          { id: 'roro', name: 'Roro', pawn: 'dino', color: 'oranye' },
        ],
      }),
    ).state;
    kokoState = rollDice(kokoState, 'koko', 1).state;
    expect(kokoState.players[0].position).toBe(3);

    // Roro si Dino: discounted 3-star Kantin Bintang cost
    expect(getPlayerShopCost('dino')).toBe(STAR_SHOP_COST - 1);
    let roroShop = startGame(
      createInitialGameState({
        matchSeed: 505,
        board: BOARD_LAYOUT,
        players: [
          { id: 'roro', name: 'Roro', pawn: 'dino', color: 'oranye' },
          { id: 'boba', name: 'Boba', pawn: 'panda', color: 'biru' },
        ],
      }),
    ).state;
    roroShop.players[0].stars = 3;
    const roroBought = buyStarItem(roroShop, 'roro');
    expect(roroBought.state.players[0].stars).toBe(0);
    expect(roroBought.state.players[0].items).toHaveLength(1);

    // Boba si Panda: +1500ms challenge timer bonus on own turn
    expect(getChallengeBonusDurationMs('panda')).toBe(1500);
    roroShop = startGame(
      createInitialGameState({
        matchSeed: 606,
        board: BOARD_LAYOUT,
        players: [
          { id: 'boba', name: 'Boba', pawn: 'panda', color: 'biru' },
          { id: 'toady', name: 'Toady', pawn: 'jamur', color: 'ungu' },
        ],
      }),
    ).state;
    const customTiles: Tile[] = TILES.map((t) =>
      t.id === 3 || t.id === 17 || t.id === 4
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            reward: { stars: 2, bonusType: 'none' },
            penalty: { type: 'none' },
          }
        : t,
    );
    roroShop = rollDice(roroShop, 'boba', 2).state;
    roroShop = resolveTile(roroShop, customTiles).state;
    expect(roroShop.activeChallenge?.durationMs).toBe(ARCHETYPE_REGISTRY.quick_math.baseDurationMs + 1500);

    // Mochi (+1 ladder star) & Toady (+1 snake dodge star)
    let perkState = startGame(
      createInitialGameState({
        matchSeed: 707,
        board: BOARD_LAYOUT,
        players: [
          { id: 'mochi', name: 'Mochi', pawn: 'kucing', color: 'pink' },
          { id: 'toady', name: 'Toady', pawn: 'jamur', color: 'ungu' },
        ],
      }),
    ).state;
    perkState = rollDice(perkState, 'mochi', 3).state; // -> tile 4 ladder (4->25)
    perkState = resolveTile(perkState, customTiles).state;
    perkState = recordChallengeSubmission(perkState, makeWinningSubmission(perkState, 'mochi'));
    const mochiRes = applyChallengeResult(perkState);
    expect(mochiRes.state.players[0].stars).toBe(3); // 2 reward + 1 Mochi ladder perk

    let toadyState = nextTurn(mochiRes.state).state;
    toadyState.players[1].position = 14;
    toadyState = rollDice(toadyState, 'toady', 3).state; // -> tile 17 snake (17->7)
    toadyState = resolveTile(toadyState, customTiles).state;
    toadyState = recordChallengeSubmission(toadyState, makeWinningSubmission(toadyState, 'toady'));
    const toadyRes = applyChallengeResult(toadyState);
    expect(toadyRes.state.players[1].stars).toBe(3); // 2 reward + 1 Toady snake-dodge perk
  });

  it('preserves accessory customization with none default through game state and podium', () => {
    expect(Object.keys(ACCESSORY_META)).toEqual([
      'none',
      'crown',
      'glasses',
      'scarf',
      'headset',
      'flower',
      'backpack',
    ]);

    const state = createInitialGameState({
      matchSeed: 808,
      board: BOARD_LAYOUT,
      players: [
        { id: 'p1', name: 'Mochi', pawn: 'kucing', color: 'pink', accessory: 'crown' },
        { id: 'p2', name: 'Koko', pawn: 'kodok', color: 'mint' },
        { id: 'p3', name: 'Boba', pawn: 'panda', color: 'biru', accessory: 'backpack' },
      ],
    });

    expect(state.players.map((p) => p.accessory)).toEqual(['crown', 'none', 'backpack']);

    state.players[0].position = 100;
    state.players[0].stars = 6;
    state.players[1].position = 82;
    state.players[2].position = 64;
    const podium = computePodium(state, 'p1');
    expect(podium.map((entry) => [entry.playerId, entry.accessory])).toEqual([
      ['p1', 'crown'],
      ['p2', 'none'],
      ['p3', 'backpack'],
    ]);
  });

  it('rejects profanity, porn, SARA slurs, insults, and obfuscated bypasses in usernames while allowing normal names', () => {
    const blocked = [
      'anjing',
      'A.n.j.1.n.g',
      'k0nt0l',
      'B o k e p',
      'p0rn_king',
      'g0bl0k99',
      'nigger',
      'kafir123',
      'asu123',
      'bego99',
      'sex2025',
      'pecundang',
      'mmk_gg',
      'a s u',
      '---',
      '   ',
    ];
    for (const bad of blocked) {
      expect({ bad, ok: validateUsername(bad).ok }).toEqual({ bad, ok: false });
    }

    const allowed = [
      'Chenn',
      'Koko',
      'Mochi',
      'Pemain 1',
      'Cassie',
      'Hasan',
      'Nasution',
      'Sasuke',
      'CoklatManis',
      'Lucina',
      'Analisa',
      'BabiesRock',
      'Perekonomian',
    ];
    for (const good of allowed) {
      expect({ good, ok: validateUsername(good).ok }).toEqual({ good, ok: true });
    }

    const badState = createInitialGameState({
      matchSeed: 707,
      board: BOARD_LAYOUT,
      players: [
        { id: 'p1', name: 'k0nt0l', pawn: 'kucing', color: 'pink' },
        { id: 'p2', name: 'Chenn', pawn: 'kodok', color: 'mint' },
      ],
    });
    expect(badState.players[0].name).toBe('Pemain 1');
    expect(badState.players[1].name).toBe('Chenn');
    expect(sanitizeUsernameOrFallback('b4b1', 'Pemain')).toBe('Pemain');
  });

  it('triggers ladder climb and snake slide when deferred advance or retreat lands on them', () => {
    const firstLadder = BOARD_LAYOUT.ladders[0]; // tile 4 -> 25
    const preLadderTileId = firstLadder.from - 1;
    const customTiles: Tile[] = TILES.map((t) =>
      t.id === preLadderTileId
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            reward: { stars: 2, bonusType: 'advance', bonusValue: 1 },
          }
        : t,
    );

    let advState = startGame(
      createInitialGameState({
        matchSeed: 808,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    advState.players[0].position = preLadderTileId - 2;
    advState = rollDice(advState, advState.turnOrder[advState.currentTurnIndex], 2).state;
    advState = resolveTile(advState, customTiles, Date.now()).state;
    advState = recordChallengeSubmission(
      advState,
      makeWinningSubmission(advState, advState.turnOrder[advState.currentTurnIndex]),
    );
    const ladderAfterAdvance = applyChallengeResult(advState);
    expect(ladderAfterAdvance.state.players[0].position).toBe(firstLadder.to);
    expect(
      ladderAfterAdvance.events.some(
        (e) => e.type === 'LadderClimbed' && e.from === firstLadder.from && e.to === firstLadder.to,
      ),
    ).toBe(true);

    // Deferred retreat landing on a snake head must also trigger snake slide (unless shielded)
    const firstSnake = BOARD_LAYOUT.snakes[0]; // tile 17 -> 7
    const postSnakeTileId = firstSnake.from + 1;
    const retreatTiles: Tile[] = TILES.map((t) =>
      t.id === postSnakeTileId
        ? {
            ...t,
            archetype: 'quick_math',
            mode: 'solo',
            params: SAMPLE_MATH_PARAMS,
            penalty: { type: 'retreat', value: 1 },
          }
        : t,
    );

    let retState = startGame(
      createInitialGameState({
        matchSeed: 809,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(2),
      }),
    ).state;
    retState.players[0].position = postSnakeTileId - 2;
    retState = rollDice(retState, retState.turnOrder[retState.currentTurnIndex], 2).state;
    retState = resolveTile(retState, retreatTiles, Date.now()).state;
    retState = recordChallengeSubmission(
      retState,
      makeFailingSubmission(retState, retState.turnOrder[retState.currentTurnIndex]),
    );
    const snakeAfterRetreat = applyChallengeResult(retState);
    expect(snakeAfterRetreat.state.players[0].position).toBe(firstSnake.to);
    expect(
      snakeAfterRetreat.events.some(
        (e) =>
          e.type === 'SnakeBitten' &&
          e.from === firstSnake.from &&
          e.to === firstSnake.to &&
          !e.dodgedByChallenge,
      ),
    ).toBe(true);
  });

  it('includes unambiguous colorblind pattern codes on color challenges', () => {
    const rng = new SeededRng(4242);
    const ccParams = ARCHETYPE_REGISTRY.color_count.buildParams(rng, 2, 12);
    const targetColor = ccParams.targetColor as { pattern?: string; cbCode?: string };
    expect(typeof targetColor.pattern).toBe('string');
    expect(typeof targetColor.cbCode).toBe('string');
    const items = ccParams.items as Array<{ colorPattern?: string; colorCode?: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((it) => Boolean(it.colorPattern) && Boolean(it.colorCode))).toBe(true);

    const bpParams = ARCHETYPE_REGISTRY.bubble_pop.buildParams(rng, 2, 15);
    const bpColor = bpParams.targetColor as { pattern?: string };
    expect(typeof bpColor.pattern).toBe('string');
  });

  it('always transitions cleanly to a rollable TURN_BEGIN across multi-turn play', () => {
    let state = startGame(
      createInitialGameState({
        matchSeed: 7788,
        board: BOARD_LAYOUT,
        players: makeTestPlayers(3),
      }),
    ).state;

    for (let turn = 0; turn < 18 && state.phase !== 'GAME_OVER'; turn++) {
      expect(state.phase).toBe('TURN_BEGIN');
      const activeId = state.turnOrder[state.currentTurnIndex];
      state = rollDice(state, activeId, (turn % 5) + 1).state;
      if (state.phase === 'ROLL') {
        state = chooseDice(state, activeId, 0).state;
      }
      expect(state.phase).toBe('TILE_CHECK');
      state = resolveTile(state, TILES, 1_700_000_000_000 + turn * 1000).state;
      if (state.phase === 'CHALLENGE' && state.activeChallenge) {
        for (const pid of state.activeChallenge.participantIds) {
          state = recordChallengeSubmission(state, makeWinningSubmission(state, pid));
        }
        state = applyChallengeResult(state).state;
      }
      if (state.phase === 'TURN_END' || state.phase === 'EXTRA_ROLL') {
        state = nextTurn(state, Date.now() + 30_000).state;
      }
    }
    expect(['TURN_BEGIN', 'GAME_OVER']).toContain(state.phase);
  });

  it('validates pair_flip, number_order, odd_one_out and randomizes challenges without repeats on TILES', () => {
    const newArchs = ['pair_flip', 'number_order', 'odd_one_out'] as const;
    const rng = new SeededRng(9191);
    for (const arch of newArchs) {
      const spec = ARCHETYPE_REGISTRY[arch];
      const params = spec.buildParams(rng, 3, 55);
      const botInput = spec.simulateBot(params, 'juara', new SeededRng(55));
      expect(typeof botInput.score).toBe('number');

      if (arch === 'pair_flip') {
        const pairCount = Number(params.pairCount);
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 2200, extra: { pairsMatched: pairCount } },
          },
          1,
        );
        expect(pass.success).toBe(true);
      } else if (arch === 'number_order') {
        const expected = params.expectedIndices as number[];
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 1600, reactionMs: 1600, sequenceIndices: expected },
          },
          1,
        );
        expect(pass.success).toBe(true);
      } else {
        const idx = Number(params.correctIndex);
        const pass = spec.validate(
          params,
          {
            playerId: 'p1',
            claimedSuccess: true,
            score: 100,
            inputLog: { startedAt: 0, completedAt: 900, reactionMs: 900, answerIndex: idx },
          },
          1,
        );
        expect(pass.success).toBe(true);
      }
    }

    // Verify landing on the same tile in two matches with different matchSeeds gives varied challenges
    const runFirstChallenge = (seed: number) => {
      let s = startGame(createInitialGameState({ matchSeed: seed, board: BOARD_LAYOUT, players: makeTestPlayers(2) })).state;
      s = rollDice(s, s.turnOrder[s.currentTurnIndex], 3).state;
      return resolveTile(s, TILES, 1000).state.activeChallenge!;
    };
    const seenArchs = new Set<string>();
    for (let s = 101; s <= 125; s++) {
      seenArchs.add(runFirstChallenge(s).archetype);
    }
    expect(seenArchs.size).toBeGreaterThanOrEqual(8);
  });
});
