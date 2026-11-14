import * as THREE from 'three';
import gsap from 'gsap';
import {
  BOARD_LAYOUT,
  getTileGridCoord,
  previewDiceLanding,
  type GameEvent,
  type GameState,
  type Player,
} from '@doodle-dash/shared';
import { DOODLE_PALETTE } from './palette.js';
import {
  createOutlineController,
  type DoodleOutlineController,
} from './doodleMaterials.js';
import { buildBoardVisuals, type BoardVisuals, type TilePreviewMarker } from './boardBuilder.js';
import { buildLaddersAndSnakes, type LaddersAndSnakesVisuals } from './laddersAndSnakes.js';
import { buildPawnVisual, type PawnVisual } from './pawnBuilder.js';
import { buildDiceVisual, type DiceVisual } from './diceMesh.js';
import { DoodleParticleSystem } from './particleSystem.js';
import { DoodleCameraRig } from './cameraRig.js';
import type { DoodleSoundEngine } from '../audio/soundEngine.js';

export interface SceneDebugStats {
  fps: number;
  drawCalls: number;
  triangles: number;
}

function createCalloutSprite(text: string, bgHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.strokeStyle = DOODLE_PALETTE.ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(14, 18, 228, 86, 30);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = DOODLE_PALETTE.ink;
  ctx.font = 'bold 54px "Gaegu", "Patrick Hand", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 62);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 1.2, 1);
  return sprite;
}

/**
 * Spring settle function approximating stiffness=180, damping=12.
 */
function springCurve(t: number): number {
  const omega = Math.sqrt(180); // ~13.4
  const zeta = 12 / (2 * omega); // ~0.447
  const dampedFreq = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(dampedFreq * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(dampedFreq * t));
}

export class DoodleSceneManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly cameraRig: DoodleCameraRig;
  private readonly outlineCtrl: DoodleOutlineController;
  private readonly board: BoardVisuals;
  private readonly laddersAndSnakes: LaddersAndSnakesVisuals;
  private readonly dice: DiceVisual;
  private readonly diceSecondary: DiceVisual;
  private readonly particles: DoodleParticleSystem;
  private readonly pawns = new Map<string, PawnVisual>();
  private readonly pawnSignatures = new Map<string, string>();
  private readonly animatingPawns = new Set<string>();
  private readonly sound: DoodleSoundEngine;

  private rafId: number | null = null;
  private lastFrameMs = performance.now();
  private elapsedSec = 0;
  private lastBoilStep = -1;
  private paused = false;
  private externalPaused = false;
  private reducedMotion = false;
  private speedMultiplier = 1;
  private preferredCameraMode: 'overview' | 'follow' = 'follow';
  private showcaseMode = true;
  private maxDpr = 2;
  private lowFpsStrikes = 0;
  private idleShadowCounter = 0;
  private activeTimeline: gsap.core.Timeline | null = null;
  private optimisticRollTween: gsap.core.Tween | null = null;
  private isPlayingQueue = false;
  private eventQueue: Array<{ event: GameEvent; onDone?: () => void }> = [];
  private latestPlayers: Player[] = [];
  private fpsSamples: number[] = [];
  private onStatsUpdate?: (stats: SceneDebugStats) => void;
  private onSpeedChange?: (enabled: boolean) => void;

  constructor(canvas: HTMLCanvasElement, sound: DoodleSoundEngine) {
    this.sound = sound;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(this.maxDpr, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DOODLE_PALETTE.deskWood);

    this.cameraRig = new DoodleCameraRig(window.innerWidth / window.innerHeight);
    this.outlineCtrl = createOutlineController(0.032);

    // Warm pastel storybook lighting with subtle cool rim separation
    const hemi = new THREE.HemisphereLight('#FFFDF9', '#E2CEB0', 1.24);
    this.scene.add(hemi);

    const rim = new THREE.DirectionalLight('#DCEBFF', 0.42);
    rim.position.set(-10, 14, -11);
    this.scene.add(rim);

    const dir = new THREE.DirectionalLight('#FFF6E3', 1.12);
    dir.position.set(11, 22, 13);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 4;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -13;
    dir.shadow.camera.right = 13;
    dir.shadow.camera.top = 13;
    dir.shadow.camera.bottom = -13;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);

    this.board = buildBoardVisuals(this.outlineCtrl);
    this.scene.add(this.board.group);

    this.laddersAndSnakes = buildLaddersAndSnakes(this.board, this.outlineCtrl);
    this.scene.add(this.laddersAndSnakes.group);

    this.dice = buildDiceVisual(this.outlineCtrl, false);
    this.scene.add(this.dice.group);

    this.diceSecondary = buildDiceVisual(this.outlineCtrl, true);
    this.scene.add(this.diceSecondary.group);

    this.particles = new DoodleParticleSystem();
    this.scene.add(this.particles.mesh);

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.startLoop();
  }

  public setDebugStatsCallback(cb: (stats: SceneDebugStats) => void): void {
    this.onStatsUpdate = cb;
  }

  public setSpeedChangeCallback(cb: (enabled: boolean) => void): void {
    this.onSpeedChange = cb;
  }

  public isSpeedUp(): boolean {
    return this.speedMultiplier > 1;
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.outlineCtrl.setReducedMotion(reduced);
  }

  public setPreferredCameraMode(mode: 'overview' | 'follow'): void {
    this.preferredCameraMode = mode;
    if (!this.showcaseMode) {
      this.cameraRig.setMode(mode);
    }
  }

  public getPreferredCameraMode(): 'overview' | 'follow' {
    return this.preferredCameraMode;
  }

  public setShowcaseMode(enabled: boolean): void {
    this.showcaseMode = enabled;
    if (enabled) {
      this.cameraRig.setMode('showcase');
      this.board.setPreviewTiles([]);
      this.board.setActiveTile(null);
    } else {
      this.cameraRig.setMode(this.preferredCameraMode);
    }
  }

  public addCameraOrbit(dxPx: number, dyPx: number): void {
    this.cameraRig.addOrbitDelta(dxPx, dyPx);
  }

  public addCameraZoom(deltaY: number): void {
    this.cameraRig.addZoomDelta(deltaY);
  }

  public resetCameraOrbit(): void {
    this.cameraRig.resetUserOrbit();
  }

  public hasActiveAnimation(): boolean {
    return this.isPlayingQueue || this.activeTimeline !== null;
  }

  public setCameraMode(mode: 'overview' | 'follow' | 'challenge' | 'victory'): void {
    if (this.showcaseMode) return;
    if (mode === 'challenge' && this.preferredCameraMode === 'overview') {
      this.cameraRig.setMode('overview');
      return;
    }
    this.cameraRig.setMode(mode);
  }

  public focusTile(tileId: number): void {
    this.cameraRig.setFollowPoint(this.board.getTileWorldTop(tileId));
  }

  public focusPlayer(playerId: string): void {
    const pv = this.pawns.get(playerId);
    if (pv) {
      this.cameraRig.setFollowPoint(pv.root.position);
      return;
    }
    const p = this.latestPlayers.find((x) => x.id === playerId);
    if (p) {
      this.focusTile(p.position);
    }
  }

  public toggleSpeedUp(enable: boolean): void {
    this.speedMultiplier = enable ? 2 : 1;
    if (this.activeTimeline) {
      this.activeTimeline.timeScale(this.speedMultiplier);
    }
    this.onSpeedChange?.(enable);
  }

  public skipCurrentAnimation(): void {
    if (this.activeTimeline) {
      this.activeTimeline.progress(1);
    }
  }

  public updateLandingPreview(player: Player | null, show: boolean): void {
    if (!show || !player || this.isPlayingQueue || this.showcaseMode) {
      this.board.setPreviewTiles([]);
      return;
    }
    const seen = new Set<number>();
    const markers: TilePreviewMarker[] = [];
    const maxDie = player.activeBrake ? 3 : 6;
    for (let die = 1; die <= maxDie; die++) {
      const p = previewDiceLanding(
        BOARD_LAYOUT,
        player.position,
        die,
        player.activeTurbo,
        player.pawn,
      );
      if (seen.has(p.to)) continue;
      seen.add(p.to);
      const kind: TilePreviewMarker['kind'] = p.ladderTo
        ? 'ladder'
        : p.snakeTo
          ? 'snake'
          : p.to === 100
            ? 'boss'
            : p.bounced
              ? 'bounced'
              : 'normal';
      markers.push({ tileId: p.to, kind });
    }
    this.board.setPreviewTiles(markers);
  }

  public syncPlayersFromState(state: GameState): void {
    this.latestPlayers = state.players;
    const validIds = new Set(state.players.map((p) => p.id));

    for (const [id, pv] of this.pawns.entries()) {
      if (!validIds.has(id)) {
        this.scene.remove(pv.root);
        this.pawns.delete(id);
        this.pawnSignatures.delete(id);
      }
    }

    const activeId = state.turnOrder[state.currentTurnIndex];

    state.players.forEach((player, idx) => {
      const acc = player.accessory ?? 'none';
      const sig = `${player.pawn}:${player.color}:${acc}:${player.name}`;
      let pv = this.pawns.get(player.id);
      if (pv && this.pawnSignatures.get(player.id) !== sig) {
        this.scene.remove(pv.root);
        pv = undefined;
      }
      if (!pv) {
        pv = buildPawnVisual(
          player.id,
          player.pawn,
          player.color,
          this.outlineCtrl,
          idx * 1.3,
          player.name,
          { accessory: acc },
        );
        this.pawns.set(player.id, pv);
        this.pawnSignatures.set(player.id, sig);
        this.scene.add(pv.root);
      }
      pv.setShieldVisible(player.shields > 0 || player.items.includes('shield'));
      pv.setActiveTurn(player.id === activeId);
      pv.setComboStreak(player.challengeStreak ?? 0);
      if (!this.animatingPawns.has(player.id)) {
        const slotPos = this.computeSlotWorldPosition(player.id, player.position, state.players);
        pv.root.position.copy(slotPos);
      }
    });

    const active = state.players.find((p) => p.id === activeId);
    if (active && !this.isPlayingQueue) {
      this.board.setActiveTile(active.position);
      this.focusTile(active.position);
      this.updateLandingPreview(
        active,
        !active.isBot && (state.phase === 'TURN_BEGIN' || state.phase === 'ROLL'),
      );
    } else if (!this.isPlayingQueue) {
      this.board.setPreviewTiles([]);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  private computeSlotWorldPosition(
    playerId: string,
    tileId: number,
    players: Player[],
  ): THREE.Vector3 {
    const base = this.board.getTileWorldTop(tileId);
    const sameTile = players.filter((p) => p.position === tileId);
    if (sameTile.length <= 1) return base;

    const index = Math.max(0, sameTile.findIndex((p) => p.id === playerId));
    const angle = (index / sameTile.length) * Math.PI * 2;
    const radius = 0.34;
    return new THREE.Vector3(
      base.x + Math.cos(angle) * radius,
      base.y,
      base.z + Math.sin(angle) * radius,
    );
  }

  /**
   * Optimistic anticipation shake when user presses Roll button before server replies.
   */
  public startOptimisticDiceShake(playerId: string): void {
    const pv = this.pawns.get(playerId);
    const anchor = pv ? pv.root.position.clone() : new THREE.Vector3(0, 0.5, 0);
    this.dice.setTint('normal');
    this.dice.group.visible = true;
    this.dice.group.position.set(anchor.x, anchor.y + 2.2, anchor.z);
    this.dice.group.scale.setScalar(1);
    this.diceSecondary.group.visible = false;
    this.sound.playDiceRattle();

    this.optimisticRollTween?.kill();
    this.optimisticRollTween = gsap.to(this.dice.mesh.rotation, {
      x: '+=6',
      y: '+=8',
      duration: 0.6,
      repeat: -1,
      ease: 'none',
    });
  }

  public enqueueEvents(events: GameEvent[], finalState: GameState): Promise<void> {
    this.latestPlayers = finalState.players;
    if (events.length === 0) {
      this.syncPlayersFromState(finalState);
      return Promise.resolve();
    }
    this.board.setPreviewTiles([]);
    return new Promise((resolve) => {
      events.forEach((ev, idx) => {
        const isLast = idx === events.length - 1;
        this.eventQueue.push({
          event: ev,
          onDone: isLast
            ? () => {
                this.syncPlayersFromState(finalState);
                resolve();
              }
            : undefined,
        });
      });
      if (!this.isPlayingQueue) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    this.isPlayingQueue = true;
    while (this.eventQueue.length > 0) {
      const next = this.eventQueue.shift()!;
      await this.playSingleEvent(next.event);
      next.onDone?.();
    }
    this.isPlayingQueue = false;
  }

  private showCallout(text: string, worldPos: THREE.Vector3, bgHex: string, duration = 0.9): void {
    const sprite = createCalloutSprite(text, bgHex);
    sprite.position.set(worldPos.x, worldPos.y + 1.4, worldPos.z);
    sprite.scale.set(0.1, 0.05, 1);
    this.scene.add(sprite);

    const tl = gsap.timeline({
      onComplete: () => {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
      },
    });
    tl.to(sprite.scale, { x: 2.3, y: 1.15, duration: 0.25, ease: 'back.out(2)' })
      .to(sprite.position, { y: worldPos.y + 2.15, duration: duration * 0.7, ease: 'power1.out' }, 0)
      .to(sprite.material, { opacity: 0, duration: 0.25 }, duration * 0.65);
  }

  private playSingleEvent(ev: GameEvent): Promise<void> {
    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.activeTimeline = null;
          resolve();
        },
      });
      tl.timeScale(this.speedMultiplier);
      this.activeTimeline = tl;

      if (ev.type === 'TurnStarted') {
        const pv = this.pawns.get(ev.playerId);
        const p = this.latestPlayers.find((x) => x.id === ev.playerId);
        if (p) {
          this.board.setActiveTile(p.position);
        }
        if (pv) {
          this.cameraRig.setMode(this.preferredCameraMode);
          this.cameraRig.setFollowPoint(pv.root.position);
        }
        tl.to({}, { duration: 0.15 });
        return;
      }

      if (ev.type === 'DiceRolled') {
        this.optimisticRollTween?.kill();
        const rolledVal = ev.diceValues[0];
        const isDual = ev.needsChoice && ev.diceValues.length > 1;
        const pv = this.pawns.get(ev.playerId);
        const anchor = pv ? pv.root.position.clone() : new THREE.Vector3(0, 0.5, 0);
        const landing = new THREE.Vector3(
          THREE.MathUtils.clamp(anchor.x + (isDual ? 1.5 : 1.1), -7.5, 7.5),
          anchor.y + 0.52,
          THREE.MathUtils.clamp(anchor.z + 0.8, -7.5, 7.5),
        );
        const landing2 = new THREE.Vector3(
          THREE.MathUtils.clamp(anchor.x - 1.0, -7.5, 7.5),
          anchor.y + 0.52,
          THREE.MathUtils.clamp(anchor.z + 1.0, -7.5, 7.5),
        );

        const dieTint = ev.usedGoldenDice
          ? 'golden'
          : ev.usedBrake
            ? 'brake'
            : ev.usedTurbo
              ? 'turbo'
              : 'normal';
        this.dice.setTint(dieTint);
        this.dice.group.visible = true;
        this.dice.group.position.set(anchor.x, anchor.y + 2.4, anchor.z);
        const startQuat = this.dice.mesh.quaternion.clone();
        const targetQuat = this.dice.getQuaternionForValue(rolledVal);
        const slerpProxy = { t: 0 };

        if (isDual) {
          this.diceSecondary.setTint('golden');
          this.diceSecondary.group.visible = true;
          this.diceSecondary.group.position.set(anchor.x - 0.6, anchor.y + 2.5, anchor.z);
          this.diceSecondary.group.scale.setScalar(1);
        } else {
          this.diceSecondary.group.visible = false;
        }
        const startQuat2 = this.diceSecondary.mesh.quaternion.clone();
        const targetQuat2 = this.diceSecondary.getQuaternionForValue(ev.diceValues[1] ?? rolledVal);

        // 250ms anticipation shake + 900ms 3-bounce arc throw + slerp orientation
        tl.to(this.dice.group.position, { y: anchor.y + 2.85, duration: 0.14, ease: 'power1.out' })
          .to(this.dice.group.scale, { x: 1.18, y: 0.82, z: 1.18, duration: 0.11 }, '<')
          .to(this.dice.group.position, {
            x: landing.x,
            z: landing.z,
            duration: 0.85,
            ease: 'power2.out',
          })
          // Bounce 1
          .to(this.dice.group.position, { y: landing.y, duration: 0.25, ease: 'power2.in' }, '<')
          .to(this.dice.group.scale, { x: 1.25, y: 0.72, z: 1.25, duration: 0.08 })
          .to(this.dice.group.scale, { x: 1, y: 1, z: 1, duration: 0.1 })
          // Bounce 2
          .to(this.dice.group.position, { y: landing.y + 1.05, duration: 0.18, ease: 'power2.out' }, '<')
          .to(this.dice.group.position, { y: landing.y, duration: 0.18, ease: 'power2.in' })
          .to(this.dice.group.scale, { x: 1.15, y: 0.84, z: 1.15, duration: 0.06 })
          .to(this.dice.group.scale, { x: 1, y: 1, z: 1, duration: 0.08 })
          // Bounce 3 + final settle
          .to(this.dice.group.position, { y: landing.y + 0.42, duration: 0.12, ease: 'power2.out' }, '<')
          .to(this.dice.group.position, { y: landing.y, duration: 0.12, ease: 'power2.in' })
          .to(
            slerpProxy,
            {
              t: 1,
              duration: 0.55,
              ease: 'power2.out',
              onUpdate: () => {
                this.dice.mesh.quaternion.copy(startQuat).slerp(targetQuat, slerpProxy.t);
                if (isDual) {
                  this.diceSecondary.mesh.quaternion.copy(startQuat2).slerp(targetQuat2, slerpProxy.t);
                }
              },
            },
            0.25,
          )
          .call(() => {
            this.sound.playDiceLand();
            this.particles.spawnStarBurst(landing, this.reducedMotion);
            const label = isDual
              ? `${ev.diceValues[0]} / ${ev.diceValues[1]}`
              : ev.usedTurbo
                ? `${rolledVal} (+2!)`
                : `${rolledVal}!`;
            this.showCallout(
              label,
              landing,
              ev.usedTurbo ? DOODLE_PALETTE.blue : DOODLE_PALETTE.yellow,
              0.8,
            );
          })
          .to({}, { duration: 0.35 })
          .call(() => {
            this.dice.group.visible = false;
            this.diceSecondary.group.visible = false;
          });

        if (isDual) {
          tl.to(
            this.diceSecondary.group.position,
            { x: landing2.x, z: landing2.z, duration: 0.82, ease: 'power2.out' },
            0.14,
          ).to(
            this.diceSecondary.group.position,
            { y: landing2.y, duration: 0.55, ease: 'bounce.out' },
            0.22,
          );
        }
        return;
      }

      if (ev.type === 'PawnMoved') {
        const pv = this.pawns.get(ev.playerId);
        if (!pv || ev.path.length === 0) {
          tl.to({}, { duration: 0.05 });
          return;
        }
        this.animatingPawns.add(ev.playerId);
        this.cameraRig.setMode(this.preferredCameraMode);

        const hopDuration = ev.path.length > 6 ? 0.2 : 0.28;
        const arcHeight = 1.05;

        ev.path.forEach((stepTileId, idx) => {
          const prevTileId = idx === 0 ? ev.from : ev.path[idx - 1];
          const fromPos = this.board.getTileWorldTop(prevTileId);
          const isLastStep = idx === ev.path.length - 1;
          const toPos = isLastStep
            ? this.computeSlotWorldPosition(ev.playerId, stepTileId, this.latestPlayers)
            : this.board.getTileWorldTop(stepTileId);

          const proxy = { t: 0 };
          // Takeoff squash 0.85
          tl.to(pv.bodyGroup.scale, { x: 1.08, y: 0.85, z: 1.08, duration: 0.045 })
            .to(proxy, {
              t: 1,
              duration: hopDuration,
              ease: 'none',
              onStart: () => {
                const lookTarget = new THREE.Vector3(toPos.x, pv.root.position.y, toPos.z);
                pv.root.lookAt(lookTarget);
              },
              onUpdate: () => {
                const p = proxy.t;
                pv.root.position.x = THREE.MathUtils.lerp(fromPos.x, toPos.x, p);
                pv.root.position.z = THREE.MathUtils.lerp(fromPos.z, toPos.z, p);
                const arc = Math.sin(p * Math.PI) * arcHeight;
                pv.root.position.y = THREE.MathUtils.lerp(fromPos.y, toPos.y, p) + arc;
                // Mid-air stretch 1.15
                const stretch = 1 + Math.sin(p * Math.PI) * 0.15;
                pv.bodyGroup.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
                this.cameraRig.setFollowPoint(pv.root.position);
              },
              onComplete: () => {
                this.sound.playBoing(idx);
                this.particles.spawnDustPuff(toPos, this.reducedMotion);
                // Tile boing press for 80ms
                this.board.setTileBoing(stepTileId, -0.14, 1.04);
                setTimeout(() => this.board.setTileBoing(stepTileId, 0, 1), 80);
              },
            })
            // Landing squash 0.8 + spring settle (stiffness ~180, damping ~12)
            .to(
              { s: 0 },
              {
                s: 1,
                duration: 0.24,
                ease: 'none',
                onUpdate: function () {
                  const prog = this.targets()[0].s as number;
                  const sp = springCurve(prog * 0.45);
                  const sy = THREE.MathUtils.lerp(0.8, 1.0, sp);
                  const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
                  pv.bodyGroup.scale.set(sxz, sy, sxz);
                },
              },
            );
        });

        tl.call(() => {
          this.animatingPawns.delete(ev.playerId);
          if (ev.bounced) {
            this.showCallout('Mantul!', pv.root.position, DOODLE_PALETTE.orange, 0.85);
          }
        });
        return;
      }

      if (ev.type === 'LadderClimbed') {
        const pv = this.pawns.get(ev.playerId);
        const ladder = this.laddersAndSnakes.ladders.get(ev.ladderId);
        if (!pv || !ladder) {
          tl.to({}, { duration: 0.05 });
          return;
        }
        this.animatingPawns.add(ev.playerId);
        this.sound.playLadderClimb();

        const growProxy = { g: 0.05 };
        const climbProxy = { t: 0 };
        const startPos = this.board.getTileWorldTop(ev.from);
        const endPos = this.computeSlotWorldPosition(ev.playerId, ev.to, this.latestPlayers);

        // Draw-on ladder 500ms
        tl.to(growProxy, {
          g: 1,
          duration: 0.5,
          ease: 'back.out(1.6)',
          onUpdate: () => ladder.setGrowProgress(growProxy.g),
        })
          .to(climbProxy, {
            t: 1,
            duration: 0.9,
            ease: 'power1.inOut',
            onUpdate: () => {
              const p = climbProxy.t;
              pv.root.position.lerpVectors(startPos, endPos, p);
              pv.root.position.y += 0.25;
              pv.bodyGroup.rotation.z = Math.sin(p * Math.PI * 8) * 0.16;
              this.cameraRig.setFollowPoint(pv.root.position);
            },
          })
          .call(() => {
            pv.bodyGroup.rotation.z = 0;
            pv.root.position.copy(endPos);
            this.animatingPawns.delete(ev.playerId);
            this.particles.spawnConfetti(endPos, this.reducedMotion, 20);
            this.showCallout('Wiii!', endPos, DOODLE_PALETTE.mint, 1.0);
          });
        return;
      }

      if (ev.type === 'SnakeBitten') {
        const pv = this.pawns.get(ev.playerId);
        const snake = this.laddersAndSnakes.snakes.get(ev.snakeId);
        if (!pv || !snake) {
          tl.to({}, { duration: 0.05 });
          return;
        }
        if (ev.dodgedByChallenge) {
          this.showCallout('Ular Ketawa!', pv.root.position, DOODLE_PALETTE.mint, 1.0);
          tl.to(snake.headGroup.position, { y: '+=0.35', yoyo: true, repeat: 3, duration: 0.12 });
          return;
        }
        if (ev.blockedByShield) {
          this.showCallout('Tangkis Perisai!', pv.root.position, DOODLE_PALETTE.blue, 1.0);
          tl.to(pv.shieldBubble.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.25, yoyo: true, repeat: 1 });
          return;
        }

        this.animatingPawns.add(ev.playerId);
        const headOrig = snake.headGroup.position.clone();
        const endPos = this.computeSlotWorldPosition(ev.playerId, ev.to, this.latestPlayers);
        const gulpProxy = { t: 0 };

        // Snake wakes up & strikes 300ms -> camera shake 250ms -> gulp 600ms + spiral slide
        tl.call(() => {
          snake.setAwake(true);
          this.sound.playSnakeBite();
        })
          .to(snake.headGroup.position, {
            y: headOrig.y + 0.55,
            duration: 0.15,
            ease: 'power2.out',
          })
          .to(snake.headGroup.position, {
            y: headOrig.y + 0.05,
            duration: 0.15,
            ease: 'power3.in',
            onComplete: () => {
              this.cameraRig.triggerShake(0.25, 0.32);
            },
          })
          .to(gulpProxy, {
            t: 1,
            duration: 0.75,
            ease: 'power1.inOut',
            onUpdate: () => {
              const p = gulpProxy.t;
              snake.setGulpProgress(p);
              const curvePt = snake.curve.getPointAt(p);
              pv.root.position.set(
                curvePt.x + Math.cos(p * Math.PI * 6) * 0.28,
                curvePt.y + 0.25,
                curvePt.z + Math.sin(p * Math.PI * 6) * 0.28,
              );
              pv.bodyGroup.rotation.y = p * Math.PI * 6;
              this.cameraRig.setFollowPoint(pv.root.position);
            },
            onComplete: () => {
              snake.setGulpProgress(-1);
              snake.setAwake(false);
              snake.headGroup.position.copy(headOrig);
              pv.bodyGroup.rotation.y = 0;
              pv.root.position.copy(endPos);
              pv.setDizzyVisible(true);
              this.animatingPawns.delete(ev.playerId);
              this.showCallout('Glek!!', endPos, DOODLE_PALETTE.pink, 1.0);
              setTimeout(() => pv.setDizzyVisible(false), 2400);
            },
          });
        return;
      }

      if (ev.type === 'GameWon') {
        const pv = this.pawns.get(ev.winnerId);
        if (pv) {
          this.cameraRig.setFollowPoint(pv.root.position);
          this.cameraRig.setMode('victory');
          this.sound.playConfettiFanfare();
          this.particles.spawnConfetti(pv.root.position, this.reducedMotion, 60);
          tl.to(pv.bodyGroup.position, { y: 0.55, yoyo: true, repeat: 5, duration: 0.22, ease: 'power1.out' });
        } else {
          tl.to({}, { duration: 0.5 });
        }
        return;
      }

      if (ev.type === 'ItemUsed') {
        const pv = this.pawns.get(ev.playerId);
        if (pv) {
          this.sound.playItemUse();
          this.particles.spawnStarBurst(pv.root.position, this.reducedMotion);
          const tag =
            ev.item === 'shield'
              ? 'Perisai!'
              : ev.item === 'golden_dice'
                ? 'Dadu Emas!'
                : ev.item === 'brake'
                  ? 'Rem!'
                  : ev.item === 'magnet_star'
                    ? 'Magnet ★!'
                    : ev.item === 'swap_turbo'
                      ? 'Turbo +2!'
                      : 'Kejutan!';
          this.showCallout(tag, pv.root.position, DOODLE_PALETTE.yellow, 0.85);
          tl.to(pv.bodyGroup.scale, { y: 1.18, x: 0.9, z: 0.9, yoyo: true, repeat: 1, duration: 0.14 });
        } else {
          tl.to({}, { duration: 0.1 });
        }
        return;
      }

      if (ev.type === 'ExtraRollGranted') {
        const pv = this.pawns.get(ev.playerId);
        if (pv) {
          this.particles.spawnStarBurst(pv.root.position, this.reducedMotion);
          this.showCallout('Lempar Lagi!', pv.root.position, DOODLE_PALETTE.yellow, 0.8);
          tl.to(pv.bodyGroup.position, { y: 0.3, yoyo: true, repeat: 1, duration: 0.14 });
        } else {
          tl.to({}, { duration: 0.1 });
        }
        return;
      }

      // Default subtle pause for informational events
      tl.to({}, { duration: 0.08 });
    });
  }

  private startLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (this.paused) return;

      const now = performance.now();
      const dtSec = Math.min(0.05, (now - this.lastFrameMs) / 1000);
      this.lastFrameMs = now;
      this.elapsedSec += dtSec;

      // Update boiling line step at ~9 fps
      const boilStep = Math.floor(this.elapsedSec * 9);
      if (boilStep !== this.lastBoilStep) {
        this.lastBoilStep = boilStep;
        this.outlineCtrl.setBoilingStep(boilStep);
      }

      this.board.updateIdle(this.elapsedSec, this.reducedMotion);
      this.laddersAndSnakes.updateIdle(this.elapsedSec, this.reducedMotion);
      for (const [id, pv] of this.pawns.entries()) {
        pv.updateIdle(this.elapsedSec, dtSec, this.animatingPawns.has(id), this.reducedMotion);
      }
      this.particles.update(dtSec);
      this.cameraRig.update(dtSec, this.elapsedSec, this.reducedMotion);

      // Update directional shadow map on motion, dice rolls, or every 10th idle frame
      this.idleShadowCounter = (this.idleShadowCounter + 1) % 10;
      if (
        this.isPlayingQueue ||
        this.animatingPawns.size > 0 ||
        this.dice.group.visible ||
        this.diceSecondary.group.visible ||
        this.idleShadowCounter === 0
      ) {
        this.renderer.shadowMap.needsUpdate = true;
      }

      this.renderer.render(this.scene, this.cameraRig.camera);

      // Update debug FPS & draw call telemetry + automatic DPR downscale watchdog
      if (dtSec > 0) {
        this.fpsSamples.push(1 / dtSec);
        if (this.fpsSamples.length > 24) this.fpsSamples.shift();
        if (this.fpsSamples.length % 12 === 0) {
          const avgFps = Math.round(
            this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length,
          );
          if (avgFps < 44 && this.fpsSamples.length >= 24) {
            this.lowFpsStrikes++;
            if (this.lowFpsStrikes >= 2 && this.maxDpr > 1.0) {
              this.maxDpr = 1.0;
              this.handleResize();
              this.lowFpsStrikes = 0;
            }
          } else {
            this.lowFpsStrikes = 0;
          }
          if (this.onStatsUpdate) {
            this.onStatsUpdate({
              fps: avgFps,
              drawCalls: this.renderer.info.render.calls,
              triangles: this.renderer.info.render.triangles,
            });
          }
        }
      }
    };
    tick();
  }

  private readonly handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(this.maxDpr, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h);
    this.cameraRig.setAspect(w / h);
  };

  public setExternalPause(paused: boolean): void {
    this.externalPaused = paused;
    this.paused = document.hidden || this.externalPaused;
    if (!this.paused) {
      this.lastFrameMs = performance.now();
    }
  }

  private readonly handleVisibility = (): void => {
    this.paused = document.hidden || this.externalPaused;
    if (!this.paused) {
      this.lastFrameMs = performance.now();
    }
  };

  public dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer.dispose();
  }
}
