import * as THREE from 'three';
import { PAWN_META, type PawnId, type PlayerColorId } from '@doodle-dash/shared';
import { DOODLE_PALETTE, PLAYER_HEX_MAP } from './palette.js';
import {
  addOutlineMesh,
  createDoodleToonMaterial,
  type DoodleOutlineController,
} from './doodleMaterials.js';

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
    eyeGeo = new THREE.SphereGeometry(eyeSize, 10, 8);
    eyeGeoCache.set(eyeSize, eyeGeo);
  }
  let pupilGeo = pupilGeoCache.get(eyeSize);
  if (!pupilGeo) {
    pupilGeo = new THREE.SphereGeometry(eyeSize * 0.58, 8, 8);
    pupilGeoCache.set(eyeSize, pupilGeo);
  }
  let sparkleGeo = sparkleGeoCache.get(eyeSize);
  if (!sparkleGeo) {
    sparkleGeo = new THREE.SphereGeometry(eyeSize * 0.22, 6, 6);
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

export function buildPawnVisual(
  playerId: string,
  pawnId: PawnId,
  colorId: PlayerColorId,
  outlineCtrl: DoodleOutlineController,
  seedOffset = 0,
  customLabel?: string,
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
    makePart(new THREE.SphereGeometry(0.29, 12, 10), mainMat, 0, 0.24, 0).scale.set(1.02, 0.9, 1.0);
    makePart(new THREE.SphereGeometry(0.18, 10, 8), creamMat, 0, 0.23, 0.16).scale.set(1.0, 0.95, 0.72);
    addChibiArms(bodyGroup, mainMat, outlineMat, 0.25, 0.28, 0.58);
    makePart(new THREE.SphereGeometry(0.32, 14, 12), mainMat, 0, 0.58, 0).scale.set(1.06, 0.96, 1.0);

    // Outer + inner pink ears
    const earGeo = new THREE.ConeGeometry(0.115, 0.24, 6);
    const innerEarGeo = new THREE.ConeGeometry(0.065, 0.15, 6);
    for (const side of [-1, 1]) {
      const ear = makePart(earGeo, mainMat, side * 0.2, 0.85, -0.02);
      ear.rotation.z = side * -0.32;
      const inner = makePart(innerEarGeo, pinkMat, side * 0.195, 0.83, 0.045);
      inner.rotation.z = side * -0.32;
    }

    // Pink bow accessory + collar with golden bell
    makePart(new THREE.TorusGeometry(0.21, 0.04, 6, 12), pinkMat, 0, 0.4, 0.01).rotation.x = Math.PI / 2;
    makePart(new THREE.SphereGeometry(0.065, 8, 8), accentMat, 0, 0.39, 0.22);
    makePart(new THREE.SphereGeometry(0.078, 8, 8), pinkMat, -0.09, 0.79, 0.22);
    makePart(new THREE.SphereGeometry(0.078, 8, 8), pinkMat, 0.09, 0.79, 0.22);
    makePart(new THREE.SphereGeometry(0.048, 8, 8), accentMat, 0, 0.79, 0.25);

    // Curled fluffy cat tail
    const tail = makePart(new THREE.CapsuleGeometry(0.055, 0.24, 4, 8), mainMat, 0.12, 0.28, -0.29);
    tail.rotation.set(-0.75, 0, -0.45);

    // Cute nose + cheeks + shiny eyes
    makePart(new THREE.SphereGeometry(0.036, 6, 6), pinkMat, 0, 0.54, 0.33);
    addRosyCheeks(bodyGroup, 0.51, 0.27, 0.19, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.6, 0.27, 0.13, outlineMat, 0.088);
  } else if (pawnId === 'kodok') {
    // Koko si Kodok: Plump frog + cream belly + lil hands + lilypad cap with lotus bud
    makePart(new THREE.SphereGeometry(0.32, 12, 10), mainMat, 0, 0.24, 0).scale.set(1.12, 0.82, 1.05);
    makePart(new THREE.SphereGeometry(0.22, 10, 8), creamMat, 0, 0.23, 0.16).scale.set(1.05, 0.8, 0.72);
    addChibiArms(bodyGroup, mainMat, outlineMat, 0.23, 0.32, 0.7);
    makePart(new THREE.SphereGeometry(0.29, 14, 12), mainMat, 0, 0.55, 0.02).scale.set(1.12, 0.9, 1.0);

    // Lilypad hat + cute yellow lotus flower bud
    const hat = makePart(new THREE.CylinderGeometry(0.29, 0.31, 0.055, 12), mintMat, 0, 0.8, 0);
    hat.rotation.x = 0.08;
    makePart(new THREE.SphereGeometry(0.075, 8, 8), accentMat, 0.07, 0.87, 0.02);
    makePart(new THREE.SphereGeometry(0.055, 8, 8), pinkMat, -0.05, 0.85, 0.04);

    // Frog eye sockets + blush
    for (const side of [-1, 1]) {
      makePart(new THREE.SphereGeometry(0.115, 10, 8), mainMat, side * 0.15, 0.75, 0.13);
    }
    addRosyCheeks(bodyGroup, 0.5, 0.28, 0.2, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.76, 0.19, 0.15, outlineMat, 0.09);
  } else if (pawnId === 'bebek') {
    // Wekwek si Bebek: Plump duck + wings + tufted hair + polka scarf + plump orange beak
    makePart(new THREE.SphereGeometry(0.3, 12, 10), mainMat, 0, 0.25, 0).scale.set(1.04, 0.9, 1.08);
    makePart(new THREE.SphereGeometry(0.19, 10, 8), creamMat, 0, 0.24, 0.15).scale.set(1.0, 0.88, 0.7);
    for (const side of [-1, 1]) {
      const wing = makePart(new THREE.SphereGeometry(0.13, 8, 8), mainMat, side * 0.29, 0.26, -0.02);
      wing.scale.set(0.55, 0.88, 1.18);
      wing.rotation.z = side * 0.28;
    }
    makePart(new THREE.SphereGeometry(0.28, 14, 12), mainMat, 0, 0.57, 0.02);

    // Cozy neck scarf + fluttering scarf tail
    makePart(new THREE.TorusGeometry(0.21, 0.062, 8, 14), pinkMat, 0, 0.41, 0.01).rotation.x = Math.PI / 2;
    const scarfTail = makePart(new THREE.BoxGeometry(0.11, 0.2, 0.05), pinkMat, 0.16, 0.32, 0.16);
    scarfTail.rotation.set(0.2, -0.3, 0.4);

    // Cute feather tuft crest on head
    makePart(new THREE.ConeGeometry(0.06, 0.15, 6), mainMat, -0.04, 0.87, 0).rotation.z = 0.28;
    makePart(new THREE.ConeGeometry(0.05, 0.12, 6), accentMat, 0.05, 0.85, 0.02).rotation.z = -0.32;

    // Rounded cute orange duckbill
    const beak = makePart(new THREE.SphereGeometry(0.12, 10, 8), orangeMat, 0, 0.53, 0.27);
    beak.scale.set(1.25, 0.62, 1.12);
    addRosyCheeks(bodyGroup, 0.55, 0.23, 0.19, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.64, 0.23, 0.12, outlineMat, 0.082);
  } else if (pawnId === 'panda') {
    // Boba si Panda: Cream body + ink shoulder saddle + patches + round glasses + bamboo sprout
    makePart(new THREE.SphereGeometry(0.3, 12, 10), creamMat, 0, 0.25, 0).scale.set(1.05, 0.92, 1.0);
    makePart(new THREE.TorusGeometry(0.2, 0.075, 6, 12), inkMat, 0, 0.38, 0).rotation.x = Math.PI / 2;
    addChibiArms(bodyGroup, inkMat, outlineMat, 0.25, 0.29, 0.58);
    makePart(new THREE.SphereGeometry(0.32, 14, 12), creamMat, 0, 0.59, 0).scale.set(1.06, 0.96, 1.0);

    // Fluffy ink ears + tail puff
    makePart(new THREE.SphereGeometry(0.115, 8, 8), inkMat, -0.23, 0.85, 0);
    makePart(new THREE.SphereGeometry(0.115, 8, 8), inkMat, 0.23, 0.85, 0);
    makePart(new THREE.SphereGeometry(0.085, 7, 7), inkMat, 0, 0.18, -0.28);

    // Classic panda oval eye patches
    for (const side of [-1, 1]) {
      const patch = makePart(new THREE.SphereGeometry(0.105, 8, 8), inkMat, side * 0.13, 0.6, 0.24);
      patch.scale.set(1.0, 1.15, 0.45);
      patch.rotation.z = side * -0.25;
    }

    // Round glasses + bamboo shoot sprout on head/ear
    makePart(new THREE.TorusGeometry(0.1, 0.02, 6, 12), mainMat, -0.13, 0.61, 0.295);
    makePart(new THREE.TorusGeometry(0.1, 0.02, 6, 12), mainMat, 0.13, 0.61, 0.295);
    makePart(new THREE.CapsuleGeometry(0.022, 0.12, 4, 6), mintMat, 0.26, 0.87, 0.05).rotation.z = -0.38;
    const leaf = makePart(new THREE.SphereGeometry(0.06, 6, 6), mintMat, 0.34, 0.94, 0.06);
    leaf.scale.set(1.5, 0.55, 0.7);
    leaf.rotation.z = 0.4;

    makePart(new THREE.SphereGeometry(0.04, 6, 6), inkMat, 0, 0.55, 0.33);
    addRosyCheeks(bodyGroup, 0.52, 0.27, 0.2, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.61, 0.27, 0.13, outlineMat, 0.075);
  } else if (pawnId === 'dino') {
    // Roro si Dino: Chubby body + cream tummy + snout + tail + dorsal spikes + golden crown
    makePart(new THREE.SphereGeometry(0.3, 12, 10), mainMat, 0, 0.24, 0).scale.set(1.05, 0.9, 1.05);
    makePart(new THREE.SphereGeometry(0.19, 10, 8), creamMat, 0, 0.23, 0.16).scale.set(1.0, 0.95, 0.72);
    addChibiArms(bodyGroup, mainMat, outlineMat, 0.26, 0.27, 0.65);

    // Head + cute rounded dino snout
    makePart(new THREE.SphereGeometry(0.3, 14, 12), mainMat, 0, 0.58, 0.01);
    const snout = makePart(new THREE.SphereGeometry(0.17, 10, 8), mainMat, 0, 0.52, 0.24);
    snout.scale.set(1.1, 0.78, 1.05);
    makePart(new THREE.SphereGeometry(0.032, 6, 6), creamMat, -0.055, 0.47, 0.38);
    makePart(new THREE.SphereGeometry(0.032, 6, 6), creamMat, 0.055, 0.47, 0.38);

    // Chubby dino tail + 3 dorsal plates
    const tail = makePart(new THREE.ConeGeometry(0.13, 0.36, 7), mainMat, 0, 0.22, -0.35);
    tail.rotation.x = -1.25;
    makePart(new THREE.ConeGeometry(0.075, 0.15, 6), orangeMat, 0, 0.68, -0.24).rotation.x = -0.6;
    makePart(new THREE.ConeGeometry(0.08, 0.16, 6), accentMat, 0, 0.5, -0.3).rotation.x = -0.9;
    makePart(new THREE.ConeGeometry(0.065, 0.13, 6), orangeMat, 0, 0.32, -0.34).rotation.x = -1.1;

    // 5-point Paper King Crown
    makePart(new THREE.CylinderGeometry(0.17, 0.14, 0.15, 6), accentMat, 0, 0.88, 0.01);
    for (let c = 0; c < 4; c++) {
      const a = (c / 4) * Math.PI * 2;
      makePart(new THREE.ConeGeometry(0.045, 0.1, 5), accentMat, Math.cos(a) * 0.11, 0.98, Math.sin(a) * 0.11 + 0.01);
    }

    addRosyCheeks(bodyGroup, 0.55, 0.24, 0.2, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.64, 0.25, 0.13, outlineMat, 0.086);
  } else {
    // Toady si Jamur: Squishy mushroom stem + arms + grand dotted domed cap + star badge
    makePart(new THREE.CylinderGeometry(0.2, 0.26, 0.42, 12), creamMat, 0, 0.22, 0);
    addChibiArms(bodyGroup, creamMat, outlineMat, 0.23, 0.25, 0.6);

    const cap = makePart(
      new THREE.SphereGeometry(0.42, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      mainMat,
      0,
      0.47,
      0,
    );
    cap.scale.set(1.12, 0.88, 1.12);
    // Ruffled brim ring underneath cap
    makePart(new THREE.CylinderGeometry(0.42, 0.36, 0.05, 14), creamMat, 0, 0.47, 0);

    // Polka dots & star badge on mushroom cap
    makePart(new THREE.SphereGeometry(0.095, 8, 8), creamMat, -0.22, 0.72, 0.2);
    makePart(new THREE.SphereGeometry(0.085, 8, 8), creamMat, 0.23, 0.7, 0.19);
    makePart(new THREE.SphereGeometry(0.085, 8, 8), creamMat, -0.02, 0.84, -0.15);
    makePart(new THREE.OctahedronGeometry(0.075, 0), accentMat, 0, 0.66, 0.41);

    addRosyCheeks(bodyGroup, 0.27, 0.22, 0.16, blushMat);
    eyesGroup = addCuteEyes(bodyGroup, 0.34, 0.21, 0.1, outlineMat, 0.074);
  }

  // Floating compact name badge above character
  const metaShort = PAWN_META[pawnId].shortName;
  const displayName =
    customLabel && !customLabel.toLowerCase().includes(metaShort.toLowerCase())
      ? `${customLabel.split(' ')[0]} (${metaShort})`
      : customLabel || metaShort;
  const nameSprite = createPawnNameSprite(displayName, mainHex);
  nameSprite.position.set(0, 1.24, 0);
  root.add(nameSprite);

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
