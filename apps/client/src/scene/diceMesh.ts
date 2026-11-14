import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DOODLE_PALETTE } from './palette.js';
import {
  addOutlineMesh,
  createDoodleToonMaterial,
  type DoodleOutlineController,
} from './doodleMaterials.js';

export interface DiceVisual {
  group: THREE.Group;
  mesh: THREE.Mesh;
  getQuaternionForValue: (value: number) => THREE.Quaternion;
  setTint: (mode: 'normal' | 'golden' | 'brake' | 'turbo') => void;
}

function drawInkCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
): void {
  // Subtle recessed pip rim
  ctx.fillStyle = 'rgba(36, 34, 45, 0.16)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, r + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Crisp ink contour + tiny specular highlight dot
  ctx.strokeStyle = DOODLE_PALETTE.ink;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, Math.max(3, r * 0.24), 0, Math.PI * 2);
  ctx.fill();
}

function createDieFaceTexture(pips: number, isGolden = false): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isGolden ? DOODLE_PALETTE.yellow : DOODLE_PALETTE.paper;
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(128, 128, 48, 128, 128, 165);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(36,34,45,0.09)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Hand-drawn inner rounded frame inside the flat face
  ctx.strokeStyle = DOODLE_PALETTE.ink;
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(28, 28, 200, 200, 28);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(36, 34, 45, 0.22)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(36, 36, 184, 184, 22);
  ctx.stroke();

  const spots: Record<number, Array<[number, number]>> = {
    1: [[128, 128]],
    2: [[78, 78], [178, 178]],
    3: [[78, 78], [128, 128], [178, 178]],
    4: [[78, 78], [178, 78], [78, 178], [178, 178]],
    5: [[78, 78], [178, 78], [128, 128], [78, 178], [178, 178]],
    6: [[82, 70], [174, 70], [82, 128], [174, 128], [82, 186], [174, 186]],
  };

  const pipColor = pips === 1 || pips === 6 ? DOODLE_PALETTE.coral : DOODLE_PALETTE.ink;
  const radius = pips === 1 ? 26 : 16.5;
  for (const [x, y] of spots[pips] ?? spots[1]) {
    drawInkCircle(ctx, x, y, radius, pipColor);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildDiceVisual(outlineCtrl: DoodleOutlineController, isGolden = false): DiceVisual {
  const group = new THREE.Group();
  const geo = new RoundedBoxGeometry(0.98, 0.98, 0.98, 2, 0.14);

  // RoundedBoxGeometry preserves BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  // Assign values: +X: 3, -X: 4, +Y: 1, -Y: 6, +Z: 2, -Z: 5 (opposite faces sum to 7!)
  const faceValues = [3, 4, 1, 6, 2, 5];
  const materials = faceValues.map((v) =>
    createDoodleToonMaterial({ map: createDieFaceTexture(v, isGolden) }),
  );

  const mesh = new THREE.Mesh(geo, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutlineMesh(mesh, outlineCtrl.material);
  group.add(mesh);
  group.visible = false;

  const getQuaternionForValue = (value: number): THREE.Quaternion => {
    const euler = new THREE.Euler(0, 0, 0);
    switch (value) {
      case 1: // +Y already up
        euler.set(0, 0, 0);
        break;
      case 6: // -Y up
        euler.set(Math.PI, 0, 0);
        break;
      case 2: // +Z up -> rotate -90 deg around X
        euler.set(-Math.PI / 2, 0, 0);
        break;
      case 5: // -Z up -> rotate +90 deg around X
        euler.set(Math.PI / 2, 0, 0);
        break;
      case 3: // +X up -> rotate +90 deg around Z
        euler.set(0, 0, Math.PI / 2);
        break;
      case 4: // -X up -> rotate -90 deg around Z
        euler.set(0, 0, -Math.PI / 2);
        break;
    }
    return new THREE.Quaternion().setFromEuler(euler);
  };

  const setTint = (mode: 'normal' | 'golden' | 'brake' | 'turbo'): void => {
    const hex =
      mode === 'golden'
        ? '#FFE066'
        : mode === 'brake'
          ? '#FFA8A8'
          : mode === 'turbo'
            ? '#9BF6FF'
            : '#FFFFFF';
    materials.forEach((m) => m.color.set(hex));
  };

  return { group, mesh, getQuaternionForValue, setTint };
}
