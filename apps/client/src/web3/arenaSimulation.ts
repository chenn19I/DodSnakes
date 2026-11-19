import type { FheProofLogEntry, OnchainMatchSnapshot } from './fheClient.js';

const CLASSIC_LADDERS: Record<number, number> = {
  4: 25,
  9: 31,
  20: 42,
  28: 56,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};

const CLASSIC_SNAKES: Record<number, number> = {
  17: 7,
  34: 13,
  47: 26,
  54: 36,
  62: 19,
  87: 57,
  93: 73,
  98: 79,
};

const SPRINT_LADDERS: Record<number, number> = {
  3: 11,
  8: 19,
  15: 24,
};

const SPRINT_SNAKES: Record<number, number> = {
  14: 5,
  21: 10,
  27: 18,
};

function fakeHandle(tag: string): `0x${string}` {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${tag.slice(0, 4).padEnd(4, '0')}${hex.slice(4)}`;
}

interface SimBotState {
  address: `0x${string}`;
  position: number;
  stars: number;
  laddersClimbed: number;
  snakesDodged: number;
  duelWins: number;
  trapsPlanted: number;
  shields: number;
  brakeActive: boolean;
}

const BOT_ADDRESSES: readonly `0x${string}`[] = [
  '0xB071000000000000000000000000000000000001',
  '0xB072000000000000000000000000000000000002',
  '0xB073000000000000000000000000000000000003',
];

export class ArenaPreviewSimulator {
  private chipBalanceMicro = 100_000_000n;
  private balanceDecrypted = false;
  private operatorApproved = false;
  private matchCounter = 0n;
  private logs: FheProofLogEntry[] = [];

  private boardSize = 30;
  private maxPlayers = 1;
  private turnIndex = 0;
  private status = 0;
  private turnNumber = 1;
  private position = 1;
  private stars = 2;
  private laddersClimbed = 0;
  private snakesDodged = 0;
  private duelWins = 0;
  private trapsPlanted = 0;
  private missionClaimed = false;
  private payoutClaimed = false;
  private stakeMicro = 0n;
  private winnerAddr: `0x${string}` = '0x0000000000000000000000000000000000000000';

  private secretMissionId = 0;
  private secretShields = 1;
  private secretTrapCharges = 2;
  private missionUnlocked = false;
  private playerTraps: Array<{ tile: number; kind: number; active: boolean }> = [];
  private houseTraps: Array<{ tile: number; kind: number; active: boolean }> = [];
  private brakeActive = false;
  private bots: SimBotState[] = [];

  private readonly playerAddress = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' as const;

  public getAddress(): `0x${string}` {
    return this.playerAddress;
  }

  public getLogs(): FheProofLogEntry[] {
    return [...this.logs];
  }

  private pushLog(entry: Omit<FheProofLogEntry, 'id' | 'ts'>): void {
    this.logs.unshift({
      id: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...entry,
    });
    if (this.logs.length > 35) this.logs.length = 35;
  }

  public getBalanceInfo() {
    return {
      handle: fakeHandle('cdod'),
      clearMicro: this.balanceDecrypted ? this.chipBalanceMicro : null,
      isOperator: this.operatorApproved,
    };
  }

  public claimFaucet(): void {
    this.chipBalanceMicro += 100_000_000n;
    this.pushLog({
      kind: 'tx',
      title: '[Preview] Claimed 100 cDOD Faucet',
      detail: 'Simulated ERC-7984 encrypted mint.',
      handle: fakeHandle('mint'),
    });
  }

  public decryptBalance(): bigint {
    this.balanceDecrypted = true;
    this.pushLog({
      kind: 'user_decrypt',
      title: '[Preview] ERC-7984 Balance Decrypted',
      detail: `${(Number(this.chipBalanceMicro) / 1e6).toFixed(2)} cDOD`,
      handle: fakeHandle('bal0'),
    });
    return this.chipBalanceMicro;
  }

  public approveOperator(): void {
    this.operatorApproved = true;
    this.pushLog({
      kind: 'tx',
      title: '[Preview] Operator Approved',
      detail: 'DodSnakeArena set as ERC-7984 operator.',
    });
  }

  public createMatch(boardMode: 0 | 1, stakeWholeTokens: number, maxPlayers = 1): bigint {
    this.matchCounter += 1n;
    this.boardSize = boardMode === 1 ? 30 : 100;
    this.maxPlayers = Math.max(1, Math.min(4, maxPlayers));
    this.turnIndex = 0;
    this.status = 1;
    this.turnNumber = 1;
    this.position = 1;
    this.stars = 2;
    this.laddersClimbed = 0;
    this.snakesDodged = 0;
    this.duelWins = 0;
    this.trapsPlanted = 0;
    this.missionClaimed = false;
    this.payoutClaimed = false;
    this.winnerAddr = '0x0000000000000000000000000000000000000000';
    this.missionUnlocked = false;
    this.secretMissionId = Math.floor(Math.random() * 4);
    this.secretShields = 1;
    this.secretTrapCharges = 2;
    this.playerTraps = [];

    const wantMicro = BigInt(Math.max(0, Math.round(stakeWholeTokens * 1e6)));
    this.stakeMicro = wantMicro <= this.chipBalanceMicro ? wantMicro : 0n;
    this.chipBalanceMicro -= this.stakeMicro;

    this.bots = Array.from({ length: Math.max(0, this.maxPlayers - 1) }, (_, idx) => ({
      address: BOT_ADDRESSES[idx % BOT_ADDRESSES.length],
      position: 1,
      stars: 2,
      laddersClimbed: 0,
      snakesDodged: 0,
      duelWins: 0,
      trapsPlanted: 0,
      shields: 1,
      brakeActive: false,
    }));

    // 2 hidden encrypted FHE House Traps (solo) + 1 hidden Golden Warp shortcut (+3 steps +1★)
    const span = this.boardSize - 4;
    const h1 = 2 + Math.floor(Math.random() * span);
    let h2 = 2 + Math.floor(Math.random() * span);
    if (h2 === h1) h2 = Math.min(this.boardSize - 1, h1 + 3);
    let w1 = 2 + Math.floor(Math.random() * span);
    if (w1 === h1 || w1 === h2) w1 = Math.min(this.boardSize - 2, h2 + 2);
    this.brakeActive = false;
    this.houseTraps =
      this.bots.length === 0
        ? [
            { tile: h1, kind: 1 + Math.floor(Math.random() * 3), active: true },
            { tile: h2, kind: 1 + Math.floor(Math.random() * 3), active: true },
            { tile: w1, kind: 4, active: true },
          ]
        : [{ tile: w1, kind: 4, active: true }];

    this.pushLog({
      kind: 'encrypt',
      title: `[Preview] Match #${this.matchCounter} Created (${this.maxPlayers}P)`,
      detail: `${this.boardSize} tiles • Secret Mission & Hidden Golden Warp initialized`,
      handle: fakeHandle('m001'),
    });
    return this.matchCounter;
  }

  public decryptSecrets(): void {
    this.missionUnlocked = true;
    this.pushLog({
      kind: 'user_decrypt',
      title: '[Preview] Secret State Unlocked',
      detail: `Mission #${this.secretMissionId} • Shields ${this.secretShields} • Trap Charges ${this.secretTrapCharges}`,
      handle: fakeHandle('sec1'),
    });
  }

  public plantTrap(tileId: number, kind: number): void {
    if (this.secretTrapCharges <= 0 || this.trapsPlanted >= 3) {
      throw new Error('No trap charges left (buy Mystery Item for more, max 3 traps).');
    }
    const clampedTile = Math.max(2, Math.min(this.boardSize - 1, tileId));
    const clampedKind = Math.max(1, Math.min(3, kind));
    this.secretTrapCharges -= 1;
    this.trapsPlanted += 1;
    this.playerTraps.push({ tile: clampedTile, kind: clampedKind, active: true });
    this.pushLog({
      kind: 'encrypt',
      title: `[Preview] Secret Trap Planted on Tile ${clampedTile}`,
      detail: 'Encrypted euint8 tile & trap type stored.',
      handle: fakeHandle('trap'),
    });
  }

  public buyMysteryItem(): void {
    if (this.stars < 2) throw new Error('Need at least 2 ★.');
    this.stars -= 2;
    const roll = Math.floor(Math.random() * 4);
    if (roll === 0) this.secretShields += 1;
    else if (roll === 1) this.secretTrapCharges += 1;
    else if (roll === 2) this.secretShields += 2;
    else {
      this.secretShields += 1;
      this.secretTrapCharges += 1;
    }
    this.pushLog({
      kind: 'encrypt',
      title: '[Preview] Encrypted Mystery Item Rolled',
      detail: `Bag updated privately (Shields: ${this.secretShields}, Traps: ${this.secretTrapCharges})`,
      handle: fakeHandle('item'),
    });
  }

  public castSecretBrake(seatIndex = 0): void {
    if (this.stars < 2) throw new Error('Need at least 2 ★.');
    this.stars -= 2;
    if (this.bots.length > 0) {
      const botIdx = Math.max(0, Math.min(this.bots.length - 1, seatIndex - 1));
      const targetBot =
        seatIndex > 0
          ? this.bots[botIdx]
          : this.bots.slice().sort((a, b) => b.position - a.position)[0];
      targetBot.brakeActive = true;
      this.pushLog({
        kind: 'encrypt',
        title: '[Preview] Secret Rival Brake Cast (euint8 seat)',
        detail: `Encrypted target ${targetBot.address.slice(0, 6)}... cursed to roll <= 3 next turn.`,
        handle: fakeHandle('brk1'),
      });
      return;
    }
    this.brakeActive = true;
    this.pushLog({
      kind: 'encrypt',
      title: '[Preview] Secret Brake Demo Active (ebool)',
      detail: 'Next dice roll is secretly capped at 1..3.',
      handle: fakeHandle('brk1'),
    });
  }

  private resolveTurnForActor(isHuman: boolean, botIdx = -1): {
    actorAddr: `0x${string}`;
    dieValue: number;
    fromPos: number;
    landedPos: number;
    finalPos: number;
    trapTriggered: number;
    shieldBlocked: boolean;
    ladderTo: number;
    snakeTo: number;
    usedBrake: boolean;
  } {
    const bot = botIdx >= 0 ? this.bots[botIdx] : null;
    const fromPos = isHuman ? this.position : bot!.position;
    const usedBrake = isHuman ? this.brakeActive : bot!.brakeActive;
    const rawDie = 1 + Math.floor(Math.random() * 6);
    const dieValue = usedBrake ? Math.min(3, rawDie) : rawDie;
    if (isHuman) this.brakeActive = false;
    else bot!.brakeActive = false;

    const raw = fromPos + dieValue;
    const landedPos = raw <= this.boardSize ? raw : this.boardSize - (raw - this.boardSize);
    let finalPos = landedPos;

    let trapTriggered = 0;
    const isExactFinish = landedPos >= this.boardSize;
    if (!isExactFinish) {
      const trapPool = isHuman
        ? this.houseTraps
        : [...this.playerTraps, ...this.houseTraps];
      for (const t of trapPool) {
        if (t.active && t.tile === landedPos) {
          t.active = false;
          trapTriggered = t.kind;
          if (t.kind === 1) finalPos = Math.max(1, finalPos - 2);
          else if (t.kind === 2) {
            if (isHuman) this.stars = Math.max(0, this.stars - 1);
            else bot!.stars = Math.max(0, bot!.stars - 1);
          } else if (t.kind === 3) {
            finalPos = Math.max(1, finalPos - 4);
          } else if (t.kind === 4) {
            finalPos = Math.min(this.boardSize - 1, finalPos + 3);
            if (isHuman) this.stars += 1;
            else bot!.stars += 1;
          }
          break;
        }
      }
    }

    const ladders = this.boardSize === 30 ? SPRINT_LADDERS : CLASSIC_LADDERS;
    const snakes = this.boardSize === 30 ? SPRINT_SNAKES : CLASSIC_SNAKES;
    const ladderTo = ladders[finalPos] ?? 0;
    const snakeTo = snakes[finalPos] ?? 0;
    let shieldBlocked = false;

    if (ladderTo > 0) {
      finalPos = ladderTo;
      if (isHuman) {
        this.laddersClimbed += 1;
        this.stars += 2;
      } else {
        bot!.laddersClimbed += 1;
        bot!.stars += 2;
      }
    } else if (snakeTo > 0) {
      const shieldsAvail = isHuman ? this.secretShields : bot!.shields;
      if (shieldsAvail > 0) {
        if (isHuman) {
          this.secretShields -= 1;
          this.snakesDodged += 1;
          this.stars += 1;
        } else {
          bot!.shields -= 1;
          bot!.snakesDodged += 1;
          bot!.stars += 1;
        }
        shieldBlocked = true;
      } else {
        finalPos = snakeTo;
      }
    } else if (trapTriggered === 0) {
      if (isHuman) this.stars += 1;
      else bot!.stars += 1;
    }

    const actorAddr = isHuman ? this.playerAddress : bot!.address;
    if (isHuman) this.position = finalPos;
    else bot!.position = finalPos;

    if (finalPos >= this.boardSize) {
      this.status = 2;
      this.winnerAddr = actorAddr;
    } else {
      const totalSeats = 1 + this.bots.length;
      this.turnIndex = (this.turnIndex + 1) % totalSeats;
      this.turnNumber += 1;
    }

    return {
      actorAddr,
      dieValue,
      fromPos,
      landedPos,
      finalPos,
      trapTriggered,
      shieldBlocked,
      ladderTo,
      snakeTo,
      usedBrake,
    };
  }

  public rollDice() {
    if (this.status !== 1 || this.turnIndex !== 0) throw new Error('Wait for your turn.');
    const res = this.resolveTurnForActor(true, -1);
    this.pushLog({
      kind: 'public_decrypt',
      title: `[Preview] FHE Dice = ${res.dieValue} (${res.fromPos} → ${res.finalPos})`,
      detail:
        res.trapTriggered === 4
          ? 'Hidden Golden Warp discovered (+3 steps +1★)!'
          : res.trapTriggered > 0
            ? `FHE House Trap #${res.trapTriggered} triggered!`
            : res.shieldBlocked
              ? 'Confidential Shield blocked Snake!'
              : 'KMS proof verified; untriggered traps stayed hidden.',
      handle: fakeHandle('dice'),
    });
    return res;
  }

  public stepBotTurn() {
    if (this.status !== 1 || this.turnIndex === 0 || this.bots.length === 0) return null;
    const botIdx = this.turnIndex - 1;
    const res = this.resolveTurnForActor(false, botIdx);
    this.pushLog({
      kind: 'public_decrypt',
      title: `[Preview] Rival #${botIdx + 1} Rolled ${res.dieValue} (${res.fromPos} → ${res.finalPos})`,
      detail:
        res.trapTriggered === 4
          ? 'Rival hit Golden Warp!'
          : res.trapTriggered > 0
            ? `BOOM! Rival hit YOUR Secret Trap #${res.trapTriggered}!`
            : res.shieldBlocked
              ? 'Rival Shield blocked Snake!'
              : 'Rival resolved FHE turn.',
      handle: fakeHandle('bot0'),
    });
    return { botNumber: botIdx + 2, ...res };
  }

  public playBlindDuel(choice: 0 | 1 | 2): { outcome: 0 | 1 | 2; houseChoice: number } {
    const houseChoice = Math.floor(Math.random() * 3);
    let outcome: 0 | 1 | 2 = 0;
    if (choice === houseChoice) {
      outcome = 0;
      this.stars += 1;
    } else if (
      (choice === 0 && houseChoice === 2) ||
      (choice === 1 && houseChoice === 0) ||
      (choice === 2 && houseChoice === 1)
    ) {
      outcome = 1;
      this.stars += 2;
      this.duelWins += 1;
    } else {
      outcome = 2;
      if (this.stars > 0) this.stars -= 1;
    }

    this.pushLog({
      kind: 'public_decrypt',
      title: `[Preview] Blind Duel: ${outcome === 1 ? 'You Won +2 ★' : outcome === 0 ? 'Tie +1 ★' : 'Rival Won (-1 ★)'}`,
      detail: 'Both encrypted RPS moves evaluated homomorphically.',
      handle: fakeHandle('duel'),
    });

    return { outcome, houseChoice };
  }

  public verifySecretMission(): boolean {
    if (this.missionClaimed) return true;
    const conds = [
      this.laddersClimbed >= 1,
      this.snakesDodged >= 1 || this.position >= Math.floor(this.boardSize / 2),
      this.duelWins >= 1,
      this.trapsPlanted >= 1 && this.stars >= 4,
    ];
    const passed = conds[this.secretMissionId] ?? false;
    if (passed) {
      this.missionClaimed = true;
      this.stars += 3;
      this.secretShields += 1;
    }
    this.pushLog({
      kind: 'public_decrypt',
      title: passed ? '[Preview] Secret Mission Verified (+3 ★ +1 Shield)!' : '[Preview] Mission Criteria Not Yet Met',
      detail: 'Evaluated without exposing secret mission ID.',
      handle: fakeHandle('miss'),
    });
    return passed;
  }

  public claimPayout(): void {
    if (this.status !== 2 || this.payoutClaimed) return;
    this.payoutClaimed = true;
    const pot = this.stakeMicro * BigInt(1 + this.bots.length);
    if (this.winnerAddr === this.playerAddress) {
      this.chipBalanceMicro += pot;
    }
    this.pushLog({
      kind: 'tx',
      title: '[Preview] Confidential Pot Paid Out!',
      detail: `${(Number(pot) / 1e6).toFixed(2)} cDOD settled confidentially.`,
      handle: fakeHandle('pay0'),
    });
  }

  public getSnapshot(): OnchainMatchSnapshot {
    const totalSeats = 1 + this.bots.length;
    return {
      matchId: this.matchCounter,
      host: this.playerAddress,
      stakeToken: this.stakeMicro > 0n ? this.playerAddress : '0x0000000000000000000000000000000000000000',
      boardSize: this.boardSize,
      maxPlayers: this.maxPlayers,
      playerCount: totalSeats,
      turnIndex: this.turnIndex % totalSeats,
      turnNumber: this.turnNumber,
      status: this.status,
      pendingAction: 0,
      winner: this.winnerAddr,
      payoutClaimed: this.payoutClaimed,
      trapCount: this.playerTraps.length + this.houseTraps.length,
      players: [
        {
          address: this.playerAddress,
          position: this.position,
          stars: this.stars,
          laddersClimbed: this.laddersClimbed,
          snakesDodged: this.snakesDodged,
          duelWins: this.duelWins,
          trapsPlanted: this.trapsPlanted,
          missionClaimed: this.missionClaimed,
        },
        ...this.bots.map((b) => ({
          address: b.address,
          position: b.position,
          stars: b.stars,
          laddersClimbed: b.laddersClimbed,
          snakesDodged: b.snakesDodged,
          duelWins: b.duelWins,
          trapsPlanted: b.trapsPlanted,
          missionClaimed: false,
        })),
      ],
      mySecret: this.matchCounter > 0n
        ? {
            missionHandle: fakeHandle('mis0'),
            shieldsHandle: fakeHandle('shd0'),
            trapChargesHandle: fakeHandle('trp0'),
            stakeHandle: fakeHandle('stk0'),
            missionId: this.missionUnlocked ? this.secretMissionId : undefined,
            shields: this.missionUnlocked ? this.secretShields : undefined,
            trapCharges: this.missionUnlocked ? this.secretTrapCharges : undefined,
            stakeMicro: this.missionUnlocked ? this.stakeMicro : undefined,
          }
        : undefined,
      myPlantedTrapTiles: this.playerTraps.filter((t) => t.active).map((t) => t.tile),
    };
  }
}
