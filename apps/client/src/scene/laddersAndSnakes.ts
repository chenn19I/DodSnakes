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
  setSprintMode: (enabled: boolean) => void;
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

function getSnakeBodyRadiusAt(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  if (u <= 0.12) {
    // Tuck neck smoothly into the head sphere, swelling gently to mid-body
    const k = u / 0.12;
    return 0.15 + 0.032 * (k * k * (3 - 2 * k));
  }
  if (u <= 0.45) {
    const k = (u - 0.12) / 0.33;
    return 0.182 + 0.02 * Math.sin(k * Math.PI);
  }
  // Smooth C1 cosine-stepped taper toward a neat rounded tail tip
  const k = (u - 0.45) / 0.55;
  const smoothK = k * k * (3 - 2 * k);
  return 0.182 - (0.182 - 0.052) * smoothK;
}

/**
 * Builds a single watertight, seamlessly UV-mapped snake body geometry with a
 * softly rounded hemisphere tail cap so toon shading and BackSide ink outlines
 * render cleanly without open-tube seams or jagged cone intersections.
 */
function buildTaperedSnakeGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments = 40,
  radialSegments = 12,
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const curveLen = Math.max(0.5, curve.getLength());
  const tailBaseRadius = getSnakeBodyRadiusAt(1);
  const tailCapLen = 0.052;
  const tailCapRings = 5;

  // Ensure (N, B, T) forms a right-handed frame everywhere along the curve
  const crossCheck = new THREE.Vector3()
    .crossVectors(frames.normals[0], frames.binormals[0])
    .dot(frames.tangents[0]);
  const binormalSign = crossCheck >= 0 ? 1 : -1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushRing = (
    center: THREE.Vector3,
    nVec: THREE.Vector3,
    bVec: THREE.Vector3,
    tVec: THREE.Vector3,
    radius: number,
    axialTilt: number,
    radialScale: number,
    uTex: number,
  ): number => {
    const startIdx = positions.length / 3;
    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const theta = v * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const rx = cosT * nVec.x + sinT * bVec.x;
      const ry = cosT * nVec.y + sinT * bVec.y;
      const rz = cosT * nVec.z + sinT * bVec.z;

      positions.push(center.x + radius * rx, center.y + radius * ry, center.z + radius * rz);

      const nx = rx * radialScale + tVec.x * axialTilt;
      const ny = ry * radialScale + tVec.y * axialTilt;
      const nz = rz * radialScale + tVec.z * axialTilt;
      const invLen = 1 / (Math.hypot(nx, ny, nz) || 1);
      normals.push(nx * invLen, ny * invLen, nz * invLen);
      uvs.push(uTex, v);
    }
    return startIdx;
  };

  const ringStarts: number[] = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const center = curve.getPointAt(t);
    const nVec = frames.normals[i];
    const bVec = frames.binormals[i].clone().multiplyScalar(binormalSign);
    const tVec = frames.tangents[i];
    const r = getSnakeBodyRadiusAt(t);

    const dt = 0.015;
    const rNext = getSnakeBodyRadiusAt(Math.min(1, t + dt));
    const rPrev = getSnakeBodyRadiusAt(Math.max(0, t - dt));
    const spanT = Math.max(dt, Math.min(1, t + dt) - Math.max(0, t - dt));
    const drDs = (rNext - rPrev) / (spanT * curveLen);

    ringStarts.push(pushRing(center, nVec, bVec, tVec, r, -drDs, 1, t));
  }

  // Smooth hemispherical tail dome rings
  const tailPoint = curve.getPointAt(1);
  const lastN = frames.normals[tubularSegments];
  const lastB = frames.binormals[tubularSegments].clone().multiplyScalar(binormalSign);
  const lastT = frames.tangents[tubularSegments].clone().normalize();
  for (let c = 1; c < tailCapRings; c++) {
    const phi = (c / tailCapRings) * (Math.PI * 0.5);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const capCenter = tailPoint.clone().addScaledVector(lastT, tailCapLen * sinPhi);
    const uTex = Math.min(1, 0.992 + (c / tailCapRings) * 0.008);
    ringStarts.push(
      pushRing(capCenter, lastN, lastB, lastT, tailBaseRadius * cosPhi, sinPhi, cosPhi, uTex),
    );
  }

  // Connect consecutive rings with outward-facing CCW quads
  for (let rIdx = 0; rIdx < ringStarts.length - 1; rIdx++) {
    const rowA = ringStarts[rIdx];
    const rowB = ringStarts[rIdx + 1];
    for (let j = 0; j < radialSegments; j++) {
      const a = rowA + j;
      const b = rowB + j;
      const c = rowB + j + 1;
      const d = rowA + j + 1;
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  // Seal head pole inside head sphere
  const headT = frames.tangents[0].clone().normalize();
  const headApex = curve.getPointAt(0).addScaledVector(headT, -0.04);
  const headApexIdx = positions.length / 3;
  positions.push(headApex.x, headApex.y, headApex.z);
  normals.push(-headT.x, -headT.y, -headT.z);
  uvs.push(0, 0.5);
  const firstRow = ringStarts[0];
  for (let j = 0; j < radialSegments; j++) {
    indices.push(firstRow + j, headApexIdx, firstRow + j + 1);
  }

  // Seal tail dome pole cleanly at tip
  const tailApex = tailPoint.clone().addScaledVector(lastT, tailCapLen);
  const tailApexIdx = positions.length / 3;
  positions.push(tailApex.x, tailApex.y, tailApex.z);
  normals.push(lastT.x, lastT.y, lastT.z);
  uvs.push(1, 0.5);
  const lastRow = ringStarts[ringStarts.length - 1];
  for (let j = 0; j < radialSegments; j++) {
    indices.push(lastRow + j, lastRow + j + 1, tailApexIdx);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function createSharedSnakeAssets(): SharedSnakeAssets {
  const headGeo = new THREE.SphereGeometry(0.32, 12, 10);
  headGeo.scale(1.06, 0.88, 1.18);

  const stem = new THREE.BoxGeometry(0.042, 0.018, 0.18);
  stem.translate(0, 0, 0.08);
  const forkL = new THREE.BoxGeometry(0.026, 0.016, 0.1);
  forkL.rotateY(0.45);
  forkL.translate(-0.028, 0, 0.19);
  const forkR = new THREE.BoxGeometry(0.026, 0.016, 0.1);
  forkR.rotateY(-0.45);
  forkR.translate(0.028, 0, 0.19);
  const tongueGeo = mergeGeometries([stem, forkL, forkR], false) ?? stem.clone();
  stem.dispose();
  forkL.dispose();
  forkR.dispose();

  return {
    headGeo,
    eyeWhiteGeo: new THREE.SphereGeometry(0.115, 9, 8),
    pupilGeo: new THREE.SphereGeometry(0.06, 8, 7),
    lidGeo: new THREE.SphereGeometry(0.125, 9, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    tongueGeo,
    gulpGeo: new THREE.SphereGeometry(0.3, 10, 8),
    blushGeo: new THREE.SphereGeometry(0.065, 7, 7),
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
  const headPos = board.getTileWorldTop(def.from).add(new THREE.Vector3(0, 0.25, 0));
  const rawTailCenter = board.getTileWorldTop(def.to).add(new THREE.Vector3(0, 0.17, 0));
  const flatStep = new THREE.Vector3().subVectors(rawTailCenter, headPos).setY(0);
  const flatLen = flatStep.length() || 1;
  // Pull visual tail end slightly back from the tile center so tile numbers stay readable
  const tailPos = rawTailCenter.clone().addScaledVector(flatStep, -Math.min(0.2, 0.22 / flatLen));

  const dir = new THREE.Vector3().subVectors(tailPos, headPos);
  const len = dir.length();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

  // Build wavy S-curve that arches mid-body and glides level above the tail tile
  const points: THREE.Vector3[] = [];
  const segs = 8;
  const amp = Math.min(1.05, len * 0.13);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const base = new THREE.Vector3().lerpVectors(headPos, tailPos, t);
    const wave = Math.sin(t * Math.PI * 2.4 + idx) * amp * Math.sin(t * Math.PI);
    base.addScaledVector(perp, wave);
    base.y += Math.pow(Math.sin(t * Math.PI), 1.75) * 0.22;
    if (i === segs) {
      base.y += 0.025;
    }
    points.push(base);
  }
  const curve = new THREE.CatmullRomCurve3(points);

  const palIdx = idx % SNAKE_PALETTE.length;
  const [primaryCol, stripeCol] = SNAKE_PALETTE[palIdx];
  const bodyMat = assets.bodyMats[palIdx];
  const primaryMat = createDoodleToonMaterial({ color: primaryCol });
  const lidMat = createDoodleToonMaterial({ color: stripeCol });
  const bodyGeo = buildTaperedSnakeGeometry(curve, 40, 12);

  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  addOutlineMesh(bodyMesh, outlineCtrl.material);
  group.add(bodyMesh);

  // Head group at `headPos` aligned cleanly out from the neck tangent and tilted gently up
  const headGroup = new THREE.Group();
  headGroup.position.copy(headPos);
  const neckTan = curve.getTangent(0.02).setY(0).normalize();
  const headForward = new THREE.Vector3(-neckTan.x, 0.22, -neckTan.z).normalize();
  headGroup.lookAt(headPos.clone().add(headForward));

  // Nested tilt group preserves `headGroup.lookAt` orientation during idle wobble
  const headTiltGroup = new THREE.Group();
  headGroup.add(headTiltGroup);

  const headMesh = new THREE.Mesh(assets.headGeo, primaryMat);
  headMesh.castShadow = true;
  addOutlineMesh(headMesh, outlineCtrl.material);
  headTiltGroup.add(headMesh);

  // Big cute eyes, cheeks + personality eyelids
  const eyelids: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(assets.eyeWhiteGeo, assets.whiteMat);
    eye.position.set(side * 0.16, 0.16, 0.18);
    addOutlineMesh(eye, outlineCtrl.material);
    headTiltGroup.add(eye);

    const pupil = new THREE.Mesh(assets.pupilGeo, assets.pupilMat);
    pupil.position.set(0, 0, 0.08);
    eye.add(pupil);

    const lid = new THREE.Mesh(assets.lidGeo, lidMat);
    lid.position.copy(eye.position);
    lid.rotation.x = getBaseEyelidTilt(def.personality);
    eyelids.push(lid);
    headTiltGroup.add(lid);

    const blush = new THREE.Mesh(assets.blushGeo, assets.blushMat);
    blush.scale.set(1.2, 0.65, 0.65);
    blush.position.set(side * 0.25, -0.02, 0.22);
    headTiltGroup.add(blush);
  }

  // Cute snout bridge & mini crest tuft on top of head
  const snoutMesh = new THREE.Mesh(assets.blushGeo, primaryMat);
  snoutMesh.scale.set(2.2, 1.3, 1.8);
  snoutMesh.position.set(0, -0.02, 0.27);
  headTiltGroup.add(snoutMesh);

  const crestMat = idx % 2 === 0 ? assets.tongueMat : assets.blushMat;
  const crestMesh = new THREE.Mesh(assets.pupilGeo, crestMat);
  crestMesh.scale.set(1.4, 1.9, 1.2);
  crestMesh.position.set(0, 0.28, 0.02);
  addOutlineMesh(crestMesh, outlineCtrl.material);
  headTiltGroup.add(crestMesh);

  // Cute forked tongue
  const tongue = new THREE.Mesh(assets.tongueGeo, assets.tongueMat);
  tongue.position.set(0, -0.055, 0.31);
  headTiltGroup.add(tongue);

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
      tongue.scale.z = val ? 1.45 : 0.7;
    },
    setGulpProgress: (t: number) => {
      if (t < 0 || t > 1) {
        gulpBulge.visible = false;
        return;
      }
      gulpBulge.visible = true;
      gulpBulge.position.copy(curve.getPointAt(t));
      const bodyRatio = getSnakeBodyRadiusAt(t) / 0.182;
      const s = (0.78 + Math.sin(t * Math.PI) * 0.45) * (0.45 + 0.55 * bodyRatio);
      gulpBulge.scale.setScalar(s);
    },
    updateIdle: (elapsedSec: number, reducedMotion: boolean) => {
      if (awake) return;
      const ampMul = reducedMotion ? 0.2 : 1;
      headTiltGroup.rotation.z = Math.sin(elapsedSec * 1.8 + idx) * 0.1 * ampMul;
      headGroup.position.y = headPos.y + Math.sin(elapsedSec * 2.2 + idx) * 0.04 * ampMul;

      // Flick tongue periodically
      const flick = Math.sin(elapsedSec * 3.1 + idx * 1.7);
      tongue.scale.z = flick > 0.7 ? 1.25 : 0.55;
      tongue.position.z = flick > 0.7 ? 0.34 : 0.29;
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

const SPRINT_LADDERS_DEFS: LadderDef[] = [
  { id: 'SL1', from: 3, to: 17 },
  { id: 'SL2', from: 8, to: 12 },
  { id: 'SL3', from: 15, to: 25 },
];

const SPRINT_SNAKES_DEFS: SnakeDef[] = [
  { id: 'SS1', from: 14, to: 6, personality: 'usil' },
  { id: 'SS2', from: 21, to: 19, personality: 'kaget' },
  { id: 'SS3', from: 27, to: 13, personality: 'ngantuk' },
];

export function buildLaddersAndSnakes(
  board: BoardVisuals,
  outlineCtrl: DoodleOutlineController,
): LaddersAndSnakesVisuals {
  const group = new THREE.Group();
  const classicGroup = new THREE.Group();
  const sprintGroup = new THREE.Group();
  sprintGroup.visible = false;
  group.add(classicGroup, sprintGroup);

  const ladders = new Map<string, LadderVisual>();
  const snakes = new Map<string, SnakeVisual>();

  BOARD_LAYOUT.ladders.forEach((def, idx) => {
    const lv = buildLadder(def, board, outlineCtrl, idx);
    ladders.set(def.id, lv);
    classicGroup.add(lv.group);
  });

  const sharedSnakeAssets = createSharedSnakeAssets();
  BOARD_LAYOUT.snakes.forEach((def, idx) => {
    const sv = buildSnake(def, board, outlineCtrl, sharedSnakeAssets, idx);
    snakes.set(def.id, sv);
    classicGroup.add(sv.group);
  });

  SPRINT_LADDERS_DEFS.forEach((def, idx) => {
    const lv = buildLadder(def, board, outlineCtrl, idx);
    ladders.set(def.id, lv);
    sprintGroup.add(lv.group);
  });

  SPRINT_SNAKES_DEFS.forEach((def, idx) => {
    const sv = buildSnake(def, board, outlineCtrl, sharedSnakeAssets, idx);
    snakes.set(def.id, sv);
    sprintGroup.add(sv.group);
  });

  return {
    group,
    ladders,
    snakes,
    setSprintMode: (enabled: boolean) => {
      classicGroup.visible = !enabled;
      sprintGroup.visible = enabled;
    },
    updateIdle: (elapsedSec: number, reducedMotion: boolean) => {
      for (const snake of snakes.values()) {
        snake.updateIdle(elapsedSec, reducedMotion);
      }
    },
  };
}
