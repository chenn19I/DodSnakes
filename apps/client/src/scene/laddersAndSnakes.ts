import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BOARD_LAYOUT,
  type LadderDef,
  type SnakeDef,
  type SnakePersonality,
} from '@doodle-dash/shared';
import { DOODLE_PALETTE } from './palette.js';
import {
  addOutlineMesh,
  createDoodleToonMaterial,
  type DoodleOutlineController,
} from './doodleMaterials.js';
import type { BoardVisuals } from './boardBuilder.js';

export interface LadderVisual {
  def: LadderDef;
  group: THREE.Group;
  pivot: THREE.Group;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  setGrowProgress: (progress: number) => void;
}

export interface SnakeVisual {
  def: SnakeDef;
  group: THREE.Group;
  headGroup: THREE.Group;
  tongue: THREE.Mesh;
  eyelids: THREE.Mesh[];
  gulpBulge: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  setAwake: (awake: boolean) => void;
  setGulpProgress: (t: number) => void;
  updateIdle: (elapsedSec: number, reducedMotion: boolean) => void;
}

export interface LaddersAndSnakesVisuals {
  group: THREE.Group;
  ladders: Map<string, LadderVisual>;
  snakes: Map<string, SnakeVisual>;
  updateIdle: (elapsedSec: number, reducedMotion: boolean) => void;
}

function createSnakeStripeTexture(primary: string, stripe: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = stripe;
  for (let x = 0; x < 256; x += 28) {
    ctx.beginPath();
    ctx.ellipse(x + 12, 32, 8, 22, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLadder(
  def: LadderDef,
  board: BoardVisuals,
  outlineCtrl: DoodleOutlineController,
  idx: number,
): LadderVisual {
  const startPos = board.getTileWorldTop(def.from).add(new THREE.Vector3(0, 0.1, 0));
  const endPos = board.getTileWorldTop(def.to).add(new THREE.Vector3(0, 0.1, 0));
  const dir = new THREE.Vector3().subVectors(endPos, startPos);
  const len = dir.length();
  const unitDir = dir.clone().normalize();
  const side = new THREE.Vector3(-unitDir.z, 0, unitDir.x).normalize();

  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.copy(startPos);
  group.add(pivot);

  // Align pivot's local +Y with ladder direction
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, unitDir);
  const localContent = new THREE.Group();
  localContent.quaternion.copy(quat);
  pivot.add(localContent);

  const railColor = idx % 2 === 0 ? '#E8B377' : DOODLE_PALETTE.pink;
  const rungColor = idx % 2 === 0 ? DOODLE_PALETTE.yellow : '#FFF6E5';
  const railMat = createDoodleToonMaterial({ color: railColor });
  const rungMat = createDoodleToonMaterial({ color: rungColor });
  const railGeoBase = new THREE.CylinderGeometry(0.065, 0.065, len, 7);
  const rungGeoBase = new THREE.CylinderGeometry(0.048, 0.048, 0.56, 7);
  rungGeoBase.rotateZ(Math.PI / 2);

  // Merge left & right rails + smooth rounded end caps into 1 geometry
  const halfWidth = 0.26;
  const knobGeo = new THREE.SphereGeometry(0.088, 7, 7);
  const railParts = [
    railGeoBase.clone().translate(-halfWidth, len / 2, 0.12),
    railGeoBase.clone().translate(halfWidth, len / 2, 0.12),
    knobGeo.clone().translate(-halfWidth, 0.04, 0.12),
    knobGeo.clone().translate(halfWidth, 0.04, 0.12),
    knobGeo.clone().translate(-halfWidth, len - 0.04, 0.12),
    knobGeo.clone().translate(halfWidth, len - 0.04, 0.12),
  ];
  const mergedRailGeo = mergeGeometries(railParts, false) ?? railGeoBase;
  railParts.forEach((g) => g.dispose());
  railGeoBase.dispose();
  knobGeo.dispose();

  const railsMesh = new THREE.Mesh(mergedRailGeo, railMat);
  railsMesh.castShadow = true;
  addOutlineMesh(railsMesh, outlineCtrl.material);
  localContent.add(railsMesh);

  // Merge all rungs into 1 geometry -> 1 mesh + 1 outline instead of ~16-30 draw calls
  const rungCount = Math.max(4, Math.floor(len / 0.65));
  const rungParts: THREE.BufferGeometry[] = [];
  for (let r = 1; r < rungCount; r++) {
    const t = r / rungCount;
    rungParts.push(rungGeoBase.clone().translate(0, t * len, 0.12));
  }
  const mergedRungsGeo = mergeGeometries(rungParts, false) ?? rungGeoBase;
  rungParts.forEach((g) => g.dispose());
  rungGeoBase.dispose();

  const rungsMesh = new THREE.Mesh(mergedRungsGeo, rungMat);
  rungsMesh.castShadow = true;
  addOutlineMesh(rungsMesh, outlineCtrl.material);
  localContent.add(rungsMesh);

  void side;

  return {
    def,
    group,
    pivot,
    startPos,
    endPos,
    setGrowProgress: (progress: number) => {
      const clamped = Math.max(0.05, Math.min(1.18, progress));
      localContent.scale.set(
        0.7 + 0.3 * Math.min(1, clamped),
        clamped,
        0.7 + 0.3 * Math.min(1, clamped),
      );
    },
  };
}

const SNAKE_PALETTE: Array<[string, string]> = [
  [DOODLE_PALETTE.mint, '#34A87F'],
  [DOODLE_PALETTE.purple, '#7E64D9'],
  [DOODLE_PALETTE.orange, '#E06D32'],
  [DOODLE_PALETTE.pink, '#E05780'],
];

interface SharedSnakeAssets {
  tailTipGeo: THREE.BufferGeometry;
  headGeo: THREE.BufferGeometry;
  eyeWhiteGeo: THREE.BufferGeometry;
  pupilGeo: THREE.BufferGeometry;
  lidGeo: THREE.BufferGeometry;
  tongueGeo: THREE.BufferGeometry;
  gulpGeo: THREE.BufferGeometry;
  blushGeo: THREE.BufferGeometry;
  whiteMat: THREE.MeshToonMaterial;
  pupilMat: THREE.MeshBasicMaterial;
  tongueMat: THREE.MeshToonMaterial;
  blushMat: THREE.MeshToonMaterial;
  bodyMats: THREE.MeshToonMaterial[];
}

function createSharedSnakeAssets(): SharedSnakeAssets {
  const headGeo = new THREE.SphereGeometry(0.32, 10, 8);
  headGeo.scale(1.05, 0.85, 1.2);
  return {
    tailTipGeo: new THREE.ConeGeometry(0.16, 0.45, 7),
    headGeo,
    eyeWhiteGeo: new THREE.SphereGeometry(0.115, 8, 7),
    pupilGeo: new THREE.SphereGeometry(0.06, 7, 7),
    lidGeo: new THREE.SphereGeometry(0.125, 8, 7, 0, Math.PI * 2, 0, Math.PI * 0.55),
    tongueGeo: new THREE.BoxGeometry(0.05, 0.02, 0.28),
    gulpGeo: new THREE.SphereGeometry(0.32, 9, 8),
    blushGeo: new THREE.SphereGeometry(0.065, 6, 6),
    whiteMat: createDoodleToonMaterial({ color: '#FFFFFF' }),
    pupilMat: new THREE.MeshBasicMaterial({ color: DOODLE_PALETTE.ink }),
    tongueMat: createDoodleToonMaterial({ color: '#FF5D8F' }),
    blushMat: createDoodleToonMaterial({ color: '#FF85A1' }),
    bodyMats: SNAKE_PALETTE.map(([primary, stripe]) =>
      createDoodleToonMaterial({ map: createSnakeStripeTexture(primary, stripe) }),
    ),
  };
}

function buildSnake(
  def: SnakeDef,
  board: BoardVisuals,
  outlineCtrl: DoodleOutlineController,
  assets: SharedSnakeAssets,
  idx: number,
): SnakeVisual {
  const headPos = board.getTileWorldTop(def.from).add(new THREE.Vector3(0, 0.22, 0));
  const tailPos = board.getTileWorldTop(def.to).add(new THREE.Vector3(0, 0.12, 0));

  const dir = new THREE.Vector3().subVectors(tailPos, headPos);
  const len = dir.length();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

  // Build wavy S-curve control points
  const points: THREE.Vector3[] = [];
  const segs = 6;
  const amp = Math.min(1.15, len * 0.14);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const base = new THREE.Vector3().lerpVectors(headPos, tailPos, t);
    const wave = Math.sin(t * Math.PI * 2.5 + idx) * amp * Math.sin(t * Math.PI);
    base.addScaledVector(perp, wave);
    base.y += Math.sin(t * Math.PI) * 0.18;
    points.push(base);
  }
  const curve = new THREE.CatmullRomCurve3(points);

  const palIdx = idx % SNAKE_PALETTE.length;
  const [primaryCol, stripeCol] = SNAKE_PALETTE[palIdx];
  const bodyMat = assets.bodyMats[palIdx];
  const primaryMat = createDoodleToonMaterial({ color: primaryCol });
  const lidMat = createDoodleToonMaterial({ color: stripeCol });
  const bodyGeo = new THREE.TubeGeometry(curve, 28, 0.17, 8, false);

  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  addOutlineMesh(bodyMesh, outlineCtrl.material);
  group.add(bodyMesh);

  // Taper tip at tail
  const tailTip = new THREE.Mesh(assets.tailTipGeo, primaryMat);
  const tailTan = curve.getTangent(1).normalize();
  tailTip.position.copy(tailPos);
  tailTip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tailTan);
  addOutlineMesh(tailTip, outlineCtrl.material);
  group.add(tailTip);

  // Head group at `headPos`
  const headGroup = new THREE.Group();
  headGroup.position.copy(headPos);
  const headForward = dir.clone().setY(0).normalize().negate();
  headGroup.lookAt(headPos.clone().add(headForward));

  const headMesh = new THREE.Mesh(assets.headGeo, primaryMat);
  headMesh.castShadow = true;
  addOutlineMesh(headMesh, outlineCtrl.material);
  headGroup.add(headMesh);

  // Big cute eyes, cheeks + personality eyelids
  const eyelids: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(assets.eyeWhiteGeo, assets.whiteMat);
    eye.position.set(side * 0.16, 0.16, 0.18);
    addOutlineMesh(eye, outlineCtrl.material);
    headGroup.add(eye);

    const pupil = new THREE.Mesh(assets.pupilGeo, assets.pupilMat);
    pupil.position.set(0, 0, 0.08);
    eye.add(pupil);

    const lid = new THREE.Mesh(assets.lidGeo, lidMat);
    lid.position.copy(eye.position);
    lid.rotation.x = getBaseEyelidTilt(def.personality);
    eyelids.push(lid);
    headGroup.add(lid);

    const blush = new THREE.Mesh(assets.blushGeo, assets.blushMat);
    blush.scale.set(1.2, 0.65, 0.65);
    blush.position.set(side * 0.25, -0.02, 0.22);
    headGroup.add(blush);
  }

  // Cute snout bridge & mini crest tuft on top of head
  const snoutMesh = new THREE.Mesh(assets.blushGeo, primaryMat);
  snoutMesh.scale.set(2.2, 1.3, 1.8);
  snoutMesh.position.set(0, -0.02, 0.27);
  headGroup.add(snoutMesh);

  const crestMat = idx % 2 === 0 ? assets.tongueMat : assets.blushMat;
  const crestMesh = new THREE.Mesh(assets.pupilGeo, crestMat);
  crestMesh.scale.set(1.4, 1.9, 1.2);
  crestMesh.position.set(0, 0.28, 0.02);
  addOutlineMesh(crestMesh, outlineCtrl.material);
  headGroup.add(crestMesh);

  // Cute forked tongue
  const tongue = new THREE.Mesh(assets.tongueGeo, assets.tongueMat);
  tongue.position.set(0, -0.05, 0.36);
  headGroup.add(tongue);

  // Swallow gulp bulge ("glek")
  const gulpBulge = new THREE.Mesh(assets.gulpGeo, primaryMat);
  gulpBulge.visible = false;
  addOutlineMesh(gulpBulge, outlineCtrl.material);
  group.add(gulpBulge);

  group.add(headGroup);

  let awake = false;

  return {
    def,
    group,
    headGroup,
    tongue,
    eyelids,
    gulpBulge,
    curve,
    setAwake: (val: boolean) => {
      awake = val;
      for (const lid of eyelids) {
        lid.rotation.x = val ? -0.95 : getBaseEyelidTilt(def.personality);
      }
      tongue.scale.z = val ? 1.6 : 0.7;
    },
    setGulpProgress: (t: number) => {
      if (t < 0 || t > 1) {
        gulpBulge.visible = false;
        return;
      }
      gulpBulge.visible = true;
      gulpBulge.position.copy(curve.getPointAt(t));
      const s = 0.85 + Math.sin(t * Math.PI) * 0.45;
      gulpBulge.scale.setScalar(s);
    },
    updateIdle: (elapsedSec: number, reducedMotion: boolean) => {
      if (awake) return;
      const ampMul = reducedMotion ? 0.2 : 1;
      headGroup.rotation.z = Math.sin(elapsedSec * 1.8 + idx) * 0.1 * ampMul;
      headGroup.position.y = headPos.y + Math.sin(elapsedSec * 2.2 + idx) * 0.04 * ampMul;

      // Flick tongue periodically
      const flick = Math.sin(elapsedSec * 3.1 + idx * 1.7);
      tongue.scale.z = flick > 0.7 ? 1.35 : 0.45;
      tongue.position.z = flick > 0.7 ? 0.42 : 0.32;
    },
  };
}

function getBaseEyelidTilt(personality: SnakePersonality): number {
  switch (personality) {
    case 'ngantuk':
      return -0.2; // sleepy half-closed
    case 'usil':
      return -0.55;
    case 'kaget':
      return -1.0; // wide open!
    case 'kenyang':
      return -0.35;
  }
}

export function buildLaddersAndSnakes(
  board: BoardVisuals,
  outlineCtrl: DoodleOutlineController,
): LaddersAndSnakesVisuals {
  const group = new THREE.Group();
  const ladders = new Map<string, LadderVisual>();
  const snakes = new Map<string, SnakeVisual>();

  BOARD_LAYOUT.ladders.forEach((def, idx) => {
    const lv = buildLadder(def, board, outlineCtrl, idx);
    ladders.set(def.id, lv);
    group.add(lv.group);
  });

  const sharedSnakeAssets = createSharedSnakeAssets();
  BOARD_LAYOUT.snakes.forEach((def, idx) => {
    const sv = buildSnake(def, board, outlineCtrl, sharedSnakeAssets, idx);
    snakes.set(def.id, sv);
    group.add(sv.group);
  });

  return {
    group,
    ladders,
    snakes,
    updateIdle: (elapsedSec: number, reducedMotion: boolean) => {
      for (const snake of snakes.values()) {
        snake.updateIdle(elapsedSec, reducedMotion);
      }
    },
  };
}
