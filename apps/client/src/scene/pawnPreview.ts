import * as THREE from 'three';
import type { AccessoryId, PawnId, PlayerColorId } from '@doodle-dash/shared';
import { createOutlineController, type DoodleOutlineController } from './doodleMaterials.js';
import { buildPawnVisual, type PawnVisual } from './pawnBuilder.js';
import { DOODLE_PALETTE, PLAYER_HEX_MAP } from './palette.js';

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
  });
}

/**
 * Self-contained interactive 3D character studio pedestal preview.
 * Supports pointer drag-to-spin and live character/color/accessory hot-swapping.
 */
export class PawnPreviewStage {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 25);
  private readonly outlineCtrl: DoodleOutlineController = createOutlineController(0.028);
  private readonly pedestalMat: THREE.MeshToonMaterial;

  private currentPawn: PawnVisual | null = null;
  private currentKey = '';
  private yaw = 0.25;
  private targetYaw = 0.25;
  private dragging = false;
  private lastPointerX = 0;
  private bouncePop = 0;
  private rafId: number | null = null;
  private lastMs = performance.now();
  private elapsedSec = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.pedestalMat = new THREE.MeshToonMaterial({ color: DOODLE_PALETTE.mint });

    try {
      const canvas = document.createElement('canvas');
      canvas.className = 'studio-preview-canvas';
      const rect = container.getBoundingClientRect();
      const width = Math.max(180, Math.round(rect.width || 240));
      const height = Math.max(180, Math.round(rect.height || 230));

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = renderer;

      this.camera.aspect = width / height;
      this.camera.position.set(0, 1.05, 2.75);
      this.camera.lookAt(0, 0.5, 0);
      this.camera.updateProjectionMatrix();

      // Studio lighting setup
      const hemi = new THREE.HemisphereLight('#FFFDF9', '#E6D4BA', 1.28);
      const keyLight = new THREE.DirectionalLight('#FFF6E3', 1.15);
      keyLight.position.set(3.2, 5.4, 4.1);
      const rimLight = new THREE.DirectionalLight('#DCEBFF', 0.55);
      rimLight.position.set(-3.5, 2.8, -3.5);
      this.scene.add(hemi, keyLight, rimLight);

      // Cozy pastel sketchbook pedestal disc
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.74, 0.14, 28),
        this.pedestalMat,
      );
      pedestal.position.y = -0.08;
      this.scene.add(pedestal);

      const rimRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.025, 10, 32),
        new THREE.MeshBasicMaterial({ color: DOODLE_PALETTE.ink }),
      );
      rimRing.rotation.x = Math.PI / 2;
      rimRing.position.y = -0.01;
      this.scene.add(rimRing);

      container.innerHTML = '';
      container.appendChild(canvas);

      canvas.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
      window.addEventListener('resize', this.onResize);

      this.startLoop();
    } catch {
      this.renderer = null;
    }
  }

  public isActive(): boolean {
    return this.renderer !== null && !this.disposed;
  }

  public setSelection(pawnId: PawnId, colorId: PlayerColorId, accessory: AccessoryId): void {
    const nextKey = `${pawnId}:${colorId}:${accessory}`;
    if (nextKey === this.currentKey) return;
    this.currentKey = nextKey;

    this.pedestalMat.color.set(PLAYER_HEX_MAP[colorId]).lerp(new THREE.Color('#FFFDF7'), 0.48);

    if (this.currentPawn) {
      this.scene.remove(this.currentPawn.root);
      disposeObject3D(this.currentPawn.root);
      this.currentPawn = null;
    }

    const visual = buildPawnVisual('studio_preview', pawnId, colorId, this.outlineCtrl, 0, undefined, {
      accessory,
      showNameplate: false,
    });
    visual.root.position.set(0, 0, 0);
    visual.root.rotation.y = this.yaw;
    this.scene.add(visual.root);
    this.currentPawn = visual;
    this.bouncePop = 1;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.lastPointerX = e.clientX;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    this.targetYaw += dx * 0.015;
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly onResize = (): void => {
    if (!this.renderer || this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(180, Math.round(rect.width || 240));
    const height = Math.max(180, Math.round(rect.height || 230));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private startLoop(): void {
    const tick = () => {
      if (this.disposed || !this.renderer) return;
      this.rafId = requestAnimationFrame(tick);

      const now = performance.now();
      const dtSec = Math.min(0.05, (now - this.lastMs) / 1000);
      this.lastMs = now;
      this.elapsedSec += dtSec;

      this.outlineCtrl.setBoilingStep(Math.floor(this.elapsedSec * 9));

      if (!this.dragging) {
        this.targetYaw += dtSec * 0.42;
      }
      this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dtSec * 12);

      if (this.currentPawn) {
        this.currentPawn.root.rotation.y = this.yaw;
        this.currentPawn.updateIdle(this.elapsedSec, dtSec, false, false);
        if (this.bouncePop > 0) {
          this.bouncePop = Math.max(0, this.bouncePop - dtSec * 4.5);
          const hop = Math.sin(this.bouncePop * Math.PI) * 0.14;
          const stretch = 1 + Math.sin(this.bouncePop * Math.PI) * 0.08;
          this.currentPawn.root.position.y = hop;
          this.currentPawn.root.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
        } else {
          this.currentPawn.root.position.y = 0;
          this.currentPawn.root.scale.set(1, 1, 1);
        }
      }

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
      this.renderer.dispose();
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    if (this.currentPawn) {
      disposeObject3D(this.currentPawn.root);
      this.currentPawn = null;
    }
    disposeObject3D(this.scene);
    this.pedestalMat.dispose();
  }
}
