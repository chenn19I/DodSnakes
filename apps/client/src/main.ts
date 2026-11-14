import './styles/doodle.css';
import { DoodleSoundEngine } from './audio/soundEngine.js';
import { DoodleSceneManager } from './scene/sceneManager.js';
import { DoodleAppShell } from './ui/appShell.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

const sound = new DoodleSoundEngine();
const scene = new DoodleSceneManager(canvas, sound);
new DoodleAppShell(uiRoot, scene, sound);

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
