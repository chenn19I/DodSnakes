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
  3: 17,
  8: 12,
  15: 25,
};

const SPRINT_SNAKES: Record<number, number> = {
  14: 6,
  21: 19,
  27: 13,
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

export interface ArenaSimSeat {
  address: `0x${string}`;
  name: string;
  isBot: boolean;
  position: number;
  stars: number;
  laddersClimbed: number;
  snakesDodged: number;
  duelWins: number;
  trapsPlanted: number;
  missionClaimed: boolean;
  secretMissionId: number;
  secretShields: number;
  secretTrapCharges: number;
  missionUnlocked: boolean;
  brakeActive: boolean;
}

export interface ArenaSimTrap {
  owner: `0x${string}`;
  tile: number;
  kind: number;
  active: boolean;
  handle: `0x${string}`;
}

export interface PendingOnlineDuel {
  challenger: `0x${string}`;
  challengerName: string;
  /** Ciphertext handle of the challenger's committed move. The clear move never leaves the challenger's browser. */
  handle: `0x${string}`;
}

export interface ArenaOnlineRoomState {
  version: number;
  matchId: string;
  boardSize: number;
  maxPlayers: number;
  turnIndex: number;
  status: number;
  turnNumber: number;
  stakeMicro: string;
  winnerAddr: `0x${string}`;
  payoutClaimed: boolean;
  seats: ArenaSimSeat[];
  allTraps: ArenaSimTrap[];
  pendingOnlineDuel: PendingOnlineDuel | null;
}

export interface TurnRollResult {
  actorAddr: `0x${string}`;
  actorName: string;
  seatIndex: number;
  dieValue: number;
  fromPos: number;
  landedPos: number;
  finalPos: number;
  trapTriggered: number;
  shieldBlocked: boolean;
  ladderTo: number;
  snakeTo: number;
  usedBrake: boolean;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as const;

const BOT_ADDRESSES: readonly `0x${string}`[] = [
  '0xB071000000000000000000000000000000000001',
  '0xB072000000000000000000000000000000000002',
  '0xB073000000000000000000000000000000000003',
];

const BOT_NAMES = ['CipherBot-1', 'CipherBot-2', 'CipherBot-3'] as const;

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
  private payoutClaimed = false;
  private stakeMicro = 0n;
  private winnerAddr: `0x${string}` = ZERO_ADDR;

  private seats: ArenaSimSeat[] = [];
  private allTraps: ArenaSimTrap[] = [];
  private pendingOnlineDuel: PendingOnlineDuel | null = null;
  /** Local-only clear move of my own outstanding duel challenge (never exported). */
  private myDuelChoice: 0 | 1 | 2 | null = null;
  private stateVersion = 1;

  private playerAddress: `0x${string}` = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
  private playerName = 'Mochi';

  public getAddress(): `0x${string}` {
    return this.playerAddress;
  }

  public getPlayerName(address?: string): string {
    if (!address) return this.playerName;
    const seat = this.seats.find((s) => s.address.toLowerCase() === address.toLowerCase());
    if (seat) return seat.name;
    if (address.toLowerCase() === this.playerAddress.toLowerCase()) return this.playerName;
    return `${address.slice(0, 6)}..${address.slice(-4)}`;
  }

  public isSeatBot(address: string): boolean {
    const seat = this.seats.find((s) => s.address.toLowerCase() === address.toLowerCase());
    return seat ? seat.isBot : address.toLowerCase().startsWith('0xb07');
  }

  public getHumanSeatCount(): number {
    return this.seats.filter((s) => !s.isBot).length;
  }

  public getPendingOnlineDuel(): PendingOnlineDuel | null {
    return this.pendingOnlineDuel;
  }

  /** Clears the active match so the lobby shows again (keeps wallet balance & proof log). */
  public resetForNewLobby(): void {
    this.status = 0;
    this.seats = [];
    this.allTraps = [];
    this.pendingOnlineDuel = null;
    this.myDuelChoice = null;
    this.turnIndex = 0;
    this.turnNumber = 1;
    this.winnerAddr = ZERO_ADDR;
    this.payoutClaimed = false;
    this.stateVersion += 1;
  }

  public isActiveSeatBot(): boolean {
    if (this.status !== 1 || this.seats.length === 0) return false;
    return Boolean(this.seats[this.turnIndex % this.seats.length]?.isBot);
  }

  public getActiveSeatName(): string {
    if (this.seats.length === 0) return '';
    return this.seats[this.turnIndex % this.seats.length]?.name ?? '';
  }

  public setPlayerIdentity(address: `0x${string}`, name?: string): void {
    const prevAddr = this.playerAddress;
    this.playerAddress = address;
    if (name && name.trim()) {
      this.playerName = name.trim().slice(0, 18);
    }
    const existing = this.seats.find((s) => s.address.toLowerCase() === prevAddr.toLowerCase());
    if (existing && !this.seats.some((s) => s.address.toLowerCase() === address.toLowerCase())) {
      existing.address = address;
      existing.name = this.playerName;
    }
  }

  private getMySeat(): ArenaSimSeat {
    const found = this.seats.find((s) => s.address.toLowerCase() === this.playerAddress.toLowerCase());
    if (found) return found;
    if (this.seats.length > 0) return this.seats[0];
    const fallback: ArenaSimSeat = {
      address: this.playerAddress,
      name: this.playerName,
      isBot: false,
      position: 1,
      stars: 2,
      laddersClimbed: 0,
      snakesDodged: 0,
      duelWins: 0,
      trapsPlanted: 0,
      missionClaimed: false,
      secretMissionId: 0,
      secretShields: 1,
      secretTrapCharges: 2,
      missionUnlocked: false,
      brakeActive: false,
    };
    this.seats.push(fallback);
    return fallback;
  }

  public getLogs(): FheProofLogEntry[] {
    return [...this.logs];
  }

  public pushExternalLog(entry: Omit<FheProofLogEntry, 'id' | 'ts'>): void {
    this.pushLog(entry);
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
      title: 'Claimed 100 cDOD Faucet',
      detail: 'ERC-7984 encrypted mint confirmed.',
      handle: fakeHandle('mint'),
    });
  }

  public decryptBalance(): bigint {
    this.balanceDecrypted = true;
    this.pushLog({
      kind: 'user_decrypt',
      title: 'ERC-7984 Balance Decrypted',
      detail: `${(Number(this.chipBalanceMicro) / 1e6).toFixed(2)} cDOD`,
      handle: fakeHandle('bal0'),
    });
    return this.chipBalanceMicro;
  }

  public approveOperator(): void {
    this.operatorApproved = true;
    this.pushLog({
      kind: 'tx',
      title: 'Operator Approved',
      detail: 'DodSnakeArena set as ERC-7984 operator.',
    });
  }

  public createMatch(boardMode: 0 | 1, stakeWholeTokens: number, maxPlayers = 1): bigint {
    this.matchCounter += 1n;
    this.stateVersion += 1;
    this.boardSize = boardMode === 1 ? 30 : 100;
    this.maxPlayers = Math.max(1, Math.min(4, maxPlayers));
    this.turnIndex = 0;
    this.status = 1;
    this.turnNumber = 1;
    this.payoutClaimed = false;
    this.winnerAddr = ZERO_ADDR;
    this.pendingOnlineDuel = null;

    const wantMicro = BigInt(Math.max(0, Math.round(stakeWholeTokens * 1e6)));
    this.stakeMicro = wantMicro <= this.chipBalanceMicro ? wantMicro : 0n;
    this.chipBalanceMicro -= this.stakeMicro;

    const hostSeat: ArenaSimSeat = {
      address: this.playerAddress,
      name: this.playerName,
      isBot: false,
      position: 1,
      stars: 2,
      laddersClimbed: 0,
      snakesDodged: 0,
      duelWins: 0,
      trapsPlanted: 0,
      missionClaimed: false,
      secretMissionId: Math.floor(Math.random() * 4),
      secretShields: 1,
      secretTrapCharges: 2,
      missionUnlocked: false,
      brakeActive: false,
    };

    const botSeats: ArenaSimSeat[] = Array.from({ length: Math.max(0, this.maxPlayers - 1) }, (_, idx) => ({
      address: BOT_ADDRESSES[idx % BOT_ADDRESSES.length],
      name: BOT_NAMES[idx % BOT_NAMES.length],
      isBot: true,
      position: 1,
      stars: 2,
      laddersClimbed: 0,
      snakesDodged: 0,
      duelWins: 0,
      trapsPlanted: 0,
      missionClaimed: false,
      secretMissionId: (idx + 1) % 4,
      secretShields: 1,
      secretTrapCharges: 2,
      missionUnlocked: false,
      brakeActive: false,
    }));

    this.seats = [hostSeat, ...botSeats];

    // 2 hidden encrypted FHE House Traps (solo) + 1 hidden Golden Warp shortcut (+3 steps +1★)
    // Placed on mid-board non-junction tiles (>= 10) so opening dice rolls move strictly by dieValue
    const laddersMap = this.boardSize === 30 ? SPRINT_LADDERS : CLASSIC_LADDERS;
    const snakesMap = this.boardSize === 30 ? SPRINT_SNAKES : CLASSIC_SNAKES;
    const junctions = new Set<number>([
      ...Object.keys(laddersMap).map(Number),
      ...Object.values(laddersMap),
      ...Object.keys(snakesMap).map(Number),
      ...Object.values(snakesMap),
    ]);
    const safePool: number[] = [];
    for (let t = 10; t <= this.boardSize - 4; t++) {
      if (!junctions.has(t)) {
        safePool.push(t);
      }
    }
    const pickSafe = (fallback: number): number => {
      if (safePool.length === 0) return fallback;
      const idx = Math.floor(Math.random() * safePool.length);
      return safePool.splice(idx, 1)[0] ?? fallback;
    };
    const h1 = pickSafe(11);
    const h2 = pickSafe(16);
    const w1 = pickSafe(22);

    this.allTraps =
      botSeats.length === 0
        ? [
            { owner: ZERO_ADDR, tile: h1, kind: 1 + Math.floor(Math.random() * 3), active: true, handle: fakeHandle('htr1') },
            { owner: ZERO_ADDR, tile: h2, kind: 1 + Math.floor(Math.random() * 3), active: true, handle: fakeHandle('htr2') },
            { owner: ZERO_ADDR, tile: w1, kind: 4, active: true, handle: fakeHandle('warp') },
          ]
        : [{ owner: ZERO_ADDR, tile: w1, kind: 4, active: true, handle: fakeHandle('warp') }];

    this.pushLog({
      kind: 'encrypt',
      title: `Match #${this.matchCounter} Created (${this.maxPlayers}P)`,
      detail: `${this.boardSize} tiles • Secret Mission & Hidden Golden Warp initialized`,
      handle: fakeHandle('m001'),
    });
    return this.matchCounter;
  }

  /**
   * Claims a seat for an online human player joining via Room Code / Invite Link.
   * Upgrades an existing bot seat to a real human player (or adds a seat up to 4 players).
   */
  public joinOnlineHumanSeat(guestAddr: `0x${string}`, guestName = 'Online Peer'): boolean {
    if (this.matchCounter === 0n) {
      this.createMatch(1, 0, 2);
    }
    const existing = this.seats.find((s) => s.address.toLowerCase() === guestAddr.toLowerCase());
    if (existing) {
      existing.isBot = false;
      if (guestName.trim()) existing.name = guestName.trim().slice(0, 18);
      return false;
    }

    const cleanName = guestName.trim() ? guestName.trim().slice(0, 18) : `Peer-${guestAddr.slice(2, 6)}`;
    const botSeat = this.seats.find((s) => s.isBot);
    if (botSeat) {
      botSeat.address = guestAddr;
      botSeat.name = cleanName;
      botSeat.isBot = false;
      botSeat.secretMissionId = Math.floor(Math.random() * 4);
      botSeat.secretShields = 1;
      botSeat.secretTrapCharges = 2;
      botSeat.missionUnlocked = false;
    } else if (this.seats.length < 4) {
      this.seats.push({
        address: guestAddr,
        name: cleanName,
        isBot: false,
        position: 1,
        stars: 2,
        laddersClimbed: 0,
        snakesDodged: 0,
        duelWins: 0,
        trapsPlanted: 0,
        missionClaimed: false,
        secretMissionId: Math.floor(Math.random() * 4),
        secretShields: 1,
        secretTrapCharges: 2,
        missionUnlocked: false,
        brakeActive: false,
      });
      this.maxPlayers = Math.max(this.maxPlayers, this.seats.length);
    } else {
      return false;
    }

    // Remove solo-only house traps when transitioning from 1P to multiplayer
    this.allTraps = this.allTraps.filter((t) => !(t.owner === ZERO_ADDR && t.kind !== 4));
    this.stateVersion += 1;
    this.pushLog({
      kind: 'info',
      title: `Online Player Joined: ${cleanName}`,
      detail: `${guestAddr.slice(0, 6)}...${guestAddr.slice(-4)} assigned encrypted Secret Mission & Vault.`,
      handle: fakeHandle('join'),
    });
    return true;
  }

  /**
   * Exports the public room state for relay peers. Every human seat's confidential vault
   * (mission id, shields, trap charges, brake curse) is redacted: each browser only ever
   * holds the clear values of its OWN seat.
   */
  public exportRoomState(): ArenaOnlineRoomState {
    return {
      version: this.stateVersion,
      matchId: this.matchCounter.toString(),
      boardSize: this.boardSize,
      maxPlayers: this.maxPlayers,
      turnIndex: this.turnIndex,
      status: this.status,
      turnNumber: this.turnNumber,
      stakeMicro: this.stakeMicro.toString(),
      winnerAddr: this.winnerAddr,
      payoutClaimed: this.payoutClaimed,
      seats: this.seats.map((s) =>
        s.isBot
          ? { ...s }
          : {
              ...s,
              secretMissionId: -1,
              secretShields: 0,
              secretTrapCharges: 0,
              missionUnlocked: false,
              brakeActive: false,
            },
      ),
      allTraps: this.allTraps.map((t) => ({ ...t })),
      pendingOnlineDuel: this.pendingOnlineDuel ? { ...this.pendingOnlineDuel } : null,
    };
  }

  public importRoomState(state: ArenaOnlineRoomState, logEntry?: Omit<FheProofLogEntry, 'id' | 'ts'>): void {
    const myLow = this.playerAddress.toLowerCase();
    const localMine = this.seats.find((s) => s.address.toLowerCase() === myLow);

    this.stateVersion = Math.max(this.stateVersion + 1, state.version);
    this.matchCounter = BigInt(state.matchId || '1');
    this.boardSize = state.boardSize;
    this.maxPlayers = state.maxPlayers;
    this.turnIndex = state.turnIndex;
    this.status = state.status;
    this.turnNumber = state.turnNumber;
    this.stakeMicro = BigInt(state.stakeMicro || '0');
    this.winnerAddr = state.winnerAddr;
    this.payoutClaimed = state.payoutClaimed;
    this.seats = state.seats.map((s) => {
      if (s.isBot || s.address.toLowerCase() !== myLow) return { ...s };
      // My own seat: public fields from the room, confidential vault stays strictly local.
      return {
        ...s,
        secretMissionId: localMine ? localMine.secretMissionId : Math.floor(Math.random() * 4),
        secretShields: localMine ? localMine.secretShields : 1,
        secretTrapCharges: localMine ? localMine.secretTrapCharges : 2,
        missionUnlocked: localMine ? localMine.missionUnlocked : false,
        brakeActive: localMine ? localMine.brakeActive : false,
      };
    });
    this.allTraps = state.allTraps.map((t) => ({ ...t }));
    this.pendingOnlineDuel = state.pendingOnlineDuel ? { ...state.pendingOnlineDuel } : null;
    if (!this.pendingOnlineDuel || this.pendingOnlineDuel.challenger.toLowerCase() !== myLow) {
      this.myDuelChoice = null;
    }

    if (logEntry) {
      this.pushLog(logEntry);
    }
  }

  /** Called on the cursed player's browser when a rival casts a Secret Rival Brake at them. */
  public applyIncomingBrake(): void {
    const me = this.seats.find((s) => s.address.toLowerCase() === this.playerAddress.toLowerCase());
    if (!me) return;
    me.brakeActive = true;
    this.stateVersion += 1;
    this.pushLog({
      kind: 'encrypt',
      title: 'A Secret Brake curse was cast on you',
      detail: 'Your next dice roll will be capped to 1..3 (caster hidden).',
      handle: fakeHandle('brk2'),
    });
  }

  public decryptSecrets(): void {
    const me = this.getMySeat();
    me.missionUnlocked = true;
    this.stateVersion += 1;
    this.pushLog({
      kind: 'user_decrypt',
      title: 'Secret Vault Unlocked (EIP-712)',
      detail: `Mission #${me.secretMissionId} • Shields ${me.secretShields} • Trap Charges ${me.secretTrapCharges}`,
      handle: fakeHandle('sec1'),
    });
  }

  public plantTrap(tileId: number, kind: number): { handle: `0x${string}`; tile: number; kind: number } {
    const me = this.getMySeat();
    if (me.secretTrapCharges <= 0 || me.trapsPlanted >= 3) {
      throw new Error('No trap charges left (buy Mystery Item for more, max 3 traps).');
    }
    const clampedTile = Math.max(2, Math.min(this.boardSize - 1, tileId));
    const clampedKind = Math.max(1, Math.min(3, kind));
    const handle = fakeHandle('trap');
    me.secretTrapCharges -= 1;
    me.trapsPlanted += 1;
    this.allTraps.push({
      owner: me.address,
      tile: clampedTile,
      kind: clampedKind,
      active: true,
      handle,
    });
    this.stateVersion += 1;
    this.pushLog({
      kind: 'encrypt',
      title: `Secret Trap Planted on Tile #${clampedTile}`,
      detail: 'Encrypted euint8 tile & trap type stored (invisible to rivals).',
      handle,
    });
    return { handle, tile: clampedTile, kind: clampedKind };
  }

  public buyMysteryItem(): void {
    const me = this.getMySeat();
    if (me.stars < 2) throw new Error('Need at least 2 ★.');
    me.stars -= 2;
    const roll = Math.floor(Math.random() * 4);
    if (roll === 0) me.secretShields += 1;
    else if (roll === 1) me.secretTrapCharges += 1;
    else if (roll === 2) me.secretShields += 2;
    else {
      me.secretShields += 1;
      me.secretTrapCharges += 1;
    }
    this.stateVersion += 1;
    this.pushLog({
      kind: 'encrypt',
      title: 'Encrypted Mystery Item Rolled',
      detail: `Vault updated privately (Shields: ${me.secretShields}, Traps: ${me.secretTrapCharges})`,
      handle: fakeHandle('item'),
    });
  }

  public castSecretBrake(seatIndex = 0): { handle: `0x${string}`; targetAddr: `0x${string}`; targetIsBot: boolean } {
    const me = this.getMySeat();
    if (me.stars < 2) throw new Error('Need at least 2 ★.');
    me.stars -= 2;
    const handle = fakeHandle('brk1');
    const rivals = this.seats.filter((s) => s.address.toLowerCase() !== me.address.toLowerCase());
    if (rivals.length > 0) {
      const targetSeat =
        seatIndex >= 0 &&
        this.seats[seatIndex] &&
        this.seats[seatIndex].address.toLowerCase() !== me.address.toLowerCase()
          ? this.seats[seatIndex]
          : rivals.slice().sort((a, b) => b.position - a.position)[0];
      targetSeat.brakeActive = true;
      this.stateVersion += 1;
      this.pushLog({
        kind: 'encrypt',
        title: 'Secret Rival Brake Cast (euint8 seat)',
        detail: `Encrypted target ${targetSeat.name} cursed to roll <= 3 next turn.`,
        handle,
      });
      return { handle, targetAddr: targetSeat.address, targetIsBot: targetSeat.isBot };
    }
    me.brakeActive = true;
    this.stateVersion += 1;
    this.pushLog({
      kind: 'encrypt',
      title: 'Secret Brake Demo Active (ebool)',
      detail: 'Next dice roll is secretly capped at 1..3.',
      handle,
    });
    return { handle, targetAddr: me.address, targetIsBot: false };
  }

  private resolveTurnForSeat(seatIdx: number): TurnRollResult {
    const actor = this.seats[seatIdx] ?? this.getMySeat();
    const fromPos = actor.position;
    const usedBrake = actor.brakeActive;
    const rawDie = 1 + Math.floor(Math.random() * 6);
    const dieValue = usedBrake ? Math.min(3, rawDie) : rawDie;
    actor.brakeActive = false;

    const raw = fromPos + dieValue;
    const landedPos = raw <= this.boardSize ? raw : this.boardSize - (raw - this.boardSize);
    let finalPos = landedPos;

    let trapTriggered = 0;
    const isExactFinish = landedPos >= this.boardSize;
    if (!isExactFinish) {
      for (const t of this.allTraps) {
        const canTrigger =
          t.active &&
          t.tile === landedPos &&
          (t.owner === ZERO_ADDR || t.owner.toLowerCase() !== actor.address.toLowerCase());
        if (canTrigger) {
          t.active = false;
          trapTriggered = t.kind;
          if (t.kind === 1) finalPos = Math.max(1, finalPos - 2);
          else if (t.kind === 2) {
            actor.stars = Math.max(0, actor.stars - 1);
          } else if (t.kind === 3) {
            finalPos = Math.max(1, finalPos - 4);
          } else if (t.kind === 4) {
            finalPos = Math.min(this.boardSize - 1, finalPos + 3);
            actor.stars += 1;
          }
          break;
        }
      }
    }

    const ladders = this.boardSize === 30 ? SPRINT_LADDERS : CLASSIC_LADDERS;
    const snakes = this.boardSize === 30 ? SPRINT_SNAKES : CLASSIC_SNAKES;
    const ladderTo = trapTriggered === 0 ? (ladders[finalPos] ?? 0) : 0;
    const snakeTo = trapTriggered === 0 ? (snakes[finalPos] ?? 0) : 0;
    let shieldBlocked = false;

    if (ladderTo > 0) {
      finalPos = ladderTo;
      actor.laddersClimbed += 1;
      actor.stars += 2;
    } else if (snakeTo > 0) {
      if (actor.secretShields > 0) {
        actor.secretShields -= 1;
        actor.snakesDodged += 1;
        actor.stars += 1;
        shieldBlocked = true;
      } else {
        finalPos = snakeTo;
      }
    } else if (trapTriggered === 0) {
      actor.stars += 1;
    }

    actor.position = finalPos;

    if (finalPos >= this.boardSize) {
      this.status = 2;
      this.winnerAddr = actor.address;
    } else {
      const totalSeats = Math.max(1, this.seats.length);
      this.turnIndex = (this.turnIndex + 1) % totalSeats;
      this.turnNumber += 1;
    }
    this.stateVersion += 1;

    return {
      actorAddr: actor.address,
      actorName: actor.name,
      seatIndex: seatIdx,
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

  public rollDice(): TurnRollResult {
    const totalSeats = Math.max(1, this.seats.length);
    const activeIdx = this.turnIndex % totalSeats;
    const activeSeat = this.seats[activeIdx];
    if (
      this.status !== 1 ||
      !activeSeat ||
      activeSeat.address.toLowerCase() !== this.playerAddress.toLowerCase()
    ) {
      throw new Error('Wait for your turn.');
    }
    const res = this.resolveTurnForSeat(activeIdx);
    const stepText =
      res.landedPos === res.finalPos
        ? `Tile ${res.fromPos} + ${res.dieValue} = Tile ${res.finalPos}`
        : `Tile ${res.fromPos} + ${res.dieValue} → Tile ${res.landedPos} → Tile ${res.finalPos}`;
    this.pushLog({
      kind: 'public_decrypt',
      title: `Dice +${res.dieValue} (${stepText})`,
      detail:
        res.trapTriggered === 4
          ? 'Hidden Golden Warp discovered (+3 steps +1★)!'
          : res.trapTriggered > 0
            ? `Secret Trap #${res.trapTriggered} triggered on Tile #${res.landedPos}!`
            : res.ladderTo > 0
              ? `Climbed ladder ${res.landedPos} → ${res.ladderTo} (+2★)`
              : res.shieldBlocked
                ? 'Confidential Shield blocked Snake!'
                : res.snakeTo > 0
                  ? `Snake bite ${res.landedPos} → ${res.snakeTo}`
                  : 'KMS proof verified; untriggered traps stayed hidden.',
      handle: fakeHandle('dice'),
    });
    return res;
  }

  public stepBotTurn(): (TurnRollResult & { botNumber: number }) | null {
    const totalSeats = Math.max(1, this.seats.length);
    const activeIdx = this.turnIndex % totalSeats;
    const activeSeat = this.seats[activeIdx];
    if (this.status !== 1 || !activeSeat || !activeSeat.isBot) return null;

    const res = this.resolveTurnForSeat(activeIdx);
    const stepText =
      res.landedPos === res.finalPos
        ? `Tile ${res.fromPos} + ${res.dieValue} = Tile ${res.finalPos}`
        : `Tile ${res.fromPos} + ${res.dieValue} → Tile ${res.landedPos} → Tile ${res.finalPos}`;
    this.pushLog({
      kind: 'public_decrypt',
      title: `${res.actorName} Rolled +${res.dieValue} (${stepText})`,
      detail:
        res.trapTriggered === 4
          ? `${res.actorName} hit Golden Warp!`
          : res.trapTriggered > 0
            ? `${res.actorName} stepped on Secret Trap #${res.trapTriggered}!`
            : res.ladderTo > 0
              ? `${res.actorName} climbed ladder ${res.landedPos} → ${res.ladderTo}`
              : res.shieldBlocked
                ? `${res.actorName} Shield blocked Snake!`
                : `${res.actorName} resolved FHE turn.`,
      handle: fakeHandle('bot0'),
    });
    return { botNumber: activeIdx + 1, ...res };
  }

  private static beats(a: 0 | 1 | 2, b: 0 | 1 | 2): boolean {
    return (a === 0 && b === 2) || (a === 1 && b === 0) || (a === 2 && b === 1);
  }

  /**
   * Blind RPS duel.
   * - Solo / vs-bots room: resolved immediately against the encrypted FHE house move.
   * - Online room with 2+ humans: the move is committed as a ciphertext handle and posted as a live
   *   challenge. The clear move stays in THIS browser until a rival answers (commit-reveal).
   */
  public playBlindDuel(choice: 0 | 1 | 2): {
    outcome: 0 | 1 | 2;
    houseChoice: number;
    kind: 'house' | 'posted' | 'responded';
    challengerName?: string;
    challenger?: `0x${string}`;
    handle?: `0x${string}`;
  } {
    const me = this.getMySeat();
    const myLow = me.address.toLowerCase();
    const names = ['Rock', 'Paper', 'Scissors'] as const;

    // 1) Responding to a rival's live challenge: send encrypted answer, challenger resolves.
    if (this.pendingOnlineDuel && this.pendingOnlineDuel.challenger.toLowerCase() !== myLow) {
      const ch = this.pendingOnlineDuel;
      this.pushLog({
        kind: 'encrypt',
        title: `Encrypted answer sent to ${ch.challengerName}`,
        detail: `Your ${names[choice]} stays hidden until the homomorphic reveal.`,
        handle: fakeHandle('ans0'),
      });
      return {
        outcome: 0,
        houseChoice: -1,
        kind: 'responded',
        challengerName: ch.challengerName,
        challenger: ch.challenger,
        handle: ch.handle,
      };
    }

    // 2) Online room: post challenge, keep clear move local.
    if (this.getHumanSeatCount() > 1) {
      if (this.pendingOnlineDuel) {
        throw new Error('Your Blind Duel challenge is still waiting for a rival answer.');
      }
      const handle = fakeHandle('duel');
      this.myDuelChoice = choice;
      this.pendingOnlineDuel = { challenger: me.address, challengerName: me.name, handle };
      this.stateVersion += 1;
      this.pushLog({
        kind: 'encrypt',
        title: 'Blind Duel challenge posted (encrypted move)',
        detail: 'Any online rival can answer. Your clear move never leaves your browser.',
        handle,
      });
      return { outcome: 0, houseChoice: -1, kind: 'posted', handle };
    }

    // 3) Solo vs FHE house.
    const houseChoice = Math.floor(Math.random() * 3);
    let outcome: 0 | 1 | 2 = 0;
    if (choice === houseChoice) {
      outcome = 0;
      me.stars += 1;
    } else if (ArenaPreviewSimulator.beats(choice, houseChoice as 0 | 1 | 2)) {
      outcome = 1;
      me.stars += 2;
      me.duelWins += 1;
    } else {
      outcome = 2;
      if (me.stars > 0) me.stars -= 1;
    }
    this.stateVersion += 1;
    this.pushLog({
      kind: 'public_decrypt',
      title: `Blind Duel: ${outcome === 1 ? 'You Won +2 ★' : outcome === 0 ? 'Tie +1 ★' : 'House Won (-1 ★)'}`,
      detail: 'Both encrypted RPS moves evaluated homomorphically.',
      handle: fakeHandle('duel'),
    });
    return { outcome, houseChoice, kind: 'house' };
  }

  /**
   * Runs on the CHALLENGER's browser when a rival's encrypted answer arrives.
   * Applies the result to both seats and clears the pending challenge.
   */
  public resolveOnlineDuelAsChallenger(
    responderAddr: `0x${string}`,
    responderChoice: 0 | 1 | 2,
  ): { outcome: 0 | 1 | 2; responderName: string; myChoice: 0 | 1 | 2 } | null {
    const me = this.getMySeat();
    if (
      !this.pendingOnlineDuel ||
      this.pendingOnlineDuel.challenger.toLowerCase() !== me.address.toLowerCase() ||
      this.myDuelChoice === null
    ) {
      return null;
    }
    const responder = this.seats.find((s) => s.address.toLowerCase() === responderAddr.toLowerCase());
    if (!responder) return null;
    const myChoice = this.myDuelChoice;
    let outcome: 0 | 1 | 2 = 0;
    if (myChoice === responderChoice) {
      outcome = 0;
      me.stars += 1;
      responder.stars += 1;
    } else if (ArenaPreviewSimulator.beats(myChoice, responderChoice)) {
      outcome = 1;
      me.stars += 2;
      me.duelWins += 1;
      responder.stars = Math.max(0, responder.stars - 1);
    } else {
      outcome = 2;
      me.stars = Math.max(0, me.stars - 1);
      responder.stars += 2;
      responder.duelWins += 1;
    }
    this.pendingOnlineDuel = null;
    this.myDuelChoice = null;
    this.stateVersion += 1;
    const names = ['Rock', 'Paper', 'Scissors'] as const;
    this.pushLog({
      kind: 'public_decrypt',
      title: `PvP Blind Duel vs ${responder.name}: ${outcome === 1 ? 'You Won +2 ★' : outcome === 0 ? 'Tie +1 ★' : `${responder.name} Won +2 ★`}`,
      detail: `Homomorphic reveal: your ${names[myChoice]} vs ${responder.name}'s ${names[responderChoice]}.`,
      handle: fakeHandle('pvp0'),
    });
    return { outcome, responderName: responder.name, myChoice };
  }

  public verifySecretMission(): boolean {
    const me = this.getMySeat();
    if (me.missionClaimed) return true;
    const conds = [
      me.laddersClimbed >= 1,
      me.snakesDodged >= 1 || me.position >= Math.floor(this.boardSize / 2),
      me.duelWins >= 1,
      me.trapsPlanted >= 1 && me.stars >= 4,
    ];
    const passed = conds[me.secretMissionId] ?? false;
    if (passed) {
      me.missionClaimed = true;
      me.stars += 3;
      me.secretShields += 1;
    }
    this.stateVersion += 1;
    this.pushLog({
      kind: 'public_decrypt',
      title: passed ? 'Secret Mission Verified (+3 ★ +1 Shield)!' : 'Mission Criteria Not Yet Met',
      detail: 'Evaluated without exposing secret mission ID.',
      handle: fakeHandle('miss'),
    });
    return passed;
  }

  public claimPayout(): void {
    if (this.status !== 2 || this.payoutClaimed) return;
    this.payoutClaimed = true;
    const pot = this.stakeMicro * BigInt(Math.max(1, this.seats.length));
    if (this.winnerAddr.toLowerCase() === this.playerAddress.toLowerCase()) {
      this.chipBalanceMicro += pot;
    }
    this.stateVersion += 1;
    this.pushLog({
      kind: 'tx',
      title: 'Confidential Pot Paid Out!',
      detail: `${(Number(pot) / 1e6).toFixed(2)} cDOD settled confidentially.`,
      handle: fakeHandle('pay0'),
    });
  }

  public getSnapshot(): OnchainMatchSnapshot {
    const totalSeats = Math.max(1, this.seats.length);
    const me = this.seats.find((s) => s.address.toLowerCase() === this.playerAddress.toLowerCase());
    const hostAddr = this.seats[0]?.address ?? this.playerAddress;
    return {
      matchId: this.matchCounter,
      host: hostAddr,
      stakeToken: this.stakeMicro > 0n ? hostAddr : ZERO_ADDR,
      boardSize: this.boardSize,
      maxPlayers: this.maxPlayers,
      playerCount: totalSeats,
      turnIndex: this.turnIndex % totalSeats,
      turnNumber: this.turnNumber,
      status: this.status,
      pendingAction: 0,
      winner: this.winnerAddr,
      payoutClaimed: this.payoutClaimed,
      trapCount: this.allTraps.filter((t) => t.active).length,
      players: this.seats.map((s) => ({
        address: s.address,
        position: s.position,
        stars: s.stars,
        laddersClimbed: s.laddersClimbed,
        snakesDodged: s.snakesDodged,
        duelWins: s.duelWins,
        trapsPlanted: s.trapsPlanted,
        missionClaimed: s.missionClaimed,
      })),
      mySecret:
        this.matchCounter > 0n && me
          ? {
              missionHandle: fakeHandle('mis0'),
              shieldsHandle: fakeHandle('shd0'),
              trapChargesHandle: fakeHandle('trp0'),
              stakeHandle: fakeHandle('stk0'),
              missionId: me.missionUnlocked ? me.secretMissionId : undefined,
              shields: me.missionUnlocked ? me.secretShields : undefined,
              trapCharges: me.missionUnlocked ? me.secretTrapCharges : undefined,
              stakeMicro: me.missionUnlocked ? this.stakeMicro : undefined,
            }
          : undefined,
      myPlantedTrapTiles: this.allTraps
        .filter((t) => t.active && t.owner.toLowerCase() === this.playerAddress.toLowerCase())
        .map((t) => t.tile),
    };
  }
}
