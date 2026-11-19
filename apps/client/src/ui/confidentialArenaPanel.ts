import type {
  GameEvent,
  GameState,
  PawnId,
  Player,
  PlayerColorId,
  AccessoryId,
} from '@doodle-dash/shared';
import { BOARD_LAYOUT } from '@doodle-dash/shared';
import type { DoodleSceneManager } from '../scene/sceneManager.js';
import type { DoodleSoundEngine } from '../audio/soundEngine.js';
import type { AppLanguage } from '../i18n/translations.js';
import {
  FheArenaClient,
  resolveConfiguredAddresses,
  saveCustomAddresses,
  type FheProofLogEntry,
  type OnchainMatchSnapshot,
} from '../web3/fheClient.js';
import { ArenaPreviewSimulator } from '../web3/arenaSimulation.js';
import {
  GOLDEN_WARP_KIND,
  PROTOCOL_DISCLAIMER,
  PROTOCOL_SEPOLIA_ADDRESSES,
  SECRET_MISSION_DESCRIPTIONS,
  SEPOLIA_FAUCETS,
  TESTNET_DIRECTORY,
  TRAP_KIND_META,
} from '../web3/faucets.js';
import { renderUiIconSvg } from '../challenges/doodleIcons.js';

function esc(text: string): string {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export interface ArenaPlayerDraft {
  name: string;
  pawn: PawnId;
  color: PlayerColorId;
  accessory: AccessoryId;
}

export class ConfidentialArenaPanel {
  private readonly scene: DoodleSceneManager;
  private readonly sound: DoodleSoundEngine;
  private readonly onRequestRender: () => void;
  private readonly onToast: (msg: string) => void;
  private readonly onBackToMenu: () => void;

  private readonly fheClient = new FheArenaClient();
  private readonly sim = new ArenaPreviewSimulator();

  private mode: 'preview' | 'sepolia' = 'preview';
  private stakeTokenKind: 'cdod' | 'cusdt' = 'cdod';
  private walletInfo: { address: string; chainId: number; ethBalance: string } | null = null;
  private chipHandle = '0x0000...';
  private chipClearMicro: bigint | null = null;
  private isOperator = false;
  private activeMatchId: bigint | null = null;
  private snapshot: OnchainMatchSnapshot | null = null;

  private boardMode: 0 | 1 = 1; // 1 = Sprint 30 (default fast), 0 = Classic 100
  private maxPlayers = 1;
  private stakeTokens = 10;
  private joinMatchInput = '';
  private trapTileInput = 12;
  private trapKindInput = 1;
  private brakeSeatInput = 0;
  private showVaultDrawer = true;
  private showProofDrawer = true;
  private showContractConfig = false;
  private showBlindDuelModal = false;
  private showPrivacyModal = false;
  private showFaucetsModal = false;
  private isAnimatingRoll = false;
  private busyLabel: string | null = null;
  private customChipInput = '';
  private customArenaInput = '';
  private duelOpponentInput = '0x0000000000000000000000000000000000000000';
  private pollTimerId: number | null = null;
  private pollInFlight = false;
  private pollEn = true;
  private pollDraft: ArenaPlayerDraft | null = null;

  constructor(opts: {
    scene: DoodleSceneManager;
    sound: DoodleSoundEngine;
    onRequestRender: () => void;
    onToast: (msg: string) => void;
    onBackToMenu: () => void;
  }) {
    this.scene = opts.scene;
    this.sound = opts.sound;
    this.onRequestRender = opts.onRequestRender;
    this.onToast = opts.onToast;
    this.onBackToMenu = opts.onBackToMenu;

    const addrs = resolveConfiguredAddresses();
    this.customChipInput = addrs.chipAddress;
    this.customArenaInput = addrs.arenaAddress;

    this.fheClient.setLogListener(() => {
      this.onRequestRender();
    });
  }

  public setInitialMatchInvite(matchId: string): void {
    this.mode = 'sepolia';
    this.joinMatchInput = matchId;
  }

  public stopPolling(): void {
    if (this.pollTimerId !== null) {
      clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    this.pollInFlight = false;
    this.scene.setTileClickCallback(undefined);
  }

  private bindBoardTilePicker(en: boolean, root: HTMLElement): void {
    if (!this.snapshot || this.snapshot.status !== 1) {
      this.scene.setTileClickCallback(undefined);
      return;
    }
    this.scene.setTileClickCallback((tileId: number) => {
      if (!this.snapshot || this.snapshot.status !== 1 || this.isAnimatingRoll || this.busyLabel) {
        return;
      }
      if (tileId < 2 || tileId >= this.snapshot.boardSize) {
        this.onToast(
          en
            ? `Pick tiles 2–${this.snapshot.boardSize - 1} for Secret Traps.`
            : `Pilih kotak 2–${this.snapshot.boardSize - 1} untuk Jebakan Rahasia.`,
        );
        return;
      }
      this.trapTileInput = tileId;
      const inp = root.querySelector<HTMLInputElement>('#inp-trap-tile');
      if (inp) inp.value = String(tileId);
      this.scene.setArenaOverlayMarkers(
        this.snapshot.myPlantedTrapTiles,
        this.snapshot.boardSize,
        this.trapTileInput,
      );
      this.sound.playUiClick();
      this.onToast(en ? `🎯 Trap Target: Tile #${tileId}` : `🎯 Target Jebakan: Kotak #${tileId}`);
    });
  }

  private ensureSepoliaPoller(en: boolean, draft: ArenaPlayerDraft): void {
    this.pollEn = en;
    this.pollDraft = draft;
    const activeNeedsPoll = Boolean(
      this.mode === 'sepolia' &&
        this.activeMatchId &&
        this.snapshot &&
        this.snapshot.status < 2,
    );
    if (!activeNeedsPoll) {
      this.stopPolling();
      return;
    }
    if (this.pollTimerId !== null) return;

    this.pollTimerId = window.setInterval(() => {
      void this.pollSepoliaState();
    }, 4500);
  }

  private async pollSepoliaState(): Promise<void> {
    if (
      this.mode !== 'sepolia' ||
      !this.activeMatchId ||
      !this.snapshot ||
      this.snapshot.status >= 2 ||
      this.busyLabel ||
      this.isAnimatingRoll ||
      this.pollInFlight
    ) {
      return;
    }
    const myAddr = this.walletInfo?.address?.toLowerCase() || '';
    const prevTurnAddr = this.snapshot.players[this.snapshot.turnIndex]?.address?.toLowerCase() || '';
    const prevWasMyTurn = this.snapshot.status === 1 && prevTurnAddr === myAddr;
    const prevStatus = this.snapshot.status;
    const prevCount = this.snapshot.playerCount;
    const prevDuel = Boolean(this.snapshot.duel?.active);

    // Pause polling when waiting for caller's own normal turn action unless duel waiting
    if (this.snapshot.status === 1 && prevWasMyTurn && !prevDuel && this.snapshot.pendingAction === 0) {
      return;
    }

    this.pollInFlight = true;
    try {
      const next = await this.fheClient.fetchMatchSnapshot(this.activeMatchId, false);
      const changed =
        next.status !== prevStatus ||
        next.playerCount !== prevCount ||
        next.turnNumber !== this.snapshot.turnNumber ||
        next.turnIndex !== this.snapshot.turnIndex ||
        next.pendingAction !== this.snapshot.pendingAction ||
        Boolean(next.duel?.active) !== prevDuel;

      if (!changed) return;
      this.snapshot = next;
      if (this.pollDraft) {
        this.syncSceneWithArena(this.pollDraft);
      }

      const nextTurnAddr = next.players[next.turnIndex]?.address?.toLowerCase() || '';
      if (prevStatus === 0 && next.status === 1) {
        this.sound.playTurnReady();
        this.onToast(this.pollEn ? '🎮 Multiplayer Match started!' : '🎮 Laga Multiplayer dimulai!');
      } else if (!prevWasMyTurn && next.status === 1 && nextTurnAddr === myAddr) {
        this.sound.playTurnReady();
        this.onToast(this.pollEn ? '🎲 Your turn on Sepolia!' : '🎲 Giliranmu di Sepolia!');
      } else if (!prevDuel && next.duel?.active && next.duel.opponent.toLowerCase() === myAddr) {
        this.sound.playTurnReady();
        this.onToast(this.pollEn ? '⚔️ You were challenged to a Blind Duel!' : '⚔️ Kamu ditantang Duel Buta!');
      }
      this.onRequestRender();
    } catch {
      // Ignore transient RPC polling blips
    } finally {
      this.pollInFlight = false;
    }
  }

  public isFaucetsModalOpen(): boolean {
    return this.showFaucetsModal;
  }

  public openFaucetsModal(): void {
    this.showFaucetsModal = true;
    this.onRequestRender();
  }

  public closeFaucetsModal(): void {
    this.showFaucetsModal = false;
    this.onRequestRender();
  }

  public hasActiveMatch(): boolean {
    return Boolean(this.snapshot && this.snapshot.status > 0);
  }

  private getSelectedTokenConfig(): {
    kind: 'cdod' | 'cusdt';
    symbol: 'cDOD' | 'cUSDT';
    address: `0x${string}` | '';
  } {
    if (this.stakeTokenKind === 'cusdt') {
      return {
        kind: 'cusdt',
        symbol: 'cUSDT',
        address: PROTOCOL_SEPOLIA_ADDRESSES.cUsdtWrapper as `0x${string}`,
      };
    }
    const addrs = resolveConfiguredAddresses(this.walletInfo?.chainId);
    return {
      kind: 'cdod',
      symbol: 'cDOD',
      address: addrs.chipAddress as `0x${string}` | '',
    };
  }

  private buildSceneGameState(snap: OnchainMatchSnapshot, draft: ArenaPlayerDraft): GameState {
    const pawns: PawnId[] = ['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur'];
    const colors: PlayerColorId[] = ['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu'];
    const myAddr = (this.mode === 'sepolia' ? this.walletInfo?.address : this.sim.getAddress()) || '';

    const players: Player[] = snap.players.map((p, idx) => {
      const isMe = p.address.toLowerCase() === myAddr.toLowerCase();
      return {
        id: p.address,
        name: isMe ? draft.name : `P${idx + 1} (${shortAddr(p.address)})`,
        pawn: isMe ? draft.pawn : pawns[(idx + 1) % pawns.length],
        color: isMe ? draft.color : colors[(idx + 1) % colors.length],
        accessory: isMe ? draft.accessory : 'none',
        position: Math.max(1, Math.min(100, p.position)),
        stars: p.stars,
        shields: isMe ? (snap.mySecret?.shields ?? 0) : 0,
        items: [],
        skipTurns: 0,
        consecutiveSixes: 0,
        consecutivePenalties: 0,
        challengeStreak: 0,
        extraRollsPending: 0,
        activeGoldenDice: false,
        activeBrake: false,
        activeTurbo: false,
        isBot: false,
        botDifficulty: 'pintar',
        connected: true,
        ready: true,
        stats: {
          rolls: 0,
          challengesWon: p.duelWins,
          challengesTotal: p.duelWins,
          laddersClimbed: p.laddersClimbed,
          snakesBitten: 0,
          snakesDodged: p.snakesDodged,
          itemsUsed: p.trapsPlanted,
        },
      };
    });

    return {
      matchSeed: Number(snap.matchId),
      rulePreset: 'klasik',
      board: BOARD_LAYOUT,
      players,
      turnOrder: players.map((p) => p.id),
      currentTurnIndex: snap.turnIndex % Math.max(1, players.length),
      phase: snap.status === 2 ? 'GAME_OVER' : 'TURN_BEGIN',
      turnNumber: snap.turnNumber,
      pendingRoll: null,
      activeChallenge: null,
      turnDeadlineAt: null,
      winnerId: snap.status === 2 ? snap.winner : null,
      podium: [],
      eventSeq: snap.turnNumber,
      stateVersion: snap.turnNumber,
    };
  }

  public syncSceneWithArena(draft: ArenaPlayerDraft): void {
    if (this.isAnimatingRoll) return;
    if (!this.snapshot || this.snapshot.status === 0) {
      this.scene.setShowcaseMode(true);
      this.scene.setArenaOverlayMarkers([], 0);
      return;
    }

    this.scene.setShowcaseMode(false);
    const fakeState = this.buildSceneGameState(this.snapshot, draft);
    this.scene.syncPlayersFromState(fakeState);
    this.scene.setArenaOverlayMarkers(
      this.snapshot.myPlantedTrapTiles,
      this.snapshot.boardSize,
      this.snapshot.status === 1 ? this.trapTileInput : 0,
    );
    const activePlayer = fakeState.players[fakeState.currentTurnIndex] ?? fakeState.players[0];
    if (activePlayer) {
      this.scene.focusTile(activePlayer.position);
    }
  }

  private async animateRollOutcome(
    snapAfter: OnchainMatchSnapshot,
    draft: ArenaPlayerDraft,
    moverAddr: string,
    roll: {
      dieValue: number;
      fromPos: number;
      landedPos: number;
      finalPos: number;
      trapTriggered: number;
      shieldBlocked: boolean;
      ladderTo: number;
      snakeTo: number;
      usedBrake?: boolean;
    },
  ): Promise<void> {
    this.isAnimatingRoll = true;
    try {
      this.scene.setShowcaseMode(false);
      const nextState = this.buildSceneGameState(snapAfter, draft);
      const baseSeq = Math.max(1, snapAfter.turnNumber * 10);
      const events: GameEvent[] = [];

      events.push({
        type: 'DiceRolled',
        seq: baseSeq + 1,
        playerId: moverAddr,
        diceValues: [roll.dieValue],
        needsChoice: false,
        usedGoldenDice: roll.trapTriggered === GOLDEN_WARP_KIND,
        usedBrake: Boolean(roll.usedBrake),
        usedTurbo: false,
      });

      const path: number[] = [];
      const maxTile = snapAfter.boardSize;
      const rawTarget = roll.fromPos + roll.dieValue;
      if (rawTarget <= maxTile) {
        for (let t = roll.fromPos + 1; t <= roll.landedPos; t++) path.push(t);
      } else {
        for (let t = roll.fromPos + 1; t <= maxTile; t++) path.push(t);
        for (let t = maxTile - 1; t >= roll.landedPos; t--) path.push(t);
      }
      if (path.length === 0) path.push(roll.landedPos);

      events.push({
        type: 'PawnMoved',
        seq: baseSeq + 2,
        playerId: moverAddr,
        from: roll.fromPos,
        to: roll.landedPos,
        path,
        bounced: rawTarget > maxTile,
        reason: 'dice',
      });

      let trapAdjustedPos = roll.landedPos;
      if (roll.trapTriggered === 1) {
        trapAdjustedPos = Math.max(1, roll.landedPos - 2);
      } else if (roll.trapTriggered === 3) {
        trapAdjustedPos = Math.max(1, roll.landedPos - 4);
      } else if (roll.trapTriggered === GOLDEN_WARP_KIND) {
        trapAdjustedPos = Math.min(maxTile - 1, roll.landedPos + 3);
      }
      if (trapAdjustedPos !== roll.landedPos) {
        events.push({
          type: 'PawnMoved',
          seq: baseSeq + 3,
          playerId: moverAddr,
          from: roll.landedPos,
          to: trapAdjustedPos,
          path: [trapAdjustedPos],
          bounced: false,
          reason: roll.trapTriggered === GOLDEN_WARP_KIND ? 'bonus_advance' : 'penalty_retreat',
        });
      }

      if (roll.ladderTo > 0) {
        events.push({
          type: 'LadderClimbed',
          seq: baseSeq + 4,
          playerId: moverAddr,
          ladderId: 'L1',
          from: trapAdjustedPos,
          to: roll.ladderTo,
        });
      } else if (roll.snakeTo > 0) {
        events.push({
          type: 'SnakeBitten',
          seq: baseSeq + 4,
          playerId: moverAddr,
          snakeId: 'S1',
          from: trapAdjustedPos,
          to: roll.shieldBlocked ? trapAdjustedPos : roll.snakeTo,
          blockedByShield: roll.shieldBlocked,
          dodgedByChallenge: false,
        });
      }

      if (snapAfter.status === 2) {
        nextState.podium = nextState.players
          .slice()
          .sort((a, b) => b.position - a.position || b.stars - a.stars)
          .map((p, idx) => ({
            rank: idx + 1,
            playerId: p.id,
            name: p.name,
            pawn: p.pawn,
            color: p.color,
            accessory: p.accessory,
            position: p.position,
            stars: p.stars,
            isWinner: p.id.toLowerCase() === snapAfter.winner.toLowerCase(),
          }));
        events.push({
          type: 'GameWon',
          seq: baseSeq + 5,
          winnerId: snapAfter.winner,
          podium: nextState.podium,
        });
      }

      await this.scene.enqueueEvents(events, nextState);
      this.scene.setArenaOverlayMarkers(
        snapAfter.myPlantedTrapTiles,
        snapAfter.boardSize,
        snapAfter.status === 1 ? this.trapTileInput : 0,
      );
    } finally {
      this.isAnimatingRoll = false;
    }
  }

  public renderScreenHtml(lang: AppLanguage, draft: ArenaPlayerDraft): string {
    const en = lang === 'en';
    const snap = this.mode === 'preview' ? this.sim.getSnapshot() : this.snapshot;
    if (this.mode === 'preview' && (!this.snapshot || this.snapshot.status !== snap?.status)) {
      this.snapshot = snap;
    }
    const simBal = this.sim.getBalanceInfo();
    const tokenCfg = this.getSelectedTokenConfig();
    const displayAddr =
      this.mode === 'sepolia'
        ? this.walletInfo
          ? shortAddr(this.walletInfo.address)
          : en
            ? 'Not Connected'
            : 'Belum Terhubung'
        : `${shortAddr(this.sim.getAddress())} (Preview)`;

    const cDodLabel =
      this.mode === 'preview'
        ? simBal.clearMicro !== null
          ? `${(Number(simBal.clearMicro) / 1e6).toFixed(1)} ${tokenCfg.symbol}`
          : `🔒 ${simBal.handle.slice(0, 10)}...`
        : this.chipClearMicro !== null
          ? `${(Number(this.chipClearMicro) / 1e6).toFixed(1)} ${tokenCfg.symbol}`
          : `🔒 ${this.chipHandle.slice(0, 10)}...`;

    const logs: FheProofLogEntry[] =
      this.mode === 'preview' ? this.sim.getLogs() : this.fheClient.getLogs();

    const isWaitingLobby = Boolean(
      this.mode === 'sepolia' && this.activeMatchId && snap && snap.status === 0,
    );
    const isMatchActive = Boolean(snap && snap.status > 0);
    const addrs = resolveConfiguredAddresses(this.walletInfo?.chainId);
    const hasSepoliaDeployed = Boolean(addrs.chipAddress && addrs.arenaAddress);
    this.ensureSepoliaPoller(en, draft);

    return `
      <div class="arena-shell">
        <div class="arena-topbar ui-interactive">
          <div class="arena-topbar-left">
            <button class="doodle-btn" id="btn-arena-back" style="min-height:36px;padding:4px 10px">
              ${renderUiIconSvg('back', 15)} <span>${en ? 'Menu' : 'Menu'}</span>
            </button>
            <div class="arena-mode-switch">
              <button class="doodle-btn ${this.mode === 'preview' ? 'doodle-btn-mint' : ''}" id="btn-mode-preview" style="min-height:34px;padding:3px 10px;font-size:0.82rem">
                ${en ? 'Instant FHE Preview' : 'Preview FHE Instan'}
              </button>
              <button class="doodle-btn ${this.mode === 'sepolia' ? 'doodle-btn-primary' : ''}" id="btn-mode-sepolia" style="min-height:34px;padding:3px 10px;font-size:0.82rem">
                Sepolia FHEVM
              </button>
            </div>
            <button class="doodle-btn doodle-btn-blue" id="btn-arena-faucets" style="min-height:34px;padding:3px 10px;font-size:0.82rem">
              🚰 ${en ? '12 Faucets & Testnet' : '12 Faucet & Testnet'}
            </button>
            <button class="doodle-btn" id="btn-arena-privacy-modal" style="min-height:34px;padding:3px 10px;font-size:0.82rem">
              🛡️ ${en ? 'Why FHE?' : 'Kenapa FHE?'}
            </button>
            ${
              isMatchActive
                ? `<button class="doodle-btn" id="btn-arena-cam-toggle" style="min-height:34px;padding:3px 10px;font-size:0.82rem" title="${en ? 'Toggle full-board overview vs follow camera' : 'Ganti kamera keseluruhan papan / ikuti bidak'}">
                     🎥 ${this.scene.getPreferredCameraMode() === 'overview' ? (en ? 'Follow' : 'Ikuti') : (en ? 'Overview' : 'Semua Kotak')}
                   </button>`
                : ''
            }
          </div>

          <div class="arena-topbar-right">
            <span class="arena-chip-pill" title="ERC-7984 Confidential Token Balance">${esc(cDodLabel)}</span>
            <button class="doodle-btn" id="btn-arena-decrypt-bal" style="min-height:34px;padding:3px 9px;font-size:0.8rem">
              🔓 ${en ? `Decrypt ${tokenCfg.symbol}` : `Dekripsi ${tokenCfg.symbol}`}
            </button>
            <button class="doodle-btn doodle-btn-mint" id="btn-arena-faucet-claim" style="min-height:34px;padding:3px 9px;font-size:0.8rem">
              +100 cDOD
            </button>
            ${
              this.mode === 'sepolia'
                ? `<button class="doodle-btn doodle-btn-primary" id="btn-arena-connect" style="min-height:34px;padding:3px 10px;font-size:0.82rem">
                     🦊 ${esc(displayAddr)}
                   </button>
                   <button class="doodle-btn" id="btn-arena-contracts" style="min-height:34px;padding:3px 8px;font-size:0.78rem">⚙️</button>`
                : `<span class="arena-addr-badge">${esc(displayAddr)}</span>`
            }
          </div>
        </div>

        ${
          this.busyLabel
            ? `<div class="arena-busy-pill ui-interactive">⏳ ${esc(this.busyLabel)}</div>`
            : ''
        }

        ${
          this.showContractConfig
            ? this.renderContractConfigDrawer(en, hasSepoliaDeployed)
            : ''
        }

        ${
          isWaitingLobby
            ? this.renderWaitingRoomLobby(en, snap!)
            : !isMatchActive
              ? this.renderOnboardingLobby(en, draft, hasSepoliaDeployed)
              : this.renderActiveArenaHud(en, snap!, logs)
        }

        ${this.showBlindDuelModal && isMatchActive ? this.renderBlindDuelModal(en, snap!) : ''}
        ${this.showPrivacyModal ? this.renderPrivacyMatrixModal(en) : ''}

        <div class="arena-disclaimer-bar ui-interactive">
          <span>⚠️ ${esc(PROTOCOL_DISCLAIMER)}</span>
        </div>
      </div>
    `;
  }

  private renderWaitingRoomLobby(en: boolean, snap: OnchainMatchSnapshot): string {
    const myAddr = this.walletInfo?.address?.toLowerCase() || '';
    const isHost = snap.host.toLowerCase() === myAddr;
    const isFree =
      !snap.stakeToken || snap.stakeToken === '0x0000000000000000000000000000000000000000';
    const stakeLabel = isFree
      ? en
        ? 'Free Play'
        : 'Gratis'
      : snap.stakeToken.toLowerCase() === PROTOCOL_SEPOLIA_ADDRESSES.cUsdtWrapper.toLowerCase()
        ? 'Sepolia cUSDT (ERC-7984)'
        : 'DodChip cDOD (ERC-7984)';

    return `
      <div class="arena-lobby-wrap">
        <div class="doodle-card sketchbook-panel arena-lobby-card ui-interactive stagger-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="showcase-badge">⏳ ${en ? `Sepolia Lobby • Match #${snap.matchId}` : `Lobi Sepolia • Laga #${snap.matchId}`}</div>
            <span class="arena-turn-badge is-mine">${snap.playerCount} / ${snap.maxPlayers} ${en ? 'Seated' : 'Pemain'}</span>
          </div>
          <h2 style="margin:6px 0 4px;font-family:var(--font-display)">
            ${en ? `Waiting for Players (#${snap.matchId})` : `Menunggu Pemain (#${snap.matchId})`}
          </h2>
          <p style="margin:0 0 8px;font-size:0.84rem;opacity:0.86">
            ${en ? 'Share this Match ID or Invite Link with friends on Sepolia. Auto-refresh runs every 4.5s.' : 'Bagikan Match ID atau Link Undangan ini ke teman di Sepolia. Lobi otomatis menyegarkan tiap 4.5 detik.'}
          </p>

          <div class="arena-secret-box" style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:0.84rem">
              <span>🗺️ ${snap.boardSize === 30 ? 'Sprint 30' : 'Classic 100'}</span>
              <span>🪙 ${esc(stakeLabel)}</span>
            </div>
            <div style="display:grid;gap:4px;margin-top:8px">
              ${snap.players
                .map(
                  (p, idx) => `
                <div class="arena-proof-item" style="display:flex;justify-content:space-between;align-items:center">
                  <span><b>Seat #${idx + 1}</b>: <code>${shortAddr(p.address)}</code></span>
                  <span class="faucet-token-badge">${p.address.toLowerCase() === snap.host.toLowerCase() ? 'Host' : 'Joined'}</span>
                </div>`,
                )
                .join('')}
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="doodle-btn doodle-btn-blue" id="btn-copy-arena-invite" style="flex:1;min-height:38px">
              🔗 ${en ? 'Copy Invite Link' : 'Salin Link Undangan'}
            </button>
            <button class="doodle-btn" id="btn-refresh-lobby" style="min-height:38px">
              🔄 ${en ? 'Refresh' : 'Segarkan'}
            </button>
            ${
              isHost && snap.playerCount >= 2
                ? `<button class="doodle-btn doodle-btn-primary" id="btn-arena-start-early" style="flex:1;min-height:38px">
                     🚀 ${en ? `Start Now (${snap.playerCount}P)` : `Mulai Sekarang (${snap.playerCount}P)`}
                   </button>`
                : ''
            }
            <button class="doodle-btn" id="btn-arena-new-match" style="min-height:38px">
              ${en ? 'Leave' : 'Keluar'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderContractConfigDrawer(en: boolean, hasSepoliaDeployed: boolean): string {
    return `
      <div class="doodle-card arena-config-drawer ui-interactive">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${en ? 'Sepolia Contract Addresses' : 'Alamat Kontrak Sepolia'}</b>
          <button class="doodle-btn" id="btn-close-contracts" style="min-height:28px;padding:2px 8px">✕</button>
        </div>
        ${
          !hasSepoliaDeployed
            ? `<div class="arena-warn-note">${
                en
                  ? 'No Sepolia deployment saved yet. Run deploy:sepolia or paste your deployed DodChip & DodSnakeArena addresses below:'
                  : 'Alamat kontrak Sepolia belum tersimpan. Jalankan deploy:sepolia atau tempel alamat DodChip & DodSnakeArena di bawah:'
              }</div>`
            : ''
        }
        <div style="display:grid;gap:6px;margin-top:6px">
          <input class="doodle-input" id="inp-custom-chip" value="${esc(this.customChipInput)}" placeholder="DodChipERC7984 Address (0x...)" style="min-height:34px;font-size:0.82rem" />
          <input class="doodle-input" id="inp-custom-arena" value="${esc(this.customArenaInput)}" placeholder="DodSnakeArena Address (0x...)" style="min-height:34px;font-size:0.82rem" />
          <div style="display:flex;gap:6px">
            <button class="doodle-btn doodle-btn-mint" id="btn-save-contracts" style="flex:1;min-height:34px">${en ? 'Save Addresses' : 'Simpan Alamat'}</button>
          </div>
          <div style="font-size:0.74rem;opacity:0.8">
            Official Sepolia cUSDT: <code>${PROTOCOL_SEPOLIA_ADDRESSES.cUsdtWrapper}</code>
          </div>
        </div>
      </div>
    `;
  }

  private renderOnboardingLobby(
    en: boolean,
    draft: ArenaPlayerDraft,
    hasSepoliaDeployed: boolean,
  ): string {
    const simBal = this.sim.getBalanceInfo();
    const tokenCfg = this.getSelectedTokenConfig();
    const step1Done = this.mode === 'preview' || Boolean(this.walletInfo);
    const step2Done =
      this.mode === 'preview' ? simBal.clearMicro !== null : this.chipClearMicro !== null;
    const step3Done = this.mode === 'preview' ? simBal.isOperator : this.isOperator;

    return `
      <div class="arena-lobby-wrap">
        <div class="doodle-card sketchbook-panel arena-lobby-card ui-interactive stagger-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="showcase-badge">🔐 FHEVM + ERC-7984 • ${en ? 'Confidential Mode' : 'Mode Rahasia'}</div>
            <button class="doodle-btn" id="btn-lobby-privacy" style="min-height:28px;padding:2px 9px;font-size:0.75rem">
              🛡️ ${en ? 'Privacy Matrix' : 'Matriks Privasi'}
            </button>
          </div>
          <h2 style="margin:6px 0 4px;font-family:var(--font-display)">
            ${en ? 'DodSnakes Confidential Arena' : 'Arena Rahasia DodSnakes'}
          </h2>
          <p style="margin:0 0 10px;font-size:0.86rem;opacity:0.85">
            ${
              en
                ? 'Secret Traps, Hidden Golden Warp, Encrypted Missions, Rival Brake Curse, Verifiable FHE Dice & Blind Duels — impossible on a public blockchain!'
                : 'Jebakan Rahasia, Golden Warp Tersembunyi, Misi Terenkripsi, Kutukan Rem Lawan, Dadu FHE Terverifikasi & Duel Buta — mustahil di blockchain transparan!'
            }
          </p>

          <div class="arena-steps-strip">
            <span class="arena-step-pill ${step1Done ? 'is-done' : ''}">
              ${step1Done ? '✓' : '1.'} ${en ? 'Wallet / Mode' : 'Wallet / Mode'}
            </span>
            <span class="arena-step-pill ${step2Done ? 'is-done' : ''}">
              ${step2Done ? '✓' : '2.'} ${en ? 'Faucet & Decrypt' : 'Faucet & Dekripsi'}
            </span>
            <span class="arena-step-pill ${step3Done ? 'is-done' : ''}">
              ${step3Done ? '✓' : '3.'} ${en ? 'Approve Operator' : 'Izinkan Operator'}
            </span>
            <span class="arena-step-pill">
              4. ${en ? 'Play Onchain' : 'Main Onchain'}
            </span>
          </div>

          ${
            this.mode === 'sepolia' && !hasSepoliaDeployed
              ? `<div class="arena-warn-note">
                   ${
                     en
                       ? 'Tip: Sepolia contracts are not configured yet in this build. Use "Instant FHE Preview" to test immediately, or deploy with npm run deploy:sepolia & paste addresses via ⚙️.'
                       : 'Tips: Kontrak Sepolia belum di-deploy pada build ini. Gunakan "Preview FHE Instan" untuk mencoba langsung, atau deploy via npm run deploy:sepolia & isi alamat di ⚙️.'
                   }
                 </div>`
              : ''
          }

          <div class="arena-setup-grid">
            <div class="arena-setup-block">
              <label><b>${en ? 'Board Length' : 'Panjang Papan'}</b></label>
              <div style="display:flex;gap:6px">
                <button class="doodle-btn ${this.boardMode === 1 ? 'doodle-btn-blue' : ''}" id="btn-board-sprint" style="flex:1;min-height:36px;font-size:0.84rem">
                  ⚡ ${en ? 'Sprint (30 Tiles)' : 'Kilat (30 Kotak)'}
                </button>
                <button class="doodle-btn ${this.boardMode === 0 ? 'doodle-btn-blue' : ''}" id="btn-board-classic" style="flex:1;min-height:36px;font-size:0.84rem">
                  🗺️ ${en ? 'Classic (100 Tiles)' : 'Klasik (100 Kotak)'}
                </button>
              </div>
            </div>

            <div class="arena-setup-block">
              <label><b>${en ? 'Players' : 'Pemain'}</b></label>
              <div style="display:flex;gap:6px">
                ${[1, 2, 4]
                  .map(
                    (n) =>
                      `<button class="doodle-btn ${this.maxPlayers === n ? 'doodle-btn-mint' : ''}" data-arena-maxp="${n}" style="flex:1;min-height:36px;font-size:0.84rem">${
                        n === 1 ? (en ? 'Solo vs FHE' : 'Solo vs FHE') : `${n}P`
                      }</button>`,
                  )
                  .join('')}
              </div>
            </div>

            <div class="arena-setup-block">
              <label><b>${en ? 'ERC-7984 Token' : 'Token ERC-7984'}</b></label>
              <div style="display:flex;gap:6px;margin-bottom:6px">
                <button class="doodle-btn ${this.stakeTokenKind === 'cdod' ? 'doodle-btn-blue' : ''}" id="btn-tok-cdod" style="flex:1;min-height:34px;font-size:0.8rem">
                  cDOD (Faucet)
                </button>
                <button class="doodle-btn ${this.stakeTokenKind === 'cusdt' ? 'doodle-btn-blue' : ''}" id="btn-tok-cusdt" style="flex:1;min-height:34px;font-size:0.8rem">
                  Sepolia cUSDT
                </button>
              </div>
              <label><b>${en ? `Encrypted Wager (${tokenCfg.symbol})` : `Taruhan Terenkripsi (${tokenCfg.symbol})`}</b></label>
              <div style="display:flex;gap:6px">
                ${[0, 10, 25]
                  .map(
                    (amt) =>
                      `<button class="doodle-btn ${this.stakeTokens === amt ? 'doodle-btn-primary' : ''}" data-arena-stake="${amt}" style="flex:1;min-height:36px;font-size:0.84rem">${
                        amt === 0 ? (en ? 'Free' : 'Gratis') : `${amt} ${tokenCfg.symbol}`
                      }</button>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            ${
              !step3Done && this.stakeTokens > 0
                ? `<button class="doodle-btn doodle-btn-blue" id="btn-arena-approve-op" style="flex:1">
                     ✍️ ${en ? `Approve ${tokenCfg.symbol} Operator` : `Setujui Operator ${tokenCfg.symbol}`}
                   </button>`
                : ''
            }
            <button class="doodle-btn doodle-btn-primary" id="btn-arena-create-match" style="flex:2">
              🎲 ${en ? `Launch as ${draft.name}` : `Mulai sebagai ${draft.name}`}
            </button>
          </div>

          ${
            this.mode === 'sepolia'
              ? `<div style="display:flex;gap:6px;margin-top:8px">
                   <input class="doodle-input" id="inp-arena-join-id" value="${esc(this.joinMatchInput)}" placeholder="${en ? 'Or enter Match ID to join...' : 'Atau masukkan Match ID...'}" style="min-height:36px;flex:1" />
                   <button class="doodle-btn doodle-btn-mint" id="btn-arena-join-match" style="min-height:36px">${en ? 'Join' : 'Gabung'}</button>
                 </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  private renderActiveArenaHud(
    en: boolean,
    snap: OnchainMatchSnapshot,
    logs: FheProofLogEntry[],
  ): string {
    const myAddr = (this.mode === 'sepolia' ? this.walletInfo?.address : this.sim.getAddress()) || '';
    const me =
      snap.players.find((p) => p.address.toLowerCase() === myAddr.toLowerCase()) ?? snap.players[0];
    const activeTurnAddr = snap.players[snap.turnIndex]?.address ?? '';
    const isMyTurn = activeTurnAddr.toLowerCase() === myAddr.toLowerCase();

    const missionUnlocked = snap.mySecret?.missionId !== undefined;
    const missionInfo =
      missionUnlocked && snap.mySecret?.missionId !== undefined
        ? SECRET_MISSION_DESCRIPTIONS[snap.mySecret.missionId] ?? SECRET_MISSION_DESCRIPTIONS[0]
        : null;

    const isWinner =
      snap.status === 2 && snap.winner.toLowerCase() === myAddr.toLowerCase();

    return `
      <div class="arena-hud-layout">
        <div class="doodle-card arena-vault-card ui-interactive">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <b>🔐 ${en ? `Match #${snap.matchId}` : `Laga #${snap.matchId}`}</b>
            <div style="display:flex;align-items:center;gap:4px">
              <span class="arena-turn-badge ${isMyTurn ? 'is-mine' : ''}">
                ${
                  snap.status === 2
                    ? en
                      ? 'Finished'
                      : 'Selesai'
                    : isMyTurn
                      ? en
                        ? 'Your Turn'
                        : 'Giliranmu'
                      : en
                        ? 'Waiting Rival'
                        : 'Menunggu Lawan'
                }
              </span>
              <button class="doodle-btn" id="btn-toggle-vault" style="min-height:24px;padding:1px 7px;font-size:0.72rem">
                ${this.showVaultDrawer ? '−' : '+'}
              </button>
            </div>
          </div>

          <div class="arena-stats-row">
            <span>📍 ${me ? `${me.position}/${snap.boardSize}` : '-'}</span>
            <span>★ ${me?.stars ?? 0}</span>
            <span>🪜 ${me?.laddersClimbed ?? 0}</span>
            <span>⚔️ ${me?.duelWins ?? 0}</span>
          </div>
          ${
            this.showVaultDrawer
              ? `
          ${
            snap.players.length > 1
              ? `<div class="arena-players-strip">
                   ${snap.players
                     .map((p, idx) => {
                       const isMeSeat = p.address.toLowerCase() === myAddr.toLowerCase();
                       const isTurnSeat = idx === snap.turnIndex;
                       return `<span class="arena-seat-chip ${isTurnSeat ? 'is-turn' : ''} ${isMeSeat ? 'is-me' : ''}">${isMeSeat ? (en ? 'You' : 'Kamu') : `P${idx + 1}`}: #${p.position} ★${p.stars}</span>`;
                     })
                     .join('')}
                 </div>`
              : ''
          }

          <div class="arena-secret-box">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b>🎯 ${en ? 'Secret Mission' : 'Misi Rahasia'}</b>
              <button class="doodle-btn" id="btn-arena-unlock-secrets" style="min-height:26px;padding:2px 8px;font-size:0.74rem">
                ${missionUnlocked ? (en ? '🔄 Refresh' : '🔄 Segarkan') : `🔓 ${en ? 'Decrypt' : 'Dekripsi'}`}
              </button>
            </div>
            ${
              missionInfo
                ? `<div class="arena-revealed-secret">
                     <b>${esc(en ? missionInfo.titleEn : missionInfo.titleId)}</b>
                     <small>${esc(en ? missionInfo.descEn : missionInfo.descId)}</small>
                   </div>`
                : `<div class="arena-locked-cipher">🔒 ${esc(snap.mySecret?.missionHandle.slice(0, 18) || '0x0000...')} (FHE.allow owner only)</div>`
            }
          </div>

          <div class="arena-secret-box">
            <b>🎒 ${en ? 'Confidential Bag' : 'Tas Rahasia'}</b>
            <div style="display:flex;gap:8px;margin-top:4px;font-size:0.84rem">
              <span>🛡️ ${en ? 'Shields' : 'Perisai'}: <b>${snap.mySecret?.shields !== undefined ? snap.mySecret.shields : '🔒'}</b></span>
              <span>💣 ${en ? 'Traps' : 'Jebakan'}: <b>${snap.mySecret?.trapCharges !== undefined ? snap.mySecret.trapCharges : '🔒'}</b></span>
            </div>
            <div style="font-size:0.73rem;margin-top:4px;color:#8a4b00">
              ⚡ ${en ? '1 Hidden FHE Golden Warp (+3 steps +1★) active on board!' : '1 Golden Warp FHE tersembunyi (+3 langkah +1★) aktif di papan!'}
            </div>
            ${
              snap.boardSize === 30
                ? `<div class="arena-sprint-guide">
                     🪜 3→11 • 8→19 • 15→24 &nbsp;|&nbsp; 🐍 14↘5 • 21↘10 • 27↘18
                   </div>`
                : ''
            }
            <div style="font-size:0.69rem;margin-top:3px;opacity:0.78">
              🎯 ${en ? 'Tip: Click any 3D board tile to aim a trap.' : 'Tips: Klik petak di papan 3D untuk bidik jebakan.'}
            </div>
            ${
              snap.myPlantedTrapTiles.length > 0
                ? `<div style="font-size:0.75rem;margin-top:4px;color:#b21f66">
                     ${en ? 'Your hidden traps' : 'Jebakan tersembunyimu'}: <b>${snap.myPlantedTrapTiles.map((t) => `#${t}`).join(', ')}</b>
                   </div>`
                : ''
            }
          </div>

          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="doodle-btn doodle-btn-mint" id="btn-arena-claim-mission" style="flex:1;min-height:32px;font-size:0.78rem" ${me?.missionClaimed ? 'disabled' : ''}>
              ${me?.missionClaimed ? (en ? '✓ Mission Claimed' : '✓ Misi Diklaim') : en ? 'Verify Mission (+3★)' : 'Verifikasi Misi (+3★)'}
            </button>
            <button class="doodle-btn" id="btn-arena-new-match" style="min-height:32px;padding:2px 8px;font-size:0.78rem">
              ${en ? 'New' : 'Baru'}
            </button>
          </div>`
              : ''
          }
        </div>

        <div class="doodle-card arena-proof-card ui-interactive">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <b>⚡ ${en ? 'FHE Proof & Tx Inspector' : 'Inspektor Bukti FHE & Tx'}</b>
            <button class="doodle-btn" id="btn-toggle-proofs" style="min-height:24px;padding:1px 7px;font-size:0.72rem">
              ${this.showProofDrawer ? '−' : '+'}
            </button>
          </div>
          ${
            this.showProofDrawer
              ? `<div class="arena-proof-list">
                   ${
                     logs.length === 0
                       ? `<div style="font-size:0.76rem;opacity:0.7">${en ? 'Encrypted handles and KMS proofs will appear here.' : 'Handle terenkripsi dan bukti KMS akan muncul di sini.'}</div>`
                       : logs
                           .slice(0, 7)
                           .map(
                             (l) => `
                         <div class="arena-proof-item">
                           <div class="arena-proof-head">
                             <span class="arena-kind-tag is-${l.kind}">${l.kind.toUpperCase()}</span>
                             <b>${esc(l.title)}</b>
                           </div>
                           <div class="arena-proof-detail">${esc(l.detail)}</div>
                           ${l.handle ? `<div class="arena-proof-hash">ct: <code>${esc(l.handle.slice(0, 18))}...</code></div>` : ''}
                           ${
                             l.txHash
                               ? `<a class="arena-tx-link" href="${esc(this.fheClient.getExplorerTxUrl(l.txHash))}" target="_blank" rel="noopener">Tx: ${esc(l.txHash.slice(0, 12))}... ↗</a>`
                               : ''
                           }
                         </div>`,
                           )
                           .join('')
                   }
                 </div>`
              : ''
          }
        </div>
      </div>

      <div class="arena-bottom-deck ui-interactive">
        ${(() => {
          if (snap.status === 2) {
            return `<div class="doodle-card arena-win-banner">
                 <b>🏆 ${isWinner ? (en ? 'Victory! You reached the goal!' : 'Menang! Kamu mencapai finis!') : `${shortAddr(snap.winner)} Won!`}</b>
                 ${
                   !snap.payoutClaimed
                     ? `<button class="doodle-btn doodle-btn-primary" id="btn-arena-claim-pot">💰 ${
                         isWinner
                           ? en
                             ? 'Claim Encrypted ERC-7984 Pot'
                             : 'Klaim Pot ERC-7984 Terenkripsi'
                           : en
                             ? 'Settle Pot to Winner'
                             : 'Kirim Pot ke Pemenang'
                       }</button>`
                     : `<span>✓ ${en ? 'Encrypted Pot Paid Out' : 'Pot Terenkripsi Dibayarkan'}</span>`
                 }
                 <button class="doodle-btn doodle-btn-mint" id="btn-arena-win-new">🎲 ${en ? 'Play Again' : 'Main Lagi'}</button>
               </div>`;
          }

          if (snap.pendingAction > 0) {
            const pendingLabels: Record<number, string> = {
              1: en ? 'Verifiable FHE Dice Roll' : 'Dadu FHE Terverifikasi',
              2: en ? 'Homomorphic Secret Trap Check' : 'Pengecekan Jebakan Rahasia',
              3: en ? 'Blind Duel Outcome Proof' : 'Bukti Hasil Duel Buta',
              4: en ? 'Secret Mission Verification' : 'Verifikasi Misi Rahasia',
            };
            return `<div class="doodle-card arena-win-banner">
                 <b>⚡ ${en ? 'Pending Onchain KMS Proof:' : 'Menunggu Verifikasi Bukti KMS:'} ${esc(pendingLabels[snap.pendingAction] || `#${snap.pendingAction}`)}</b>
                 <button class="doodle-btn doodle-btn-primary" id="btn-arena-resume-pending">
                   🔄 ${en ? 'Complete Pending KMS Proof' : 'Selesaikan Bukti KMS'}
                 </button>
               </div>`;
          }

          if (snap.duel?.active) {
            const myLow = myAddr.toLowerCase();
            const isChal = snap.duel.challenger.toLowerCase() === myLow;
            const isOpp = snap.duel.opponent.toLowerCase() === myLow;
            const needsMyMove =
              (isChal && !snap.duel.challengerCommitted) ||
              (isOpp && !snap.duel.opponentCommitted);
            const rivalAddr = isChal ? snap.duel.opponent : snap.duel.challenger;
            return `<div class="doodle-card arena-win-banner">
                 <b>⚔️ ${
                   needsMyMove
                     ? en
                       ? `Blind Duel vs ${shortAddr(rivalAddr)} — Choose Your Move!`
                       : `Duel Buta vs ${shortAddr(rivalAddr)} — Pilih Langkahmu!`
                     : en
                       ? `Waiting for ${shortAddr(rivalAddr)}'s encrypted move...`
                       : `Menunggu langkah terenkripsi ${shortAddr(rivalAddr)}...`
                 }</b>
                 ${
                   needsMyMove
                     ? `<button class="doodle-btn doodle-btn-mint" id="btn-arena-open-duel">⚔️ ${en ? 'Commit Secret RPS Move' : 'Kirim Langkah RPS Rahasia'}</button>`
                     : `<button class="doodle-btn" id="btn-refresh-lobby">🔄 ${en ? 'Refresh' : 'Segarkan'}</button>`
                 }
               </div>`;
          }

          return `<div class="doodle-card arena-action-bar">
                 <button class="doodle-btn doodle-btn-primary" id="btn-arena-roll" ${!isMyTurn ? 'disabled' : ''} style="min-height:46px;font-size:1.05rem;padding:8px 18px">
                   🎲 ${en ? 'Roll FHE Dice' : 'Lempar Dadu FHE'}
                 </button>

                 <div class="arena-trap-inline">
                   <input class="doodle-input" id="inp-trap-tile" type="number" min="2" max="${snap.boardSize - 1}" value="${this.trapTileInput}" style="width:58px;min-height:38px;padding:4px 6px" title="${en ? 'Target tile' : 'Target kotak'}" />
                   <select class="doodle-input" id="sel-trap-kind" style="width:auto;min-height:38px;padding:4px 6px;font-size:0.8rem">
                     ${TRAP_KIND_META.map(
                       (tm) =>
                         `<option value="${tm.kind}" ${this.trapKindInput === tm.kind ? 'selected' : ''}>${esc(en ? tm.shortEn : tm.shortId)}</option>`,
                     ).join('')}
                   </select>
                   <button class="doodle-btn doodle-btn-pink" id="btn-arena-plant-trap" ${!isMyTurn ? 'disabled' : ''} style="min-height:38px;font-size:0.82rem;white-space:nowrap">
                     💣 ${en ? 'Plant Trap' : 'Tanam Jebakan'}
                   </button>
                 </div>

                 <button class="doodle-btn doodle-btn-blue" id="btn-arena-buy-mystery" ${!isMyTurn || (me?.stars ?? 0) < 2 ? 'disabled' : ''} style="min-height:38px;font-size:0.82rem;white-space:nowrap">
                   🎁 ${en ? 'Mystery (2★)' : 'Misteri (2★)'}
                 </button>

                 <div class="arena-trap-inline">
                   ${
                     snap.players.length > 1
                       ? `<select class="doodle-input" id="sel-brake-seat" style="width:auto;min-width:84px;min-height:38px;padding:4px 8px;font-size:0.78rem" title="${en ? 'Hidden target seat for FHE Brake' : 'Kursi target terenkripsi'}">
                            ${snap.players
                              .map((p, idx) =>
                                p.address.toLowerCase() === myAddr.toLowerCase()
                                  ? ''
                                  : `<option value="${idx}" ${this.brakeSeatInput === idx ? 'selected' : ''}>Seat #${idx + 1}</option>`,
                              )
                              .join('')}
                          </select>`
                       : ''
                   }
                   <button class="doodle-btn" id="btn-arena-cast-brake" ${
                     !isMyTurn ||
                     (me?.stars ?? 0) < 2 ||
                     (this.mode === 'sepolia' && snap.players.length <= 1)
                       ? 'disabled'
                       : ''
                   } style="min-height:38px;font-size:0.82rem;white-space:nowrap" title="${
                     this.mode === 'sepolia' && snap.players.length <= 1
                       ? en
                         ? 'Multiplayer (2P/4P) only — encrypts target seat & caps next dice to 1..3'
                         : 'Khusus Multiplayer (2P/4P) — mengutuk dadu lawan jadi 1..3'
                       : en
                         ? 'Cast FHE Secret Brake (caps next dice roll to 1..3)'
                         : 'Kutuk Rem FHE Rahasia (dadu berikutnya max 3)'
                   }">
                     🧊 ${en ? 'Secret Brake (2★)' : 'Rem Rahasia (2★)'}
                   </button>
                 </div>

                 <button class="doodle-btn doodle-btn-mint" id="btn-arena-open-duel" ${!isMyTurn ? 'disabled' : ''} style="min-height:38px;font-size:0.82rem;white-space:nowrap">
                   ⚔️ ${en ? 'Blind Duel' : 'Duel Buta'}
                 </button>
               </div>`;
        })()}
      </div>
    `;
  }

  private renderBlindDuelModal(en: boolean, snap: OnchainMatchSnapshot): string {
    const myAddr = (this.mode === 'sepolia' ? this.walletInfo?.address : this.sim.getAddress()) || '';
    const rivals = snap.players.filter((p) => p.address.toLowerCase() !== myAddr.toLowerCase());
    const lockedOpponent = snap.duel?.active
      ? snap.duel.challenger.toLowerCase() === myAddr.toLowerCase()
        ? snap.duel.opponent
        : snap.duel.challenger
      : null;
    return `
      <div class="challenge-backdrop ui-interactive">
        <div class="doodle-card menu-box setup-card-compact stagger-item">
          <h2 class="modal-heading">⚔️ ${en ? 'Encrypted Blind Duel' : 'Duel Buta Terenkripsi'}</h2>
          <p style="margin:0 0 8px;font-size:0.85rem">
            ${
              en
                ? 'Your choice is FHE-encrypted before leaving your browser. Neither opponents nor mempool watchers can peek or counter-pick!'
                : 'Pilihanmu dienkripsi FHE sebelum dikirim. Lawan maupun pengamat mempool tidak bisa mengintip pilihanmu!'
            }
          </p>
          ${
            lockedOpponent
              ? `<div class="arena-secret-box" style="margin-bottom:8px;font-size:0.84rem">
                   🎯 ${en ? 'Active Duel vs' : 'Duel Aktif vs'}: <b>${lockedOpponent === '0x0000000000000000000000000000000000000000' ? (en ? 'FHE House Bot' : 'Bot Rumah FHE') : shortAddr(lockedOpponent)}</b>
                 </div>`
              : this.mode === 'sepolia' && rivals.length > 0
                ? `<label><b>${en ? 'Target Opponent' : 'Target Lawan'}:</b></label>
                   <select class="doodle-input" id="sel-duel-opp" style="margin-bottom:8px">
                     <option value="0x0000000000000000000000000000000000000000">${en ? 'FHE Encrypted House Bot' : 'Bot Rumah Terenkripsi FHE'}</option>
                     ${rivals.map((r) => `<option value="${r.address}">${shortAddr(r.address)}</option>`).join('')}
                   </select>`
                : ''
          }
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="doodle-btn doodle-btn-primary" data-duel-rps="0" style="flex:1;min-height:60px;flex-direction:column">
              <span style="font-size:1.3rem">🪨</span>
              <span>${en ? 'Ink Rock' : 'Batu Tinta'}</span>
            </button>
            <button class="doodle-btn doodle-btn-mint" data-duel-rps="1" style="flex:1;min-height:60px;flex-direction:column">
              <span style="font-size:1.3rem">📄</span>
              <span>${en ? 'Scroll' : 'Kertas'}</span>
            </button>
            <button class="doodle-btn doodle-btn-pink" data-duel-rps="2" style="flex:1;min-height:60px;flex-direction:column">
              <span style="font-size:1.3rem">✂️</span>
              <span>${en ? 'Scissors' : 'Gunting'}</span>
            </button>
          </div>
          <button class="doodle-btn" id="btn-close-duel-modal">${en ? 'Cancel' : 'Batal'}</button>
        </div>
      </div>
    `;
  }

  private renderPrivacyMatrixModal(en: boolean): string {
    const rows = [
      {
        feature: en ? 'Secret Board Traps' : 'Jebakan Papan Rahasia',
        type: 'euint8 + FHE.eq / FHE.select',
        why: en
          ? 'Trap tiles stay encrypted onchain. Only hit checks run homomorphically; untriggered traps stay invisible.'
          : 'Kotak jebakan terenkripsi onchain. Cek tabrakan diproses homomorfik; jebakan aman tetap rahasia.',
      },
      {
        feature: en ? 'Hidden Golden Warp' : 'Golden Warp Tersembunyi',
        type: 'FHE.randEuint8 (no ACL)',
        why: en
          ? 'Spawned randomly onchain with ZERO read access — even the contract deployer cannot peek until a pawn lands on it!'
          : 'Di-spawn acak tanpa akses baca siapa pun — bahkan deployer tak bisa mengintip sebelum diinjak!',
      },
      {
        feature: en ? 'Secret Rival Brake' : 'Kutukan Rem Rahasia',
        type: 'externalEuint8 + ebool',
        why: en
          ? 'Encrypts target seat index & sets hidden ebool curse capping rival next FHE dice to 1..3.'
          : 'Target seat & status ebool terenkripsi; diam-diam membatasi dadu lawan 1..3.',
      },
      {
        feature: en ? 'Blind RPS Duel & Shields' : 'Duel Buta & Perisai',
        type: 'externalEuint8 + euint8',
        why: en
          ? 'Prevents mempool front-running or counter-picking against opponent Rock/Paper/Scissors or Shield inventory.'
          : 'Mencegah front-running mempool maupun mengintip jumlah Perisai sebelum ular menyerang.',
      },
      {
        feature: en ? 'Wagers & Match Pot' : 'Taruhan & Pot ERC-7984',
        type: 'euint64 + confidentialTransferFrom',
        why: en
          ? 'Private match stakes and confidential pot payouts via ERC-7984 (cDOD or Sepolia cUSDT).'
          : 'Taruhan & payout pot berlangsung privat via standar ERC-7984 (cDOD / Sepolia cUSDT).',
      },
      {
        feature: en ? 'Verifiable FHE Dice' : 'Dadu FHE Terverifikasi',
        type: 'FHE.randEuint32 + FHE.checkSignatures',
        why: en
          ? 'Generates tamper-proof onchain randomness verified by KMS signatures & replay protection.'
          : 'Mengacak dadu di dalam FHE lalu memverifikasi bukti KMS secara onchain anti-curang.',
      },
    ];

    return `
      <div class="challenge-backdrop ui-interactive">
        <div class="doodle-card menu-box setup-card stagger-item" style="max-height:88vh;overflow:auto">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 class="modal-heading" style="margin:0">🛡️ ${en ? 'Why FHE? Confidentiality Matrix' : 'Kenapa FHE? Matriks Privasi'}</h2>
            <button class="doodle-btn" id="btn-close-privacy-modal" style="min-height:32px;padding:3px 10px">✕</button>
          </div>
          <p style="margin:6px 0 10px;font-size:0.84rem;opacity:0.85">
            ${
              en
                ? 'On a transparent blockchain, storage slots & mempool transactions leak every hidden trap, bluff, inventory shield, and secret mission. DodSnakes uses FHEVM so the game stays fair yet truly hidden:'
                : 'Di blockchain transparan, slot storage & mempool membocorkan posisi jebakan, pilihan duel, dan jumlah perisai. DodSnakes memakai FHEVM agar semuanya tetap adil sekaligus rahasia:'
            }
          </p>
          <div class="privacy-matrix-grid">
            ${rows
              .map(
                (r) => `
              <div class="faucet-card">
                <div style="display:flex;justify-content:space-between;gap:6px;align-items:center;flex-wrap:wrap">
                  <b>${esc(r.feature)}</b>
                  <span class="faucet-token-badge">${esc(r.type)}</span>
                </div>
                <div style="font-size:0.78rem;opacity:0.86">${esc(r.why)}</div>
              </div>`,
              )
              .join('')}
          </div>
          <div class="arena-disclaimer-inline">⚠️ ${esc(PROTOCOL_DISCLAIMER)}</div>
        </div>
      </div>
    `;
  }

  public renderFaucetsModalHtml(lang: AppLanguage): string {
    const en = lang === 'en';
    return `
      <div class="challenge-backdrop ui-interactive" id="faucets-modal-backdrop">
        <div class="doodle-card menu-box setup-card stagger-item" style="max-height:88vh;overflow:auto">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 class="modal-heading" style="margin:0">🚰 ${en ? 'Sepolia Testnet & 12 Faucets' : 'Testnet Sepolia & 12 Faucet'}</h2>
            <button class="doodle-btn" id="btn-close-faucets" style="min-height:32px;padding:3px 10px">✕</button>
          </div>
          <p style="margin:4px 0 8px;font-size:0.84rem;opacity:0.85">
            ${
              en
                ? 'Need Sepolia ETH for gas or cDOD encrypted chips? Use any of the 12 verified faucets below:'
                : 'Butuh Sepolia ETH untuk gas atau token terenkripsi cDOD? Gunakan daftar 12 faucet terverifikasi berikut:'
            }
          </p>

          <div class="faucets-grid">
            ${SEPOLIA_FAUCETS.map(
              (f, idx) => `
              <div class="faucet-card">
                <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start">
                  <b>${idx + 1}. ${esc(f.name)}</b>
                  <span class="faucet-token-badge">${esc(f.token)}</span>
                </div>
                <div style="font-size:0.78rem;opacity:0.82">${esc(en ? f.noteEn : f.noteId)}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;gap:6px">
                  <small style="opacity:0.72">${esc(f.requirement)}</small>
                  ${
                    f.url === '#in-app-faucet'
                      ? `<button class="doodle-btn doodle-btn-mint" id="btn-modal-claim-cdod" style="min-height:28px;padding:2px 8px;font-size:0.76rem">Mint 100 cDOD</button>`
                      : `<a class="doodle-btn doodle-btn-blue" href="${esc(f.url)}" target="_blank" rel="noopener" style="min-height:28px;padding:2px 8px;font-size:0.76rem;text-decoration:none">${en ? 'Open ↗' : 'Buka ↗'}</a>`
                  }
                </div>
              </div>`,
            ).join('')}
          </div>

          <div class="faucet-wallets-box">
            <b>🧪 ${en ? 'Sepolia Protocol & 10 Testnet Accounts' : 'Alamat Protokol Sepolia & 10 Akun Testnet'}</b>
            <div style="font-size:0.76rem;margin-top:4px">
              Chain ID: <b>11155111</b> • Relayer: <code>${PROTOCOL_SEPOLIA_ADDRESSES.relayerUrl}</code><br/>
              cUSDT Wrapper: <code>${PROTOCOL_SEPOLIA_ADDRESSES.cUsdtWrapper}</code><br/>
              Deployer: <code>${TESTNET_DIRECTORY.deployerAddress}</code>
            </div>
            <div class="testnet-addr-grid">
              ${TESTNET_DIRECTORY.testAccounts
                .map(
                  (addr, i) => `
                <button class="doodle-btn testnet-copy-btn" data-copy-addr="${addr}" title="Copy ${addr}">
                  <span>#${i + 1}: ${shortAddr(addr)}</span>
                </button>`,
                )
                .join('')}
            </div>
          </div>

          <div class="arena-disclaimer-inline">⚠️ ${esc(PROTOCOL_DISCLAIMER)}</div>
        </div>
      </div>
    `;
  }

  public bindScreenEvents(root: HTMLElement, lang: AppLanguage, draft: ArenaPlayerDraft): void {
    const en = lang === 'en';
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);

    q('#btn-arena-back')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.stopPolling();
      this.onBackToMenu();
    });

    q('#btn-mode-preview')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.stopPolling();
      this.mode = 'preview';
      this.snapshot = this.sim.getSnapshot();
      this.syncSceneWithArena(draft);
      this.onRequestRender();
    });

    q('#btn-mode-sepolia')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.stopPolling();
      this.mode = 'sepolia';
      this.snapshot = null;
      this.activeMatchId = null;
      this.syncSceneWithArena(draft);
      this.onRequestRender();
    });

    q('#btn-arena-faucets')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.openFaucetsModal();
    });
    const openPrivacy = () => {
      this.sound.playUiClick();
      this.showPrivacyModal = true;
      this.onRequestRender();
    };
    q('#btn-arena-privacy-modal')?.addEventListener('click', openPrivacy);
    q('#btn-lobby-privacy')?.addEventListener('click', openPrivacy);
    q('#btn-close-privacy-modal')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showPrivacyModal = false;
      this.onRequestRender();
    });

    const switchToken = (kind: 'cdod' | 'cusdt') => {
      this.sound.playUiClick();
      this.stakeTokenKind = kind;
      if (this.mode === 'sepolia') {
        this.chipClearMicro = null;
        this.chipHandle = '0x0000...';
        this.isOperator = false;
        const cfg = this.getSelectedTokenConfig();
        if (this.fheClient.isConnected() && cfg.address) {
          void this.fheClient
            .readChipStatus(cfg.address)
            .then((st) => {
              this.chipHandle = st.encryptedBalanceHandle;
              this.isOperator = st.isArenaOperator;
              this.onRequestRender();
            })
            .catch(() => {});
        }
      }
      this.onRequestRender();
    };
    q('#btn-tok-cdod')?.addEventListener('click', () => switchToken('cdod'));
    q('#btn-tok-cusdt')?.addEventListener('click', () => switchToken('cusdt'));

    q('#btn-arena-contracts')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showContractConfig = !this.showContractConfig;
      this.onRequestRender();
    });
    q('#btn-close-contracts')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showContractConfig = false;
      this.onRequestRender();
    });
    q('#btn-save-contracts')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const chip = q<HTMLInputElement>('#inp-custom-chip')?.value ?? '';
      const arena = q<HTMLInputElement>('#inp-custom-arena')?.value ?? '';
      this.customChipInput = chip;
      this.customArenaInput = arena;
      saveCustomAddresses(chip, arena);
      this.showContractConfig = false;
      this.onToast(en ? 'Contract addresses saved!' : 'Alamat kontrak tersimpan!');
      this.onRequestRender();
    });

    q('#btn-arena-connect')?.addEventListener('click', () => void this.handleConnect(en));
    q('#btn-arena-faucet-claim')?.addEventListener('click', () => void this.handleClaimFaucet(en));
    q('#btn-arena-decrypt-bal')?.addEventListener('click', () => void this.handleDecryptBalance(en));
    q('#btn-arena-approve-op')?.addEventListener('click', () => void this.handleApproveOperator(en));

    q('#btn-board-sprint')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.boardMode = 1;
      this.trapTileInput = 12;
      this.onRequestRender();
    });
    q('#btn-board-classic')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.boardMode = 0;
      this.onRequestRender();
    });
    root.querySelectorAll<HTMLElement>('[data-arena-maxp]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.maxPlayers = Number(el.dataset.arenaMaxp || 1);
        this.onRequestRender();
      };
    });
    root.querySelectorAll<HTMLElement>('[data-arena-stake]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.stakeTokens = Number(el.dataset.arenaStake || 0);
        this.onRequestRender();
      };
    });

    q('#btn-arena-create-match')?.addEventListener('click', () => void this.handleCreateMatch(en, draft));
    q('#inp-arena-join-id')?.addEventListener('input', (e) => {
      this.joinMatchInput = (e.target as HTMLInputElement).value;
    });
    q('#btn-arena-join-match')?.addEventListener('click', () => void this.handleJoinMatch(en, draft));

    this.bindBoardTilePicker(en, root);

    q('#btn-arena-cam-toggle')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const nextMode = this.scene.getPreferredCameraMode() === 'overview' ? 'follow' : 'overview';
      this.scene.setPreferredCameraMode(nextMode);
      this.onRequestRender();
    });

    q('#btn-arena-unlock-secrets')?.addEventListener('click', () => void this.handleUnlockSecrets(en, draft));
    q('#btn-arena-roll')?.addEventListener('click', () => void this.handleRollDice(en, draft));
    q<HTMLInputElement>('#inp-trap-tile')?.addEventListener('input', (e) => {
      this.trapTileInput = Number((e.target as HTMLInputElement).value || 2);
      if (this.snapshot && this.snapshot.status === 1) {
        this.scene.setArenaOverlayMarkers(
          this.snapshot.myPlantedTrapTiles,
          this.snapshot.boardSize,
          this.trapTileInput,
        );
      }
    });
    q<HTMLSelectElement>('#sel-trap-kind')?.addEventListener('change', (e) => {
      this.trapKindInput = Number((e.target as HTMLSelectElement).value || 1);
    });
    q('#btn-arena-plant-trap')?.addEventListener('click', () => void this.handlePlantTrap(en, draft));
    q('#btn-arena-buy-mystery')?.addEventListener('click', () => void this.handleBuyMystery(en, draft));
    q<HTMLSelectElement>('#sel-brake-seat')?.addEventListener('change', (e) => {
      this.brakeSeatInput = Number((e.target as HTMLSelectElement).value || 0);
    });
    q('#btn-arena-cast-brake')?.addEventListener('click', () => void this.handleCastBrake(en, draft));
    q('#btn-arena-open-duel')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showBlindDuelModal = true;
      this.onRequestRender();
    });
    q('#btn-close-duel-modal')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showBlindDuelModal = false;
      this.onRequestRender();
    });
    q<HTMLSelectElement>('#sel-duel-opp')?.addEventListener('change', (e) => {
      this.duelOpponentInput = (e.target as HTMLSelectElement).value;
    });
    root.querySelectorAll<HTMLElement>('[data-duel-rps]').forEach((el) => {
      el.onclick = () => {
        const choice = Number(el.dataset.duelRps || 0) as 0 | 1 | 2;
        void this.handleBlindDuel(en, draft, choice);
      };
    });
    q('#btn-arena-claim-mission')?.addEventListener('click', () => void this.handleVerifyMission(en, draft));
    q('#btn-arena-claim-pot')?.addEventListener('click', () => void this.handleClaimPot(en));
    q('#btn-copy-arena-invite')?.addEventListener('click', () => {
      if (!this.activeMatchId) return;
      const url = `${window.location.origin}/?arenaMatch=${this.activeMatchId}`;
      void navigator.clipboard?.writeText(url);
      this.sound.playUiClick();
      this.onToast(en ? `🔗 Invite copied: Match #${this.activeMatchId}` : `🔗 Link undangan disalin: Laga #${this.activeMatchId}`);
    });
    q('#btn-refresh-lobby')?.addEventListener('click', () => void this.handleRefreshMatch(en, draft));
    q('#btn-arena-start-early')?.addEventListener('click', () => void this.handleStartEarly(en, draft));
    q('#btn-arena-resume-pending')?.addEventListener('click', () => void this.handleResumePending(en, draft));
    const resetToSetup = () => {
      this.sound.playUiClick();
      this.stopPolling();
      this.snapshot = null;
      this.activeMatchId = null;
      this.syncSceneWithArena(draft);
      this.onRequestRender();
    };
    q('#btn-arena-new-match')?.addEventListener('click', resetToSetup);
    q('#btn-arena-win-new')?.addEventListener('click', resetToSetup);
    q('#btn-toggle-vault')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showVaultDrawer = !this.showVaultDrawer;
      this.onRequestRender();
    });
    q('#btn-toggle-proofs')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showProofDrawer = !this.showProofDrawer;
      this.onRequestRender();
    });
  }

  public bindModalEvents(modalRoot: HTMLElement, lang: AppLanguage): void {
    const en = lang === 'en';
    modalRoot.querySelector('#btn-close-faucets')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.closeFaucetsModal();
    });
    modalRoot.querySelector('#btn-modal-claim-cdod')?.addEventListener('click', () => {
      void this.handleClaimFaucet(en);
    });
    modalRoot.querySelectorAll<HTMLElement>('[data-copy-addr]').forEach((btn) => {
      btn.onclick = () => {
        const addr = btn.dataset.copyAddr || '';
        void navigator.clipboard?.writeText(addr);
        this.sound.playUiClick();
        this.onToast(`${en ? 'Copied' : 'Disalin'}: ${shortAddr(addr)}`);
      };
    });
  }

  private async withBusy(label: string, fn: () => Promise<void>): Promise<void> {
    this.busyLabel = label;
    this.onRequestRender();
    try {
      await fn();
    } catch (err) {
      this.onToast(err instanceof Error ? err.message : String(err));
    } finally {
      this.busyLabel = null;
      this.onRequestRender();
    }
  }

  private async handleConnect(en: boolean): Promise<void> {
    this.sound.playUiClick();
    await this.withBusy(en ? 'Connecting MetaMask & Sepolia FHEVM...' : 'Menghubungkan Wallet & Sepolia...', async () => {
      this.walletInfo = await this.fheClient.connectWallet();
      const tokenCfg = this.getSelectedTokenConfig();
      try {
        const st = await this.fheClient.readChipStatus(tokenCfg.address || undefined);
        this.chipHandle = st.encryptedBalanceHandle;
        this.isOperator = st.isArenaOperator;
      } catch {
        // Contracts may not be configured yet
      }
      this.onToast(en ? 'Wallet connected!' : 'Wallet terhubung!');
    });
  }

  private async handleClaimFaucet(en: boolean): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      this.sim.claimFaucet();
      this.onToast(en ? '✅ +100 cDOD minted in Preview!' : '✅ +100 cDOD di-mint di Preview!');
      this.onRequestRender();
      return;
    }
    await this.withBusy(en ? 'Claiming 100 cDOD onchain...' : 'Mengklaim 100 cDOD onchain...', async () => {
      await this.fheClient.claimChipFaucet();
      this.stakeTokenKind = 'cdod';
      const st = await this.fheClient.readChipStatus();
      this.chipHandle = st.encryptedBalanceHandle;
      this.isOperator = st.isArenaOperator;
      this.onToast(en ? '✅ Claimed 100 encrypted cDOD!' : '✅ Berhasil klaim 100 cDOD terenkripsi!');
    });
  }

  private async handleDecryptBalance(en: boolean): Promise<void> {
    this.sound.playUiClick();
    const tokenCfg = this.getSelectedTokenConfig();
    if (this.mode === 'preview') {
      this.sim.decryptBalance();
      this.onToast(
        en
          ? `🔓 Decrypted Preview ${tokenCfg.symbol} balance!`
          : `🔓 Saldo ${tokenCfg.symbol} Preview didekripsi!`,
      );
      this.onRequestRender();
      return;
    }
    await this.withBusy(en ? `Signing EIP-712 permit & decrypting ${tokenCfg.symbol}...` : `Menandatangani EIP-712 & dekripsi ${tokenCfg.symbol}...`, async () => {
      const res = await this.fheClient.decryptChipBalance(tokenCfg.address || undefined, tokenCfg.symbol);
      this.chipHandle = res.handle;
      this.chipClearMicro = res.clearMicro;
      this.onToast(en ? `🔓 Encrypted ${tokenCfg.symbol} balance unlocked!` : `🔓 Saldo ${tokenCfg.symbol} berhasil dibuka!`);
    });
  }

  private async handleApproveOperator(en: boolean): Promise<void> {
    this.sound.playUiClick();
    const tokenCfg = this.getSelectedTokenConfig();
    if (this.mode === 'preview') {
      this.sim.approveOperator();
      this.onRequestRender();
      return;
    }
    await this.withBusy(en ? `Approving Arena for ${tokenCfg.symbol}...` : `Menyetujui Arena untuk ${tokenCfg.symbol}...`, async () => {
      await this.fheClient.approveArenaOperator(tokenCfg.address || undefined, tokenCfg.symbol);
      this.isOperator = true;
      this.onToast(en ? `✅ ${tokenCfg.symbol} operator approved!` : `✅ Operator ${tokenCfg.symbol} disetujui!`);
    });
  }

  private async handleCreateMatch(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    const tokenCfg = this.getSelectedTokenConfig();
    if (this.mode === 'preview') {
      this.activeMatchId = this.sim.createMatch(this.boardMode, this.stakeTokens, this.maxPlayers);
      this.snapshot = this.sim.getSnapshot();
      this.syncSceneWithArena(draft);
      this.onToast(
        en
          ? `🎮 Confidential ${this.maxPlayers === 1 ? 'Solo' : `${this.maxPlayers}P`} Match started!`
          : `🎮 Laga Rahasia ${this.maxPlayers === 1 ? 'Solo' : `${this.maxPlayers}P`} dimulai!`,
      );
      this.onRequestRender();
      return;
    }
    await this.withBusy(en ? `Encrypting ${tokenCfg.symbol} stake & launching...` : `Mengenkripsi taruhan ${tokenCfg.symbol} & memulai...`, async () => {
      if (!this.fheClient.isConnected()) {
        this.walletInfo = await this.fheClient.connectWallet();
      }
      const { matchId } = await this.fheClient.createMatch({
        boardMode: this.boardMode,
        maxPlayers: this.maxPlayers,
        useChipStake: this.stakeTokens > 0,
        stakeWholeTokens: this.stakeTokens,
        stakeTokenAddress: tokenCfg.address || undefined,
        stakeSymbol: tokenCfg.symbol,
      });
      this.activeMatchId = matchId;
      this.snapshot = await this.fheClient.fetchMatchSnapshot(matchId, false);
      this.syncSceneWithArena(draft);
      this.onToast(
        this.snapshot.status === 0
          ? en
            ? `⏳ Lobby #${matchId} created! Share invite link.`
            : `⏳ Lobi #${matchId} dibuat! Bagikan link undangan.`
          : `✅ Match #${matchId} created onchain!`,
      );
    });
  }

  private async handleJoinMatch(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    const idNum = Number.parseInt(this.joinMatchInput.trim(), 10);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      this.onToast(en ? 'Enter a valid numeric Match ID.' : 'Masukkan Match ID angka yang valid.');
      return;
    }
    const targetId = BigInt(idNum);
    await this.withBusy(en ? `Checking Match #${idNum}...` : `Memeriksa Laga #${idNum}...`, async () => {
      if (!this.fheClient.isConnected()) {
        this.walletInfo = await this.fheClient.connectWallet();
      }
      const myAddr = this.walletInfo?.address?.toLowerCase() || '';
      const existingSnap = await this.fheClient.fetchMatchSnapshot(targetId, false);
      const alreadySeated = existingSnap.players.some((p) => p.address.toLowerCase() === myAddr);

      if (!alreadySeated && existingSnap.status === 0) {
        const isZeroToken =
          !existingSnap.stakeToken ||
          existingSnap.stakeToken === '0x0000000000000000000000000000000000000000';
        const wagerAmt = isZeroToken ? 0 : this.stakeTokens;
        if (!isZeroToken && wagerAmt > 0) {
          const tokSt = await this.fheClient.readChipStatus(existingSnap.stakeToken);
          if (!tokSt.isArenaOperator) {
            this.busyLabel = en ? 'Approving ERC-7984 Operator...' : 'Menyetujui Operator ERC-7984...';
            this.onRequestRender();
            await this.fheClient.approveArenaOperator(existingSnap.stakeToken, 'ERC-7984');
          }
        }
        this.busyLabel = en ? `Joining Match #${idNum}...` : `Bergabung ke Laga #${idNum}...`;
        this.onRequestRender();
        await this.fheClient.joinMatch(targetId, !isZeroToken && wagerAmt > 0, wagerAmt);
      }

      this.activeMatchId = targetId;
      this.snapshot = await this.fheClient.fetchMatchSnapshot(targetId, false);
      this.syncSceneWithArena(draft);
      this.onToast(
        alreadySeated
          ? en
            ? `🔓 Reconnected to Match #${idNum}`
            : `🔓 Terhubung kembali ke Laga #${idNum}`
          : en
            ? `✅ Joined Match #${idNum}!`
            : `✅ Bergabung ke Laga #${idNum}!`,
      );
    });
  }

  private async handleRefreshMatch(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (!this.activeMatchId || this.mode !== 'sepolia') return;
    await this.withBusy(en ? 'Syncing match state...' : 'Menyinkronkan status laga...', async () => {
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.syncSceneWithArena(draft);
    });
  }

  private async handleStartEarly(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (!this.activeMatchId || this.mode !== 'sepolia') return;
    await this.withBusy(en ? 'Starting multiplayer match...' : 'Memulai laga multiplayer...', async () => {
      await this.fheClient.startMatchEarly(this.activeMatchId!);
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.syncSceneWithArena(draft);
      this.sound.playTurnReady();
      this.onToast(en ? '🚀 Match started on Sepolia!' : '🚀 Laga dimulai di Sepolia!');
    });
  }

  private async handleResumePending(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (!this.activeMatchId || this.mode !== 'sepolia') return;
    await this.withBusy(en ? 'Resuming pending KMS proof...' : 'Melanjutkan bukti KMS tertunda...', async () => {
      const moverAddr =
        this.snapshot?.players[this.snapshot.turnIndex]?.address ||
        this.walletInfo?.address ||
        '';
      const res = await this.fheClient.resumePendingAction(this.activeMatchId!);
      const nextSnap = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.snapshot = nextSnap;
      if (res.roll && res.roll.dieValue > 0) {
        this.isAnimatingRoll = true;
        this.onRequestRender();
        await this.animateRollOutcome(nextSnap, draft, moverAddr || nextSnap.players[0]?.address || '', res.roll);
        this.onToast(this.formatRollOutcomeToast(en, res.roll));
      } else {
        this.syncSceneWithArena(draft);
        if (res.actionKind === 3) {
          this.onToast(
            res.duelOutcome === 1
              ? '✅ Blind Duel Won!'
              : res.duelOutcome === 2
                ? '❌ Blind Duel Lost!'
                : '🤝 Blind Duel Tie!',
          );
        } else if (res.actionKind === 4) {
          this.onToast(
            res.missionPassed
              ? '🏆 Secret Mission verified (+3 ★ +1 Shield)!'
              : en
                ? 'Mission criteria not met yet.'
                : 'Syarat misi belum terpenuhi.',
          );
        } else {
          this.onToast(en ? '✅ Pending KMS proof finalized!' : '✅ Bukti KMS selesai diverifikasi!');
        }
      }
    });
  }

  private async handleUnlockSecrets(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      this.sim.decryptSecrets();
      this.snapshot = this.sim.getSnapshot();
      this.syncSceneWithArena(draft);
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? 'Decrypting private FHE handles...' : 'Mendekripsi handle rahasia FHE...', async () => {
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, true);
      this.syncSceneWithArena(draft);
    });
  }

  private formatRollOutcomeToast(
    en: boolean,
    res: {
      dieValue: number;
      finalPos: number;
      trapTriggered: number;
      shieldBlocked: boolean;
      ladderTo: number;
      snakeTo: number;
      usedBrake?: boolean;
    },
  ): string {
    const brakeTag = res.usedBrake ? (en ? ' [Cursed Brake ≤3]' : ' [Kutukan Rem ≤3]') : '';
    if (res.trapTriggered === GOLDEN_WARP_KIND) {
      return `⚡ ${en ? 'Golden Warp Shortcut! +3 steps +1★' : 'Golden Warp Rahasia! +3 langkah +1★'} (🎲 ${res.dieValue}${brakeTag})`;
    }
    if (res.trapTriggered > 0) {
      return `💥 ${en ? `FHE Trap #${res.trapTriggered} hit!` : `Kena Jebakan #${res.trapTriggered}!`} 🎲 ${res.dieValue}${brakeTag}`;
    }
    if (res.shieldBlocked) {
      return `🛡️ ${en ? 'Confidential Shield blocked Snake!' : 'Perisai Rahasia menahan Ular!'} 🎲 ${res.dieValue}${brakeTag}`;
    }
    if (res.ladderTo > 0) {
      this.sound.playLadderClimb();
      return `🪜 ${en ? `Climbed ladder to #${res.ladderTo}!` : `Naik tangga ke #${res.ladderTo}!`} 🎲 ${res.dieValue}${brakeTag}`;
    }
    if (res.snakeTo > 0) {
      return `🐍 ${en ? `Bitten down to #${res.snakeTo}!` : `Digigit ular ke #${res.snakeTo}!`} 🎲 ${res.dieValue}${brakeTag}`;
    }
    return `🎲 FHE Dice: ${res.dieValue}${brakeTag} → #${res.finalPos}`;
  }

  private async handleRollDice(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      await this.withBusy(en ? 'Rolling 3D FHE Dice...' : 'Mengocok Dadu 3D FHE...', async () => {
        const res = this.sim.rollDice();
        this.isAnimatingRoll = true;
        this.snapshot = this.sim.getSnapshot();
        await this.animateRollOutcome(this.snapshot, draft, this.sim.getAddress(), res);
        this.sound.playDiceLand();
        this.onToast(this.formatRollOutcomeToast(en, res));

        // Simulate multiplayer FHE Rival bots taking turns sequentially
        while (this.sim.getSnapshot().status === 1 && this.sim.getSnapshot().turnIndex !== 0) {
          this.busyLabel = en ? 'FHE Rival Bot Rolling...' : 'Bot Lawan FHE Mengocok Dadu...';
          this.onRequestRender();
          await new Promise((r) => setTimeout(r, 320));
          const botRes = this.sim.stepBotTurn();
          if (!botRes) break;
          this.isAnimatingRoll = true;
          this.snapshot = this.sim.getSnapshot();
          await this.animateRollOutcome(this.snapshot, draft, botRes.actorAddr, botRes);
          if (botRes.trapTriggered >= 1 && botRes.trapTriggered <= 3) {
            this.onToast(
              en
                ? `💥 P${botRes.botNumber} stepped on YOUR Secret Trap (#${botRes.trapTriggered})!`
                : `💥 P${botRes.botNumber} menginjak Jebakan Rahasiamu (#${botRes.trapTriggered})!`,
            );
          } else if (botRes.trapTriggered === GOLDEN_WARP_KIND) {
            this.onToast(en ? `⚡ P${botRes.botNumber} hit Golden Warp!` : `⚡ P${botRes.botNumber} kena Golden Warp!`);
          }
        }
      });
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? '1/3 Requesting onchain FHE dice...' : '1/3 Meminta dadu FHE onchain...', async () => {
      const moverAddr =
        this.snapshot?.players[this.snapshot.turnIndex]?.address ||
        this.walletInfo?.address ||
        '';
      const res = await this.fheClient.rollVerifiableDice(this.activeMatchId!, (stage) => {
        const labels: Record<string, string> = {
          requesting: en ? '1/3 Onchain FHE.randEuint32...' : '1/3 FHE.randEuint32 onchain...',
          decrypting_dice: en ? '2/3 Fetching KMS publicDecrypt proof...' : '2/3 Mengambil bukti KMS publicDecrypt...',
          verifying_dice: en ? '3/3 Verifying FHE.checkSignatures...' : '3/3 Verifikasi FHE.checkSignatures...',
          decrypting_trap: en ? 'Evaluating encrypted Secret Traps...' : 'Mengevaluasi Jebakan Rahasia terenkripsi...',
          verifying_trap: en ? 'Finalizing homomorphic trap/shield proof...' : 'Memverifikasi bukti jebakan/perisai...',
        };
        this.busyLabel = labels[stage] || null;
        this.onRequestRender();
      });
      const nextSnap = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.isAnimatingRoll = true;
      this.snapshot = nextSnap;
      this.busyLabel = en ? 'Animating 3D Board Turn...' : 'Memainkan Animasi Papan 3D...';
      this.onRequestRender();
      await this.animateRollOutcome(nextSnap, draft, moverAddr || nextSnap.players[0]?.address || '', res);
      this.sound.playDiceLand();
      this.onToast(this.formatRollOutcomeToast(en, res));
    });
  }

  private async handlePlantTrap(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      try {
        this.sim.plantTrap(this.trapTileInput, this.trapKindInput);
        this.snapshot = this.sim.getSnapshot();
        this.syncSceneWithArena(draft);
        this.onToast(en ? `💣 Secret Trap hidden on Tile ${this.trapTileInput}!` : `💣 Jebakan rahasia ditanam di Kotak ${this.trapTileInput}!`);
      } catch (e) {
        this.onToast(e instanceof Error ? e.message : String(e));
      }
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? 'Encrypting & planting Secret Trap...' : 'Mengenkripsi & menanam Jebakan Rahasia...', async () => {
      await this.fheClient.plantSecretTrap(this.activeMatchId!, this.trapTileInput, this.trapKindInput);
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, true);
      this.syncSceneWithArena(draft);
      this.onToast(en ? '💣 Encrypted Secret Trap planted!' : '💣 Jebakan Rahasia terenkripsi ditanam!');
    });
  }

  private async handleBuyMystery(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      try {
        this.sim.buyMysteryItem();
        this.snapshot = this.sim.getSnapshot();
        this.syncSceneWithArena(draft);
        this.sound.playItemUse();
        this.onToast(en ? '🎁 Mystery item encrypted in your bag!' : '🎁 Item misteri masuk ke tas rahasiamu!');
      } catch (e) {
        this.onToast(e instanceof Error ? e.message : String(e));
      }
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? 'Rolling encrypted Mystery Item...' : 'Mengundi Item Misteri terenkripsi...', async () => {
      await this.fheClient.buyEncryptedMysteryItem(this.activeMatchId!);
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, true);
      this.syncSceneWithArena(draft);
      this.sound.playItemUse();
    });
  }

  private async handleCastBrake(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      try {
        this.sim.castSecretBrake(this.brakeSeatInput);
        this.snapshot = this.sim.getSnapshot();
        this.syncSceneWithArena(draft);
        this.sound.playItemUse();
        this.onToast(
          en
            ? this.snapshot.players.length > 1
              ? '🧊 Secret Brake cast on rival seat (next roll ≤ 3)!'
              : '🧊 Secret Brake cast! Next roll secretly capped to 1..3.'
            : this.snapshot.players.length > 1
              ? '🧊 Rem Rahasia dilempar ke lawan (dadu berikutnya ≤ 3)!'
              : '🧊 Rem Rahasia aktif! Lemparan dadu berikutnya maksimal 3.',
        );
      } catch (e) {
        this.onToast(e instanceof Error ? e.message : String(e));
      }
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId || !this.snapshot) return;
    const myAddr = this.walletInfo?.address?.toLowerCase() || '';
    const candidate = this.snapshot.players[this.brakeSeatInput];
    const targetSeat =
      candidate && candidate.address.toLowerCase() !== myAddr
        ? this.brakeSeatInput
        : this.snapshot.players.findIndex((p) => p.address.toLowerCase() !== myAddr);
    if (targetSeat < 0) {
      this.onToast(en ? 'Requires at least 1 rival player.' : 'Butuh minimal 1 pemain lawan.');
      return;
    }
    await this.withBusy(en ? 'Encrypting Secret Brake curse...' : 'Mengenkripsi kutukan Rem Rahasia...', async () => {
      await this.fheClient.castSecretBrake(this.activeMatchId!, targetSeat);
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.syncSceneWithArena(draft);
      this.sound.playItemUse();
      this.onToast(
        en
          ? '🧊 Encrypted Secret Brake cast on rival seat!'
          : '🧊 Rem Rahasia terenkripsi dilempar ke kursi lawan!',
      );
    });
  }

  private async handleBlindDuel(
    en: boolean,
    draft: ArenaPlayerDraft,
    choice: 0 | 1 | 2,
  ): Promise<void> {
    this.sound.playUiClick();
    this.showBlindDuelModal = false;
    if (this.mode === 'preview') {
      const icons = ['🪨', '📄', '✂️'];
      const res = this.sim.playBlindDuel(choice);
      const matchup = `${icons[choice] ?? '🪨'} vs ${icons[res.houseChoice] ?? '✂️'}`;
      this.snapshot = this.sim.getSnapshot();
      this.syncSceneWithArena(draft);
      this.onToast(
        res.outcome === 1
          ? en
            ? `✅ ${matchup} — Blind Duel Won (+2 ★)!`
            : `✅ ${matchup} — Menang Duel Buta (+2 ★)!`
          : res.outcome === 0
            ? en
              ? `🤝 ${matchup} — Blind Duel Tie (+1 ★)!`
              : `🤝 ${matchup} — Seri Duel Buta (+1 ★)!`
            : en
              ? `❌ ${matchup} — Rival Won (-1 ★)!`
              : `❌ ${matchup} — Lawan Menang (-1 ★)!`,
      );
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? 'Encrypting Blind Duel move...' : 'Mengenkripsi langkah Duel Buta...', async () => {
      const myLow = this.walletInfo?.address?.toLowerCase() || '';
      const duel = this.snapshot?.duel;
      const oppAddr = duel?.active
        ? duel.challenger.toLowerCase() === myLow
          ? duel.opponent
          : duel.challenger
        : (this.duelOpponentInput as `0x${string}`);
      const res = await this.fheClient.playBlindDuel(
        this.activeMatchId!,
        oppAddr,
        choice,
      );
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.syncSceneWithArena(draft);
      this.onToast(
        res.outcome === 1
          ? '✅ Blind Duel Won (+2 ★)!'
          : res.outcome === 0
            ? '🤝 Blind Duel Tie (+1 ★)!'
            : res.outcome === 2
              ? '❌ Blind Duel Lost!'
              : '⏳ Encrypted move committed! Waiting opponent.',
      );
    });
  }

  private async handleVerifyMission(en: boolean, draft: ArenaPlayerDraft): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      const passed = this.sim.verifySecretMission();
      this.snapshot = this.sim.getSnapshot();
      this.syncSceneWithArena(draft);
      this.onToast(
        passed
          ? en
            ? '🏆 Secret Mission verified (+3 ★ +1 Shield)!'
            : '🏆 Misi Rahasia terverifikasi (+3 ★ +1 Perisai)!'
          : en
            ? 'Mission criteria not met yet.'
            : 'Syarat misi belum terpenuhi.',
      );
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? 'Verifying Secret Mission homomorphically...' : 'Memverifikasi Misi Rahasia secara homomorfik...', async () => {
      const res = await this.fheClient.verifySecretMission(this.activeMatchId!);
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, true);
      this.syncSceneWithArena(draft);
      this.onToast(
        res.passed
          ? en
            ? '🏆 Secret Mission verified (+3 ★ +1 Shield)!'
            : '🏆 Misi Rahasia terverifikasi (+3 ★ +1 Perisai)!'
          : en
            ? 'Mission criteria not met yet.'
            : 'Syarat misi belum terpenuhi.',
      );
    });
  }

  private async handleClaimPot(en: boolean): Promise<void> {
    this.sound.playUiClick();
    if (this.mode === 'preview') {
      this.sim.claimPayout();
      this.snapshot = this.sim.getSnapshot();
      this.sound.playConfettiFanfare();
      this.onToast(en ? '💰 Encrypted ERC-7984 pot paid out!' : '💰 Pot ERC-7984 dibayarkan!');
      this.onRequestRender();
      return;
    }
    if (!this.activeMatchId) return;
    await this.withBusy(en ? 'Transferring encrypted ERC-7984 pot...' : 'Mentransfer pot ERC-7984 terenkripsi...', async () => {
      await this.fheClient.claimMatchPayout(this.activeMatchId!);
      this.snapshot = await this.fheClient.fetchMatchSnapshot(this.activeMatchId!, false);
      this.sound.playConfettiFanfare();
      this.onToast(en ? '💰 Confidential pot transferred!' : '💰 Pot rahasia ditransfer!');
    });
  }
}
