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
  sanitizeUsernameOrFallback,
  validateUsername,
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
  renderEmoteSvg,
  renderItemSvg,
  renderPawnAvatarSvg,
  renderUiIconSvg,
  type UiIconKind,
} from '../challenges/doodleIcons.js';
import { LocalGameController, buildBotPlayers } from '../controllers/localGameController.js';
import { OnlineGameController } from '../controllers/onlineGameController.js';
import type { GameSessionController, SessionCallbacks } from '../controllers/gameTypes.js';
import {
  COLORBLIND_SHAPES,
  formatEventFeedText,
  formatMissionText,
  getAccessoryMeta,
  getArchetypeMeta,
  getBotDiffLabel,
  getColorName,
  getEmoteLabel,
  getItemMeta,
  getLocalizedGiftVariant,
  getModeMeta,
  getPawnMeta,
  getZoneName,
  localizeText,
  tr,
  type AppLanguage,
  type UiKey,
} from '../i18n/translations.js';

type ScreenKind = 'splash' | 'menu' | 'online_setup' | 'local_setup' | 'bot_setup' | 'lobby' | 'game';

interface AccessibilitySettings {
  muted: boolean;
  musicEnabled: boolean;
  volume: number;
  colorblindMode: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  language: AppLanguage;
}

interface CareerStats {
  matches: number;
  wins: number;
  starsEarned: number;
  challengesWon: number;
}

const SETTINGS_STORAGE_KEY = 'doodle_dash_settings_v3';
const CAREER_STORAGE_KEY = 'doodle_dash_career_v1';

const EMOTE_LIST: Array<{ id: EmoteId; label: string }> = [
  { id: 'jempol', label: 'Mantap!' },
  { id: 'ketawa', label: 'Wkwk!' },
  { id: 'kaget', label: 'Waduh!' },
  { id: 'nangis', label: 'Huwaa!' },
  { id: 'api', label: 'Gass!' },
  { id: 'mahkota', label: 'Juara!' },
];

interface ActivityEntry {
  icon: UiIconKind | { item: ItemType };
  text: string;
}

interface FloatingEmoteState {
  playerName: string;
  emoteId: EmoteId;
  label: string;
}

interface SuperlativeAward {
  icon: UiIconKind | { item: ItemType };
  label: string;
}

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
  private showSupportModal = false;
  private emoteTrayOpen = false;
  private feedOpen = typeof window === 'undefined' ? true : window.innerWidth >= 880;
  private hudCompact = false;
  private speed2x = false;
  private isAnimating = false;
  private toastMessage: string | null = null;
  private toastTimer: number | null = null;
  private turnBannerText: string | null = null;
  private turnBannerTimer: number | null = null;
  private floatingEmote: FloatingEmoteState | null = null;
  private floatingEmoteTimer: number | null = null;
  private debugStats: SceneDebugStats = { fps: 60, drawCalls: 0, triangles: 0 };
  private activityFeed: ActivityEntry[] = [];

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
  private animatingCount = 0;
  private rollRequestPending = false;
  private rollPendingTimer: number | null = null;
  private lastTurnAudioKey = '';
  private lastUrgentTickSec = -1;
  private showLegendPopover = false;

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
  private readonly colorShapes = COLORBLIND_SHAPES;

  private get lang(): AppLanguage {
    return this.settings.language;
  }

  private t(key: UiKey, vars?: Record<string, string | number>): string {
    return tr(this.settings.language, key, vars);
  }

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

    this.setupResilientTurnHandlers();

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
      language: 'id',
    };
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = raw ? { ...defaults, ...(JSON.parse(raw) as Partial<AccessibilitySettings>) } : defaults;
      parsed.language = parsed.language === 'en' ? 'en' : 'id';
      return parsed;
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
    this.scene.setColorblindMode(this.settings.colorblindMode);
    this.scene.setLanguage(this.settings.language);
    document.documentElement.lang = this.settings.language;
    document.body.classList.toggle('large-text', this.settings.largeText);
    document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
    document.body.classList.toggle('colorblind-mode', this.settings.colorblindMode);
    this.saveSettings();
  }

  private pushActivity(icon: UiIconKind | { item: ItemType }, text: string): void {
    this.activityFeed.unshift({ icon, text });
    if (this.activityFeed.length > 10) {
      this.activityFeed.length = 10;
    }
  }

  private renderActivityIcon(icon: UiIconKind | { item: ItemType }, size = 14): string {
    return typeof icon === 'string' ? renderUiIconSvg(icon, size) : renderItemSvg(icon.item, size);
  }

  private ingestEventsIntoFeed(events: GameEvent[], state: GameState): void {
    for (const ev of events) {
      const formatted = formatEventFeedText(ev, state, this.lang);
      if (!formatted) continue;

      let icon: UiIconKind | { item: ItemType } = 'spark';
      if (ev.type === 'DiceRolled') icon = 'dice';
      else if (ev.type === 'LadderClimbed') icon = 'ladder';
      else if (ev.type === 'SnakeBitten') {
        icon = ev.dodgedByChallenge ? 'spark' : ev.blockedByShield ? { item: 'shield' } : 'snake';
      } else if (ev.type === 'ItemUsed' || ev.type === 'ItemGained') {
        icon = { item: ev.item };
      } else if (ev.type === 'ChallengeResolved') {
        icon = 'flame';
      } else if (ev.type === 'BoardSpecialTriggered') {
        icon = ev.kind === 'shield_shrine' ? { item: 'shield' } : ev.grantedItem ? { item: ev.grantedItem } : 'spark';
      } else if (ev.type === 'MissionCompleted') {
        icon = 'mission';
      } else if (ev.type === 'TurnSkipped') {
        icon = 'skip';
      } else if (ev.type === 'GameWon') {
        icon = 'trophy';
      }

      this.pushActivity(icon, formatted.text);
      if (formatted.toast) {
        this.showToast(formatted.toast);
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
        this.syncTurnAudioCue(state);
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
        if (events.some((e) => e.type === 'DiceRolled' || e.type === 'TurnStarted' || e.type === 'GameWon')) {
          this.clearRollPending();
          this.scene.cancelOptimisticDiceShake();
        }
        this.gameState = finalState;
        this.syncTurnAudioCue(finalState);
        this.animatingCount += 1;
        this.isAnimating = this.animatingCount > 0;
        this.render();
        try {
          await this.scene.enqueueEvents(events, finalState);
        } finally {
          this.animatingCount = Math.max(0, this.animatingCount - 1);
          this.isAnimating = this.animatingCount > 0;
          this.gameState = finalState;
          this.syncTurnAudioCue(finalState);
          this.recordCareerIfFinished(finalState);
          this.render();
        }
      },
      onChallengePrompt: (challenge, localParticipantId) => {
        const isAllowedParticipant =
          localParticipantId === challenge.ownerPlayerId ||
          (challenge.mode === 'duel' &&
            !challenge.awaitingDuelPick &&
            challenge.opponentId === localParticipantId);
        if (!isAllowedParticipant) {
          return;
        }
        const duelReady = challenge.mode !== 'duel' || !challenge.awaitingDuelPick;
        const sameDuel =
          this.activeChallengeModal &&
          this.activeChallengeModal.challenge.tileId === challenge.tileId &&
          this.activeChallengeModal.challenge.seed === challenge.seed &&
          this.activeChallengeModal.duelPicked === duelReady;
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
          duelPicked: challenge.mode !== 'duel' || !isOwner || !challenge.awaitingDuelPick,
        };
        this.renderChallengeLayerIfNeeded();
      },
      onChallengeStamp: (success, summary) => {
        this.activeChallengeModal?.cleanup?.();
        cancelAnimationFrame(this.challengeTimerRaf);
        const localizedSummary = localizeText(summary, this.lang);
        if (this.activeChallengeModal) {
          this.activeChallengeModal.stamp = { success, summary: localizedSummary };
        } else {
          this.activeChallengeModal = {
            challenge: this.gameState?.activeChallenge ?? {
              tileId: 1,
              archetype: 'gift_trap',
              mode: 'solo',
              difficulty: 1,
              title: this.lang === 'en' ? 'Bot Turn' : 'Giliran Bot',
              flavorText: localizedSummary,
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
            stamp: { success, summary: localizedSummary },
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
        this.floatingEmote = {
          playerName: player?.name ?? (this.lang === 'en' ? 'Player' : 'Pemain'),
          emoteId,
          label: getEmoteLabel(emoteId, this.lang),
        };
        this.sound.playUiClick();
        if (this.floatingEmoteTimer) clearTimeout(this.floatingEmoteTimer);
        this.renderOverlaysOnly();
        this.floatingEmoteTimer = window.setTimeout(() => {
          this.floatingEmote = null;
          this.renderOverlaysOnly();
        }, 2200);
      },
      onError: (msg) => {
        const localized = localizeText(msg, this.lang);
        if (this.screen === 'lobby' && !this.roomState) {
          this.onlineController?.leave();
          this.screen = 'online_setup';
          this.render();
          this.showToast(localized);
        } else {
          this.showToast(localized);
        }
      },
      onTurnBanner: (playerName) => {
        this.turnBannerText = this.lang === 'en' ? `${playerName}'s Turn!` : `Giliran ${playerName}!`;
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
        this.floatingEmote = null;
        this.hudCompact = false;
        this.scene.setPreferredCameraMode('overview');
        this.screen = 'menu';
        this.render();
      },
    };
  }

  private readonly handleGlobalKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && (this.showSupportModal || this.showHowToPlay || this.showSettings)) {
      this.showSupportModal = false;
      this.showHowToPlay = false;
      this.showSettings = false;
      this.renderModalsLayer();
      return;
    }
    if (
      this.screen !== 'game' ||
      this.activeChallengeModal ||
      this.showHowToPlay ||
      this.showSettings ||
      this.showSupportModal ||
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
    const localId = this.controller?.getLocalPlayerId() ?? null;
    const rawCh =
      this.screen === 'game' &&
      !this.activeChallengeModal &&
      this.gameState?.phase === 'CHALLENGE'
        ? this.gameState.activeChallenge
        : null;
    const isMyPromptedChallenge =
      Boolean(rawCh && localId) &&
      (rawCh!.mode === 'duel' && rawCh!.awaitingDuelPick
        ? rawCh!.ownerPlayerId === localId
        : rawCh!.participantIds.includes(localId!));
    const ch = isMyPromptedChallenge ? null : rawCh;
    let watchBanner = '';
    if (ch && this.gameState) {
      const ownerName = this.gameState.players.find((p) => p.id === ch.ownerPlayerId)?.name ?? '';
      if (ch.mode === 'duel' && ch.awaitingDuelPick) {
        watchBanner = this.t('duelPickWait', { name: ownerName });
      } else if (ch.mode === 'duel' && ch.opponentId) {
        const oppName = this.gameState.players.find((p) => p.id === ch.opponentId)?.name ?? '';
        watchBanner = this.t('spectatingDuel', { a: ownerName, b: oppName, tile: ch.tileId });
      } else {
        const archName = getArchetypeMeta(ch.archetype, this.lang).name;
        watchBanner = this.t('spectatingChallenge', {
          name: ownerName,
          challenge: archName,
          tile: ch.tileId,
        });
      }
    }

    return `
      ${this.turnBannerText ? `<div class="turn-banner">${escapeHtml(this.turnBannerText)}</div>` : ''}
      ${watchBanner ? `<div class="challenge-watch-pill">${renderUiIconSvg('timer', 14)}<span>${escapeHtml(watchBanner)}</span></div>` : ''}
      ${
        this.floatingEmote
          ? `<div class="floating-emote">
               <span class="floating-emote-ico">${renderEmoteSvg(this.floatingEmote.emoteId, 20)}</span>
               <span><strong>${escapeHtml(this.floatingEmote.playerName)}:</strong> ${escapeHtml(this.floatingEmote.label)}</span>
             </div>`
          : ''
      }
      ${this.toastMessage ? `<div class="floating-emote" style="background:var(--pink)">${escapeHtml(this.toastMessage)}</div>` : ''}
      ${
        this.isAnimating
          ? `<div class="anim-controls-pill">
               <button class="doodle-btn" id="btn-speed-2x">
                 <span class="ui-ico-row">${renderUiIconSvg('play', 14)}<span>${this.speed2x ? (this.lang === 'en' ? '2x Active' : '2x Aktif') : this.t('speed2x')}</span></span>
               </button>
               <button class="doodle-btn" id="btn-skip-anim">
                 <span class="ui-ico-row">${renderUiIconSvg('skip', 14)}<span>${this.t('skip')}</span></span>
               </button>
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
      this.settings.language,
      studioKey,
      this.gameState?.phase === 'GAME_OVER' ? `podium:${this.gameState.winnerId}` : 'no-pod',
      this.showHowToPlay ? 'howto' : '',
      this.showSettings ? `set:${this.settings.muted}:${this.settings.musicEnabled}:${Math.round(this.settings.volume * 100)}:${this.settings.colorblindMode}:${this.settings.largeText}:${this.settings.reducedMotion}` : '',
      this.showSupportModal ? 'support' : '',
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
      ${this.showSupportModal ? this.renderSupportModal() : ''}
    `;
    this.bindModalEvents();
  }

  private renderChallengeLayerIfNeeded(): void {
    const modal = this.activeChallengeModal;
    const key = modal
      ? `${modal.challenge.tileId}:${modal.challenge.seed}:${modal.localParticipantId}:${modal.challenge.opponentId ?? ''}:${modal.challenge.awaitingDuelPick ? 1 : 0}:${modal.duelPicked ? 1 : 0}:${modal.stamp ? modal.stamp.summary : ''}`
      : 'none';

    if (key === this.renderedChallengeKey) return;
    this.renderedChallengeKey = key;
    this.renderOverlaysOnly();

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
            language: this.settings.language,
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

  private setupResilientTurnHandlers(): void {
    // Capture-phase delegation prevents DOM rebuilds or lingering animations from dropping taps
    this.mainLayer.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest('#btn-roll-dice')) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerLocalRoll();
          return;
        }
        if (target.closest('#btn-hud-legend')) {
          e.preventDefault();
          e.stopPropagation();
          this.sound.playUiClick();
          this.showLegendPopover = !this.showLegendPopover;
          this.render();
          return;
        }
        if (target.closest('#btn-close-legend')) {
          e.preventDefault();
          e.stopPropagation();
          this.sound.playUiClick();
          this.showLegendPopover = false;
          this.render();
        }
      },
      true,
    );

    // Capture Space so leftover animations never lock keyboard dice rolling
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'Space' || e.repeat) return;
        const activeTag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
        if (
          this.screen !== 'game' ||
          this.showSettings ||
          this.showHowToPlay ||
          this.showSupportModal ||
          this.studioContext ||
          this.activeChallengeModal
        ) {
          return;
        }
        if (this.canLocalRollNow()) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerLocalRoll();
        }
      },
      true,
    );

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.screen === 'game') {
        if (this.scene.hasActiveAnimation()) {
          this.scene.skipCurrentAnimation(true);
        }
        this.animatingCount = 0;
        this.isAnimating = false;
        this.clearRollPending();
        this.render();
      }
    });
  }

  private clearRollPending(): void {
    if (this.rollPendingTimer !== null) {
      clearTimeout(this.rollPendingTimer);
      this.rollPendingTimer = null;
    }
    this.rollRequestPending = false;
  }

  private armRollPending(): void {
    this.clearRollPending();
    this.rollRequestPending = true;
    this.render();
    this.rollPendingTimer = window.setTimeout(() => {
      this.rollPendingTimer = null;
      this.rollRequestPending = false;
      this.scene.cancelOptimisticDiceShake();
      this.render();
    }, 1800);
  }

  private canLocalRollNow(state: GameState | null = this.gameState): boolean {
    if (!state || state.phase !== 'TURN_BEGIN' || this.rollRequestPending) return false;
    if (this.controller?.isSpectator()) return false;
    const activeId = state.turnOrder[state.currentTurnIndex];
    const localId = this.controller?.getLocalPlayerId();
    return Boolean(localId && activeId === localId);
  }

  private triggerLocalRoll(): void {
    if (!this.canLocalRollNow()) return;
    if (this.scene.hasActiveAnimation()) {
      this.scene.skipCurrentAnimation(true);
    }
    this.animatingCount = 0;
    this.isAnimating = false;
    this.showLegendPopover = false;
    this.armRollPending();
    this.controller?.rollDice();
  }

  private syncTurnAudioCue(state: GameState | null): void {
    if (!state) {
      this.clearRollPending();
      this.scene.cancelOptimisticDiceShake();
      return;
    }
    if (
      state.phase !== 'CHALLENGE' &&
      !state.activeChallenge &&
      this.activeChallengeModal &&
      !this.activeChallengeModal.stamp
    ) {
      this.activeChallengeModal.cleanup?.();
      this.activeChallengeModal = null;
      this.renderChallengeLayerIfNeeded();
    }
    if (state.phase !== 'TURN_BEGIN') {
      this.clearRollPending();
      if (state.phase !== 'MOVE' && state.phase !== 'ROLL') {
        this.scene.cancelOptimisticDiceShake();
      }
      return;
    }
    const activeId = state.turnOrder[state.currentTurnIndex];
    const localId = this.controller?.getLocalPlayerId();
    if (!this.controller?.isSpectator() && localId && activeId === localId) {
      const turnKey = `${state.turnNumber}:${activeId}:${state.turnDeadlineAt ?? 0}`;
      if (turnKey !== this.lastTurnAudioKey) {
        this.lastTurnAudioKey = turnKey;
        this.lastUrgentTickSec = -1;
        this.clearRollPending();
        this.sound.playTurnReady();
      }
    }
  }

  private computeTurnForecastHint(state: GameState, player: Player): string | null {
    const en = this.lang === 'en';
    const maxDie = player.activeBrake ? 3 : 6;
    const ladderHits: string[] = [];
    const snakeHits: string[] = [];
    let canWin = false;
    for (let die = 1; die <= maxDie; die++) {
      const prev = previewDiceLanding(
        BOARD_LAYOUT,
        player.position,
        die,
        player.activeTurbo,
        player.pawn,
      );
      if (prev.to === 100 && !prev.bounced) canWin = true;
      if (prev.ladderTo) ladderHits.push(`+${die}`);
      if (prev.snakeTo) snakeHits.push(`+${die}`);
    }
    if (canWin) return en ? 'Shot at 100!' : 'Bisa Finis 100!';
    if (ladderHits.length > 0) {
      return `${en ? 'Ladder' : 'Tangga'}: ${ladderHits.slice(0, 2).join('/')}`;
    }
    if (snakeHits.length > 0) {
      return `${en ? 'Snake' : 'Ular'}: ${snakeHits.slice(0, 2).join('/')}`;
    }
    if (player.items.length > 0) {
      return en ? `${player.items.length} item ready` : `${player.items.length} item siap`;
    }
    return null;
  }

  private renderLegendPopoverHtml(state: GameState): string {
    const en = this.lang === 'en';
    const modeInfo = getModeMeta(state.rulePreset, this.lang);
    const focusId = this.controller?.getLocalPlayerId() || state.turnOrder[state.currentTurnIndex];
    const focusPos = state.players.find((p) => p.id === focusId)?.position ?? 1;
    const curZone =
      state.board.zones.find((z) => focusPos >= z.startTile && focusPos <= z.endTile) ?? state.board.zones[0];
    return `
      <div class="doodle-card legend-popover" role="dialog" aria-label="${en ? 'Board Guide' : 'Panduan Papan'}">
        <div class="legend-head">
          <b>${escapeHtml(modeInfo.name)}</b>
          <button class="doodle-btn" id="btn-close-legend" style="min-height:24px;padding:1px 7px;font-size:0.74rem">x</button>
        </div>
        <p style="margin:3px 0 6px;font-size:0.76rem;opacity:0.85">${escapeHtml(modeInfo.description)}</p>
        ${
          curZone
            ? `<div class="legend-zone-pill"><span>${escapeHtml(getZoneName(curZone.id, this.lang))} (${curZone.startTile}-${curZone.endTile})</span><span>${PLAYABLE_TILE_ARCHETYPES.length} ${en ? 'Mini-Games' : 'Mini-Game'}</span></div>`
            : ''
        }
        <div class="legend-grid">
          <span class="legend-chip">${renderUiIconSvg('ladder', 13)} ${en ? 'Ladder: Win duel/quiz to climb' : 'Tangga: Tantangan sukses = naik'}</span>
          <span class="legend-chip">${renderUiIconSvg('snake', 13)} ${en ? 'Snake: Pass check or Shield to dodge' : 'Ular: Lolos uji / Perisai = aman'}</span>
          <span class="legend-chip">${renderUiIconSvg('star', 13)} ${en ? 'Star Tiles: Mini-games & Star Shop' : 'Petak Bintang: Mini-game & Toko'}</span>
          <span class="legend-chip">${renderUiIconSvg('mission', 13)} ${en ? 'Special Tiles & Bonus Missions' : 'Petak Spesial & Misi Bonus'}</span>
          <span class="legend-chip">${renderUiIconSvg('trophy', 13)} ${en ? 'Tile 100: Boss Trial to win' : 'Petak 100: Ujian Boss untuk juara'}</span>
        </div>
      </div>
    `;
  }

  private startTurnCountdown(): void {
    const updateBadge = () => {
      const el = this.mainLayer.querySelector<HTMLElement>('#hud-turn-timer');
      if (!el) return;
      const sec = this.computeTurnSecondsLeft();
      if (sec === null) {
        el.style.display = 'none';
        el.classList.remove('is-urgent');
        return;
      }
      el.style.display = 'flex';
      el.classList.toggle('is-urgent', sec <= 8);
      el.innerHTML = `<span class="ui-ico-row">${renderUiIconSvg('timer', 14)}<span>${sec}s</span></span>`;
      el.style.background = sec <= 8 ? 'var(--pink)' : 'rgba(255, 246, 229, 0.95)';

      const st = this.gameState;
      const activeId = st?.turnOrder[st.currentTurnIndex];
      const localId = this.controller?.getLocalPlayerId();
      if (
        st?.phase === 'TURN_BEGIN' &&
        !this.controller?.isSpectator() &&
        localId &&
        activeId === localId &&
        sec <= 5 &&
        sec >= 1 &&
        sec !== this.lastUrgentTickSec
      ) {
        this.lastUrgentTickSec = sec;
        this.sound.playTimerTick();
      }
    };

    updateBadge();
    this.turnCountdownInterval = window.setInterval(updateBadge, 250);
  }

  private renderLangToggleBtnHtml(): string {
    return `<button class="lang-toggle-btn" id="btn-toggle-lang" title="${this.t('languageSettingLabel')}">${renderUiIconSvg('globe', 13)}<span>${this.settings.language === 'en' ? 'EN' : 'ID'}</span></button>`;
  }

  private renderSplash(): string {
    const saved = OnlineGameController.getSavedSession();
    const en = this.lang === 'en';
    return `
      <div class="screen-showcase">
        <div class="doodle-card sketchbook-panel menu-box stagger-item">
          ${this.renderLangToggleBtnHtml()}
          <div class="showcase-badge">${renderUiIconSvg('dice', 18)} ${en ? '3D Sketchbook Snakes & Ladders' : 'Ular Tangga Sketchbook 3D'}</div>
          <h1 class="game-logo">DodSnake</h1>
          <p class="subtitle">${this.t('tagline')}</p>
          <button class="doodle-btn doodle-btn-primary stagger-item stagger-1" id="btn-splash-play">
            ${renderUiIconSvg('dice', 22)} ${en ? 'Play Now!' : 'Ayo Main!'}
          </button>
          ${
            saved
              ? `<button class="doodle-btn doodle-btn-mint stagger-item stagger-2" id="btn-splash-reconnect">${this.t('rejoinRoom')} (${saved.roomCode})</button>`
              : ''
          }
          <div class="showcase-hint">${en ? 'Drag the 3D board to orbit • Scroll to zoom' : 'Tarik papan 3D untuk mengintip sudut lain • Scroll untuk zoom'}</div>
        </div>
      </div>
    `;
  }

  private renderMenu(): string {
    const activeMeta = getPawnMeta(this.draftPawn, this.lang);
    const accMeta = getAccessoryMeta(this.draftAccessory, this.lang);
    const en = this.lang === 'en';
    return `
      <div class="screen-showcase">
        <div class="doodle-card sketchbook-panel menu-box">
          ${this.renderLangToggleBtnHtml()}
          <div class="showcase-badge">${renderUiIconSvg('trophy', 15)} ${en ? 'Adventure Mode' : 'Mode Petualangan'}</div>
          <h1 class="game-logo">DodSnake</h1>
          <p class="subtitle">${en ? 'Pick your favorite way to play!' : 'Pilih mode bermain favoritmu!'}</p>
          <button class="doodle-btn menu-profile-card stagger-item" id="btn-menu-studio" title="${this.t('studioTitle')}">
            <span class="menu-profile-avatar">${pawnSvg(this.draftPawn, this.draftColor, 38, this.draftAccessory)}</span>
            <span class="menu-profile-meta">
              <b>${escapeHtml(this.draftName)} • ${escapeHtml(activeMeta.shortName)}</b>
              <small>${escapeHtml(accMeta.name)} • ${escapeHtml(activeMeta.perkTitle)}</small>
            </span>
            <span class="menu-profile-cta">${en ? 'Customize' : 'Ganti Gaya'}</span>
          </button>
          ${
            this.career.matches > 0
              ? `<div class="career-banner tabular-num">
                   <span>${en ? 'Matches' : 'Main'}: <b>${this.career.matches}</b></span>
                   <span>${en ? 'Wins' : 'Menang'}: <b>${this.career.wins}</b></span>
                   <span>${renderUiIconSvg('star', 14)} <b>${this.career.starsEarned}</b></span>
                   <span>${en ? 'Won' : 'Duel'}: <b>${this.career.challengesWon}</b></span>
                 </div>`
              : ''
          }
          <button class="doodle-btn doodle-btn-primary stagger-item stagger-1" id="btn-menu-online">
            ${renderUiIconSvg('globe', 18)} ${this.t('playOnline')} (2-6)
          </button>
          <button class="doodle-btn doodle-btn-mint stagger-item stagger-2" id="btn-menu-local">
            ${renderUiIconSvg('users', 18)} ${this.t('playLocal')}
          </button>
          <button class="doodle-btn doodle-btn-blue stagger-item stagger-3" id="btn-menu-bot">
            ${renderUiIconSvg('bot', 18)} ${this.t('playBot')}
          </button>
          <div class="menu-util-row stagger-item stagger-4">
            <button class="doodle-btn" id="btn-menu-howto">${renderUiIconSvg('help', 15)} ${this.t('howToPlay')}</button>
            <button class="doodle-btn" id="btn-menu-settings">${renderUiIconSvg('settings', 15)} ${this.t('settings')}</button>
            <button class="doodle-btn doodle-btn-pink" id="btn-menu-support">${renderUiIconSvg('heart', 15)} ${this.t('supportBtn')}</button>
          </div>
          <div class="showcase-hint">${en ? 'Drag the 3D board to orbit the diorama' : 'Tarik papan 3D untuk mengintip diorama'}</div>
        </div>
      </div>
    `;
  }

  private renderRulePresetPickerHtml(canEdit: boolean): string {
    const presets: GameModePreset[] = ['klasik', 'kilat', 'pesta_item'];
    const currentMeta = getModeMeta(this.draftRulePreset, this.lang);
    return `
      <label><b>${this.t('modeRules')}</b></label>
      <div style="display:flex;gap:5px">
        ${presets
          .map((id) => {
            const m = getModeMeta(id, this.lang);
            return `
          <button class="doodle-btn ${this.draftRulePreset === id ? 'doodle-btn-blue' : ''}" style="flex:1;min-height:36px;font-size:0.84rem;padding:4px 6px" data-rule-preset="${id}" ${canEdit ? '' : 'disabled'} title="${escapeHtml(m.description)}">
            ${escapeHtml(m.shortLabel)}
          </button>`;
          })
          .join('')}
      </div>
      <div style="font-size:0.78rem;opacity:0.82;text-align:center;line-height:1.25">${escapeHtml(currentMeta.description)}</div>
    `;
  }

  private getLiveNameError(name: string): string | null {
    if (name.trim().length === 0) return null;
    const res = validateUsername(name);
    return res.ok ? null : localizeText(res.error ?? 'Nama pemain tidak diizinkan.', this.lang);
  }

  private renderCustomizationDraftHtml(): string {
    const pawns = Object.keys(PAWN_META) as PawnId[];
    const accessories = Object.keys(ACCESSORY_META) as AccessoryId[];
    const colors = Object.keys(PLAYER_COLORS) as PlayerColorId[];
    const selectedMeta = getPawnMeta(this.draftPawn, this.lang);
    const selectedAcc = getAccessoryMeta(this.draftAccessory, this.lang);
    const nameErr = this.getLiveNameError(this.draftName);
    return `
      <div class="setup-name-row">
        <input class="doodle-input ${nameErr ? 'is-invalid' : ''}" id="inp-name" maxlength="18" value="${escapeHtml(this.draftName)}" placeholder="${this.t('yourName')}" />
        <button class="doodle-btn doodle-btn-blue" id="btn-open-studio-profile" style="white-space:nowrap;padding:6px 10px" title="${this.t('studioTitle')}">${this.t('studio3dBtn')}</button>
      </div>
      <div class="name-error-hint" id="draft-name-error" style="${nameErr ? '' : 'display:none'}">${escapeHtml(nameErr ?? '')}</div>
      <div class="picker-grid">
        ${pawns
          .map((p) => {
            const pm = getPawnMeta(p, this.lang);
            return `
          <button class="doodle-btn pawn-chip ${this.draftPawn === p ? 'selected' : ''}" data-pick-pawn="${p}" title="${escapeHtml(pm.name)} (${escapeHtml(pm.perkTitle)})">
            <span>${pawnSvg(p, this.draftColor, 24, p === this.draftPawn ? this.draftAccessory : 'none')}</span>
            <span>${escapeHtml(pm.shortName)}</span>
          </button>`;
          })
          .join('')}
      </div>
      <div class="char-bio-card">
        <div class="char-bio-top">
          <b>${escapeHtml(selectedMeta.name)}</b>
          <span class="char-role-tag">${escapeHtml(selectedMeta.title)}</span>
        </div>
        <div class="char-perk-pill"><b>${escapeHtml(selectedMeta.perkTitle)}:</b> ${escapeHtml(selectedMeta.perkDesc)}</div>
      </div>
      <div class="acc-strip-header">
        <b>${this.t('accessories')}</b>
        <span>${escapeHtml(selectedAcc.name)}</span>
      </div>
      <div class="acc-strip">
        ${accessories
          .map((acc) => {
            const am = getAccessoryMeta(acc, this.lang);
            return `
          <button class="doodle-btn acc-chip ${this.draftAccessory === acc ? 'selected' : ''}" data-pick-acc="${acc}" title="${escapeHtml(am.name)}: ${escapeHtml(am.description)}">
            ${renderAccessorySvg(acc, PLAYER_COLORS[this.draftColor].hex, 22)}
          </button>`;
          })
          .join('')}
      </div>
      <div class="color-row">
        ${colors
          .map((c) => {
            const cname = getColorName(c, this.lang);
            return `
          <button class="color-dot ${this.draftColor === c ? 'selected' : ''}" data-pick-color="${c}" style="background:${PLAYER_COLORS[c].hex}" title="${escapeHtml(cname)}">
            ${this.settings.colorblindMode ? this.colorShapes[c] : ''}
          </button>`;
          })
          .join('')}
      </div>
    `;
  }

  private renderOnlineSetup(): string {
    const hasServer = OnlineGameController.hasConfiguredServer();
    return `
      <div class="screen-center">
        <div class="doodle-card menu-box setup-card stagger-item">
          <h2 class="modal-heading">${renderUiIconSvg('globe', 20)} <span>${this.t('playOnline')}</span></h2>
          <div class="online-info-note is-ready">
            <span class="ui-ico-row">${renderUiIconSvg('globe', 15)}<span>${escapeHtml(hasServer ? this.t('serverConnectedNote') : this.t('relayNote'))}</span></span>
          </div>
          <div class="setup-grid">
            <div class="setup-col">${this.renderCustomizationDraftHtml()}</div>
            <div class="setup-col setup-col-actions">
              <div class="setup-action-card">
                <button class="doodle-btn doodle-btn-primary" id="btn-create-room">${renderUiIconSvg('play', 18)} ${this.t('createRoom')}</button>
                <div style="display:flex;gap:8px;align-items:center">
                  <input class="doodle-input" id="inp-room-code" maxlength="4" placeholder="${this.t('roomCodePlaceholder')}" value="${escapeHtml(this.draftRoomCode)}" style="text-transform:uppercase;flex:1" />
                  <button class="doodle-btn doodle-btn-mint" id="btn-join-room">${this.t('join')}</button>
                </div>
                <button class="doodle-btn doodle-btn-blue" id="btn-join-spectator">${renderUiIconSvg('eye', 18)} ${this.t('joinSpectator')}</button>
              </div>
              <button class="doodle-btn" id="btn-back-menu">${renderUiIconSvg('back', 16)} ${this.t('back')}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderLocalSetup(): string {
    return `
      <div class="screen-center">
        <div class="doodle-card menu-box setup-card-compact stagger-item">
          <h2 class="modal-heading">${renderUiIconSvg('users', 20)} <span>${this.t('localHotSeat')}</span></h2>
          <div class="setup-inline-bar">
            <div class="setup-inline-group">
              <label><b>${this.t('playersCount')} (${this.draftLocalCount}):</b></label>
              <div style="display:flex;gap:5px">
                ${[2, 3, 4, 5, 6]
                  .map(
                    (n) => `<button class="doodle-btn ${this.draftLocalCount === n ? 'doodle-btn-primary' : ''}" style="flex:1;min-height:36px;padding:4px 6px" data-local-count="${n}">${n}</button>`,
                  )
                  .join('')}
              </div>
            </div>
            <div class="setup-inline-group">
              ${this.renderRulePresetPickerHtml(true)}
            </div>
          </div>
          <div class="lobby-list">
            ${Array.from({ length: this.draftLocalCount }, (_, i) => {
              const p = this.draftLocalPawns[i];
              const c = this.draftLocalColors[i];
              const acc = this.draftLocalAccessories[i];
              const meta = getPawnMeta(p, this.lang);
              const accMeta = getAccessoryMeta(acc, this.lang);
              const err = this.getLiveNameError(this.draftLocalNames[i]);
              return `<div class="lobby-row" style="gap:6px;flex-wrap:wrap">
                <button class="doodle-btn" style="min-height:34px;padding:3px 7px" data-local-pawn="${i}" title="${escapeHtml(meta.name)}">${pawnSvg(p, c, 24, acc)}</button>
                <button class="doodle-btn" style="min-height:34px;width:34px;padding:0;background:${PLAYER_COLORS[c].hex}" data-local-color="${i}" title="${escapeHtml(getColorName(c, this.lang))}">${this.settings.colorblindMode ? this.colorShapes[c] : ''}</button>
                <input class="doodle-input ${err ? 'is-invalid' : ''}" style="min-height:34px;padding:4px 10px;flex:1;min-width:95px" data-local-name="${i}" value="${escapeHtml(this.draftLocalNames[i])}" maxlength="18" />
                <button class="doodle-btn doodle-btn-blue" style="min-height:34px;padding:3px 10px;font-size:0.8rem" data-local-studio="${i}" title="${this.t('studioTitle')}">${this.t('styleBtn')}</button>
                <div class="lobby-submeta"><b>${escapeHtml(meta.shortName)}</b> • ${escapeHtml(accMeta.shortName)} • ${escapeHtml(meta.perkTitle)}</div>
              </div>`;
            }).join('')}
          </div>
          ${(() => {
            const firstErrIdx = Array.from({ length: this.draftLocalCount }, (_, i) => i).find(
              (i) => this.getLiveNameError(this.draftLocalNames[i]) !== null,
            );
            const firstErr =
              firstErrIdx !== undefined ? this.getLiveNameError(this.draftLocalNames[firstErrIdx]) : null;
            return `<div class="name-error-hint" id="local-name-error" style="${firstErr ? '' : 'display:none'}">${firstErr ? `${this.lang === 'en' ? 'Player' : 'Pemain'} ${firstErrIdx! + 1}: ${escapeHtml(firstErr)}` : ''}</div>`;
          })()}
          <div class="setup-footer-row">
            <button class="doodle-btn" id="btn-back-menu">${renderUiIconSvg('back', 16)} ${this.t('back')}</button>
            <button class="doodle-btn doodle-btn-primary" style="flex:2" id="btn-start-local">${renderUiIconSvg('dice', 18)} ${this.t('startGame')}</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderBotSetup(): string {
    return `
      <div class="screen-center">
        <div class="doodle-card menu-box setup-card stagger-item">
          <h2 class="modal-heading">${renderUiIconSvg('bot', 20)} <span>${this.t('vsBotTitle')}</span></h2>
          <div class="setup-grid">
            <div class="setup-col">${this.renderCustomizationDraftHtml()}</div>
            <div class="setup-col setup-col-actions">
              <div class="setup-action-card">
                <label><b>${this.t('botCount')}</b></label>
                <div style="display:flex;gap:5px">
                  ${[1, 2, 3, 4, 5]
                    .map((n) => `<button class="doodle-btn ${this.draftBotCount === n ? 'doodle-btn-primary' : ''}" style="flex:1;min-height:36px;padding:4px" data-bot-count="${n}">${n}</button>`)
                    .join('')}
                </div>
                <label><b>${this.t('botDiff')}</b></label>
                <div style="display:flex;gap:5px">
                  ${(['santai', 'pintar', 'juara'] as BotDifficulty[])
                    .map((d) => `<button class="doodle-btn ${this.draftBotDiff === d ? 'doodle-btn-mint' : ''}" style="flex:1;min-height:36px;padding:4px 6px;font-size:0.82rem" data-bot-diff="${d}">${getBotDiffLabel(d, this.lang).toUpperCase()}</button>`)
                    .join('')}
                </div>
                ${this.renderRulePresetPickerHtml(true)}
              </div>
              <div class="setup-footer-row">
                <button class="doodle-btn" id="btn-back-menu">${renderUiIconSvg('back', 16)} ${this.t('back')}</button>
                <button class="doodle-btn doodle-btn-primary" style="flex:2" id="btn-start-bot">${renderUiIconSvg('play', 18)} ${this.t('startMatch')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderLobby(): string {
    const room = this.roomState;
    if (!room) {
      return `<div class="screen-center"><div class="doodle-card menu-box"><p>${this.t('connectingRoom')}</p><button class="doodle-btn" id="btn-leave-lobby">${this.t('cancel')}</button></div></div>`;
    }
    const myId = this.onlineController?.getLocalPlayerId();
    const isHost = myId === room.hostId;
    const me = room.players.find((p) => p.id === myId);

    return `
      <div class="screen-center">
        <div class="doodle-card menu-box setup-card-compact stagger-item">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 style="margin:0">${this.t('lobbyTitle')}</h2>
            <span class="ui-ico-row" style="font-size:0.88rem">${renderUiIconSvg('eye', 16)} <span>${this.t('spectators')} ${room.spectatorCount}</span></span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;justify-content:center">
            <div class="room-badge" style="margin:0">${room.roomCode}</div>
            <button class="doodle-btn doodle-btn-mint" id="btn-copy-invite" title="${this.t('copyInvite')}">${renderUiIconSvg('link', 16)} ${this.t('copyInvite')}</button>
          </div>
          ${this.renderRulePresetPickerHtml(isHost)}
          <div class="lobby-list">
            ${room.players
              .map((p) => {
                const pMeta = getPawnMeta(p.pawn, this.lang);
                const accMeta = p.accessory && p.accessory !== 'none' ? getAccessoryMeta(p.accessory, this.lang) : null;
                return `
              <div class="lobby-row">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="width:12px;height:12px;border-radius:50%;background:${PLAYER_COLORS[p.color].hex};border:2px solid var(--ink);display:inline-block"></span>
                  ${this.settings.colorblindMode ? `<span class="cb-shape">${this.colorShapes[p.color]}</span>` : ''}
                  <span>${pawnSvg(p.pawn, p.color, 24, p.accessory ?? 'none')}</span>
                  <b>${escapeHtml(p.name)}</b>
                  <span style="font-size:0.74rem;opacity:0.72">(${escapeHtml(pMeta.shortName)}${accMeta ? ` • ${escapeHtml(accMeta.shortName)}` : ''})</span>
                  ${p.id === room.hostId ? renderUiIconSvg('trophy', 14) : ''}
                  ${p.isBot ? '<span style="font-size:0.72rem;padding:0 5px;border:1.5px solid var(--ink);border-radius:6px;background:var(--blue)">BOT</span>' : ''}
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  ${p.id === myId ? `<button class="doodle-btn doodle-btn-blue" style="min-height:30px;padding:3px 9px;font-size:0.78rem" id="btn-lobby-studio" title="${this.t('studioTitle')}">${this.t('styleBtn')}</button>` : ''}
                  ${isHost && p.isBot ? `<button class="doodle-btn doodle-btn-pink" style="min-height:28px;padding:2px 8px;font-size:0.78rem" data-remove-bot="${p.id}" title="Remove Bot">✕</button>` : ''}
                  <span class="lobby-ready-pill ${p.ready ? 'is-ready' : 'is-wait'}">
                    ${p.ready ? this.t('readyTag') : this.t('notReadyTag')}
                  </span>
                </div>
              </div>`;
              })
              .join('')}
          </div>
          ${
            me
              ? `<div style="display:flex;flex-direction:column;gap:8px">
                  ${
                    isHost
                      ? `<div style="display:flex;gap:6px;align-items:center">
                           <select class="doodle-input" id="sel-lobby-bot-diff" style="min-height:38px;padding:4px 8px;width:118px">
                             <option value="santai" ${this.draftLobbyBotDiff === 'santai' ? 'selected' : ''}>Bot ${getBotDiffLabel('santai', this.lang)}</option>
                             <option value="pintar" ${this.draftLobbyBotDiff === 'pintar' ? 'selected' : ''}>Bot ${getBotDiffLabel('pintar', this.lang)}</option>
                             <option value="juara" ${this.draftLobbyBotDiff === 'juara' ? 'selected' : ''}>Bot ${getBotDiffLabel('juara', this.lang)}</option>
                           </select>
                           <button class="doodle-btn doodle-btn-blue" style="flex:1" id="btn-lobby-add-bot" ${room.players.length >= 6 ? 'disabled' : ''}>${this.t('hostAddBot')}</button>
                           <button class="doodle-btn doodle-btn-primary" style="flex:1" id="btn-lobby-start" ${room.players.length < 2 ? 'disabled' : ''}>${this.t('startMatch')}</button>
                         </div>`
                      : `<button class="doodle-btn ${me.ready ? 'doodle-btn-mint' : 'doodle-btn-primary'}" style="flex:1" id="btn-lobby-ready">${me.ready ? `${renderUiIconSvg('check', 16)} ${this.t('readyDone')}` : `${renderUiIconSvg('play', 16)} ${this.t('pressReady')}`}</button>`
                  }
                 </div>`
              : `<div class="subtitle">${this.t('spectatorWait')}</div>`
          }
          <button class="doodle-btn" id="btn-leave-lobby">${this.t('leaveRoom')}</button>
        </div>
      </div>
    `;
  }

  private renderGameHud(): string {
    const state = this.gameState;
    if (!state) return '';
    const activeId = state.turnOrder[state.currentTurnIndex];
    const localId = this.controller?.getLocalPlayerId();
    const isTurnOwner = !this.controller?.isSpectator() && activeId === localId;
    const isMyTurn = isTurnOwner && !this.isAnimating;
    const canRollNow = isTurnOwner && state.phase === 'TURN_BEGIN' && !this.rollRequestPending;
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

    const en = this.lang === 'en';
    const activeBuffs: string[] = [];
    if (me?.activeGoldenDice) activeBuffs.push(en ? 'Golden Die' : 'Dadu Emas');
    if (me?.activeBrake) activeBuffs.push(en ? 'Brake ≤3' : 'Rem ≤3');
    if (me?.activeTurbo) activeBuffs.push('Turbo +2');
    if (me?.activeDoubleStars) activeBuffs.push('2x ★');

    return `
      <div class="hud-top">
        <div class="turn-strip">
          ${state.turnOrder
            .map((pid) => {
              const p = state.players.find((x) => x.id === pid)!;
              const isAct = pid === activeId;
              const streak = p.challengeStreak ?? 0;
              const meta = getPawnMeta(p.pawn, this.lang);
              const cname = getColorName(p.color, this.lang);
              return `
                <div class="player-pill player-pill-clickable ${isAct ? 'active' : ''} ${!p.connected ? 'disconnected' : ''}" data-focus-player="${p.id}" style="border-left: 8px solid ${PLAYER_COLORS[p.color].hex}" title="${escapeHtml(meta.name)} (${escapeHtml(meta.perkTitle)}: ${escapeHtml(meta.perkDesc)})">
                  ${this.settings.colorblindMode ? `<span class="cb-shape" title="${escapeHtml(cname)}">${this.colorShapes[p.color]}</span>` : ''}
                  <span>${pawnSvg(p.pawn, p.color, 26, p.accessory ?? 'none')}</span>
                  <div>
                    <div style="display:flex;align-items:center;gap:4px">
                      <b>${escapeHtml(p.name)}</b>
                      ${p.shields > 0 ? renderItemSvg('shield', 15) : ''}
                      ${streak >= 2 ? `<span class="streak-badge" title="${en ? 'Challenge Streak!' : 'Kombo Tantangan!'}">${renderUiIconSvg('flame', 13)}x${streak}</span>` : ''}
                    </div>
                    <div class="tabular-num" style="font-size:0.78rem;display:flex;align-items:center;gap:4px">
                      <span>${this.t('tileShort')}${p.position}</span> • <span data-star-pid="${p.id}">★${this.getDisplayedStars(p.id, p.stars)}</span> • <span style="opacity:0.75">${escapeHtml(meta.shortName)}</span>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
        <div class="hud-actions-top">
          <div class="player-pill tabular-num" id="hud-turn-timer" style="display:none;font-weight:700"></div>
          <button class="doodle-btn hud-icon-btn" id="btn-hud-cam" title="${camOverview ? (en ? 'Follow Pawn' : 'Mode Ikuti Pion') : (en ? 'Overview Camera' : 'Mode Lihat Penuh')}">${renderUiIconSvg('camera', 16)}</button>
          <button class="doodle-btn hud-icon-btn" id="btn-hud-reset-cam" title="${en ? 'Reset Camera' : 'Kembalikan Sudut Kamera'}">${renderUiIconSvg('reset', 16)}</button>
          <button class="doodle-btn hud-icon-btn ${this.hudCompact ? 'doodle-btn-blue' : ''}" id="btn-hud-peek" title="${this.hudCompact ? (en ? 'Show HUD Overlay' : 'Tampilkan Overlay HUD') : (en ? 'Peek Board' : 'Intip Papan Penuh')}">${renderUiIconSvg('eye', 16)}</button>
          <button class="doodle-btn hud-icon-btn ${!this.settings.musicEnabled ? 'hud-btn-off' : ''}" id="btn-hud-music" title="${this.t('musicLabel')}">${renderUiIconSvg('music', 16)}</button>
          <button class="doodle-btn hud-icon-btn ${this.settings.muted ? 'hud-btn-off' : ''}" id="btn-hud-mute" title="${this.t('muteLabel')}">${renderUiIconSvg(this.settings.muted ? 'muted' : 'sound', 16)}</button>
          <button class="doodle-btn hud-icon-btn ${this.showLegendPopover ? 'doodle-btn-mint' : ''}" id="btn-hud-legend" title="${en ? 'Board Guide & Rules' : 'Panduan Papan & Aturan'}">${renderUiIconSvg('book', 16)}</button>
          <button class="doodle-btn hud-icon-btn" id="btn-hud-settings" title="${this.t('settingsTitle')}">${renderUiIconSvg('settings', 16)}</button>
          <button class="doodle-btn doodle-btn-pink hud-leave-btn" id="btn-hud-leave" title="${this.t('leaveRoom')}">${renderUiIconSvg('leave', 15)}<span class="hud-btn-label">${en ? 'Leave' : 'Keluar'}</span></button>
        </div>
        ${this.showLegendPopover ? this.renderLegendPopoverHtml(state) : ''}
      </div>

      ${
        !this.hudCompact && this.activityFeed.length > 0
          ? `<div class="activity-feed-dock">
               <button class="doodle-btn" style="min-height:30px;padding:3px 9px;font-size:0.75rem" id="btn-toggle-feed">${this.feedOpen ? this.t('hideLog') : `${this.t('logCount')} (${this.activityFeed.length})`}</button>
               ${
                 this.feedOpen
                   ? `<div class="activity-feed" aria-label="Activity Feed">
                        ${this.activityFeed
                          .slice(0, 5)
                          .map(
                            (entry) =>
                              `<div class="activity-feed-item"><span class="hud-feed-icon">${this.renderActivityIcon(entry.icon, 13)}</span><span>${escapeHtml(entry.text)}</span></div>`,
                          )
                          .join('')}
                      </div>`
                   : ''
               }
             </div>`
          : ''
      }

      ${
        !this.hudCompact
          ? `<div class="emote-dock">
               ${
                 this.emoteTrayOpen
                   ? `<div class="doodle-card emote-tray">
                       ${EMOTE_LIST.map((em) => `<button class="doodle-btn emote-choice-btn" data-send-emote="${em.id}" title="${escapeHtml(getEmoteLabel(em.id, this.lang))}">${renderEmoteSvg(em.id, 22)}</button>`).join('')}
                      </div>`
                   : ''
               }
               <button class="doodle-btn doodle-btn-blue" id="btn-toggle-emote">
                 <span class="ui-ico-row">${renderUiIconSvg('sticker', 16)}<span>${this.t('sticker')}</span></span>
               </button>
             </div>`
          : ''
      }

      <div class="hud-bottom">
        ${
          !this.hudCompact && isMyTurn && state.phase === 'TURN_BEGIN' && me
            ? `<div class="hud-turn-helper tabular-num">
                 <span><b>${this.t('turnYou')}</b> ${this.t('tileShort')}${me.position}/100</span>
                 <span class="helper-dot-row"><span class="preview-dot is-ladder"></span>${en ? 'Ladder' : 'Tangga'}</span>
                 <span class="helper-dot-row"><span class="preview-dot is-snake"></span>${en ? 'Snake' : 'Ular'}</span>
                 <span class="helper-key-hint">${en ? '[Space]' : '[Spasi]'}</span>
               </div>`
            : ''
        }
        ${!this.hudCompact && activeBuffs.length > 0 ? `<div class="hud-buffs-pill">${en ? 'Active' : 'Aktif'}: ${activeBuffs.join(' • ')}</div>` : ''}
        ${
          !this.hudCompact && me?.mission
            ? `<div class="hud-mission-pill ${me.mission.completed ? 'is-done' : ''}">${renderUiIconSvg('mission', 13)}<span>${this.t('missionLabel')}: ${escapeHtml(formatMissionText(me.mission, this.lang))}</span></div>`
            : ''
        }
        <div class="hud-bottom-bar">
          <div class="item-slots">
            ${[0, 1]
              .map((idx) => {
                const item = me?.items[idx];
                if (!item) {
                  return `<button class="doodle-btn item-slot-btn" disabled title="${this.t('empty')}">-</button>`;
                }
                const im = getItemMeta(item, this.lang);
                return `<button class="doodle-btn doodle-btn-mint item-slot-btn" data-use-item="${idx}" ${!isMyTurn || state.phase !== 'TURN_BEGIN' ? 'disabled' : ''} title="${escapeHtml(im.name)}: ${escapeHtml(im.description)}">
                  ${renderItemSvg(item, 22)}
                  <span>${escapeHtml(im.name.split(' ')[0])}</span>
                </button>`;
              })
              .join('')}
            ${
              me && !this.controller?.isSpectator()
                ? `<button class="doodle-btn shop-buy-btn" id="btn-buy-star-item" ${!canBuyStarItem ? 'disabled' : ''} title="${escapeHtml(this.t('buyTooltip'))} (★${myShopCost})">
                     ${renderUiIconSvg('shop', 18)}
                     <span class="tabular-num">${me.items.length >= 2 ? this.t('bagFull') : `${en ? 'Buy' : 'Beli'} ★${myShopCost}`}</span>
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
                        ? `${this.t('tileShort')}${prev.to} → ${en ? 'Ladder' : 'Tangga'} ${prev.ladderTo}`
                        : prev.snakeTo
                          ? `${this.t('tileShort')}${prev.to} → ${en ? 'Snake' : 'Ular'} ${prev.snakeTo}`
                          : prev.to === 100
                            ? en
                              ? 'Tile 100 Win!'
                              : 'Kt.100 Menang!'
                            : prev.bounced
                              ? `${en ? 'Bounce' : 'Pantul'} ${this.t('tileShort')}${prev.to}`
                              : `→ ${this.t('tileShort')}${prev.to}`;
                      return `<button class="doodle-btn dice-pick-btn" data-pick-dice="${idx}">
                        <span>${en ? 'Pick' : 'Pilih'} ${val}</span>
                        <span class="dice-pick-hint ${hintCls} tabular-num">${hintTxt}</span>
                      </button>`;
                    })
                    .join('')}
                 </div>`
              : (() => {
                  const localPlayer = state.players.find((p) => p.id === localId) ?? null;
                  const forecastHint =
                    canRollNow && localPlayer ? this.computeTurnForecastHint(state, localPlayer) : null;
                  return `<button class="doodle-btn roll-btn ${canRollNow ? 'is-your-turn' : ''}" id="btn-roll-dice" ${!canRollNow ? 'disabled' : ''}>
                  ${
                    this.controller?.isSpectator()
                      ? this.t('spectatorMode')
                      : canRollNow
                        ? `${renderUiIconSvg('dice', 24)} ${this.t('rollDice')}!${forecastHint ? ` <span class="roll-sub-hint">${escapeHtml(forecastHint)}</span>` : ''}`
                        : this.rollRequestPending
                          ? `${en ? 'Rolling...' : 'Melempar...'}`
                          : `${this.t('turnOther')} ${escapeHtml(state.players.find((p) => p.id === activeId)?.name ?? '')}`
                  }
                 </button>`;
                })()
          }
        </div>
      </div>
    `;
  }

  private renderChallengeModalShell(): string {
    const modal = this.activeChallengeModal;
    if (!modal) return '';
    const ch = modal.challenge;
    const en = this.lang === 'en';
    const archMeta = getArchetypeMeta(ch.archetype, this.lang);
    const giftLoc =
      ch.archetype === 'gift_trap'
        ? getLocalizedGiftVariant(
            String(ch.params?.variantId ?? ''),
            ch.title,
            ch.flavorText,
            this.lang,
          )
        : null;
    const displayTitle = giftLoc ? giftLoc.title : archMeta.name;
    const displayFlavor = giftLoc ? giftLoc.flavorText : archMeta.instruction;
    const owner = this.gameState?.players.find((p) => p.id === modal.localParticipantId);
    const challenger = this.gameState?.players.find((p) => p.id === ch.ownerPlayerId);
    const rival = ch.opponentId ? this.gameState?.players.find((p) => p.id === ch.opponentId) : undefined;
    const others = (this.gameState?.players ?? []).filter((p) => p.id !== ch.ownerPlayerId);
    const ladder = BOARD_LAYOUT.ladders.find((l) => l.from === ch.tileId);
    const snake = BOARD_LAYOUT.snakes.find((s) => s.from === ch.tileId);

    return `
      <div class="challenge-backdrop">
        <div class="doodle-card challenge-modal">
          <div class="challenge-header">
            <div>
              <div style="font-size:0.82rem;opacity:0.8">${this.t('tileLabel')} ${ch.tileId} • ${escapeHtml(archMeta.name)} ${ch.mode === 'duel' ? '• DUEL 1v1' : ''}</div>
              <h3 style="margin:2px 0">${escapeHtml(displayTitle)}</h3>
              ${
                ch.mode === 'duel' && challenger && rival && modal.duelPicked
                  ? `<div style="font-size:0.85rem;display:inline-flex;align-items:center;gap:5px">${pawnSvg(challenger.pawn, challenger.color, 18, challenger.accessory ?? 'none')} <b>${escapeHtml(challenger.name)}</b> <span style="opacity:0.75">vs</span> ${pawnSvg(rival.pawn, rival.color, 18, rival.accessory ?? 'none')} <b>${escapeHtml(rival.name)}</b></div>`
                  : owner
                    ? `<div style="font-size:0.85rem;display:inline-flex;align-items:center;gap:5px">${pawnSvg(owner.pawn, owner.color, 20, owner.accessory ?? 'none')} <b>${escapeHtml(owner.name)}</b> <span style="opacity:0.75">• ${escapeHtml(getPawnMeta(owner.pawn, this.lang).shortName)}</span></div>`
                    : ''
              }
            </div>
            <div class="challenge-timer-ring">
              <svg width="52" height="52">
                <circle cx="26" cy="26" r="21" fill="none" stroke="#E5DAC5" stroke-width="5"/>
                <circle id="timer-circle-prog" cx="26" cy="26" r="21" fill="none" stroke="#2B2A33" stroke-width="5" stroke-linecap="round"/>
              </svg>
              <span id="timer-sec-text">${Math.ceil(ch.durationMs / 1000)}</span>
            </div>
          </div>
          ${ladder ? `<div class="challenge-junction-pill is-ladder">${renderUiIconSvg('ladder', 15)}<span>${escapeHtml(this.t('ladderTileBanner', { from: ladder.from, to: ladder.to }))}</span></div>` : ''}
          ${snake ? `<div class="challenge-junction-pill is-snake">${renderUiIconSvg('snake', 15)}<span>${escapeHtml(this.t('snakeTileBanner', { from: snake.from, to: snake.to }))}</span></div>` : ''}
          <p style="margin:6px 0 12px;font-size:0.95rem">${escapeHtml(displayFlavor)}</p>
          ${
            !modal.duelPicked
              ? `<div class="mg-wrap">
                  <div class="mg-sub">${this.t('pickDuelRival')}</div>
                  ${others
                    .map(
                      (o) => `<button class="doodle-btn doodle-btn-primary" style="width:100%" data-duel-opp="${o.id}">${pawnSvg(o.pawn, o.color, 24, o.accessory ?? 'none')} ${en ? 'Challenge' : 'Tantang'} ${escapeHtml(o.name)} (${this.t('tileShort')}${o.position})</button>`,
                    )
                    .join('')}
                 </div>`
              : `<div id="challenge-mg-body"></div>`
          }
          ${
            modal.stamp
              ? `<div class="stamp-overlay">
                  <div class="stamp-badge ${modal.stamp.success ? 'stamp-win' : 'stamp-lose'}">
                    ${modal.stamp.success ? this.t('youWinChallenge') : en ? 'OOPS...' : 'YAAH...'}
                  </div>
                  <p style="margin-top:14px;font-size:1.05rem">${escapeHtml(modal.stamp.summary)}</p>
                </div>`
              : ''
          }
        </div>
      </div>
    `;
  }

  private computeSuperlatives(players: Player[]): SuperlativeAward[] {
    if (players.length === 0) return [];
    const pickBest = (scoreFn: (p: Player) => number): Player | null => {
      const sorted = [...players].sort((a, b) => scoreFn(b) - scoreFn(a));
      return scoreFn(sorted[0]) > 0 ? sorted[0] : null;
    };

    const en = this.lang === 'en';
    const awards: SuperlativeAward[] = [];
    const starKing = pickBest((p) => p.stars);
    if (starKing) awards.push({ icon: 'star', label: `${en ? 'Star Collector' : 'Kolektor Bintang'}: ${starKing.name} (${starKing.stars}★)` });
    const challengeAce = pickBest((p) => p.stats.challengesWon);
    if (challengeAce) awards.push({ icon: 'brain', label: `${en ? 'Challenge Ace' : 'Raja Tantangan'}: ${challengeAce.name} (${challengeAce.stats.challengesWon}x)` });
    const climber = pickBest((p) => p.stats.laddersClimbed);
    if (climber) awards.push({ icon: 'ladder', label: `${en ? 'Ladder Dasher' : 'Pemanjat Kilat'}: ${climber.name} (${climber.stats.laddersClimbed}x)` });
    const dodger = pickBest((p) => p.stats.snakesDodged);
    if (dodger) awards.push({ icon: { item: 'shield' }, label: `${en ? 'Snake Tamer' : 'Pawang Ular'}: ${dodger.name} (${dodger.stats.snakesDodged}x)` });
    const bitten = pickBest((p) => p.stats.snakesBitten);
    if (bitten) awards.push({ icon: 'snake', label: `${en ? 'Snake Magnet' : 'Sobat Ular'}: ${bitten.name} (${bitten.stats.snakesBitten}x)` });
    const itemPro = pickBest((p) => p.stats.itemsUsed);
    if (itemPro) awards.push({ icon: { item: 'surprise' }, label: `${en ? 'Item Master' : 'Ahli Item'}: ${itemPro.name} (${itemPro.stats.itemsUsed}x)` });
    return awards.slice(0, 4);
  }

  private renderPodiumModal(): string {
    const state = this.gameState;
    const podium = state?.podium ?? [];
    if (!state || podium.length === 0) return '';
    const isHost = this.modeIsHostOrLocal();
    const awards = this.computeSuperlatives(state.players);
    const en = this.lang === 'en';

    return `
      <div class="challenge-backdrop">
        <div class="doodle-card menu-box setup-card-compact stagger-item" style="max-width:500px">
          <h1 class="game-logo modal-heading">${renderUiIconSvg('trophy', 24)} <span>${en ? 'Winner Podium!' : 'Podium Juara!'}</span></h1>
          <div class="podium-stage">
            ${podium
              .slice(0, 3)
              .map(
                (entry) => `
              <div class="podium-col podium-rank-${entry.rank}">
                <div class="tabular-num" style="font-size:1.25rem;font-weight:700">#${entry.rank}</div>
                <div>${pawnSvg(entry.pawn, entry.color, 36, entry.accessory ?? 'none')}</div>
                <div>${this.settings.colorblindMode ? `<span class="cb-shape">${this.colorShapes[entry.color]}</span> ` : ''}<b>${escapeHtml(entry.name)}</b></div>
                <div style="font-size:0.74rem;opacity:0.78">${escapeHtml(getPawnMeta(entry.pawn, this.lang).shortName)}</div>
                <div class="tabular-num" style="font-size:0.84rem">${this.t('tileShort')}${entry.position} • ★${entry.stars}</div>
              </div>`,
              )
              .join('')}
          </div>
          <div class="lobby-list">
            ${podium
              .map((e) => {
                const pl = state.players.find((p) => p.id === e.playerId);
                const winRatio = pl ? `${pl.stats.challengesWon}/${pl.stats.challengesTotal} • ` : '';
                return `<div class="lobby-row"><span style="display:inline-flex;align-items:center;gap:6px">#${e.rank} ${this.settings.colorblindMode ? `<span class="cb-shape">${this.colorShapes[e.color]}</span>` : ''}${pawnSvg(e.pawn, e.color, 22, e.accessory ?? 'none')} <b>${escapeHtml(e.name)}</b></span><span class="tabular-num">${winRatio}${this.t('tileShort')}${e.position} • ★${e.stars}</span></div>`;
              })
              .join('')}
          </div>
          ${
            awards.length > 0
              ? `<div class="podium-awards">
                   ${awards.map((a) => `<span class="award-chip"><span class="ui-ico-row">${this.renderActivityIcon(a.icon, 14)}<span>${escapeHtml(a.label)}</span></span></span>`).join('')}
                 </div>`
              : ''
          }
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            ${isHost ? `<button class="doodle-btn doodle-btn-primary" style="flex:1" id="btn-podium-rematch">${renderUiIconSvg('reset', 16)} ${this.t('playAgain')}</button>` : ''}
            <button class="doodle-btn" style="flex:1" id="btn-podium-menu">${renderUiIconSvg('home', 16)} ${this.t('mainMenu')}</button>
            <button class="doodle-btn doodle-btn-pink" id="btn-podium-support">${renderUiIconSvg('heart', 16)} ${this.t('supportBtn')}</button>
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
      const candidate =
        ctx.name.trim() ||
        (ctx.mode === 'local' ? PAWN_META[ctx.pawn].shortName : sanitizeUsernameOrFallback(this.draftName, 'Pemain'));
      const nameCheck = validateUsername(candidate);
      if (!nameCheck.ok) {
        const errText = localizeText(nameCheck.error ?? 'Username tidak diizinkan.', this.lang);
        const errEl = this.modalLayer.querySelector<HTMLElement>('#studio-name-error');
        const inpEl = this.modalLayer.querySelector<HTMLInputElement>('#inp-studio-name');
        if (errEl) {
          errEl.textContent = errText;
          errEl.style.display = 'block';
        }
        inpEl?.classList.add('is-invalid');
        inpEl?.focus();
        this.showToast(errText);
        return;
      }

      const cleanName = nameCheck.sanitized;
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
          playerName: cleanName,
          pawn: ctx.pawn,
          color: ctx.color,
          accessory: ctx.accessory,
        });
      } else {
        this.draftName = cleanName;
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
    const meta = getPawnMeta(pawn, this.lang);
    const acc = getAccessoryMeta(accessory, this.lang);
    const colName = getColorName(color, this.lang);
    return `
      <div class="char-bio-card studio-bio-box">
        <div class="char-bio-top">
          <b>${escapeHtml(meta.name)}</b>
          <span class="char-role-tag">${escapeHtml(meta.title)}</span>
        </div>
        <div style="font-size:0.82rem;opacity:0.82">${escapeHtml(colName)} • ${escapeHtml(acc.name)}</div>
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
        ? `${this.t('studioPlayerTitle')} ${ctx.localIndex + 1}`
        : this.t('studioTitle');

    return `
      <div class="challenge-backdrop">
        <div class="doodle-card studio-modal stagger-item">
          <div class="studio-header">
            <div>
              <h2 style="margin:0">${titleLabel}</h2>
              <small style="opacity:0.75">${this.t('studioSubtitle')}</small>
            </div>
            <button class="doodle-btn" id="btn-studio-cancel" style="min-height:40px;padding:6px 12px" aria-label="${this.t('close')}">✕</button>
          </div>
          <div class="studio-layout">
            <div class="studio-stage-col">
              <div class="studio-preview-box">
                <div id="studio-preview-stage" class="studio-preview-stage">
                  ${pawnSvg(ctx.pawn, ctx.color, 130, ctx.accessory)}
                </div>
                <div class="studio-drag-hint">${this.t('dragHint3d')}</div>
              </div>
              <input class="doodle-input ${this.getLiveNameError(ctx.name) ? 'is-invalid' : ''}" id="inp-studio-name" maxlength="18" value="${escapeHtml(ctx.name)}" placeholder="${this.t('charNamePlaceholder')}" />
              <div class="name-error-hint" id="studio-name-error" style="${this.getLiveNameError(ctx.name) ? '' : 'display:none'}">${escapeHtml(this.getLiveNameError(ctx.name) ?? '')}</div>
              <div class="color-row" id="studio-color-row">
                ${colors
                  .map(
                    (c) => `
                  <button class="color-dot ${ctx.color === c ? 'selected' : ''}" data-studio-color="${c}" style="background:${PLAYER_COLORS[c].hex}" title="${escapeHtml(getColorName(c, this.lang))}">
                    ${this.settings.colorblindMode ? this.colorShapes[c] : ''}
                  </button>`,
                  )
                  .join('')}
              </div>
              <div id="studio-bio-slot">${this.renderStudioBioCardHtml(ctx.pawn, ctx.color, ctx.accessory)}</div>
            </div>
            <div class="studio-picker-col">
              <div class="studio-section-label"><b>${this.t('pickCharStep')}</b></div>
              <div class="studio-char-grid" id="studio-char-grid">
                ${pawns
                  .map((p) => {
                    const m = getPawnMeta(p, this.lang);
                    return `
                      <button class="doodle-btn studio-char-card ${ctx.pawn === p ? 'selected' : ''}" data-studio-pawn="${p}" title="${escapeHtml(m.name)}: ${escapeHtml(m.perkDesc)}">
                        <span>${pawnSvg(p, ctx.color, 36, ctx.accessory)}</span>
                        <span class="studio-char-name">${escapeHtml(m.shortName)}</span>
                        <small class="studio-char-role">${escapeHtml(m.title)}</small>
                      </button>`;
                  })
                  .join('')}
              </div>
              <div class="studio-section-label" style="margin-top:4px">
                <b>${this.t('pickAccStep')}</b>
                <span id="studio-acc-active" style="font-size:0.84rem;opacity:0.8">${escapeHtml(getAccessoryMeta(ctx.accessory, this.lang).name)}</span>
              </div>
              <div class="studio-acc-grid" id="studio-acc-grid">
                ${accessories
                  .map((accId) => {
                    const acc = getAccessoryMeta(accId, this.lang);
                    return `
                      <button class="doodle-btn studio-acc-card ${ctx.accessory === accId ? 'selected' : ''}" data-studio-acc="${accId}" title="${escapeHtml(acc.description)}">
                        <span>${renderAccessorySvg(accId, PLAYER_COLORS[ctx.color].hex, 28)}</span>
                        <small>${escapeHtml(acc.shortName)}</small>
                      </button>`;
                  })
                  .join('')}
              </div>
              <div id="studio-acc-desc" class="studio-acc-desc">${escapeHtml(getAccessoryMeta(ctx.accessory, this.lang).description)}</div>
              <div class="studio-footer-actions">
                <button class="doodle-btn" id="btn-studio-close" style="flex:1">${this.t('cancel')}</button>
                <button class="doodle-btn doodle-btn-primary" id="btn-studio-save" style="flex:2">${this.lang === 'en' ? 'Save & Equip' : 'Simpan & Pakai'}</button>
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
    const accMeta = getAccessoryMeta(ctx.accessory, this.lang);
    const accActive = this.modalLayer.querySelector<HTMLElement>('#studio-acc-active');
    if (accActive) accActive.textContent = accMeta.name;
    const accDesc = this.modalLayer.querySelector<HTMLElement>('#studio-acc-desc');
    if (accDesc) accDesc.textContent = accMeta.description;

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
    const items: ItemType[] = [
      'shield',
      'golden_dice',
      'brake',
      'surprise',
      'magnet_star',
      'swap_turbo',
      'star_multiplier',
      'rival_brake',
    ];
    return `
      <div class="challenge-backdrop">
        <div class="doodle-card menu-box setup-card-compact stagger-item">
          <h2 class="modal-heading">${renderUiIconSvg('book', 20)} <span>${this.t('howtoTitle')}</span></h2>
          <ul class="howto-list">
            <li><b>${escapeHtml(this.t('howtoTurnTitle'))}:</b> ${escapeHtml(this.t('howtoTurnDesc'))}</li>
            <li><b>${escapeHtml(this.t('howtoTileTitle'))}:</b> ${escapeHtml(this.t('howtoTileDesc'))}</li>
            <li><b>${escapeHtml(this.t('howtoSnakeTitle'))}:</b> ${escapeHtml(this.t('howtoSnakeDesc'))}</li>
            <li><b>${escapeHtml(this.t('howtoShopTitle'))}:</b> ${escapeHtml(this.t('howtoShopDesc'))}</li>
            <li><b>${escapeHtml(this.t('howtoSpecialTitle'))}:</b> ${escapeHtml(this.t('howtoSpecialDesc'))}</li>
          </ul>
          <div class="howto-items-grid">
            ${items
              .map((id) => {
                const im = getItemMeta(id, this.lang);
                return `
              <div class="howto-item-pill" title="${escapeHtml(im.description)}">
                ${renderItemSvg(id, 18)}
                <span><b>${escapeHtml(im.name)}</b><small>${escapeHtml(im.description)}</small></span>
              </div>`;
              })
              .join('')}
          </div>
          <button class="doodle-btn doodle-btn-primary" id="btn-close-howto">${this.t('understood')}</button>
        </div>
      </div>
    `;
  }

  private renderSettingsModal(): string {
    return `
      <div class="challenge-backdrop">
        <div class="doodle-card menu-box setup-card-compact stagger-item">
          <h2 class="modal-heading">${renderUiIconSvg('settings', 20)} <span>${this.t('settingsTitle')}</span></h2>
          <label class="settings-row">
            <span class="ui-ico-row">${renderUiIconSvg('globe', 16)}<span>${this.t('languageSettingLabel')}</span></span>
            <select class="doodle-input" id="set-lang" style="min-height:34px;padding:3px 8px;width:152px">
              <option value="id" ${this.settings.language === 'id' ? 'selected' : ''}>Indonesia (ID)</option>
              <option value="en" ${this.settings.language === 'en' ? 'selected' : ''}>English (EN)</option>
            </select>
          </label>
          <label class="settings-row">
            <span class="ui-ico-row">${renderUiIconSvg('muted', 16)}<span>${this.t('muteLabel')}</span></span>
            <input type="checkbox" id="set-mute" ${this.settings.muted ? 'checked' : ''} />
          </label>
          <label class="settings-row">
            <span class="ui-ico-row">${renderUiIconSvg('music', 16)}<span>${this.t('musicLabel')}</span></span>
            <input type="checkbox" id="set-music" ${this.settings.musicEnabled ? 'checked' : ''} />
          </label>
          <label class="settings-vol-row">
            <span class="ui-ico-row">${renderUiIconSvg('sound', 16)}<span>${this.t('volumeLabel')} (${Math.round(this.settings.volume * 100)}%)</span></span>
            <input type="range" id="set-vol" min="0" max="100" value="${Math.round(this.settings.volume * 100)}" style="width:100%"/>
          </label>
          <label class="settings-row">
            <span class="ui-ico-row">${renderUiIconSvg('eye', 16)}<span>${this.t('colorblindLabel')}</span></span>
            <input type="checkbox" id="set-cb" ${this.settings.colorblindMode ? 'checked' : ''} />
          </label>
          <label class="settings-row">
            <span class="ui-ico-row">${renderUiIconSvg('text', 16)}<span>${this.t('largeTextLabel')}</span></span>
            <input type="checkbox" id="set-large" ${this.settings.largeText ? 'checked' : ''} />
          </label>
          <label class="settings-row">
            <span class="ui-ico-row">${renderUiIconSvg('spark', 16)}<span>${this.t('reducedMotionLabel')}</span></span>
            <input type="checkbox" id="set-rm" ${this.settings.reducedMotion ? 'checked' : ''} />
          </label>
          <button class="doodle-btn doodle-btn-primary" id="btn-close-settings">${this.t('save')}</button>
        </div>
      </div>
    `;
  }

  private renderSupportModal(): string {
    return `
      <div class="challenge-backdrop" id="support-modal-backdrop">
        <div class="doodle-card menu-box setup-card-compact stagger-item">
          <h2 class="modal-heading">${renderUiIconSvg('heart', 20)} <span>${this.t('supportTitle')}</span></h2>
          <div class="support-modal-body">
            <p class="support-desc">${escapeHtml(this.t('supportDesc'))}</p>
            <div class="support-qr-frame">
              <img class="support-qr-img" src="/saweria-qr.png" alt="Saweria QR DodSnake" />
            </div>
            <p class="support-note">${escapeHtml(this.t('supportNote'))}</p>
          </div>
          <button class="doodle-btn doodle-btn-primary" id="btn-close-support">${this.t('close')}</button>
        </div>
      </div>
    `;
  }

  private renderDebugPanel(): string {
    return `
      <div class="debug-panel">
        <b class="ui-ico-row">${renderUiIconSvg('settings', 14)}<span>DEBUG PANEL</span></b>
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

    q('#btn-toggle-lang')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.settings.language = this.settings.language === 'id' ? 'en' : 'id';
      this.applyAccessibilitySettings();
      this.render();
    });

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
      online.joinRoom(
        saved.roomCode,
        sanitizeUsernameOrFallback(this.draftName, 'Pemain'),
        this.draftPawn,
        this.draftColor,
        {
          reconnectToken: saved.reconnectToken,
          accessory: this.draftAccessory,
        },
      );
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
    q('#btn-menu-support')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showSupportModal = true;
      this.renderModalsLayer();
    });
    q('#btn-back-menu')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.screen = 'menu';
      this.render();
    });

    // Draft pickers & rule preset
    q<HTMLInputElement>('#inp-name')?.addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement;
      this.draftName = inp.value;
      const err = this.getLiveNameError(this.draftName);
      inp.classList.toggle('is-invalid', err !== null);
      const errEl = q<HTMLElement>('#draft-name-error');
      if (errEl) {
        errEl.textContent = err ?? '';
        errEl.style.display = err ? 'block' : 'none';
      }
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
      const nameCheck = validateUsername(this.draftName.trim() || 'Pemain');
      if (!nameCheck.ok) {
        const errText = localizeText(nameCheck.error ?? 'Username tidak diizinkan.', this.lang);
        const inp = q<HTMLInputElement>('#inp-name');
        const errEl = q<HTMLElement>('#draft-name-error');
        inp?.classList.add('is-invalid');
        inp?.focus();
        if (errEl) {
          errEl.textContent = errText;
          errEl.style.display = 'block';
        }
        this.showToast(errText);
        return;
      }
      this.draftName = nameCheck.sanitized;
      this.sound.playUiClick();
      const online = new OnlineGameController(this.scene, this.createSessionCallbacks());
      this.onlineController = online;
      this.controller = online;
      online.createRoom(
        nameCheck.sanitized,
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
        this.showToast(localizeText('Masukkan kode room 4 huruf ya!', this.lang));
        return;
      }
      let joinName = this.lang === 'en' ? 'Spectator' : 'Penonton';
      if (!asSpectator) {
        const nameCheck = validateUsername(this.draftName.trim() || 'Pemain');
        if (!nameCheck.ok) {
          const errText = localizeText(nameCheck.error ?? 'Username tidak diizinkan.', this.lang);
          const inp = q<HTMLInputElement>('#inp-name');
          const errEl = q<HTMLElement>('#draft-name-error');
          inp?.classList.add('is-invalid');
          inp?.focus();
          if (errEl) {
            errEl.textContent = errText;
            errEl.style.display = 'block';
          }
          this.showToast(errText);
          return;
        }
        joinName = nameCheck.sanitized;
        this.draftName = joinName;
      }
      this.sound.playUiClick();
      const online = new OnlineGameController(this.scene, this.createSessionCallbacks());
      this.onlineController = online;
      this.controller = online;
      online.joinRoom(code, joinName, this.draftPawn, this.draftColor, {
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
    const syncLocalNameBanner = () => {
      const errEl = q<HTMLElement>('#local-name-error');
      if (!errEl) return;
      let firstIdx = -1;
      let firstMsg: string | null = null;
      for (let i = 0; i < this.draftLocalCount; i++) {
        const err = this.getLiveNameError(this.draftLocalNames[i]);
        if (err && firstIdx === -1) {
          firstIdx = i;
          firstMsg = err;
        }
      }
      errEl.textContent = firstMsg ? `${this.lang === 'en' ? 'Player' : 'Pemain'} ${firstIdx + 1}: ${firstMsg}` : '';
      errEl.style.display = firstMsg ? 'block' : 'none';
    };

    this.mainLayer.querySelectorAll<HTMLInputElement>('[data-local-name]').forEach((inp) => {
      inp.oninput = () => {
        const idx = Number(inp.dataset.localName);
        this.draftLocalNames[idx] = inp.value;
        inp.classList.toggle('is-invalid', this.getLiveNameError(inp.value) !== null);
        syncLocalNameBanner();
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
      const sanitizedNames: string[] = [];
      for (let i = 0; i < this.draftLocalCount; i++) {
        const check = validateUsername(this.draftLocalNames[i].trim() || `Pemain ${i + 1}`);
        if (!check.ok) {
          const errText = `${this.lang === 'en' ? 'Player' : 'Pemain'} ${i + 1}: ${localizeText(check.error ?? 'Username tidak diizinkan.', this.lang)}`;
          const inp = q<HTMLInputElement>(`[data-local-name="${i}"]`);
          const errEl = q<HTMLElement>('#local-name-error');
          inp?.classList.add('is-invalid');
          inp?.focus();
          if (errEl) {
            errEl.textContent = errText;
            errEl.style.display = 'block';
          }
          this.showToast(errText);
          return;
        }
        sanitizedNames.push(check.sanitized);
      }
      this.sound.playUiClick();
      const players: CreatePlayerInput[] = Array.from({ length: this.draftLocalCount }, (_, i) => ({
        id: `local_${i + 1}`,
        name: sanitizedNames[i],
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
      const nameCheck = validateUsername(this.draftName.trim() || 'Kamu');
      if (!nameCheck.ok) {
        const errText = localizeText(nameCheck.error ?? 'Username tidak diizinkan.', this.lang);
        const inp = q<HTMLInputElement>('#inp-name');
        const errEl = q<HTMLElement>('#draft-name-error');
        inp?.classList.add('is-invalid');
        inp?.focus();
        if (errEl) {
          errEl.textContent = errText;
          errEl.style.display = 'block';
        }
        this.showToast(errText);
        return;
      }
      this.draftName = nameCheck.sanitized;
      this.sound.playUiClick();
      const players = buildBotPlayers(
        nameCheck.sanitized,
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
          () => this.showToast(this.lang === 'en' ? `Room ${roomCode} link copied!` : `Link room ${roomCode} disalin!`),
          () => this.showToast(this.lang === 'en' ? `Room code: ${roomCode}` : `Kode room: ${roomCode}`),
        );
      } else if (typeof navigator.share === 'function') {
        void navigator
          .share({
            title: this.lang === 'en' ? 'DodSnake: Join Room!' : 'DodSnake: Gabung Room!',
            text: this.lang === 'en' ? `Play DodSnake together! Room code: ${roomCode}` : `Main DodSnake bareng yuk! Kode room: ${roomCode}`,
            url,
          })
          .catch(() => this.showToast(this.lang === 'en' ? `Room code: ${roomCode}` : `Kode room: ${roomCode}`));
      } else {
        this.showToast(this.lang === 'en' ? `Room code: ${roomCode}` : `Kode room: ${roomCode}`);
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
    q('#btn-hud-peek')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.hudCompact = !this.hudCompact;
      this.renderMainLayer();
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
          const val = (e.target as HTMLInputElement).value;
          this.studioContext.name = val;
          const err = this.getLiveNameError(val);
          nameInp.classList.toggle('is-invalid', err !== null);
          const errEl = q<HTMLElement>('#studio-name-error');
          if (errEl) {
            errEl.textContent = err ?? '';
            errEl.style.display = err ? 'block' : 'none';
          }
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
    q('#btn-podium-support')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showSupportModal = true;
      this.renderModalsLayer();
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
    q('#btn-close-support')?.addEventListener('click', () => {
      this.sound.playUiClick();
      this.showSupportModal = false;
      this.renderModalsLayer();
    });
    q('#support-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.sound.playUiClick();
        this.showSupportModal = false;
        this.renderModalsLayer();
      }
    });
    q<HTMLSelectElement>('#set-lang')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.settings.language = val === 'en' ? 'en' : 'id';
      this.applyAccessibilitySettings();
      this.render();
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
