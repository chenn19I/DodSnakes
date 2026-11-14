import * as THREE from 'three';
import {
  PAWN_META,
  type AccessoryId,
  type PawnId,
  type PlayerColorId,
} from '@doodle-dash/shared';
import { DOODLE_PALETTE, PLAYER_HEX_MAP } from './palette.js';
import {
  addOutlineMesh,
  createDoodleToonMaterial,
  type DoodleOutlineController,
} from './doodleMaterials.js';

export interface BuildPawnVisualOptions {
  accessory?: AccessoryId;
  showNameplate?: boolean;
}

export interface PawnVisual {
  playerId: string;
  pawnId: PawnId;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  eyesGroup: THREE.Group;
  shadowDisc: THREE.Mesh;
  shieldBubble: THREE.Mesh;
  dizzyStars: THREE.Group;
  setShieldVisible: (visible: boolean) => void;
  setDizzyVisible: (visible: boolean) => void;
  setActiveTurn: (active: boolean) => void;
  setComboStreak: (streak: number) => void;
  updateIdle: (elapsedSec: number, dtSec: number, isAnimating: boolean, reducedMotion: boolean) => void;
}

let cachedShadowGeo: THREE.PlaneGeometry | null = null;
let cachedShadowMat: THREE.MeshBasicMaterial | null = null;
let cachedTurnRingGeo: THREE.RingGeometry | null = null;
let cachedShieldGeo: THREE.SphereGeometry | null = null;
let cachedStarGeo: THREE.OctahedronGeometry | null = null;

function createSoftShadowDisc(): THREE.Mesh {
  if (!cachedShadowGeo || !cachedShadowMat) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(36, 34, 45, 0.36)');
    grad.addColorStop(1, 'rgba(36, 34, 45, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    cachedShadowGeo = new THREE.PlaneGeometry(0.95, 0.95);
    cachedShadowGeo.rotateX(-Math.PI / 2);
    cachedShadowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  const mesh = new THREE.Mesh(cachedShadowGeo, cachedShadowMat);
  mesh.position.y = 0.015;
  return mesh;
}

const eyeGeoCache = new Map<number, THREE.SphereGeometry>();
const pupilGeoCache = new Map<number, THREE.SphereGeometry>();
const sparkleGeoCache = new Map<number, THREE.SphereGeometry>();

function addCuteEyes(
  parent: THREE.Group,
  y: number,
  z: number,
  spread: number,
  outlineMat: THREE.Material,
  eyeSize = 0.088,
): THREE.Group {
  const eyesGroup = new THREE.Group();
  const whiteMat = createDoodleToonMaterial({ color: '#FFFFFF' });
  const pupilMat = new THREE.MeshBasicMaterial({ color: DOODLE_PALETTE.ink });
  const sparkleMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });

  let eyeGeo = eyeGeoCache.get(eyeSize);
  if (!eyeGeo) {
    eyeGeo = new THREE.SphereGeometry(eyeSize, 14, 10);
    eyeGeoCache.set(eyeSize, eyeGeo);
  }
  let pupilGeo = pupilGeoCache.get(eyeSize);
  if (!pupilGeo) {
    pupilGeo = new THREE.SphereGeometry(eyeSize * 0.58, 12, 10);
    pupilGeoCache.set(eyeSize, pupilGeo);
  }
  let sparkleGeo = sparkleGeoCache.get(eyeSize);
  if (!sparkleGeo) {
    sparkleGeo = new THREE.SphereGeometry(eyeSize * 0.22, 8, 8);
    sparkleGeoCache.set(eyeSize, sparkleGeo);
  }

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, whiteMat);
    eye.position.set(side * spread, y, z);
    addOutlineMesh(eye, outlineMat);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0, -eyeSize * 0.04, eyeSize * 0.56);
    eye.add(pupil);

    // Chibi catchlight glint for lively kawaii expression
    const sparkle = new THREE.Mesh(sparkleGeo, sparkleMat);
    sparkle.position.set(eyeSize * 0.2, eyeSize * 0.22, eyeSize * 0.94);
    eye.add(sparkle);

    eyesGroup.add(eye);
  }
  parent.add(eyesGroup);
  return eyesGroup;
}

function addRosyCheeks(
  parent: THREE.Group,
  y: number,
  z: number,
  spread: number,
  blushMat: THREE.Material,
): void {
  const geo = new THREE.SphereGeometry(0.062, 8, 6);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(geo, blushMat);
    cheek.position.set(side * spread, y, z);
    cheek.scale.set(1.25, 0.7, 0.5);
    parent.add(cheek);
  }
}

function addChibiArms(
  parent: THREE.Group,
  armMat: THREE.Material,
  outlineMat: THREE.Material,
  y = 0.27,
  spread = 0.29,
  angleZ = 0.55,
): void {
  const geo = new THREE.CapsuleGeometry(0.065, 0.11, 4, 7);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(geo, armMat);
    arm.position.set(side * spread, y, 0.06);
    arm.rotation.z = side * angleZ;
    arm.castShadow = true;
    addOutlineMesh(arm, outlineMat);
    parent.add(arm);
  }
}

function createPawnNameSprite(displayText: string, accentHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 68;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 68);

  // Warm pill badge with ink border & character accent dot
  ctx.fillStyle = 'rgba(255, 250, 238, 0.94)';
  ctx.strokeStyle = DOODLE_PALETTE.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(12, 10, 232, 48, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.arc(36, 34, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = DOODLE_PALETTE.ink;
  ctx.font = 'bold 26px "Patrick Hand", "Comic Sans MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const clean = displayText.length > 13 ? `${displayText.slice(0, 12)}…` : displayText;
  ctx.fillText(clean, 140, 35);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.22, 0.33, 1);
  return sprite;
}

interface PawnAccessoryAnchor {
  crownPos: [number, number, number];
  crownTiltZ?: number;
  headsetY: number;
  headsetWidth: number;
  flowerPos: [number, number, number];
  flowerRotZ: number;
  eyeY: number;
  eyeZ: number;
  eyeSpread: number;
  neckY: number;
  neckRadius: number;
  backY: number;
  backZ: number;
}

const ACCESSORY_ANCHORS: Record<PawnId, PawnAccessoryAnchor> = {
  kucing: {
    crownPos: [0, 0.9, 0.02],
    headsetY: 0.62,
    headsetWidth: 0.34,
    flowerPos: [-0.24, 0.78, 0.14],
    flowerRotZ: 0.35,
    eyeY: 0.6,
    eyeZ: 0.29,
    eyeSpread: 0.13,
    neckY: 0.4,
    neckRadius: 0.23,
    backY: 0.29,
    backZ: -0.25,
  },
  kodok: {
    crownPos: [-0.08, 0.89, 0.03],
    crownTiltZ: 0.16,
    headsetY: 0.58,
    headsetWidth: 0.35,
    flowerPos: [-0.22, 0.84, 0.12],
    flowerRotZ: 0.3,
    eyeY: 0.76,
    eyeZ: 0.24,
    eyeSpread: 0.15,
    neckY: 0.38,
    neckRadius: 0.25,
    backY: 0.26,
    backZ: -0.28,
  },
  bebek: {
    crownPos: [0, 0.89, 0.02],
    headsetY: 0.59,
    headsetWidth: 0.31,
    flowerPos: [-0.21, 0.78, 0.15],
    flowerRotZ: 0.38,
    eyeY: 0.64,
    eyeZ: 0.27,
    eyeSpread: 0.12,
    neckY: 0.41,
    neckRadius: 0.23,
    backY: 0.27,
    backZ: -0.28,
  },
  panda: {
    crownPos: [0, 0.91, 0.02],
    headsetY: 0.61,
    headsetWidth: 0.34,
    flowerPos: [-0.24, 0.79, 0.16],
    flowerRotZ: 0.32,
    eyeY: 0.61,
    eyeZ: 0.31,
    eyeSpread: 0.13,
    neckY: 0.4,
    neckRadius: 0.24,
    backY: 0.27,
    backZ: -0.27,
  },
  dino: {
    crownPos: [0, 1.03, 0.01],
    headsetY: 0.61,
    headsetWidth: 0.32,
    flowerPos: [0.22, 0.8, 0.14],
    flowerRotZ: -0.35,
    eyeY: 0.64,
    eyeZ: 0.29,
    eyeSpread: 0.13,
    neckY: 0.4,
    neckRadius: 0.23,
    backY: 0.3,
    backZ: -0.29,
  },
  jamur: {
    crownPos: [0, 0.87, 0.02],
    headsetY: 0.62,
    headsetWidth: 0.44,
    flowerPos: [-0.28, 0.76, 0.22],
    flowerRotZ: 0.36,
    eyeY: 0.34,
    eyeZ: 0.24,
    eyeSpread: 0.1,
    neckY: 0.22,
    neckRadius: 0.23,
    backY: 0.24,
    backZ: -0.25,
  },
};

function attachWearableAccessory(
  bodyGroup: THREE.Group,
  pawnId: PawnId,
  accessory: AccessoryId,
  outlineMat: THREE.Material,
  mainMat: THREE.Material,
  accentMat: THREE.Material,
  pinkMat: THREE.Material,
  creamMat: THREE.Material,
): void {
  if (accessory === 'none') return;
  const anchor = ACCESSORY_ANCHORS[pawnId];
  const blueMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.blue });
  const coralMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.coral });
  const mintMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.mint });
  const inkMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.ink });

  const addAccPart = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    addOutlineMesh(mesh, outlineMat);
    parent.add(mesh);
    return mesh;
  };

  if (accessory === 'crown') {
    const crownGroup = new THREE.Group();
    crownGroup.position.set(...anchor.crownPos);
    if (anchor.crownTiltZ) crownGroup.rotation.z = anchor.crownTiltZ;

    addAccPart(crownGroup, new THREE.CylinderGeometry(0.155, 0.125, 0.12, 12), accentMat, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      addAccPart(
        crownGroup,
        new THREE.ConeGeometry(0.04, 0.095, 8),
        accentMat,
        Math.cos(a) * 0.11,
        0.09,
        Math.sin(a) * 0.11,
      );
      addAccPart(
        crownGroup,
        new THREE.SphereGeometry(0.025, 8, 6),
        i % 2 === 0 ? pinkMat : blueMat,
        Math.cos(a) * 0.11,
        0.135,
        Math.sin(a) * 0.11,
      );
    }
    addAccPart(crownGroup, new THREE.SphereGeometry(0.038, 10, 8), coralMat, 0, 0.01, 0.145);
    bodyGroup.add(crownGroup);
    return;
  }

  if (accessory === 'glasses') {
    const glassGroup = new THREE.Group();
    glassGroup.position.set(0, anchor.eyeY, anchor.eyeZ);
    const frameMat = pawnId === 'panda' ? accentMat : inkMat;
    const radius = Math.max(0.078, anchor.eyeSpread * 0.72);
    const rimGeo = new THREE.TorusGeometry(radius, 0.019, 8, 18);

    addAccPart(glassGroup, rimGeo, frameMat, -anchor.eyeSpread, 0, 0.02);
    addAccPart(glassGroup, rimGeo, frameMat, anchor.eyeSpread, 0, 0.02);
    addAccPart(
      glassGroup,
      new THREE.CapsuleGeometry(0.014, anchor.eyeSpread * 0.65, 4, 6),
      frameMat,
      0,
      0.015,
      0.025,
    ).rotation.z = Math.PI / 2;
    bodyGroup.add(glassGroup);
    return;
  }

  if (accessory === 'scarf') {
    const scarfGroup = new THREE.Group();
    scarfGroup.position.set(0, anchor.neckY, 0.01);
    const ring = addAccPart(
      scarfGroup,
      new THREE.TorusGeometry(anchor.neckRadius, 0.068, 10, 20),
      coralMat,
      0,
      0,
      0,
    );
    ring.rotation.x = Math.PI / 2;

    const stripeRing = addAccPart(
      scarfGroup,
      new THREE.TorusGeometry(anchor.neckRadius + 0.015, 0.022, 8, 18),
      creamMat,
      0,
      0.015,
      0,
    );
    stripeRing.rotation.x = Math.PI / 2;

    const tail = addAccPart(
      scarfGroup,
      new THREE.CapsuleGeometry(0.055, 0.15, 6, 10),
      coralMat,
      0.13,
      -0.09,
      anchor.neckRadius * 0.75,
    );
    tail.rotation.set(0.35, -0.2, 0.42);
    addAccPart(
      scarfGroup,
      new THREE.CapsuleGeometry(0.048, 0.035, 6, 8),
      creamMat,
      0.16,
      -0.14,
      anchor.neckRadius * 0.85,
    ).rotation.set(0.35, -0.2, 0.42);
    bodyGroup.add(scarfGroup);
    return;
  }

  if (accessory === 'headset') {
    const hsGroup = new THREE.Group();
    hsGroup.position.set(0, anchor.headsetY, 0.01);
    const bandRadius = anchor.headsetWidth * 0.98;
    addAccPart(
      hsGroup,
      new THREE.TorusGeometry(bandRadius, 0.032, 10, 24, Math.PI),
      blueMat,
      0,
      0.03,
      0,
    );

    for (const side of [-1, 1]) {
      const cup = addAccPart(
        hsGroup,
        new THREE.CylinderGeometry(0.095, 0.095, 0.075, 14),
        pinkMat,
        side * anchor.headsetWidth,
        -0.01,
        0.02,
      );
      cup.rotation.z = Math.PI / 2;

      const pad = addAccPart(
        hsGroup,
        new THREE.TorusGeometry(0.085, 0.024, 8, 16),
        creamMat,
        side * (anchor.headsetWidth - 0.025),
        -0.01,
        0.02,
      );
      pad.rotation.y = Math.PI / 2;
    }

    // Mini mic boom on left earcup
    const boom = addAccPart(
      hsGroup,
      new THREE.CapsuleGeometry(0.014, 0.14, 4, 6),
      inkMat,
      -anchor.headsetWidth + 0.04,
      -0.08,
      0.11,
    );
    boom.rotation.set(0.95, 0, -0.35);
    addAccPart(
      hsGroup,
      new THREE.SphereGeometry(0.028, 8, 6),
      mintMat,
      -anchor.headsetWidth + 0.09,
      -0.11,
      0.19,
    );
    bodyGroup.add(hsGroup);
    return;
  }

  if (accessory === 'flower') {
    const flGroup = new THREE.Group();
    flGroup.position.set(...anchor.flowerPos);
    flGroup.rotation.set(0.35, 0, anchor.flowerRotZ);

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      addAccPart(
        flGroup,
        new THREE.SphereGeometry(0.056, 10, 8),
        i % 2 === 0 ? pinkMat : creamMat,
        Math.cos(a) * 0.068,
        0,
        Math.sin(a) * 0.068,
      ).scale.set(1.05, 0.65, 1.05);
    }
    addAccPart(flGroup, new THREE.SphereGeometry(0.044, 10, 8), accentMat, 0, 0.015, 0);
    bodyGroup.add(flGroup);
    return;
  }

  if (accessory === 'backpack') {
    const bpGroup = new THREE.Group();
    bpGroup.position.set(0, anchor.backY, anchor.backZ);
    const bag = addAccPart(
      bpGroup,
      new THREE.SphereGeometry(0.18, 14, 12),
      blueMat,
      0,
      0,
      0,
    );
    bag.scale.set(1.02, 1.15, 0.72);
    const pocket = addAccPart(
      bpGroup,
      new THREE.SphereGeometry(0.11, 12, 10),
      mintMat,
      0,
      -0.03,
      -0.095,
    );
    pocket.scale.set(1.15, 0.85, 0.65);
    addAccPart(bpGroup, new THREE.OctahedronGeometry(0.052, 0), accentMat, 0, 0.07, -0.145);
    // Cute top carry handle loop
    addAccPart(bpGroup, new THREE.TorusGeometry(0.055, 0.018, 6, 12, Math.PI), mainMat, 0, 0.19, 0);
    bodyGroup.add(bpGroup);
  }
}

export function buildPawnVisual(
  playerId: string,
  pawnId: PawnId,
  colorId: PlayerColorId,
  outlineCtrl: DoodleOutlineController,
  seedOffset = 0,
  customLabel?: string,
  options: BuildPawnVisualOptions = {},
): PawnVisual {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const outlineMat = outlineCtrl.material;
  const mainHex = PLAYER_HEX_MAP[colorId];
  const mainMat = createDoodleToonMaterial({ color: mainHex });
  const creamMat = createDoodleToonMaterial({ color: '#FFF6E5' });
  const inkMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.ink });
  const accentMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.yellow });
  const blushMat = createDoodleToonMaterial({ color: '#FF9BB8' });
  const mintMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.mint });
  const pinkMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.pink });
  const orangeMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.orange });

  const makePart = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    addOutlineMesh(mesh, outlineMat);
    bodyGroup.add(mesh);
    return mesh;
  };

  let eyesGroup = new THREE.Group();

  if (pawnId === 'kucing') {
    // Mochi si Kucing: Chubby cat + belly bib + pink inner ears + ribbon + collar bell + curled tail
    makePart(new THREE.SphereGeometry(0.29, 18, 14), mainMat, 0, 0.24, 0).scale.set(1.02, 0.9, 1.0);
    makePart(new THREE.SphereGeometry(0.18, 14, 10), creamMat, 0, 0.23, 0.16).scale.set(1.0, 0.95, 0.72);
    addChibiArms(bodyGroup, mainMat, outlineMat, 0.25, 0.28, 0.58);
    makePart(new THREE.SphereGeometry(0.32, 20, 16), mainMat, 0, 0.58, 0).scale.set(1.06, 0.96, 1.0);

    // Outer + inner pink ears
    const earGeo = new THREE.ConeGeometry(0.115, 0.24, 10);
    const innerEarGeo = new THREE.ConeGeometry(0.065, 0.15, 10);
    for (const side of [-1, 1]) {
      const ear = makePart(earGeo, mainMat, side * 0.2, 0.85, -0.02);
      ear.rotation.z = side * -0.32;
      const inner = makePart(innerEarGeo, pinkMat, side * 0.195, 0.83, 0.045);
      inner.rotation.z = side * -0.32;
    }

    // Pink bow accessory + collar with golden bell
    makePart(new THREE.TorusGeometry(0.21, 0.04, 8, 16), pinkMat, 0, 0.4, 0.01).rotation.x = Math.PI / 2;
    makePart(new THREE.SphereGeometry(0.065, 10, 8), accentMat, 0, 0.39, 0.22);
    makePart(new THREE.SphereGeometry(0.078, 10, 8), pinkMat, -0.09, 0.79, 0.22);
    makePart(new THREE.SphereGeometry(0.078, 10, 8), pinkMat, 0.09, 0.79, 0.22);
    makePart(new THREE.SphereGeometry(0.048, 10, 8), accentMat, 0, 0.79, 0.25);

    // Curled fluffy cat tail
    const tail = makePart(new THREE.CapsuleGeometry(0.055, 0.24, 6, 10), mainMat, 0.12, 0.28, -0.29);
    tail.rotation.set(-0.75, 0, -0.45);

    // Cute nose + cheeks + shiny eyes
    makePart(new THREE.SphereGeometry(0.036, 8, 8), pinkMat, 0, 0.54, 0.33);
    addRosyCheeks(bodyGroup, 0.51, 0.27, 0.19, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.6, 0.27, 0.13, outlineMat, 0.088);
  } else if (pawnId === 'kodok') {
    // Koko si Kodok: Plump frog + cream belly + lil hands + lilypad cap with lotus bud
    makePart(new THREE.SphereGeometry(0.32, 18, 14), mainMat, 0, 0.24, 0).scale.set(1.12, 0.82, 1.05);
    makePart(new THREE.SphereGeometry(0.22, 14, 10), creamMat, 0, 0.23, 0.16).scale.set(1.05, 0.8, 0.72);
    addChibiArms(bodyGroup, mainMat, outlineMat, 0.23, 0.32, 0.7);
    makePart(new THREE.SphereGeometry(0.29, 20, 16), mainMat, 0, 0.55, 0.02).scale.set(1.12, 0.9, 1.0);

    // Lilypad hat + cute yellow lotus flower bud
    const hat = makePart(new THREE.CylinderGeometry(0.29, 0.31, 0.055, 18), mintMat, 0, 0.8, 0);
    hat.rotation.x = 0.08;
    makePart(new THREE.SphereGeometry(0.075, 10, 8), accentMat, 0.07, 0.87, 0.02);
    makePart(new THREE.SphereGeometry(0.055, 10, 8), pinkMat, -0.05, 0.85, 0.04);

    // Frog eye sockets + blush
    for (const side of [-1, 1]) {
      makePart(new THREE.SphereGeometry(0.115, 14, 10), mainMat, side * 0.15, 0.75, 0.13);
    }
    addRosyCheeks(bodyGroup, 0.5, 0.28, 0.2, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.76, 0.19, 0.15, outlineMat, 0.09);
  } else if (pawnId === 'bebek') {
    // Wekwek si Bebek: Plump duck + wings + tufted hair + polka scarf + plump orange beak
    makePart(new THREE.SphereGeometry(0.3, 18, 14), mainMat, 0, 0.25, 0).scale.set(1.04, 0.9, 1.08);
    makePart(new THREE.SphereGeometry(0.19, 14, 10), creamMat, 0, 0.24, 0.15).scale.set(1.0, 0.88, 0.7);
    for (const side of [-1, 1]) {
      const wing = makePart(new THREE.SphereGeometry(0.13, 12, 10), mainMat, side * 0.29, 0.26, -0.02);
      wing.scale.set(0.55, 0.88, 1.18);
      wing.rotation.z = side * 0.28;
    }
    makePart(new THREE.SphereGeometry(0.28, 20, 16), mainMat, 0, 0.57, 0.02);

    // Cozy neck scarf + fluttering scarf tail
    makePart(new THREE.TorusGeometry(0.21, 0.062, 10, 18), pinkMat, 0, 0.41, 0.01).rotation.x = Math.PI / 2;
    const scarfTail = makePart(new THREE.CapsuleGeometry(0.048, 0.13, 6, 8), pinkMat, 0.16, 0.32, 0.16);
    scarfTail.rotation.set(0.2, -0.3, 0.4);

    // Cute feather tuft crest on head
    makePart(new THREE.ConeGeometry(0.06, 0.15, 10), mainMat, -0.04, 0.87, 0).rotation.z = 0.28;
    makePart(new THREE.ConeGeometry(0.05, 0.12, 10), accentMat, 0.05, 0.85, 0.02).rotation.z = -0.32;

    // Rounded cute orange duckbill
    const beak = makePart(new THREE.SphereGeometry(0.12, 14, 10), orangeMat, 0, 0.53, 0.27);
    beak.scale.set(1.25, 0.62, 1.12);
    addRosyCheeks(bodyGroup, 0.55, 0.23, 0.19, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.64, 0.23, 0.12, outlineMat, 0.082);
  } else if (pawnId === 'panda') {
    // Boba si Panda: Cream body + ink shoulder saddle + patches + round glasses + bamboo sprout
    makePart(new THREE.SphereGeometry(0.3, 18, 14), creamMat, 0, 0.25, 0).scale.set(1.05, 0.92, 1.0);
    makePart(new THREE.TorusGeometry(0.2, 0.075, 8, 16), inkMat, 0, 0.38, 0).rotation.x = Math.PI / 2;
    addChibiArms(bodyGroup, inkMat, outlineMat, 0.25, 0.29, 0.58);
    makePart(new THREE.SphereGeometry(0.32, 20, 16), creamMat, 0, 0.59, 0).scale.set(1.06, 0.96, 1.0);

    // Fluffy ink ears + tail puff
    makePart(new THREE.SphereGeometry(0.115, 12, 10), inkMat, -0.23, 0.85, 0);
    makePart(new THREE.SphereGeometry(0.115, 12, 10), inkMat, 0.23, 0.85, 0);
    makePart(new THREE.SphereGeometry(0.085, 10, 8), inkMat, 0, 0.18, -0.28);

    // Classic panda oval eye patches
    for (const side of [-1, 1]) {
      const patch = makePart(new THREE.SphereGeometry(0.105, 12, 10), inkMat, side * 0.13, 0.6, 0.24);
      patch.scale.set(1.0, 1.15, 0.45);
      patch.rotation.z = side * -0.25;
    }

    // Round glasses + bamboo shoot sprout on head/ear
    makePart(new THREE.TorusGeometry(0.1, 0.02, 8, 16), mainMat, -0.13, 0.61, 0.295);
    makePart(new THREE.TorusGeometry(0.1, 0.02, 8, 16), mainMat, 0.13, 0.61, 0.295);
    makePart(new THREE.CapsuleGeometry(0.022, 0.12, 4, 8), mintMat, 0.26, 0.87, 0.05).rotation.z = -0.38;
    const leaf = makePart(new THREE.SphereGeometry(0.06, 10, 8), mintMat, 0.34, 0.94, 0.06);
    leaf.scale.set(1.5, 0.55, 0.7);
    leaf.rotation.z = 0.4;

    makePart(new THREE.SphereGeometry(0.04, 8, 8), inkMat, 0, 0.55, 0.33);
    addRosyCheeks(bodyGroup, 0.52, 0.27, 0.2, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.61, 0.27, 0.13, outlineMat, 0.075);
  } else if (pawnId === 'dino') {
    // Roro si Dino: Chubby body + cream tummy + snout + tail + dorsal spikes + golden crown
    makePart(new THREE.SphereGeometry(0.3, 18, 14), mainMat, 0, 0.24, 0).scale.set(1.05, 0.9, 1.05);
    makePart(new THREE.SphereGeometry(0.19, 14, 10), creamMat, 0, 0.23, 0.16).scale.set(1.0, 0.95, 0.72);
    addChibiArms(bodyGroup, mainMat, outlineMat, 0.26, 0.27, 0.65);

    // Head + cute rounded dino snout
    makePart(new THREE.SphereGeometry(0.3, 20, 16), mainMat, 0, 0.58, 0.01);
    const snout = makePart(new THREE.SphereGeometry(0.17, 14, 10), mainMat, 0, 0.52, 0.24);
    snout.scale.set(1.1, 0.78, 1.05);
    makePart(new THREE.SphereGeometry(0.032, 8, 8), creamMat, -0.055, 0.47, 0.38);
    makePart(new THREE.SphereGeometry(0.032, 8, 8), creamMat, 0.055, 0.47, 0.38);

    // Chubby dino tail + 3 dorsal plates
    const tail = makePart(new THREE.ConeGeometry(0.13, 0.36, 10), mainMat, 0, 0.22, -0.35);
    tail.rotation.x = -1.25;
    makePart(new THREE.ConeGeometry(0.075, 0.15, 8), orangeMat, 0, 0.68, -0.24).rotation.x = -0.6;
    makePart(new THREE.ConeGeometry(0.08, 0.16, 8), accentMat, 0, 0.5, -0.3).rotation.x = -0.9;
    makePart(new THREE.ConeGeometry(0.065, 0.13, 8), orangeMat, 0, 0.32, -0.34).rotation.x = -1.1;

    // 5-point Paper King Crown
    makePart(new THREE.CylinderGeometry(0.17, 0.14, 0.15, 10), accentMat, 0, 0.88, 0.01);
    for (let c = 0; c < 4; c++) {
      const a = (c / 4) * Math.PI * 2;
      makePart(new THREE.ConeGeometry(0.045, 0.1, 8), accentMat, Math.cos(a) * 0.11, 0.98, Math.sin(a) * 0.11 + 0.01);
    }

    addRosyCheeks(bodyGroup, 0.55, 0.24, 0.2, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.64, 0.25, 0.13, outlineMat, 0.086);
  } else {
    // Toady si Jamur: Squishy mushroom stem + arms + grand dotted domed cap + star badge
    makePart(new THREE.CylinderGeometry(0.2, 0.26, 0.42, 18), creamMat, 0, 0.22, 0);
    addChibiArms(bodyGroup, creamMat, outlineMat, 0.23, 0.25, 0.6);

    const cap = makePart(
      new THREE.SphereGeometry(0.42, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58),
      mainMat,
      0,
      0.47,
      0,
    );
    cap.scale.set(1.12, 0.88, 1.12);
    // Ruffled brim ring underneath cap
    makePart(new THREE.CylinderGeometry(0.42, 0.36, 0.05, 18), creamMat, 0, 0.47, 0);

    // Polka dots & star badge on mushroom cap
    makePart(new THREE.SphereGeometry(0.095, 12, 10), creamMat, -0.22, 0.72, 0.2);
    makePart(new THREE.SphereGeometry(0.085, 12, 10), creamMat, 0.23, 0.7, 0.19);
    makePart(new THREE.SphereGeometry(0.085, 12, 10), creamMat, -0.02, 0.84, -0.15);
    makePart(new THREE.OctahedronGeometry(0.075, 0), accentMat, 0, 0.66, 0.41);

    addRosyCheeks(bodyGroup, 0.27, 0.22, 0.16, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.34, 0.21, 0.1, outlineMat, 0.074);
  }

  attachWearableAccessory(
    bodyGroup,
    pawnId,
    options.accessory ?? 'none',
    outlineMat,
    mainMat,
    accentMat,
    pinkMat,
    creamMat,
  );

  // Floating compact name badge above character (hidden in studio turntable preview)
  if (options.showNameplate !== false) {
    const metaShort = PAWN_META[pawnId].shortName;
    const displayName =
      customLabel && !customLabel.toLowerCase().includes(metaShort.toLowerCase())
        ? `${customLabel.split(' ')[0]} (${metaShort})`
        : customLabel || metaShort;
    const nameSprite = createPawnNameSprite(displayName, mainHex);
    nameSprite.position.set(0, 1.24, 0);
    root.add(nameSprite);
  }

  // Soft ink shadow disc underneath
  const shadowDisc = createSoftShadowDisc();
  root.add(shadowDisc);

  // Active-turn colored halo under the active pawn
  if (!cachedTurnRingGeo) {
    cachedTurnRingGeo = new THREE.RingGeometry(0.36, 0.48, 18);
    cachedTurnRingGeo.rotateX(-Math.PI / 2);
  }
  const turnHaloMat = new THREE.MeshBasicMaterial({
    color: mainHex,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const turnHalo = new THREE.Mesh(cachedTurnRingGeo, turnHaloMat);
  turnHalo.position.y = 0.028;
  turnHalo.visible = false;
  root.add(turnHalo);

  // Streak combo golden aura ring when player has >=2 challenge streak
  const comboMat = new THREE.MeshBasicMaterial({
    color: DOODLE_PALETTE.yellow,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const comboRing = new THREE.Mesh(cachedTurnRingGeo, comboMat);
  comboRing.position.y = 0.56;
  comboRing.rotation.x = Math.PI * 0.44;
  comboRing.visible = false;
  root.add(comboRing);

  // Protective anti-snake shield bubble
  if (!cachedShieldGeo) {
    cachedShieldGeo = new THREE.SphereGeometry(0.62, 12, 10);
  }
  const shieldMat = new THREE.MeshToonMaterial({
    color: DOODLE_PALETTE.blue,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const shieldBubble = new THREE.Mesh(cachedShieldGeo, shieldMat);
  shieldBubble.position.y = 0.5;
  shieldBubble.visible = false;
  root.add(shieldBubble);

  // Dizzy stars ring (shown after snake bite!)
  const dizzyStars = new THREE.Group();
  dizzyStars.position.y = 1.05;
  dizzyStars.visible = false;
  if (!cachedStarGeo) {
    cachedStarGeo = new THREE.OctahedronGeometry(0.08, 0);
  }
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const star = new THREE.Mesh(cachedStarGeo, accentMat);
    star.position.set(Math.cos(angle) * 0.32, 0, Math.sin(angle) * 0.32);
    addOutlineMesh(star, outlineMat);
    dizzyStars.add(star);
  }
  root.add(dizzyStars);

  let nextBlinkTime = 2.5 + (seedOffset % 3);
  let blinkRemaining = 0;

  return {
    playerId,
    pawnId,
    root,
    bodyGroup,
    eyesGroup,
    shadowDisc,
    shieldBubble,
    dizzyStars,
    setShieldVisible: (visible: boolean) => {
      shieldBubble.visible = visible;
    },
    setDizzyVisible: (visible: boolean) => {
      dizzyStars.visible = visible;
    },
    setActiveTurn: (active: boolean) => {
      turnHalo.visible = active;
    },
    setComboStreak: (streak: number) => {
      comboRing.visible = streak >= 2;
      comboMat.color.set(streak >= 3 ? DOODLE_PALETTE.orange : DOODLE_PALETTE.yellow);
    },
    updateIdle: (elapsedSec: number, dtSec: number, isAnimating: boolean, reducedMotion: boolean) => {
      // Dizzy stars rotation
      if (dizzyStars.visible) {
        dizzyStars.rotation.y += dtSec * 4.2;
      }
      if (shieldBubble.visible && !reducedMotion) {
        const s = 1 + Math.sin(elapsedSec * 3.5) * 0.05;
        shieldBubble.scale.setScalar(s);
      }
      if (turnHalo.visible) {
        const s = 1 + Math.sin(elapsedSec * 4.8) * (reducedMotion ? 0.02 : 0.11);
        turnHalo.scale.set(s, s, 1);
      }
      if (comboRing.visible && !reducedMotion) {
        comboRing.rotation.z = elapsedSec * 2.2;
      }

      // Random blink every 3-6 seconds
      nextBlinkTime -= dtSec;
      if (nextBlinkTime <= 0) {
        blinkRemaining = 0.14;
        nextBlinkTime = 3.0 + ((Math.sin(elapsedSec * 7.1 + seedOffset) * 0.5 + 0.5) * 3.0);
      }
      if (blinkRemaining > 0) {
        blinkRemaining -= dtSec;
        eyesGroup.scale.y = 0.15;
      } else {
        eyesGroup.scale.y = 1;
      }

      if (isAnimating) return;

      // 2.4s breathing loop + subtle pawn-specific idle character personality
      const breathPhase = (elapsedSec / 2.4) * Math.PI * 2 + seedOffset;
      const amp = reducedMotion ? 0.25 : 1;
      const breath = Math.sin(breathPhase);

      bodyGroup.scale.set(
        1 - breath * 0.035 * amp,
        1 + breath * 0.045 * amp,
        1 - breath * 0.035 * amp,
      );

      if (pawnId === 'bebek' || pawnId === 'kucing') {
        bodyGroup.rotation.z = Math.sin(breathPhase * 0.5) * 0.05 * amp;
      } else if (pawnId === 'kodok') {
        bodyGroup.position.y = Math.max(0, Math.sin(breathPhase) * 0.04 * amp);
      } else {
        bodyGroup.rotation.y = Math.sin(breathPhase * 0.5) * 0.08 * amp;
      }
    },
  };
}
