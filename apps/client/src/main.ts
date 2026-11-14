import './styles/doodle.css';
import { DoodleSoundEngine } from './audio/soundEngine.js';
import { DoodleSceneManager } from './scene/sceneManager.js';
import { DoodleAppShell } from './ui/appShell.js';

function renderStartupError(uiRoot: HTMLElement | null, error: unknown): void {
  if (!uiRoot) return;
  const msg = error instanceof Error ? error.message : String(error);
  const safeMsg = msg.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
  uiRoot.innerHTML = `
    <div class="boot-fallback" style="pointer-events:auto;">
      <div class="boot-fallback-card">
        <div class="boot-fallback-title">DodSnake</div>
        <p style="margin:6px 0 12px;">Ups, gagal menyiapkan tampilan 3D di browser ini.</p>
        <pre style="text-align:left;font-size:0.78rem;background:#fff;border:2px solid #24222D;border-radius:12px;padding:8px;overflow:auto;max-height:110px;">${safeMsg}</pre>
        <button id="btn-boot-retry" class="doodle-btn doodle-btn-primary" style="margin-top:10px;width:100%;">Muat Ulang</button>
      </div>
    </div>
  `;
  uiRoot.querySelector('#btn-boot-retry')?.addEventListener('click', () => window.location.reload());
}

function attachCameraControls(canvas: HTMLCanvasElement, scene: DoodleSceneManager): void {
  // Smooth tabletop camera drag-to-orbit, wheel zoom & double-click reset; short tap skips/speeds active anim
  let isDraggingCamera = false;
  let dragMovedPx = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    isDraggingCamera = true;
    dragMovedPx = 0;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDraggingCamera) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    dragMovedPx += Math.hypot(dx, dy);
    if (dragMovedPx > 4) {
      scene.addCameraOrbit(dx, dy);
    }
  });

  const stopDrag = (e: PointerEvent) => {
    if (!isDraggingCamera) return;
    isDraggingCamera = false;
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (dragMovedPx <= 5 && scene.hasActiveAnimation()) {
      scene.toggleSpeedUp(!scene.isSpeedUp());
    }
  };

  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('dblclick', () => {
    scene.resetCameraOrbit();
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      scene.addCameraZoom(e.deltaY);
    },
    { passive: false },
  );
}

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

if (canvas && uiRoot) {
  try {
    const sound = new DoodleSoundEngine();
    const scene = new DoodleSceneManager(canvas, sound);
    new DoodleAppShell(uiRoot, scene, sound);
    attachCameraControls(canvas, scene);
  } catch (err) {
    console.error('[DodSnake] Boot error:', err);
    renderStartupError(uiRoot, err);
  }
}
