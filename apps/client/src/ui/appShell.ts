import {
  ACCESSORY_META,
  ARCHETYPE_REGISTRY,
  BOARD_LAYOUT,
  GAME_MODE_META,
  ITEM_META,
  PAWN_META,
  PLAYER_COLORS,
  PLAYABLE_TILE_ARCHETYPES,
  STAR_SHOP_COST,
  getPlayerShopCost,
  previewDiceLanding,
  type AccessoryId,
  type ActiveChallenge,
  type BotDifficulty,
  type ChallengeArchetype,
  type CreatePlayerInput,
  type EmoteId,
  type GameEvent,
  type GameModePreset,
  type GameState,
  type ItemType,
  type PawnId,
  type Player,
  type PlayerColorId,
  type RoomStatePayload,
} from '@doodle-dash/shared';
import type { DoodleSceneManager, SceneDebugStats } from '../scene/sceneManager.js';
import { PawnPreviewStage } from '../scene/pawnPreview.js';
import type { DoodleSoundEngine } from '../audio/soundEngine.js';
import { CLIENT_CHALLENGE_RENDERERS } from '../challenges/challengeRenderer.js';
import {
  renderAccessorySvg,
  renderItemSvg,
  renderPawnAvatarSvg,
  renderUiIconSvg,
} from '../challenges/doodleIcons.js';
import { LocalGameController, buildBotPlayers } from '../controllers/localGameController.js';
import { OnlineGameController } from '../controllers/onlineGameController.js';
import type { GameSessionController, SessionCallbacks } from '../controllers/gameTypes.js';

type ScreenKind = 'splash' | 'menu' | 'online_setup' | 'local_setup' | 'bot_setup' | 'lobby' | 'game';

interface AccessibilitySettings {
  muted: boolean;
  musicEnabled: boolean;
  volume: number;
  colorblindMode: boolean;
  largeText: boolean;
  reducedMotion: boolean;
}

interface CareerStats {
  matches: number;
  wins: number;
  starsEarned: number;
  challengesWon: number;
}

const SETTINGS_STORAGE_KEY = 'doodle_dash_settings_v3';
const CAREER_STORAGE_KEY = 'doodle_dash_career_v1';

const EMOTE_LIST: Array<{ id: EmoteId; icon: string; label: string }> = [
  { id: 'jempol', icon: '👍', label: 'Mantap!' },
  { id: 'ketawa', icon: '😂', label: 'Wkwk!' },
  { id: 'kaget', icon: '😱', label: 'Waduh!' },
  { id: 'nangis', icon: '😭', label: 'Huwaa!' },
  { id: 'api', icon: '🔥', label: 'Gass!' },
  { id: 'mahkota', icon: '👑', label: 'Juara!' },
];

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pawnSvg(
  pawnId: PawnId,
  colorId: PlayerColorId = 'kuning',
  size = 26,
  accessory: AccessoryId = 'none',
): string {
  return renderPawnAvatarSvg(pawnId, PLAYER_COLORS[colorId].hex, size, accessory);
}

export class DoodleAppShell {
  private readonly root: HTMLElement;
  private readonly scene: DoodleSceneManager;
  private readonly sound: DoodleSoundEngine;
  private readonly debugEnabled: boolean;

  private mainLayer!: HTMLElement;
  private overlayLayer!: HTMLElement;
  private challengeLayer!: HTMLElement;
  private modalLayer!: HTMLElement;

  private screen: ScreenKind = 'splash';
  private controller: GameSessionController | null = null;
  private onlineController: OnlineGameController | null = null;
  private roomState: RoomStatePayload | null = null;
  private gameState: GameState | null = null;
  private showHowToPlay = false;
  private showSettings = false;
  private emoteTrayOpen = false;
  private feedOpen = true;
  private speed2x = false;
  private isAnimating = false;
  private toastMessage: string | null = null;
  private toastTimer: number | null = null;
  private turnBannerText: string | null = null;
  private turnBannerTimer: number | null = null;
  private floatingEmoteText: string | null = null;
  private floatingEmoteTimer: number | null = null;
  private debugStats: SceneDebugStats = { fps: 60, drawCalls: 0, triangles: 0 };
  private activityFeed: string[] = [];

  private activeChallengeModal: {
    challenge: ActiveChallenge;
    localParticipantId: string;
    cleanup?: () => void;
    duelPicked?: boolean;
    stamp?: { success: boolean; summary: string };
  } | null = null;
  private renderedChallengeKey = 'none';
  private renderedModalKey = 'none';
  private challengeTimerRaf = 0;

  // Player setup drafts
  private draftName = 'Pemain Kece';
  private draftPawn: PawnId = 'kucing';
  private draftColor: PlayerColorId = 'pink';
  private draftAccessory: AccessoryId = 'none';
  private draftRoomCode = '';
  private draftBotCount = 3;
  private draftBotDiff: BotDifficulty = 'pintar';
  private draftLobbyBotDiff: BotDifficulty = 'pintar';
  private draftRulePreset: GameModePreset = 'klasik';
  private draftLocalCount = 2;
  private draftLocalNames = ['Mochi', 'Koko', 'Wekwek', 'Boba', 'Roro', 'Toady'];
  private draftLocalPawns: PawnId[] = ['kucing', 'kodok', 'bebek', 'panda', 'dino', 'jamur'];
  private draftLocalColors: PlayerColorId[] = ['pink', 'kuning', 'mint', 'biru', 'oranye', 'ungu'];
  private draftLocalAccessories: AccessoryId[] = ['flower', 'scarf', 'headset', 'glasses', 'crown', 'backpack'];

  private studioContext: {
    mode: 'profile' | 'local' | 'lobby';
    localIndex?: number;
    name: string;
    pawn: PawnId;
    color: PlayerColorId;
    accessory: AccessoryId;
  } | null = null;
  private studioPreviewStage: PawnPreviewStage | null = null;

  private settings: AccessibilitySettings;
  private career: CareerStats;
  private recordedMatchKey: string | null = null;
  private turnCountdownInterval: number | null = null;
  private displayedStars = new Map<string, number>();
  private starTickerId: number | null = null;
  private readonly colorShapes: Record<PlayerColorId, string> = {
    pink: '●',
    kuning: '▲',
    mint: '■',
    biru: '★',
    oranye: '◆',
    ungu: '✚',
  };

  constructor(root: HTMLElement, scene: DoodleSceneManager, sound: DoodleSoundEngine) {
    this.root = root;
    this.scene = scene;
    this.sound = sound;

    const search = new URLSearchParams(window.location.search);
    this.debugEnabled = search.get('debug') === '1';
    const inviteCode = search.get('room')?.trim().toUpperCase() ?? '';
    if (/^[A-Z]{4}$/.test(inviteCode)) {
      this.draftRoomCode = inviteCode;
      this.screen = 'online_setup';
    }

    this.settings = this.loadSettings();
    this.career = this.loadCareer();
    this.applyAccessibilitySettings();

    // Persistent 4-layer DOM prevents background updates from wiping active mini-games
    this.root.innerHTML = `
      <div id="layer-main"></div>
      <div id="overlay-slot"></div>
      <div id="layer-challenge"></div>
      <div id="layer-modals"></div>
    `;
    this.mainLayer = this.root.querySelector<HTMLElement>('#layer-main')!;
    this.overlayLayer = this.root.querySelector<HTMLElement>('#overlay-slot')!;
    this.challengeLayer = this.root.querySelector<HTMLElement>('#layer-challenge')!;
    this.modalLayer = this.root.querySelector<HTMLElement>('#layer-modals')!;

    this.scene.setSpeedChangeCallback((enabled) => {
      this.speed2x = enabled;
      this.renderOverlaysOnly();
    });

    this.scene.setDebugStatsCallback((stats) => {
      this.debugStats = stats;
      const statsEl = this.mainLayer.querySelector<HTMLElement>('#debug-stats');
      if (statsEl) {
        statsEl.textContent = `FPS: ${stats.fps} | Draw: ${stats.drawCalls} | Tri: ${stats.triangles} | v${this.gameState?.stateVersion ?? 0}`;
      }
    });

    const unlockAudio = () => {
      this.sound.unlock();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('keydown', this.handleGlobalKeyDown);
    this.render();
  }

  private loadSettings(): AccessibilitySettings {
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const defaults: AccessibilitySettings = {
      muted: false,
      musicEnabled: true,
      volume: 0.72,
      colorblindMode: false,
      largeText: false,
      reducedMotion: prefersReduced,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<AccessibilitySettings>) } : defaults;
    } catch {
      return defaults;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota errors
    }
  }

  private loadCareer(): CareerStats {
    const defaults: CareerStats = { matches: 0, wins: 0, starsEarned: 0, challengesWon: 0 };
    try {
      const raw = localStorage.getItem(CAREER_STORAGE_KEY);
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<CareerStats>) } : defaults;
    } catch {
      return defaults;
    }
  }

  private saveCareer(): void {
    try {
      localStorage.setItem(CAREER_STORAGE_KEY, JSON.stringify(this.career));
    } catch {
      // Ignore storage quota errors
    }
  }

  private recordCareerIfFinished(state: GameState): void {
    if (state.phase !== 'GAME_OVER' || !state.winnerId) return;
    const key = `${state.matchSeed}:${state.winnerId}`;
    if (this.recordedMatchKey === key) return;
    this.recordedMatchKey = key;

    const myId = this.controller?.getLocalPlayerId();
    const myPlayer = myId ? state.players.find((p) => p.id === myId) : undefined;
    this.career.matches += 1;
    if (myPlayer && !this.controller?.isSpectator()) {
      if (state.winnerId === myPlayer.id) this.career.wins += 1;
      this.career.starsEarned += myPlayer.stars;
      this.career.challengesWon += myPlayer.stats.challengesWon;
    }
    this.saveCareer();
  }

  private applyAccessibilitySettings(): void {
    this.sound.setMuted(this.settings.muted);
    this.sound.setVolume(this.settings.volume);
    this.sound.setMusicEnabled(this.settings.musicEnabled);
    this.scene.setReducedMotion(this.settings.reducedMotion);
    document.body.classList.toggle('large-text', this.settings.largeText);
    document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
    document.body.classList.toggle('colorblind-mode', this.settings.colorblindMode);
    this.saveSettings();
  }

  private pushActivity(line: string): void {
    this.activityFeed.unshift(line);
    if (this.activityFeed.length > 10) {
      this.activityFeed.length = 10;
    }
  }

  private ingestEventsIntoFeed(events: GameEvent[], state: GameState): void {
    const playerOf = (id: string) => state.players.find((p) => p.id === id);
    const nameOf = (id: string) => playerOf(id)?.name ?? 'Pemain';
    for (const ev of events) {
      if (ev.type === 'DiceRolled') {
        const vals = ev.diceValues.join(' & ');
        const tag = ev.usedTurbo ? ' (+2 Turbo!)' : ev.usedBrake ? ' (Rem)' : '';
        const p = playerOf(ev.playerId);
        const hopNote = p?.pawn === 'kodok' && ev.diceValues.length === 1 && ev.diceValues[0] === 1 ? ' (+1 Lompatan Kodok!)' : '';
        this.pushActivity(`🎲 ${nameOf(ev.playerId)} lempar ${vals}${tag}${hopNote}`);
      } else if (ev.type === 'LadderClimbed') {
        const p = playerOf(ev.playerId);
        const bonus = p?.pawn === 'kucing' ? ' (+1★ Kaki Gesit!)' : '';
        this.pushActivity(`🪜 ${nameOf(ev.playerId)} naik tangga ${ev.from}→${ev.to}!${bonus}`);
      } else if (ev.type === 'SnakeBitten') {
        const p = playerOf(ev.playerId);
        const luckyNote = p?.pawn === 'jamur' ? ' (+1★ Aura Hoki!)' : '';
        if (ev.dodgedByChallenge) {
          this.pushActivity(`😄 ${nameOf(ev.playerId)} bikin ular ketawa di ${ev.from}!${luckyNote}`);
        } else if (ev.blockedByShield) {
          this.pushActivity(`🛡️ ${nameOf(ev.playerId)} tangkis gigitan ular!${luckyNote}`);
        } else {
          this.pushActivity(`🐍 ${nameOf(ev.playerId)} tergigit ular ${ev.from}→${ev.to}`);
        }
      } else if (ev.type === 'ItemUsed') {
        this.pushActivity(`Item: ${ev.effectDescription}`);
      } else if (ev.type === 'ItemGained') {
        const shopTag = ev.source === 'star_shop' ? ` (-${ev.starsCost ?? STAR_SHOP_COST}★)` : '';
        this.pushActivity(`${nameOf(ev.playerId)} dapat ${ITEM_META[ev.item].name}${shopTag}`);
      } else if (ev.type === 'ChallengeResolved' && ev.serverSummaryText.includes('Kombo')) {
        this.pushActivity(ev.serverSummaryText);
      } else if (ev.type === 'TurnSkipped') {
        this.pushActivity(`⏭️ ${nameOf(ev.playerId)} lewat 1 giliran`);
      } else if (ev.type === 'GameWon') {
        this.pushActivity(`🏆 ${nameOf(ev.winnerId)} MENANG!!`);
      }
    }
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastMessage = null;
      this.renderOverlaysOnly();
    }, 3200);
    this.renderOverlaysOnly();
  }

  private createSessionCallbacks(): SessionCallbacks {
    return {
      onStateChange: (state) => {
        this.gameState = state;
        if (state && this.screen !== 'game') {
          this.studioPreviewStage?.dispose();
          this.studioPreviewStage = null;
          this.studioContext = null;
          this.scene.setExternalPause(false);
          this.screen = 'game';
          this.activityFeed = [];
        }
        if (state) {
          this.recordCareerIfFinished(state);
        }
        this.render();
      },
      onEvents: async (events, finalState) => {
        this.ingestEventsIntoFeed(events, finalState);
        this.isAnimating = true;
        this.renderOverlaysOnly();
        await this.scene.enqueueEvents(events, finalState);
        this.isAnimating = false;
        this.gameState = finalState;
        this.recordCareerIfFinished(finalState);
        this.render();
      },
      onChallengePrompt: (challenge, localParticipantId) => {
        const sameDuel =
          this.activeChallengeModal &&
          this.activeChallengeModal.challenge.tileId === challenge.tileId &&
          this.activeChallengeModal.challenge.seed === challenge.seed &&
          this.activeChallengeModal.duelPicked;
        if (sameDuel) {
          this.activeChallengeModal!.challenge = challenge;
          this.renderChallengeLayerIfNeeded();
          return;
        }
        this.activeChallengeModal?.cleanup?.();
        const isOwner = challenge.ownerPlayerId === localParticipantId;
        this.activeChallengeModal = {
          challenge,
          localParticipantId,
          duelPicked: challenge.mode !== 'duel' || !isOwner,
        };
        this.renderChallengeLayerIfNeeded();
      },
      onChallengeStamp: (success, summary) => {
        this.activeChallengeModal?.cleanup?.();
        cancelAnimationFrame(this.challengeTimerRaf);
        if (this.activeChallengeModal) {
          this.activeChallengeModal.stamp = { success, summary };
        } else {
          this.activeChallengeModal = {
            challenge: this.gameState?.activeChallenge ?? {
              tileId: 1,
              archetype: 'gift_trap',
              mode: 'solo',
              difficulty: 1,
              title: 'Giliran Bot',
              flavorText: summary,
              seed: 1,
              params: {},
              reward: { stars: 0, bonusType: 'none' },
              penalty: { type: 'none' },
              ownerPlayerId: '',
              participantIds: [],
              submissions: {},
              deadlineAt: Date.now() + 2000,
              durationMs: 2000,
            },
            localParticipantId: '',
            duelPicked: true,
            stamp: { success, summary },
          };
        }
        if (success) this.sound.playChallengeSuccess();
        else this.sound.playChallengeFail();
        this.renderChallengeLayerIfNeeded();
      },
      onChallengeClose: () => {
        this.activeChallengeModal?.cleanup?.();
        cancelAnimationFrame(this.challengeTimerRaf);
        this.activeChallengeModal = null;
        this.renderChallengeLayerIfNeeded();
      },
      onRoomState: (room) => {
        this.roomState = room;
        this.draftRulePreset = room.rulePreset;
        if (!room.inGame && this.screen !== 'lobby' && this.onlineController) {
          this.screen = 'lobby';
          this.gameState = null;
        }
        this.render();
      },
      onEmote: (playerId, emoteId) => {
        const player = this.gameState?.players.find((p) => p.id === playerId);
        const em = EMOTE_LIST.find((e) => e.id === emoteId);
        this.floatingEmoteText = `${player?.name ?? 'Pemain'}: ${em?.icon ?? ''} ${em?.label ?? ''}`;
        this.sound.playUiClick();
        if (this.floatingEmoteTimer) clearTimeout(this.floatingEmoteTimer);
        this.renderOverlaysOnly();
        this.floatingEmoteTimer = window.setTimeout(() => {
          this.floatingEmoteText = null;
          this.renderOverlaysOnly();
        }, 2200);
      },
      onError: (msg) => this.showToast(msg),
      onTurnBanner: (playerName) => {
        this.turnBannerText = `Giliran ${playerName}!`;
        if (this.turnBannerTimer) clearTimeout(this.turnBannerTimer);
        this.renderOverlaysOnly();
        this.turnBannerTimer = window.setTimeout(() => {
          this.turnBannerText = null;
          this.renderOverlaysOnly();
        }, 1600);
      },
      onExitToMenu: () => {
        if (this.turnCountdownInterval) {
          clearInterval(this.turnCountdownInterval);
          this.turnCountdownInterval = null;
        }
        if (this.starTickerId !== null) {
          clearInterval(this.starTickerId);
          this.starTickerId = null;
        }
        this.displayedStars.clear();
        this.activeChallengeModal?.cleanup?.();
        cancelAnimationFrame(this.challengeTimerRaf);
        this.activeChallengeModal = null;
        this.renderedChallengeKey = 'none';
        this.studioPreviewStage?.dispose();
        this.studioPreviewStage = null;
        this.studioContext = null;
        this.scene.setExternalPause(false);
        this.controller = null;
        this.onlineController = null;
        this.roomState = null;
        this.gameState = null;
        this.activityFeed = [];
        this.scene.setPreferredCameraMode('overview');
        this.screen = 'menu';
        this.render();
      },
    };
  }

  private readonly handleGlobalKeyDown = (e: KeyboardEvent): void => {
    if (
      this.screen !== 'game' ||
      this.activeChallengeModal ||
      this.showHowToPlay ||
      this.showSettings ||
      !this.gameState ||
      this.isAnimating
    ) {
      return;
    }
    const targetTag = (e.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

    const activeId = this.gameState.turnOrder[this.gameState.currentTurnIndex];
    const localId = this.controller?.getLocalPlayerId();
    const isMyTurn = !this.controller?.isSpectator() && activeId === localId;
    if (!isMyTurn) return;

    if (e.code === 'Space' && this.gameState.phase === 'TURN_BEGIN') {
      e.preventDefault();
      this.sound.playUiClick();
      this.controller?.rollDice();
    } else if (this.gameState.phase === 'ROLL' && this.gameState.pendingRoll) {
      if (e.key === '1') {
        e.preventDefault();
        this.sound.playUiClick();
        this.controller?.selectDice(0);
      } else if (e.key === '2' && this.gameState.pendingRoll.diceValues.length > 1) {
        e.preventDefault();
        this.sound.playUiClick();
        this.controller?.selectDice(1);
      }
    }
  };

  private renderOverlaysOnly(): void {
    if (!this.overlayLayer) return;
    this.overlayLayer.innerHTML = this.renderTransientOverlaysHtml();
    this.bindTransientEvents();
  }

  private renderTransientOverlaysHtml(): string {
    return `
      ${this.turnBannerText ? `<div class="turn-banner">${escapeHtml(this.turnBannerText)}</div>` : ''}
      ${this.floatingEmoteText ? `<div class="floating-emote">${escapeHtml(this.floatingEmoteText)}</div>` : ''}
      ${this.toastMessage ? `<div class="floating-emote" style="background:var(--pink)">${escapeHtml(this.toastMessage)}</div>` : ''}
      ${
        this.isAnimating
          ? `<div class="anim-controls-pill">
               <button class="doodle-btn" id="btn-speed-2x">${this.speed2x ? '⏩ 2x Aktif' : '⏩ Percepat 2x'}</button>
               <button class="doodle-btn" id="btn-skip-anim">⏭️ Lewati</button>
             </div>`
          : ''
      }
    `;
  }

  public render(): void {
    this.scene.setShowcaseMode(this.screen !== 'game');
    this.renderMainLayer();
    this.renderOverlaysOnly();
    this.renderChallengeLayerIfNeeded();
    this.renderModalsLayer();
  }

  private renderMainLayer(): void {
    if (this.turnCountdownInterval) {
      clearInterval(this.turnCountdownInterval);
      this.turnCountdownInterval = null;
    }

    let mainHtml = '';
    if (this.screen === 'splash') mainHtml = this.renderSplash();
    else if (this.screen === 'menu') mainHtml = this.renderMenu();
    else if (this.screen === 'online_setup') mainHtml = this.renderOnlineSetup();
    else if (this.screen === 'local_setup') mainHtml = this.renderLocalSetup();
    else if (this.screen === 'bot_setup') mainHtml = this.renderBotSetup();
    else if (this.screen === 'lobby') mainHtml = this.renderLobby();
    else if (this.screen === 'game') mainHtml = this.renderGameHud();

    this.mainLayer.innerHTML = `
      ${mainHtml}
      ${this.debugEnabled && this.screen === 'game' ? this.renderDebugPanel() : ''}
    `;

    this.bindMainEvents();

    if (this.screen === 'game') {
      this.startTurnCountdown();
      this.syncStarCounters();
    }
  }

  private renderModalsLayer(): void {
    const studioKey = this.studioContext
      ? `studio:${this.studioContext.mode}:${this.studioContext.localIndex ?? ''}`
      : 'no-studio';
    const key = [
      studioKey,
      this.gameState?.phase === 'GAME_OVER' ? `podium:${this.gameState.winnerId}` : 'no-pod',
      this.showHowToPlay ? 'howto' : '',
      this.showSettings ? `set:${this.settings.muted}:${this.settings.musicEnabled}:${Math.round(this.settings.volume * 100)}:${this.settings.colorblindMode}:${this.settings.largeText}:${this.settings.reducedMotion}` : '',
    ].join('|');
    if (key === this.renderedModalKey) return;
    this.renderedModalKey = key;

    if (!this.studioContext && this.studioPreviewStage) {
      this.studioPreviewStage.dispose();
      this.studioPreviewStage = null;
    }

    this.modalLayer.innerHTML = `
      ${this.studioContext ? this.renderCharacterStudioModal() : ''}
      ${!this.studioContext && this.gameState?.phase === 'GAME_OVER' ? this.renderPodiumModal() : ''}
      ${this.showHowToPlay ? this.renderHowToPlayModal() : ''}
      ${this.showSettings ? this.renderSettingsModal() : ''}
    `;
    this.bindModalEvents();
  }

  private renderChallengeLayerIfNeeded(): void {
    const modal = this.activeChallengeModal;
    const key = modal
      ? `${modal.challenge.tileId}:${modal.challenge.seed}:${modal.localParticipantId}:${modal.duelPicked ? 1 : 0}:${modal.stamp ? modal.stamp.summary : ''}`
      : 'none';

    if (key === this.renderedChallengeKey) return;
    this.renderedChallengeKey = key;

    if (!modal) {
      this.challengeLayer.innerHTML = '';
      return;
    }

    this.challengeLayer.innerHTML = this.renderChallengeModalShell();
    this.challengeLayer.querySelectorAll<HTMLElement>('[data-duel-opp]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        if (this.activeChallengeModal) {
          this.activeChallengeModal.duelPicked = true;
        }
        this.controller?.chooseDuelOpponent(el.dataset.duelOpp!);
        this.renderChallengeLayerIfNeeded();
      };
    });

    if (!modal.stamp && modal.duelPicked) {
      const body = this.challengeLayer.querySelector<HTMLElement>('#challenge-mg-body');
      if (body) {
        const ch = modal.challenge;
        const renderer = CLIENT_CHALLENGE_RENDERERS[ch.archetype];
        if (renderer) {
          modal.cleanup?.();
          modal.cleanup = renderer({
            challenge: ch,
            playerId: modal.localParticipantId,
            container: body,
            colorblindMode: this.settings.colorblindMode,
            sound: this.sound,
            onSubmit: (sub) => {
              this.controller?.submitChallenge(sub);
            },
          });
        }
        this.startChallengeTimerRing();
      }
    }
  }

  private startChallengeTimerRing(): void {
    cancelAnimationFrame(this.challengeTimerRaf);
    const modal = this.activeChallengeModal;
    if (!modal) return;
    const totalMs = Math.max(2500, modal.challenge.durationMs);
    const startMs = performance.now();

    const tick = () => {
      const circle = this.challengeLayer.querySelector<SVGCircleElement>('#timer-circle-prog');
      const numEl = this.challengeLayer.querySelector<HTMLElement>('#timer-sec-text');
      if (!circle || !numEl || !this.activeChallengeModal || this.activeChallengeModal.stamp) return;
      const elapsed = performance.now() - startMs;
      const rem = Math.max(0, totalMs - elapsed);
      const frac = rem / totalMs;
      const circum = 2 * Math.PI * 21;
      circle.style.strokeDasharray = `${circum}`;
      circle.style.strokeDashoffset = `${circum * (1 - frac)}`;
      numEl.textContent = String(Math.ceil(rem / 1000));
      if (rem > 0) {
        this.challengeTimerRaf = requestAnimationFrame(tick);
      }
    };
    this.challengeTimerRaf = requestAnimationFrame(tick);
  }

  private getDisplayedStars(playerId: string, actualStars: number): number {
    const cur = this.displayedStars.get(playerId);
    if (cur === undefined || actualStars < cur) {
      this.displayedStars.set(playerId, actualStars);
      return actualStars;
    }
    return cur;
  }

  private syncStarCounters(): void {
    if (this.starTickerId !== null) {
      clearInterval(this.starTickerId);
      this.starTickerId = null;
    }
    const players = this.gameState?.players ?? [];
    const hasPending = players.some((p) => (this.displayedStars.get(p.id) ?? p.stars) < p.stars);
    if (!hasPending) return;

    this.starTickerId = window.setInterval(() => {
      const currentPlayers = this.gameState?.players ?? [];
      let remaining = false;
      for (const p of currentPlayers) {
        const cur = this.displayedStars.get(p.id) ?? p.stars;
        if (cur < p.stars) {
          const step = Math.max(1, Math.ceil((p.stars - cur) / 5));
          const next = Math.min(p.stars, cur + step);
          this.displayedStars.set(p.id, next);
          const el = this.mainLayer.querySelector<HTMLElement>(`[data-star-pid="${p.id}"]`);
          if (el) {
            el.textContent = `★${next}`;
            el.classList.add('star-pop');
          }
          if (next < p.stars) remaining = true;
        } else {
          const el = this.mainLayer.querySelector<HTMLElement>(`[data-star-pid="${p.id}"]`);
          el?.classList.remove('star-pop');
        }
      }
      if (!remaining && this.starTickerId !== null) {
        clearInterval(this.starTickerId);
        this.starTickerId = null;
        window.setTimeout(() => {
          this.mainLayer.querySelectorAll<HTMLElement>('[data-star-pid].star-pop').forEach((el) => {
            el.classList.remove('star-pop');
          });
        }, 180);
      }
    }, 45);
  }

  private computeTurnSecondsLeft(): number | null {
    const st = this.gameState;
    if (!st || st.phase === 'GAME_OVER' || st.phase === 'CHALLENGE' || st.phase === 'STARTING') {
      return null;
    }
    if (!st.turnDeadlineAt) return null;
    return Math.max(0, Math.ceil((st.turnDeadlineAt - Date.now()) / 1000));
  }

  private startTurnCountdown(): void {
    const updateBadge = () => {
      const el = this.mainLayer.querySelector<HTMLElement>('#hud-turn-timer');
      if (!el) return;
      if (this.isAnimating) {
        el.style.display = 'none';
        return;
      }
      const sec = this.computeTurnSecondsLeft();
      if (sec === null) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'flex';
      el.textContent = `⏱️ ${sec}s`;
      el.style.background = sec <= 8 ? 'var(--pink)' : 'rgba(255, 246, 229, 0.95)';
    };

    updateBadge();
    this.turnCountdownInterval = window.setInterval(updateBadge, 250);
  }

  private renderSplash(): string {
    const saved = OnlineGameController.getSavedSession();
    return `
      <div class="screen-showcase">
        <div class="doodle-card sketchbook-panel menu-box stagger-item">
          <div class="showcase-badge">${renderUiIconSvg('dice', 18)} Ular Tangga Sketchbook 3D</div>
          <h1 class="game-logo">DodSnake</h1>
          <p class="subtitle">100 kotak tantangan kilat, studio karakter & aksesoris 3D, Kantin Bintang, dan duel seru bersama teman atau bot!</p>
          <button class="doodle-btn doodle-btn-primary stagger-item stagger-1" id="btn-splash-play">
            ${renderUiIconSvg('dice', 22)} Ayo Main!
          </button>
          ${
            saved
              ? `<button class="doodle-btn doodle-btn-mint stagger-item stagger-2" id="btn-splash-reconnect">Sambung Lagi (${saved.roomCode})</button>`
              : ''
          }
          <div class="showcase-hint">Tarik papan 3D untuk mengintip sudut lain • Scroll untuk zoom</div>
        </div>
      </div>
    `;
  }

  private renderMenu(): string {
    const activeMeta = PAWN_META[this.draftPawn];
    const accMeta = ACCESSORY_META[this.draftAccessory];
    return `
      <div class="screen-showcase">
        <div class="doodle-card sketchbook-panel menu-box">
          <div class="showcase-badge">${renderUiIconSvg('trophy', 16)} Mode Petualangan</div>
          <h1 class="game-logo">Ular Tangga<br/>Doodle Dash</h1>
          <p class="subtitle">Pilih mode bermain favoritmu!</p>
          <button class="doodle-btn menu-profile-card stagger-item" id="btn-menu-studio" title="Buka Studio Karakter & Aksesoris 3D">
            <span class="menu-profile-avatar">${pawnSvg(this.draftPawn, this.draftColor, 42, this.draftAccessory)}</span>
            <span class="menu-profile-meta">
              <b>${escapeHtml(this.draftName)} • ${escapeHtml(activeMeta.shortName)}</b>
              <small>${escapeHtml(accMeta.name)} • ${escapeHtml(activeMeta.perkTitle)}</small>
            </span>
            <span class="menu-profile-cta">Ganti Gaya</span>
          </button>
          ${
            this.career.matches > 0
              ? `<div class="career-banner tabular-num">
                   <span>Main: <b>${this.career.matches}</b></span>
                   <span>Menang: <b>${this.career.wins}</b></span>
                   <span>${renderUiIconSvg('star', 15)} <b>${this.career.starsEarned}</b></span>
                   <span>Tantangan: <b>${this.career.challengesWon}</b></span>
                 </div>`
              : ''
          }
          <button class="doodle-btn doodle-btn-primary stagger-item stagger-1" id="btn-menu-online">Main Online (2–6 Orang)</button>
          <button class="doodle-btn doodle-btn-mint stagger-item stagger-2" id="btn-menu-local">Main Lokal (1 Perangkat)</button>
          <button class="doodle-btn doodle-btn-blue stagger-item stagger-3" id="btn-menu-bot">Lawan Bot Cerdas</button>
          <div style="display:flex;gap:8px" class="stagger-item stagger-4">
            <button class="doodle-btn" style="flex:1" id="btn-menu-howto">${renderUiIconSvg('help', 18)} Cara Main</button>
            <button class="doodle-btn" style="flex:1" id="btn-menu-settings">${renderUiIconSvg('settings', 18)} Pengaturan</button>
          </div>
          <div class="showcase-hint">Tarik papan 3D di sebelah kanan untuk lihat diorama</div>
        </div>
      </div>
    `;
  }

  private renderRulePresetPickerHtml(canEdit: boolean): string {
    const presets: GameModePreset[] = ['klasik', 'kilat', 'pesta_item'];
    return `
      <label><b>Mode Aturan:</b></label>
      <div style="display:flex;gap:6px">
        ${presets
          .map(
            (id) => `
          <button class="doodle-btn ${this.draftRulePreset === id ? 'doodle-btn-blue' : ''}" style="flex:1;font-size:0.85rem;padding:6px" data-rule-preset="${id}" ${canEdit ? '' : 'disabled'} title="${GAME_MODE_META[id].description}">
            ${GAME_MODE_META[id].name.split(' ')[0]}
          </button>`,
          )
          .join('')}
      </div>
      <div style="font-size:0.82rem;opacity:0.82;text-align:center">${GAME_MODE_META[this.draftRulePreset].description}</div>
    `;
  }

  private renderCustomizationDraftHtml(): string {
    const pawns = Object.keys(PAWN_META) as PawnId[];
    const accessories = Object.keys(ACCESSORY_META) as AccessoryId[];
    const colors = Object.keys(PLAYER_COLORS) as PlayerColorId[];
    const selectedMeta = PAWN_META[this.draftPawn];
    const selectedAcc = ACCESSORY_META[this.draftAccessory];
    return `
      <div class="setup-name-row">
        <input class="doodle-input" id="inp-name" maxlength="18" value="${escapeHtml(this.draftName)}" placeholder="Nama Kamu" />
        <button class="doodle-btn doodle-btn-blue" id="btn-open-studio-profile" style="white-space:nowrap;padding:8px 12px" title="Buka Pratinjau 3D Karakter & Aksesoris">Studio 3D</button>
      </div>
      <div class="picker-grid">
        ${pawns
          .map(
            (p) => `
          <button class="doodle-btn pawn-chip ${this.draftPawn === p ? 'selected' : ''}" data-pick-pawn="${p}" title="${PAWN_META[p].name} — ${PAWN_META[p].perkTitle}">
            <span>${pawnSvg(p, this.draftColor, 28, p === this.draftPawn ? this.draftAccessory : 'none')}</span>
            <span>${PAWN_META[p].shortName}</span>
          </button>`,
          )
          .join('')}
      </div>
      <div class="char-bio-card">
        <div class="char-bio-top">
          <b>${escapeHtml(selectedMeta.name)}</b>
          <span class="char-role-tag">${escapeHtml(selectedMeta.title)}</span>
        </div>
        <div style="font-size:0.8rem;opacity:0.82">${escapeHtml(selectedMeta.tagline)}</div>
        <div class="char-perk-pill"><b>${escapeHtml(selectedMeta.perkTitle)}:</b> ${escapeHtml(selectedMeta.perkDesc)}</div>
      </div>
      <div class="acc-strip-header">
        <b>Aksesoris:</b>
        <span>${escapeHtml(selectedAcc.name)}</span>
      </div>
      <div class="acc-strip">
        ${accessories
          .map(
            (acc) => `
          <button class="doodle-btn acc-chip ${this.draftAccessory === acc ? 'selected' : ''}" data-pick-acc="${acc}" title="${ACCESSORY_META[acc].name}: ${ACCESSORY_META[acc].description}">
            ${renderAccessorySvg(acc, PLAYER_COLORS[this.draftColor].hex, 24)}
          </button>`,
          )
          .join('')}
      </div>
      <div class="color-row">
        ${colors
          .map(
            (c) => `
          <button class="color-dot ${this.draftColor === c ? 'selected' : ''}" data-pick-color="${c}" style="background:${PLAYER_COLORS[c].hex}" title="${PLAYER_COLORS[c].name}">
            ${this.settings.colorblindMode ? this.colorShapes[c] : ''}
          </button>`,
          )
          .join('')}
      </div>
    `;
  }

  private renderOnlineSetup(): string {
    const hasServer = OnlineGameController.hasConfiguredServer();
    return `
      <div class="screen-center">
        <div class="doodle-card menu-box stagger-item">
          <h2 style="margin:0;text-align:center">🌐 Main Online</h2>
          ${
            !hasServer
              ? `<div class="online-info-note">
                   Mode Online membutuhkan server backend aktif (<code>VITE_SERVER_URL</code>). Untuk langsung bermain di browser tanpa server, pilih <b>Main Lokal</b> atau <b>Lawan Bot</b> di menu utama!
                 </div>`
              : ''
          }
          ${this.renderCustomizationDraftHtml()}
          <button class="doodle-btn doodle-btn-primary" id="btn-create-room">✨ Buat Room Baru</button>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="doodle-input" id="inp-room-code" maxlength="4" placeholder="KODE (4 HURUF)" value="${escapeHtml(this.draftRoomCode)}" style="text-transform:uppercase;flex:1" />
            <button class="doodle-btn doodle-btn-mint" id="btn-join-room">Gabung</button>
          </div>
          <button class="doodle-btn doodle-btn-blue" id="btn-join-spectator">👀 Masuk Sebagai Penonton</button>
          <button class="doodle-btn" id="btn-back-menu">⬅️ Kembali</button>
        </div>
      </div>
    `;
  }

  private renderLocalSetup(): string {
    return `
      <div class="screen-center">
        <div class="doodle-card menu-box stagger-item">
          <h2 style="margin:0;text-align:center">📱 Main Lokal (Hot-Seat)</h2>
          <label><b>Jumlah Pemain (${this.draftLocalCount}):</b></label>
          <div style="display:flex;gap:6px">
            ${[2, 3, 4, 5, 6]
              .map(
                (n) => `<button class="doodle-btn ${this.draftLocalCount === n ? 'doodle-btn-primary' : ''}" style="flex:1" data-local-count="${n}">${n}</button>`,
              )
              .join('')}
          </div>
          ${this.renderRulePresetPickerHtml(true)}
          <div class="lobby-list">
            ${Array.from({ length: this.draftLocalCount }, (_, i) => {
              const p = this.draftLocalPawns[i];
              const c = this.draftLocalColors[i];
              const acc = this.draftLocalAccessories[i];
              const meta = PAWN_META[p];
              const accMeta = ACCESSORY_META[acc];
              return `<div class="lobby-row" style="gap:6px;flex-wrap:wrap">
                <button class="doodle-btn" style="min-height:36px;padding:4px 8px" data-local-pawn="${i}" title="Ganti Karakter (${meta.name})">${pawnSvg(p, c, 26, acc)}</button>
                <button class="doodle-btn" style="min-height:36px;width:36px;padding:0;background:${PLAYER_COLORS[c].hex}" data-local-color="${i}" title="Ganti Warna">${this.settings.colorblindMode ? this.colorShapes[c] : ''}</button>
                <input class="doodle-input" style="min-height:36px;padding:4px 10px;flex:1;min-width:95px" data-local-name="${i}" value="${escapeHtml(this.draftLocalNames[i])}" maxlength="16" />
                <button class="doodle-btn doodle-btn-blue" style="min-height:36px;padding:4px 10px;font-size:0.8rem" data-local-studio="${i}" title="Pilih Karakter & Aksesoris 3D">Gaya</button>
                <div style="width:100%;font-size:0.74rem;opacity:0.82;padding-left:4px"><b>${escapeHtml(meta.name)}</b> • ${escapeHtml(accMeta.shortName)} • ${escapeHtml(meta.perkTitle)}: ${escapeHtml(meta.perkDesc)}</div>
              </div>`;
            }).join('')}
          </div>
          <button class="doodle-btn doodle-btn-primary" id="btn-start-local">🎲 Mulai Main!</button>
          <button class="doodle-btn" id="btn-back-menu">⬅️ Kembali</button>
        </div>
      </div>
    `;
  }

  private renderBotSetup(): string {
    return `
      <div class="screen-center">
        <div class="doodle-card menu-box stagger-item">
          <h2 style="margin:0;text-align:center">🤖 Lawan Bot</h2>
          ${this.renderCustomizationDraftHtml()}
          <label><b>Jumlah Lawan Bot:</b></label>
          <div style="display:flex;gap:6px">
            ${[1, 2, 3, 4, 5]
              .map((n) => `<button class="doodle-btn ${this.draftBotCount === n ? 'doodle-btn-primary' : ''}" style="flex:1" data-bot-count="${n}">${n}</button>`)
              .join('')}
          </div>
          <label><b>Tingkat Kepintaran Bot:</b></label>
          <div style="display:flex;gap:6px">
            ${(['santai', 'pintar', 'juara'] as BotDifficulty[])
              .map((d) => `<button class="doodle-btn ${this.draftBotDiff === d ? 'doodle-btn-mint' : ''}" style="flex:1" data-bot-diff="${d}">${d.toUpperCase()}</button>`)
              .join('')}
          </div>
          ${this.renderRulePresetPickerHtml(true)}
          <button class="doodle-btn doodle-btn-primary" id="btn-start-bot">🚀 Mulai Lawan Bot!</button>
          <button class="doodle-btn" id="btn-back-menu">⬅️ Kembali</button>
        </div>
      </div>
    `;
  }

  private renderLobby(): string {
    const room = this.roomState;
    if (!room) {
      return `<div class="screen-center"><div class="doodle-card menu-box"><p>Menghubungkan ke room...</p><button class="doodle-btn" id="btn-leave-lobby">Batal</button></div></div>`;
    }
    const myId = this.onlineController?.getLocalPlayerId();
    const isHost = myId === room.hostId;
    const me = room.players.find((p) => p.id === myId);

    return `
      <div class="screen-center">
        <div class="doodle-card menu-box stagger-item">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 style="margin:0">Lobby Room</h2>
            <span style="font-size:0.9rem">👀 Penonton: ${room.spectatorCount}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;justify-content:center">
            <div class="room-badge" style="margin:0">${room.roomCode}</div>
            <button class="doodle-btn doodle-btn-mint" id="btn-copy-invite" title="Salin link undangan">🔗 Salin</button>
          </div>
          ${this.renderRulePresetPickerHtml(isHost)}
          <div class="lobby-list">
            ${room.players
              .map(
                (p) => `
              <div class="lobby-row">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="width:14px;height:14px;border-radius:50%;background:${PLAYER_COLORS[p.color].hex};border:2px solid var(--ink);display:inline-block"></span>
                  <span>${pawnSvg(p.pawn, p.color, 26, p.accessory ?? 'none')}</span>
                  <b>${escapeHtml(p.name)}</b>
                  <span style="font-size:0.75rem;opacity:0.72">(${escapeHtml(PAWN_META[p.pawn].shortName)}${p.accessory && p.accessory !== 'none' ? ` • ${escapeHtml(ACCESSORY_META[p.accessory].shortName)}` : ''})</span>
                  ${p.id === room.hostId ? renderUiIconSvg('trophy', 15) : ''}
                  ${p.isBot ? '<span style="font-size:0.75rem;padding:0 5px;border:1.5px solid var(--ink);border-radius:6px;background:var(--blue)">BOT</span>' : ''}
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  ${p.id === myId ? `<button class="doodle-btn doodle-btn-blue" style="min-height:32px;padding:3px 10px;font-size:0.8rem" id="btn-lobby-studio" title="Pilih Karakter & Aksesoris">Gaya</button>` : ''}
                  ${isHost && p.isBot ? `<button class="doodle-btn doodle-btn-pink" style="min-height:30px;padding:2px 8px;font-size:0.8rem" data-remove-bot="${p.id}" title="Hapus Bot">✕</button>` : ''}
                  <span style="padding:3px 10px;border-radius:10px;border:2px solid var(--ink);background:${p.ready ? 'var(--mint)' : '#EEE'}">
                    ${p.ready ? 'Siap!' : 'Belum'}
                  </span>
                </div>
              </div>`,
              )
              .join('')}
          </div>
          ${
            me
              ? `<div style="display:flex;flex-direction:column;gap:8px">
                  ${
                    isHost
                      ? `<div style="display:flex;gap:6px;align-items:center">
                           <select class="doodle-input" id="sel-lobby-bot-diff" style="min-height:40px;padding:4px 8px;width:120px">
                             <option value="santai" ${this.draftLobbyBotDiff === 'santai' ? 'selected' : ''}>Bot Santai</option>
                             <option value="pintar" ${this.draftLobbyBotDiff === 'pintar' ? 'selected' : ''}>Bot Pintar</option>
                             <option value="juara" ${this.draftLobbyBotDiff === 'juara' ? 'selected' : ''}>Bot Juara</option>
                           </select>
                           <button class="doodle-btn doodle-btn-blue" style="flex:1" id="btn-lobby-add-bot" ${room.players.length >= 6 ? 'disabled' : ''}>+ Bot</button>
                           <button class="doodle-btn doodle-btn-primary" style="flex:1" id="btn-lobby-start" ${room.players.length < 2 ? 'disabled' : ''}>Mulai!</button>
                         </div>`
                      : `<button class="doodle-btn ${me.ready ? 'doodle-btn-mint' : 'doodle-btn-primary'}" style="flex:1" id="btn-lobby-ready">${me.ready ? '✅ Sudah Siap' : '✋ Tekan Siap!'}</button>`
                  }
                 </div>`
              : `<div class="subtitle">Kamu masuk sebagai penonton. Menunggu host memulai...</div>`
          }
          <button class="doodle-btn" id="btn-leave-lobby">Keluar Room</button>
        </div>
      </div>
    `;
  }

  private renderGameHud(): string {
    const state = this.gameState;
    if (!state) return '';
    const activeId = state.turnOrder[state.currentTurnIndex];
    const localId = this.controller?.getLocalPlayerId();
    const isMyTurn = !this.controller?.isSpectator() && activeId === localId && !this.isAnimating;
    const me = state.players.find((p) => p.id === (localId ?? activeId));
    const camOverview = this.scene.getPreferredCameraMode() === 'overview';
    const myShopCost = me ? getPlayerShopCost(me.pawn) : STAR_SHOP_COST;
    const canBuyStarItem = Boolean(
      me &&
        isMyTurn &&
        state.phase === 'TURN_BEGIN' &&
        me.stars >= myShopCost &&
        me.items.length < 2,
    );

    const activeBuffs: string[] = [];
    if (me?.activeGoldenDice) activeBuffs.push('Dadu Emas');
    if (me?.activeBrake) activeBuffs.push('Rem <=3');
    if (me?.activeTurbo) activeBuffs.push('Turbo +2');

    return `
      <div class="hud-top">
        <div class="turn-strip">
          ${state.turnOrder
            .map((pid) => {
              const p = state.players.find((x) => x.id === pid)!;
              const isAct = pid === activeId;
              const streak = p.challengeStreak ?? 0;
              const meta = PAWN_META[p.pawn];
              return `
                <div class="player-pill player-pill-clickable ${isAct ? 'active' : ''} ${!p.connected ? 'disconnected' : ''}" data-focus-player="${p.id}" style="border-left: 8px solid ${PLAYER_COLORS[p.color].hex}" title="${escapeHtml(meta.name)} — ${escapeHtml(meta.perkTitle)}: ${escapeHtml(meta.perkDesc)} (Klik untuk sorot pion)">
                  ${this.settings.colorblindMode ? `<span class="cb-shape" title="${PLAYER_COLORS[p.color].name}">${this.colorShapes[p.color]}</span>` : ''}
                  <span>${pawnSvg(p.pawn, p.color, 26, p.accessory ?? 'none')}</span>
                  <div>
                    <div style="display:flex;align-items:center;gap:4px">
                      <b>${escapeHtml(p.name)}</b>
                      ${p.shields > 0 ? renderItemSvg('shield', 15) : ''}
                      ${streak >= 2 ? `<span class="streak-badge" title="Kombo Tantangan!">${renderUiIconSvg('flame', 13)}x${streak}</span>` : ''}
                    </div>
                    <div class="tabular-num" style="font-size:0.78rem;display:flex;align-items:center;gap:4px">
                      <span>Kt.${p.position}</span> • <span data-star-pid="${p.id}">★${this.getDisplayedStars(p.id, p.stars)}</span> • <span style="opacity:0.75">${escapeHtml(meta.shortName)}</span>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
        <div class="hud-actions-top">
          <div class="player-pill tabular-num" id="hud-turn-timer" style="display:none;font-weight:700"></div>
          <button class="doodle-btn" id="btn-hud-cam" title="${camOverview ? 'Mode Ikuti Pion' : 'Mode Lihat Penuh'}">${renderUiIconSvg('camera', 18)}</button>
          <button class="doodle-btn" id="btn-hud-reset-cam" title="Kembalikan Sudut Kamera">Reset</button>
          <button class="doodle-btn" id="btn-hud-music" title="Musik Latar">${renderUiIconSvg(this.settings.musicEnabled ? 'sound' : 'muted', 18)}</button>
          <button class="doodle-btn" id="btn-hud-mute" title="Suara Efek">${this.settings.muted ? 'Mute' : 'SFX'}</button>
          <button class="doodle-btn" id="btn-hud-settings" title="Pengaturan">${renderUiIconSvg('settings', 18)}</button>
          <button class="doodle-btn doodle-btn-pink" id="btn-hud-leave" title="Keluar Room">Keluar</button>
        </div>
      </div>

      ${
        this.activityFeed.length > 0
          ? `<div class="activity-feed-dock">
               <button class="doodle-btn" style="min-height:32px;padding:3px 10px;font-size:0.78rem" id="btn-toggle-feed">${this.feedOpen ? 'Sembunyikan Log' : `Log (${this.activityFeed.length})`}</button>
               ${
                 this.feedOpen
                   ? `<div class="activity-feed" aria-label="Catatan Kejadian">
                        ${this.activityFeed.slice(0, 6).map((line) => `<div class="activity-feed-item">${escapeHtml(line)}</div>`).join('')}
                      </div>`
                   : ''
               }
             </div>`
          : ''
      }

      <div class="emote-dock">
        ${
          this.emoteTrayOpen
            ? `<div class="doodle-card emote-tray">
                ${EMOTE_LIST.map((em) => `<button class="doodle-btn" data-send-emote="${em.id}" title="${em.label}">${em.icon}</button>`).join('')}
               </div>`
            : ''
        }
        <button class="doodle-btn doodle-btn-blue" id="btn-toggle-emote">Stiker</button>
      </div>

      <div class="hud-bottom">
        ${
          isMyTurn && state.phase === 'TURN_BEGIN' && me
            ? `<div class="hud-turn-helper tabular-num">
                 <span><b>Giliranmu!</b> Kt.${me.position}/100</span>
                 <span class="helper-dot-row"><span class="preview-dot is-ladder"></span>Tangga</span>
                 <span class="helper-dot-row"><span class="preview-dot is-snake"></span>Ular</span>
                 <span class="helper-key-hint">[Spasi]</span>
               </div>`
            : ''
        }
        ${activeBuffs.length > 0 ? `<div style="margin-bottom:4px;font-size:0.82rem;font-weight:700;background:rgba(255,255,255,0.92);padding:2px 10px;border-radius:999px;border:2px solid var(--ink)">Aktif: ${activeBuffs.join(' • ')}</div>` : ''}
        <div class="hud-bottom-bar">
          <div class="item-slots">
            ${[0, 1]
              .map((idx) => {
                const item = me?.items[idx];
                if (!item) {
                  return `<button class="doodle-btn item-slot-btn" disabled title="Slot Item Kosong">—</button>`;
                }
                return `<button class="doodle-btn doodle-btn-mint item-slot-btn" data-use-item="${idx}" ${!isMyTurn || state.phase !== 'TURN_BEGIN' ? 'disabled' : ''} title="${ITEM_META[item].name}: ${ITEM_META[item].description}">
                  ${renderItemSvg(item, 22)}
                  <span>${ITEM_META[item].name.split(' ')[0]}</span>
                </button>`;
              })
              .join('')}
            ${
              me && !this.controller?.isSpectator()
                ? `<button class="doodle-btn shop-buy-btn" id="btn-buy-star-item" ${!canBuyStarItem ? 'disabled' : ''} title="Kantin Bintang: Beli 1 item acak seharga ${myShopCost}★${me.pawn === 'dino' ? ' (Diskon VIP Roro!)' : ''} (maksimal 2 slot)">
                     ${renderUiIconSvg('shop', 18)}
                     <span class="tabular-num">${me.items.length >= 2 ? 'Penuh' : `Beli ★${myShopCost}`}</span>
                   </button>`
                : ''
            }
          </div>

          ${
            state.phase === 'ROLL' && state.pendingRoll && isMyTurn && me
              ? `<div style="display:flex;gap:8px;flex:1">
                  ${state.pendingRoll.diceValues
                    .map((val, idx) => {
                      const prev = previewDiceLanding(
                        BOARD_LAYOUT,
                        me.position,
                        val,
                        Boolean(state.pendingRoll?.usedTurbo),
                        me.pawn,
                      );
                      const hintCls = prev.ladderTo
                        ? 'is-ladder'
                        : prev.snakeTo
                          ? 'is-snake'
                          : prev.to === 100
                            ? 'is-boss'
                            : '';
                      const hintTxt = prev.ladderTo
                        ? `Kt.${prev.to} → Tangga ${prev.ladderTo}`
                        : prev.snakeTo
                          ? `Kt.${prev.to} → Ular ${prev.snakeTo}`
                          : prev.to === 100
                            ? 'Kt.100 Menang!'
                            : prev.bounced
                              ? `Pantul Kt.${prev.to}`
                              : `→ Kt.${prev.to}`;
                      return `<button class="doodle-btn dice-pick-btn" data-pick-dice="${idx}">
                        <span>Pilih ${val}</span>
                        <span class="dice-pick-hint ${hintCls} tabular-num">${hintTxt}</span>
                      </button>`;
                    })
                    .join('')}
                 </div>`
              : `<button class="doodle-btn roll-btn ${isMyTurn && state.phase === 'TURN_BEGIN' ? 'is-your-turn' : ''}" id="btn-roll-dice" ${!isMyTurn || state.phase !== 'TURN_BEGIN' ? 'disabled' : ''}>
                  ${
                    this.controller?.isSpectator()
                      ? 'Mode Penonton'
                      : isMyTurn
                        ? `${renderUiIconSvg('dice', 24)} LEMPAR DADU!`
                        : `Giliran ${escapeHtml(state.players.find((p) => p.id === activeId)?.name ?? '')}`
                  }
                 </button>`
          }
        </div>
      </div>
    `;
  }

  private renderChallengeModalShell(): string {
    const modal = this.activeChallengeModal;
    if (!modal) return '';
    const ch = modal.challenge;
    const spec = ARCHETYPE_REGISTRY[ch.archetype];
    const owner = this.gameState?.players.find((p) => p.id === modal.localParticipantId);
    const others = (this.gameState?.players ?? []).filter((p) => p.id !== ch.ownerPlayerId);

    return `
      <div class="challenge-backdrop">
        <div class="doodle-card challenge-modal">
          <div class="challenge-header">
            <div>
              <div style="font-size:0.82rem;opacity:0.8">Kotak ${ch.tileId} • ${spec.displayName} ${ch.mode === 'all_play' ? '• SEMUA MAIN!' : ch.mode === 'duel' ? '• DUEL 1v1' : ''}</div>
              <h3 style="margin:2px 0">${escapeHtml(ch.title)}</h3>
              ${owner ? `<div style="font-size:0.85rem;display:inline-flex;align-items:center;gap:5px">${pawnSvg(owner.pawn, owner.color, 20, owner.accessory ?? 'none')} <b>${escapeHtml(owner.name)}</b> <span style="opacity:0.75">• ${escapeHtml(PAWN_META[owner.pawn].shortName)}</span></div>` : ''}
            </div>
            <div class="challenge-timer-ring">
              <svg width="52" height="52">
                <circle cx="26" cy="26" r="21" fill="none" stroke="#E5DAC5" stroke-width="5"/>
                <circle id="timer-circle-prog" cx="26" cy="26" r="21" fill="none" stroke="#2B2A33" stroke-width="5" stroke-linecap="round"/>
              </svg>
              <span id="timer-sec-text">${Math.ceil(ch.durationMs / 1000)}</span>
            </div>
          </div>
          <p style="margin:4px 0 12px;font-size:0.95rem">${escapeHtml(ch.flavorText)}</p>
          ${
            !modal.duelPicked
              ? `<div class="mg-wrap">
                  <div class="mg-sub">Pilih siapa lawan duelmu!</div>
                  ${others
                    .map(
                      (o) => `<button class="doodle-btn doodle-btn-primary" style="width:100%" data-duel-opp="${o.id}">${pawnSvg(o.pawn, o.color, 24, o.accessory ?? 'none')} Tantang ${escapeHtml(o.name)} (Kt.${o.position})</button>`,
                    )
                    .join('')}
                 </div>`
              : `<div id="challenge-mg-body"></div>`
          }
          ${
            modal.stamp
              ? `<div class="stamp-overlay">
                  <div class="stamp-badge ${modal.stamp.success ? 'stamp-win' : 'stamp-lose'}">
                    ${modal.stamp.success ? 'BERHASIL!' : 'YAAH...'}
                  </div>
                  <p style="margin-top:14px;font-size:1.05rem">${escapeHtml(modal.stamp.summary)}</p>
                </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  private computeSuperlatives(players: Player[]): string[] {
    if (players.length === 0) return [];
    const pickBest = (scoreFn: (p: Player) => number): Player | null => {
      const sorted = [...players].sort((a, b) => scoreFn(b) - scoreFn(a));
      return scoreFn(sorted[0]) > 0 ? sorted[0] : null;
    };

    const awards: string[] = [];
    const starKing = pickBest((p) => p.stars);
    if (starKing) awards.push(`⭐ Kolektor Bintang: ${starKing.name} (${starKing.stars}★)`);
    const challengeAce = pickBest((p) => p.stats.challengesWon);
    if (challengeAce) awards.push(`🧠 Raja Tantangan: ${challengeAce.name} (${challengeAce.stats.challengesWon}x)`);
    const climber = pickBest((p) => p.stats.laddersClimbed);
    if (climber) awards.push(`🪜 Pemanjat Kilat: ${climber.name} (${climber.stats.laddersClimbed}x)`);
    const dodger = pickBest((p) => p.stats.snakesDodged);
    if (dodger) awards.push(`🛡️ Pawang Ular: ${dodger.name} (${dodger.stats.snakesDodged}x)`);
    const bitten = pickBest((p) => p.stats.snakesBitten);
    if (bitten) awards.push(`🐍 Sobat Ular: ${bitten.name} (${bitten.stats.snakesBitten}x)`);
    const itemPro = pickBest((p) => p.stats.itemsUsed);
    if (itemPro) awards.push(`🎒 Ahli Item: ${itemPro.name} (${itemPro.stats.itemsUsed}x)`);
    return awards.slice(0, 4);
  }

  private renderPodiumModal(): string {
    const state = this.gameState;
    const podium = state?.podium ?? [];
    if (!state || podium.length === 0) return '';
    const isHost = this.modeIsHostOrLocal();
    const awards = this.computeSuperlatives(state.players);

    return `
      <div class="challenge-backdrop">
        <div class="doodle-card menu-box stagger-item" style="max-width:500px">
          <h1 class="game-logo">🏆 Podium Juara! 🏆</h1>
          <div class="podium-stage">
            ${podium
              .slice(0, 3)
              .map(
                (entry) => `
              <div class="podium-col podium-rank-${entry.rank}">
                <div class="tabular-num" style="font-size:1.3rem;font-weight:700">#${entry.rank}</div>
                <div>${pawnSvg(entry.pawn, entry.color, 38, entry.accessory ?? 'none')}</div>
                <div>${this.settings.colorblindMode ? `<span class="cb-shape">${this.colorShapes[entry.color]}</span> ` : ''}<b>${escapeHtml(entry.name)}</b></div>
                <div style="font-size:0.74rem;opacity:0.78">${escapeHtml(PAWN_META[entry.pawn].shortName)}</div>
                <div class="tabular-num" style="font-size:0.85rem">Kt.${entry.position} • ★${entry.stars}</div>
              </div>`,
              )
              .join('')}
          </div>
          <div class="lobby-list">
            ${podium
              .map(
                (e) => `<div class="lobby-row"><span style="display:inline-flex;align-items:center;gap:6px">#${e.rank} ${this.settings.colorblindMode ? `<span class="cb-shape">${this.colorShapes[e.color]}</span>` : ''}${pawnSvg(e.pawn, e.color, 22, e.accessory ?? 'none')} <b>${escapeHtml(e.name)}</b></span><span class="tabular-num">Kotak ${e.position} • ★${e.stars}</span></div>`,
              )
              .join('')}
          </div>
          ${
            awards.length > 0
              ? `<div class="podium-awards">
                   ${awards.map((a) => `<span class="award-chip">${escapeHtml(a)}</span>`).join('')}
                 </div>`
              : ''
          }
          <div style="display:flex;gap:8px;margin-top:6px">
            ${isHost ? `<button class="doodle-btn doodle-btn-primary" style="flex:1" id="btn-podium-rematch">🔄 Main Lagi</button>` : ''}
            <button class="doodle-btn" style="flex:1" id="btn-podium-menu">🏠 Menu Utama</button>
          </div>
        </div>
      </div>
    `;
  }

  private modeIsHostOrLocal(): boolean {
    if (!this.controller) return false;
    if (this.controller.mode !== 'online') return true;
    const myId = this.onlineController?.getLocalPlayerId();
    return Boolean(myId && this.roomState?.hostId === myId);
  }

  private openCharacterStudio(mode: 'profile' | 'local' | 'lobby', localIndex = 0): void {
    if (mode === 'local') {
      this.studioContext = {
        mode: 'local',
        localIndex,
        name: this.draftLocalNames[localIndex] || PAWN_META[this.draftLocalPawns[localIndex]].shortName,
        pawn: this.draftLocalPawns[localIndex],
        color: this.draftLocalColors[localIndex],
        accessory: this.draftLocalAccessories[localIndex],
      };
    } else if (mode === 'lobby' && this.roomState) {
      const myId = this.onlineController?.getLocalPlayerId();
      const me = this.roomState.players.find((p) => p.id === myId);
      this.studioContext = {
        mode: 'lobby',
        name: me?.name ?? this.draftName,
        pawn: me?.pawn ?? this.draftPawn,
        color: me?.color ?? this.draftColor,
        accessory: me?.accessory ?? this.draftAccessory,
      };
    } else {
      this.studioContext = {
        mode: 'profile',
        name: this.draftName,
        pawn: this.draftPawn,
        color: this.draftColor,
        accessory: this.draftAccessory,
      };
    }
    this.scene.setExternalPause(true);
    this.renderModalsLayer();
  }

  private closeCharacterStudio(applyChanges: boolean): void {
    const ctx = this.studioContext;
    if (applyChanges && ctx) {
      const cleanName = ctx.name.trim();
      if (ctx.mode === 'local' && ctx.localIndex !== undefined) {
        const idx = ctx.localIndex;
        const prevShort = PAWN_META[this.draftLocalPawns[idx]].shortName;
        this.draftLocalPawns[idx] = ctx.pawn;
        this.draftLocalColors[idx] = ctx.color;
        this.draftLocalAccessories[idx] = ctx.accessory;
        if (cleanName && cleanName !== prevShort) {
          this.draftLocalNames[idx] = cleanName;
        } else if (cleanName === prevShort || !cleanName) {
          this.draftLocalNames[idx] = PAWN_META[ctx.pawn].shortName;
        }
      } else if (ctx.mode === 'lobby') {
        this.onlineController?.customize({
          playerName: cleanName || this.draftName,
          pawn: ctx.pawn,
          color: ctx.color,
          accessory: ctx.accessory,
        });
      } else {
        if (cleanName) this.draftName = cleanName;
        this.draftPawn = ctx.pawn;
        this.draftColor = ctx.color;
        this.draftAccessory = ctx.accessory;
      }
    }

    this.studioPreviewStage?.dispose();
    this.studioPreviewStage = null;
    this.studioContext = null;
    this.scene.setExternalPause(false);
    this.renderModalsLayer();
    this.renderMainLayer();
  }

  private renderStudioBioCardHtml(pawn: PawnId, color: PlayerColorId, accessory: AccessoryId): string {
    const meta = PAWN_META[pawn];
    const acc = ACCESSORY_META[accessory];
    const col = PLAYER_COLORS[color];
    return `
      <div class="char-bio-card studio-bio-box">
        <div class="char-bio-top">
          <b>${escapeHtml(meta.name)}</b>
          <span class="char-role-tag">${escapeHtml(meta.title)}</span>
        </div>
        <div style="font-size:0.82rem;opacity:0.82">${escapeHtml(col.name)} • ${escapeHtml(acc.name)}</div>
        <div class="char-perk-pill"><b>${escapeHtml(meta.perkTitle)}:</b> ${escapeHtml(meta.perkDesc)}</div>
      </div>
    `;
  }

  private renderCharacterStudioModal(): string {
    const ctx = this.studioContext;
    if (!ctx) return '';
    const pawns = Object.keys(PAWN_META) as PawnId[];
    const accessories = Object.keys(ACCESSORY_META) as AccessoryId[];
    const colors = Object.keys(PLAYER_COLORS) as PlayerColorId[];
    const titleLabel =
      ctx.mode === 'local' && ctx.localIndex !== undefined
        ? `Studio Pemain ${ctx.localIndex + 1}`
        : 'Studio Karakter & Aksesoris';

    return `
      <div class="challenge-backdrop">
        <div class="doodle-card studio-modal stagger-item">
          <div class="studio-header">
            <div>
              <h2 style="margin:0">${titleLabel}</h2>
              <small style="opacity:0.75">Pilih karakter favorit, warna pastel, dan aksesoris lucunya</small>
            </div>
            <button class="doodle-btn" id="btn-studio-cancel" style="min-height:40px;padding:6px 12px" aria-label="Tutup">✕</button>
          </div>
          <div class="studio-layout">
            <div class="studio-stage-col">
              <div class="studio-preview-box">
                <div id="studio-preview-stage" class="studio-preview-stage">
                  ${pawnSvg(ctx.pawn, ctx.color, 130, ctx.accessory)}
                </div>
                <div class="studio-drag-hint">Geser kiri / kanan untuk memutar model 3D</div>
              </div>
              <input class="doodle-input" id="inp-studio-name" maxlength="18" value="${escapeHtml(ctx.name)}" placeholder="Nama Karakter" />
              <div class="color-row" id="studio-color-row">
                ${colors
                  .map(
                    (c) => `
                  <button class="color-dot ${ctx.color === c ? 'selected' : ''}" data-studio-color="${c}" style="background:${PLAYER_COLORS[c].hex}" title="${PLAYER_COLORS[c].name}">
                    ${this.settings.colorblindMode ? this.colorShapes[c] : ''}
                  </button>`,
                  )
                  .join('')}
              </div>
              <div id="studio-bio-slot">${this.renderStudioBioCardHtml(ctx.pawn, ctx.color, ctx.accessory)}</div>
            </div>
            <div class="studio-picker-col">
              <div class="studio-section-label"><b>1. Pilih Karakter Unik</b></div>
              <div class="studio-char-grid" id="studio-char-grid">
                ${pawns
                  .map((p) => {
                    const m = PAWN_META[p];
                    return `
                      <button class="doodle-btn studio-char-card ${ctx.pawn === p ? 'selected' : ''}" data-studio-pawn="${p}" title="${m.name} — ${m.perkDesc}">
                        <span>${pawnSvg(p, ctx.color, 36, ctx.accessory)}</span>
                        <span class="studio-char-name">${escapeHtml(m.shortName)}</span>
                        <small class="studio-char-role">${escapeHtml(m.title)}</small>
                      </button>`;
                  })
                  .join('')}
              </div>
              <div class="studio-section-label" style="margin-top:4px">
                <b>2. Pasang Aksesoris</b>
                <span id="studio-acc-active" style="font-size:0.84rem;opacity:0.8">${escapeHtml(ACCESSORY_META[ctx.accessory].name)}</span>
              </div>
              <div class="studio-acc-grid" id="studio-acc-grid">
                ${accessories
                  .map((accId) => {
                    const acc = ACCESSORY_META[accId];
                    return `
                      <button class="doodle-btn studio-acc-card ${ctx.accessory === accId ? 'selected' : ''}" data-studio-acc="${accId}" title="${acc.description}">
                        <span>${renderAccessorySvg(accId, PLAYER_COLORS[ctx.color].hex, 28)}</span>
                        <small>${escapeHtml(acc.shortName)}</small>
                      </button>`;
                  })
                  .join('')}
              </div>
              <div id="studio-acc-desc" class="studio-acc-desc">${escapeHtml(ACCESSORY_META[ctx.accessory].description)}</div>
              <div class="studio-footer-actions">
                <button class="doodle-btn" id="btn-studio-close" style="flex:1">Batal</button>
                <button class="doodle-btn doodle-btn-primary" id="btn-studio-save" style="flex:2">Simpan & Pakai</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private syncStudioLiveUi(): void {
    const ctx = this.studioContext;
    if (!ctx) return;

    this.studioPreviewStage?.setSelection(ctx.pawn, ctx.color, ctx.accessory);
    if (!this.studioPreviewStage?.isActive()) {
      const stageEl = this.modalLayer.querySelector<HTMLElement>('#studio-preview-stage');
      if (stageEl) stageEl.innerHTML = pawnSvg(ctx.pawn, ctx.color, 130, ctx.accessory);
    }

    const bioSlot = this.modalLayer.querySelector<HTMLElement>('#studio-bio-slot');
    if (bioSlot) {
      bioSlot.innerHTML = this.renderStudioBioCardHtml(ctx.pawn, ctx.color, ctx.accessory);
    }
    const accActive = this.modalLayer.querySelector<HTMLElement>('#studio-acc-active');
    if (accActive) accActive.textContent = ACCESSORY_META[ctx.accessory].name;
    const accDesc = this.modalLayer.querySelector<HTMLElement>('#studio-acc-desc');
    if (accDesc) accDesc.textContent = ACCESSORY_META[ctx.accessory].description;

    this.modalLayer.querySelectorAll<HTMLElement>('[data-studio-pawn]').forEach((btn) => {
      const p = btn.dataset.studioPawn as PawnId;
      btn.classList.toggle('selected', p === ctx.pawn);
      const iconSpan = btn.querySelector('span');
      if (iconSpan) iconSpan.innerHTML = pawnSvg(p, ctx.color, 36, ctx.accessory);
    });
    this.modalLayer.querySelectorAll<HTMLElement>('[data-studio-acc]').forEach((btn) => {
      const a = btn.dataset.studioAcc as AccessoryId;
      btn.classList.toggle('selected', a === ctx.accessory);
      const iconSpan = btn.querySelector('span');
      if (iconSpan) iconSpan.innerHTML = renderAccessorySvg(a, PLAYER_COLORS[ctx.color].hex, 28);
    });
    this.modalLayer.querySelectorAll<HTMLElement>('[data-studio-color]').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.studioColor === ctx.color);
    });
  }

  private renderHowToPlayModal(): string {
    return `
      <div class="challenge-backdrop">
        <div class="doodle-card menu-box stagger-item">
          <h2 style="margin:0">📖 Cara Bermain</h2>
          <ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
            <li>Lempar dadu 1d6 (atau tekan <b>Spasi</b> saat giliranmu!). Angka <b>6</b> dapat lemparan lagi (maks 2x).</li>
            <li>Setiap kotak (2–99) punya <b>17 jenis mini-game 5–10 detik</b> berhadiah ★ & bonus!</li>
            <li><b>6 Item Strategis:</b> Perisai 🛡️, Dadu Emas 🎲✨, Rem 🛑, Kotak Kejutan 🎁, Magnet Bintang 🧲, dan Sepatu Turbo ⚡ (+2 langkah)!</li>
            <li><b>Kepala Ular:</b> menang tantangan kotak ular bikin ular tertawa & kamu tidak jatuh!</li>
            <li><b>Kotak 100 (Bos Doodle):</b> harus mendarat pas dan taklukkan Bos Doodle untuk menang!</li>
          </ul>
          <button class="doodle-btn doodle-btn-primary" id="btn-close-howto">Siap Mengerti!</button>
        </div>
      </div>
    `;
  }

  private renderSettingsModal(): string {
    return `
      <div class="challenge-backdrop">
        <div class="doodle-card menu-box stagger-item">
          <h2 style="margin:0">⚙️ Pengaturan</h2>
          <label style="display:flex;justify-content:space-between;align-items:center">
            <span>🔇 Bisu (Mute)</span>
            <input type="checkbox" id="set-mute" ${this.settings.muted ? 'checked' : ''} style="width:24px;height:24px"/>
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center">
            <span>🎵 Musik Latar Tabletop</span>
            <input type="checkbox" id="set-music" ${this.settings.musicEnabled ? 'checked' : ''} style="width:24px;height:24px"/>
          </label>
          <label>
            <span>🔊 Volume (${Math.round(this.settings.volume * 100)}%)</span>
            <input type="range" id="set-vol" min="0" max="100" value="${Math.round(this.settings.volume * 100)}" style="width:100%"/>
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center">
            <span>👁️ Mode Ramah Buta Warna</span>
            <input type="checkbox" id="set-cb" ${this.settings.colorblindMode ? 'checked' : ''} style="width:24px;height:24px"/>
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center">
            <span>🔠 Teks Besar</span>
            <input type="checkbox" id="set-large" ${this.settings.largeText ? 'checked' : ''} style="width:24px;height:24px"/>
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center">
            <span>✨ Kurangi Gerakan (Reduced Motion)</span>
            <input type="checkbox" id="set-rm" ${this.settings.reducedMotion ? 'checked' : ''} style="width:24px;height:24px"/>
          </label>
          <button class="doodle-btn doodle-btn-primary" id="btn-close-settings">Simpan</button>
        </div>
      </div>
    `;
  }

  private renderDebugPanel(): string {
    return `
      <div class="debug-panel">
        <b>🛠️ DEBUG PANEL</b>
        <div id="debug-stats">FPS: ${this.debugStats.fps} | Draw: ${this.debugStats.drawCalls} | v${this.gameState?.stateVersion ?? 0}</div>
        <div>Paksa Dadu:</div>
        <div class="debug-dice-row">
          ${[1, 2, 3, 4, 5, 6].map((n) => `<button class="doodle-btn" data-dbg-dice="${n}">${n}</button>`).join('')}
        </div>
        ${
          this.controller?.debugJumpToTile
            ? `<div style="display:flex;gap:4px">
                 <input class="doodle-input" id="dbg-tile-inp" type="number" min="1" max="100" value="97" style="min-height:34px;padding:4px"/>
                 <button class="doodle-btn" id="dbg-jump-btn" style="min-height:34px;padding:4px 8px">Loncat</button>
               </div>
               <div style="display:flex;gap:4px">
                 <select class="doodle-input" id="dbg-arch-sel" style="min-height:34px;padding:4px">
                   ${[...PLAYABLE_TILE_ARCHETYPES, 'boss_doodle'].map((a) => `<option value="${a}">${a}</option>`).join('')}
                 </select>
                 <button class="doodle-btn" id="dbg-trig-btn" style="min-height:34px;padding:4px 8px">Picu</button>
               </div>`
            : ''
        }
      </div>
    `;
  }

  private bindMainEvents(): void {
    const q = <T extends HTMLElement>(sel: string) => this.mainLayer.querySelector<T>(sel);

    q('#btn-splash-play')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.screen = 'menu';
      this.render();
    });

    q('#btn-splash-reconnect')?.addEventListener('click', () => {
      const saved = OnlineGameController.getSavedSession();
      if (!saved) return;
      this.sound.playUiClick();
      const online = new OnlineGameController(this.scene, this.createSessionCallbacks());
      this.onlineController = online;
      this.controller = online;
      online.joinRoom(saved.roomCode, this.draftName, this.draftPawn, this.draftColor, {
        reconnectToken: saved.reconnectToken,
        accessory: this.draftAccessory,
      });
      this.screen = 'lobby';
      this.render();
    });

    q('#btn-menu-studio')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.openCharacterStudio('profile');
    });
    q('#btn-menu-online')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.screen = 'online_setup';
      this.render();
    });
    q('#btn-menu-local')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.screen = 'local_setup';
      this.render();
    });
    q('#btn-menu-bot')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.screen = 'bot_setup';
      this.render();
    });
    q('#btn-menu-howto')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showHowToPlay = true;
      this.renderModalsLayer();
    });
    q('#btn-menu-settings')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showSettings = true;
      this.renderModalsLayer();
    });
    q('#btn-back-menu')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.screen = 'menu';
      this.render();
    });

    // Draft pickers & rule preset
    q<HTMLInputElement>('#inp-name')?.addEventListener('input', (e) => {
      this.draftName = (e.target as HTMLInputElement).value;
    });
    q('#btn-open-studio-profile')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.openCharacterStudio('profile');
    });
    q<HTMLInputElement>('#inp-room-code')?.addEventListener('input', (e) => {
      this.draftRoomCode = (e.target as HTMLInputElement).value.toUpperCase();
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-pick-pawn]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.draftPawn = el.dataset.pickPawn as PawnId;
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-pick-acc]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.draftAccessory = el.dataset.pickAcc as AccessoryId;
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-pick-color]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.draftColor = el.dataset.pickColor as PlayerColorId;
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-rule-preset]').forEach((el) => {
      el.onclick = () => {
        const preset = el.dataset.rulePreset as GameModePreset;
        this.sound.playUiClick();
        this.draftRulePreset = preset;
        if (this.screen === 'lobby') {
          this.onlineController?.setRoomSettings(preset);
        } else {
          this.renderMainLayer();
        }
      };
    });

    // Online create / join
    q('#btn-create-room')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const online = new OnlineGameController(this.scene, this.createSessionCallbacks());
      this.onlineController = online;
      this.controller = online;
      online.createRoom(
        this.draftName.trim() || 'Pemain',
        this.draftPawn,
        this.draftColor,
        this.draftAccessory,
      );
      this.screen = 'lobby';
      this.render();
    });

    const doJoinOnline = (asSpectator: boolean) => {
      const code = this.draftRoomCode.trim().toUpperCase();
      if (code.length !== 4) {
        this.showToast('Masukkan kode room 4 huruf ya!');
        return;
      }
      this.sound.playUiClick();
      const online = new OnlineGameController(this.scene, this.createSessionCallbacks());
      this.onlineController = online;
      this.controller = online;
      online.joinRoom(code, this.draftName.trim() || 'Pemain', this.draftPawn, this.draftColor, {
        asSpectator,
        accessory: this.draftAccessory,
      });
      this.screen = 'lobby';
      this.render();
    };
    q('#btn-join-room')?.addEventListener('click', () => doJoinOnline(false));
    q('#btn-join-spectator')?.addEventListener('click', () => doJoinOnline(true));

    // Local hot-seat setup
    this.mainLayer.querySelectorAll<HTMLElement>('[data-local-count]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.draftLocalCount = Number(el.dataset.localCount);
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLInputElement>('[data-local-name]').forEach((inp) => {
      inp.oninput = () => {
        this.draftLocalNames[Number(inp.dataset.localName)] = inp.value;
      };
    });
    const allPawns = Object.keys(PAWN_META) as PawnId[];
    const allColors = Object.keys(PLAYER_COLORS) as PlayerColorId[];
    this.mainLayer.querySelectorAll<HTMLElement>('[data-local-pawn]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.localPawn);
        const prevShort = PAWN_META[this.draftLocalPawns[idx]].shortName;
        const cur = allPawns.indexOf(this.draftLocalPawns[idx]);
        const nextPawn = allPawns[(cur + 1) % allPawns.length];
        this.draftLocalPawns[idx] = nextPawn;
        if (this.draftLocalNames[idx] === prevShort || /^Pemain \d+$/.test(this.draftLocalNames[idx])) {
          this.draftLocalNames[idx] = PAWN_META[nextPawn].shortName;
        }
        this.sound.playUiClick();
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-local-color]').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.localColor);
        const cur = allColors.indexOf(this.draftLocalColors[idx]);
        this.draftLocalColors[idx] = allColors[(cur + 1) % allColors.length];
        this.sound.playUiClick();
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-local-studio]').forEach((btn) => {
      btn.onclick = () => {
        this.sound.playUiClick();
        this.openCharacterStudio('local', Number(btn.dataset.localStudio));
      };
    });
    q('#btn-start-local')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const players: CreatePlayerInput[] = Array.from({ length: this.draftLocalCount }, (_, i) => ({
        id: `local_${i + 1}`,
        name: this.draftLocalNames[i].trim() || `Pemain ${i + 1}`,
        pawn: this.draftLocalPawns[i],
        color: this.draftLocalColors[i],
        accessory: this.draftLocalAccessories[i],
        isBot: false,
      }));
      this.recordedMatchKey = null;
      this.controller = new LocalGameController(
        'local',
        players,
        this.scene,
        this.createSessionCallbacks(),
        this.draftRulePreset,
      );
      this.screen = 'game';
      this.render();
    });

    // Bot setup
    this.mainLayer.querySelectorAll<HTMLElement>('[data-bot-count]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.draftBotCount = Number(el.dataset.botCount);
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-bot-diff]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.draftBotDiff = el.dataset.botDiff as BotDifficulty;
        this.renderMainLayer();
      };
    });
    q('#btn-start-bot')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const players = buildBotPlayers(
        this.draftName.trim() || 'Kamu',
        this.draftPawn,
        this.draftColor,
        this.draftBotCount,
        this.draftBotDiff,
        this.draftAccessory,
      );
      this.recordedMatchKey = null;
      this.controller = new LocalGameController(
        'bot',
        players,
        this.scene,
        this.createSessionCallbacks(),
        this.draftRulePreset,
      );
      this.screen = 'game';
      this.render();
    });

    // Lobby controls
    q<HTMLSelectElement>('#sel-lobby-bot-diff')?.addEventListener('change', (e) => {
      this.draftLobbyBotDiff = (e.target as HTMLSelectElement).value as BotDifficulty;
    });
    q('#btn-copy-invite')?.addEventListener('click', () => {
      if (!this.roomState) return;
      const roomCode = this.roomState.roomCode;
      const url = `${window.location.origin}/?room=${roomCode}`;
      this.sound.playUiClick();
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(url).then(
          () => this.showToast(`Link room ${roomCode} disalin!`),
          () => this.showToast(`Kode room: ${roomCode}`),
        );
      } else if (typeof navigator.share === 'function') {
        void navigator
          .share({
            title: 'DodSnake — Gabung Room!',
            text: `Main DodSnake bareng yuk! Kode room: ${roomCode}`,
            url,
          })
          .catch(() => this.showToast(`Kode room: ${roomCode}`));
      } else {
        this.showToast(`Kode room: ${roomCode}`);
      }
    });
    q('#btn-lobby-studio')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.openCharacterStudio('lobby');
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-remove-bot]').forEach((btn) => {
      btn.onclick = () => {
        this.sound.playUiClick();
        this.onlineController?.removeBot(btn.dataset.removeBot!);
      };
    });
    q('#btn-lobby-add-bot')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.onlineController?.addBot(this.draftLobbyBotDiff);
    });
    q('#btn-lobby-start')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.onlineController?.startGame();
    });
    q('#btn-lobby-ready')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const myId = this.onlineController?.getLocalPlayerId();
      const me = this.roomState?.players.find((p) => p.id === myId);
      this.onlineController?.setReady(!me?.ready);
    });
    q('#btn-leave-lobby')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.onlineController?.leave();
    });

    // Game HUD controls
    q('#btn-roll-dice')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.controller?.rollDice();
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-pick-dice]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.controller?.selectDice(Number(el.dataset.pickDice) as 0 | 1);
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-use-item]').forEach((el) => {
      el.onclick = () => {
        this.sound.playUiClick();
        this.controller?.useItem(Number(el.dataset.useItem));
      };
    });
    q('#btn-buy-star-item')?.addEventListener('click', () => {
      this.sound.playShopBuy();
      this.controller?.buyStarItem();
    });
    q('#btn-toggle-feed')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.feedOpen = !this.feedOpen;
      this.renderMainLayer();
    });
    q('#btn-toggle-emote')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.emoteTrayOpen = !this.emoteTrayOpen;
      this.renderMainLayer();
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-send-emote]').forEach((el) => {
      el.onclick = () => {
        this.emoteTrayOpen = false;
        this.controller?.sendEmote(el.dataset.sendEmote as EmoteId);
        this.renderMainLayer();
      };
    });
    this.mainLayer.querySelectorAll<HTMLElement>('[data-focus-player]').forEach((el) => {
      el.onclick = () => {
        const pid = el.dataset.focusPlayer;
        if (!pid) return;
        this.sound.playUiClick();
        if (this.scene.getPreferredCameraMode() === 'overview') {
          this.scene.setPreferredCameraMode('follow');
          this.renderMainLayer();
        }
        this.scene.focusPlayer(pid);
      };
    });
    q('#btn-hud-cam')?.addEventListener('click', () => {
      this.sound.playUiClick();
      const next = this.scene.getPreferredCameraMode() === 'overview' ? 'follow' : 'overview';
      this.scene.resetCameraOrbit();
      this.scene.setPreferredCameraMode(next);
      this.renderMainLayer();
    });
    q('#btn-hud-reset-cam')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.scene.resetCameraOrbit();
      const activeId = this.gameState?.turnOrder[this.gameState.currentTurnIndex];
      if (activeId) {
        this.scene.focusPlayer(activeId);
      }
    });
    q('#btn-hud-music')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.settings.musicEnabled = !this.settings.musicEnabled;
      this.applyAccessibilitySettings();
      this.renderMainLayer();
    });
    q('#btn-hud-mute')?.addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      this.applyAccessibilitySettings();
      this.renderMainLayer();
    });
    q('#btn-hud-settings')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showSettings = true;
      this.renderModalsLayer();
    });
    q('#btn-hud-leave')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.controller?.leave();
    });

    // Debug Panel
    this.mainLayer.querySelectorAll<HTMLElement>('[data-dbg-dice]').forEach((el) => {
      el.onclick = () => this.controller?.rollDice(Number(el.dataset.dbgDice));
    });
    q('#dbg-jump-btn')?.addEventListener('click', () => {
      const val = Number(q<HTMLInputElement>('#dbg-tile-inp')?.value ?? 1);
      this.controller?.debugJumpToTile?.(val);
    });
    q('#dbg-trig-btn')?.addEventListener('click', () => {
      const arch = q<HTMLSelectElement>('#dbg-arch-sel')?.value as ChallengeArchetype;
      if (arch) this.controller?.debugTriggerArchetype?.(arch);
    });
  }

  private bindModalEvents(): void {
    const q = <T extends HTMLElement>(sel: string) => this.modalLayer.querySelector<T>(sel);

    if (this.studioContext) {
      const stageEl = q<HTMLElement>('#studio-preview-stage');
      if (stageEl) {
        this.studioPreviewStage?.dispose();
        this.studioPreviewStage = new PawnPreviewStage(stageEl);
        this.studioPreviewStage.setSelection(
          this.studioContext.pawn,
          this.studioContext.color,
          this.studioContext.accessory,
        );
      }

      q('#btn-studio-cancel')?.addEventListener('click', () => {
        this.sound.playUiClick();
        this.closeCharacterStudio(false);
      });
      q('#btn-studio-close')?.addEventListener('click', () => {
        this.sound.playUiClick();
        this.closeCharacterStudio(false);
      });
      q('#btn-studio-save')?.addEventListener('click', () => {
        this.sound.playUiClick();
        this.closeCharacterStudio(true);
      });

      const nameInp = q<HTMLInputElement>('#inp-studio-name');
      nameInp?.addEventListener('input', (e) => {
        if (this.studioContext) {
          this.studioContext.name = (e.target as HTMLInputElement).value;
        }
      });

      this.modalLayer.querySelectorAll<HTMLElement>('[data-studio-pawn]').forEach((btn) => {
        btn.onclick = () => {
          if (!this.studioContext) return;
          const nextPawn = btn.dataset.studioPawn as PawnId;
          const prevShort = PAWN_META[this.studioContext.pawn].shortName;
          const curName = this.studioContext.name.trim();
          if (
            this.studioContext.mode === 'local' &&
            (!curName || curName === prevShort || /^Pemain \d+$/.test(curName))
          ) {
            this.studioContext.name = PAWN_META[nextPawn].shortName;
            if (nameInp) nameInp.value = this.studioContext.name;
          }
          this.studioContext.pawn = nextPawn;
          this.sound.playUiClick();
          this.syncStudioLiveUi();
        };
      });

      this.modalLayer.querySelectorAll<HTMLElement>('[data-studio-acc]').forEach((btn) => {
        btn.onclick = () => {
          if (!this.studioContext) return;
          this.studioContext.accessory = btn.dataset.studioAcc as AccessoryId;
          this.sound.playUiClick();
          this.syncStudioLiveUi();
        };
      });

      this.modalLayer.querySelectorAll<HTMLElement>('[data-studio-color]').forEach((btn) => {
        btn.onclick = () => {
          if (!this.studioContext) return;
          this.studioContext.color = btn.dataset.studioColor as PlayerColorId;
          this.sound.playUiClick();
          this.syncStudioLiveUi();
        };
      });
    }

    q('#btn-podium-rematch')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.recordedMatchKey = null;
      this.activityFeed = [];
      this.controller?.rematch();
    });
    q('#btn-podium-menu')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.controller?.leave();
    });
    q('#btn-close-howto')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showHowToPlay = false;
      this.renderModalsLayer();
    });
    q('#btn-close-settings')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showSettings = false;
      this.renderModalsLayer();
      this.renderMainLayer();
    });
    q<HTMLInputElement>('#set-mute')?.addEventListener('change', (e) => {
      this.settings.muted = (e.target as HTMLInputElement).checked;
      this.applyAccessibilitySettings();
    });
    q<HTMLInputElement>('#set-music')?.addEventListener('change', (e) => {
      this.settings.musicEnabled = (e.target as HTMLInputElement).checked;
      this.applyAccessibilitySettings();
    });
    q<HTMLInputElement>('#set-vol')?.addEventListener('input', (e) => {
      this.settings.volume = Number((e.target as HTMLInputElement).value) / 100;
      this.applyAccessibilitySettings();
    });
    q<HTMLInputElement>('#set-cb')?.addEventListener('change', (e) => {
      this.settings.colorblindMode = (e.target as HTMLInputElement).checked;
      this.applyAccessibilitySettings();
    });
    q<HTMLInputElement>('#set-large')?.addEventListener('change', (e) => {
      this.settings.largeText = (e.target as HTMLInputElement).checked;
      this.applyAccessibilitySettings();
    });
    q<HTMLInputElement>('#set-rm')?.addEventListener('change', (e) => {
      this.settings.reducedMotion = (e.target as HTMLInputElement).checked;
      this.applyAccessibilitySettings();
    });
  }

  private bindTransientEvents(): void {
    this.overlayLayer.querySelector('#btn-speed-2x')?.addEventListener('click', () => {
      this.scene.toggleSpeedUp(!this.scene.isSpeedUp());
    });
    this.overlayLayer.querySelector('#btn-skip-anim')?.addEventListener('click', () => {
      this.scene.skipCurrentAnimation();
    });
  }
}
