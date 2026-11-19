import * as THREE from 'three';
import {
  BOARD_LAYOUT,
  TILES,
  TILE_SPACING,
  getBoardSpecialTile,
  getTileGridCoord,
  getZoneForTile,
  type Tile,
  type ZoneId,
} from '@doodle-dash/shared';
import { DOODLE_PALETTE, ZONE_THEME } from './palette.js';
import {
  addOutlineMesh,
  applyVertexWobble,
  createDeskSurfaceTexture,
  createDoodleToonMaterial,
  createPaperTableTexture,
  getToonGradientMap,
  type DoodleOutlineController,
} from './doodleMaterials.js';

export interface TilePreviewMarker {
  tileId: number;
  kind: 'normal' | 'ladder' | 'snake' | 'boss' | 'bounced' | 'special' | 'trap' | 'aim';
}

export interface BoardVisuals {
  group: THREE.Group;
  tileTopY: number[];
  setTileBoing: (tileId: number, offsetY: number, scaleXZ?: number) => void;
  setActiveTile: (tileId: number | null) => void;
  setPreviewTiles: (previews: TilePreviewMarker[]) => void;
  setColorblindMode: (enabled: boolean) => void;
  setLanguage: (lang: 'id' | 'en') => void;
  setActiveZoneLimit: (finishTile: number) => void;
  updateIdle: (elapsedSec: number, reducedMotion: boolean) => void;
  getTileWorldTop: (tileId: number) => THREE.Vector3;
}

function createRoundedSlabGeometry(width: number, height: number, depth: number, radius = 0.22): THREE.BufferGeometry {
  const hw = width / 2 - radius;
  const hd = depth / 2 - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hd - radius);
  shape.lineTo(hw, -hd - radius);
  shape.quadraticCurveTo(hw + radius, -hd - radius, hw + radius, -hd);
  shape.lineTo(hw + radius, hd);
  shape.quadraticCurveTo(hw + radius, hd + radius, hw, hd + radius);
  shape.lineTo(-hw, hd + radius);
  shape.quadraticCurveTo(-hw - radius, hd + radius, -hw - radius, hd);
  shape.lineTo(-hw - radius, -hd);
  shape.quadraticCurveTo(-hw - radius, -hd - radius, -hw, -hd - radius);

  // Lower segment counts preserve chunky rounded silhouette while slashing instanced vertex cost
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.075,
    bevelSize: 0.075,
    bevelSegments: 1,
    curveSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function archetypeBadgeSymbol(tile: Tile, isSprint = false): string {
  if (isSprint && tile.id === 30) return 'GOAL';
  switch (tile.archetype) {
    case 'start':
      return 'START';
    case 'boss_doodle':
      return isSprint ? '' : 'BOSS';
    case 'tap_timing':
      return '◎';
    case 'quick_quiz':
      return '?';
    case 'memory_doodle':
      return '♣';
    case 'spam_tap':
      return '!';
    case 'swipe_dodge':
      return '⇄';
    case 'shadow_match':
      return '◐';
    case 'quick_math':
      return '∑';
    case 'word_scramble':
      return 'Az';
    case 'trace_line':
      return '~';
    case 'lucky_wheel':
      return '☼';
    case 'stroop_color':
      return '◈';
    case 'quick_duel':
      return '×';
    case 'gift_trap':
      return '★';
    case 'bubble_pop':
      return '◉';
    case 'rhythm_clap':
      return '♪';
    case 'color_count':
      return '❖';
    case 'balance_bar':
      return '≈';
    case 'pair_flip':
      return '◫';
    case 'number_order':
      return '#';
    case 'odd_one_out':
      return '✧';
    case 'pattern_next':
      return '⊞';
    case 'math_compare':
      return '><';
    case 'target_sum':
      return '=+';
    case 'arrow_blitz':
      return '↕';
    default:
      return '•';
  }
}

function createTileAtlasTexture(isSprint = false): THREE.CanvasTexture {
  const size = 2048;
  const cell = size / 10;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const ladderStarts = new Set(isSprint ? [3, 8, 15] : BOARD_LAYOUT.ladders.map((l) => l.from));
  const snakeHeads = new Set(isSprint ? [14, 21, 27] : BOARD_LAYOUT.snakes.map((s) => s.from));
  const goalTileId = isSprint ? 30 : 100;

  for (let i = 0; i < 100; i++) {
    const tile = TILES[i];
    const col = i % 10;
    const row = Math.floor(i / 10);
    const x = col * cell;
    const y = row * cell;
    const cx = x + cell / 2;
    const cy = y + cell / 2;

    // Subtle rounded card frame border + corner stitch accents
    ctx.strokeStyle = 'rgba(43, 40, 56, 0.16)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 12, cell - 24, cell - 24, 30);
    ctx.stroke();

    // Special badge for start, goal/boss, ladder, snake & zone gate milestones
    if (tile.id === 1) {
      ctx.fillStyle = DOODLE_PALETTE.mint;
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 68, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = DOODLE_PALETTE.ink;
      ctx.lineWidth = 5;
      ctx.stroke();
    } else if (tile.id === goalTileId) {
      ctx.fillStyle = DOODLE_PALETTE.yellow;
      ctx.beginPath();
      ctx.arc(cx, cy + 6, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = DOODLE_PALETTE.ink;
      ctx.lineWidth = 6;
      ctx.stroke();
    } else if (!isSprint && (tile.id === 26 || tile.id === 51 || tile.id === 76)) {
      ctx.strokeStyle = 'rgba(43, 40, 56, 0.28)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.roundRect(x + 20, y + 20, cell - 40, cell - 40, 24);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (ladderStarts.has(tile.id)) {
      ctx.fillStyle = 'rgba(88, 214, 163, 0.56)';
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(43, 40, 56, 0.42)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Colorblind-safe upward triangle marker in bottom-left corner
      ctx.fillStyle = '#009E73';
      ctx.strokeStyle = DOODLE_PALETTE.ink;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x + 42, y + cell - 54);
      ctx.lineTo(x + 60, y + cell - 24);
      ctx.lineTo(x + 24, y + cell - 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (snakeHeads.has(tile.id)) {
      ctx.fillStyle = 'rgba(255, 127, 167, 0.56)';
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(43, 40, 56, 0.42)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Colorblind-safe downward triangle warning in bottom-left corner
      ctx.fillStyle = '#D55E00';
      ctx.strokeStyle = DOODLE_PALETTE.ink;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x + 42, y + cell - 22);
      ctx.lineTo(x + 60, y + cell - 52);
      ctx.lineTo(x + 24, y + cell - 52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (!isSprint) {
      const special = getBoardSpecialTile(tile.id);
      if (special) {
        const ringColor =
          special.kind === 'star_fountain'
            ? DOODLE_PALETTE.yellow
            : special.kind === 'supply_crate'
              ? '#FF9852'
              : special.kind === 'shield_shrine'
                ? DOODLE_PALETTE.blue
                : DOODLE_PALETTE.mint;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 7;
        ctx.setLineDash([12, 6]);
        ctx.beginPath();
        ctx.roundRect(x + 18, y + 18, cell - 36, cell - 36, 22);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bottom-left emblem badge (shape + color coded for colorblind clarity)
        const bx = x + 44;
        const by = y + cell - 40;
        ctx.fillStyle = ringColor;
        ctx.strokeStyle = DOODLE_PALETTE.ink;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(bx, by, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = DOODLE_PALETTE.ink;
        ctx.font = 'bold 20px "Patrick Hand", "Comic Sans MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const glyph =
          special.kind === 'star_fountain'
            ? '+★'
            : special.kind === 'supply_crate'
              ? '+?'
              : special.kind === 'shield_shrine'
                ? 'S'
                : '>>';
        ctx.fillText(glyph, bx, by + 1);
      }
    }

    // Mode tag dot (duel / all_play) — classic party mode only
    if (!isSprint && tile.mode === 'duel') {
      ctx.fillStyle = DOODLE_PALETTE.orange;
      ctx.beginPath();
      ctx.arc(x + 42, y + 42, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = DOODLE_PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (!isSprint && tile.mode === 'all_play') {
      ctx.fillStyle = DOODLE_PALETTE.blue;
      ctx.beginPath();
      ctx.arc(x + 42, y + 42, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = DOODLE_PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Small archetype icon in top-right corner
    const badgeSym = isSprint && tile.id !== 1 && tile.id !== 30 ? '' : archetypeBadgeSymbol(tile, isSprint);
    if (badgeSym) {
      ctx.fillStyle = DOODLE_PALETTE.ink;
      ctx.font = 'bold 34px "Patrick Hand", "Comic Sans MS", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(badgeSym, x + cell - 24, y + 22);
    }

    // Big bold tile number in center with thick cream halo
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = tile.id === 100 ? 74 : tile.id >= 10 ? 82 : 88;
    ctx.font = `bold ${fontSize}px "Gaegu", "Patrick Hand", "Comic Sans MS", cursive`;
    ctx.lineWidth = 11;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 248, 232, 0.94)';
    ctx.strokeText(String(tile.id), cx, cy + 14);
    ctx.fillStyle = DOODLE_PALETTE.ink;
    ctx.fillText(String(tile.id), cx, cy + 14);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function drawScribbleCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  kind: 'star' | 'cloud' | 'note' | 'arrow',
): void {
  ctx.clearRect(0, 0, 256, 128);
  ctx.strokeStyle = DOODLE_PALETTE.ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'star') {
    ctx.fillStyle = DOODLE_PALETTE.yellow;
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 44 : 20;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const px = 128 + Math.cos(a) * r;
      const py = 64 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'cloud') {
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(88, 72, 26, 0, Math.PI * 2);
    ctx.arc(124, 54, 34, 0, Math.PI * 2);
    ctx.arc(164, 68, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(86, 68, 80, 30);
    ctx.beginPath();
    ctx.moveTo(76, 97);
    ctx.lineTo(176, 97);
    ctx.stroke();
  } else if (kind === 'arrow') {
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(40, 82);
    ctx.quadraticCurveTo(120, 22, 200, 56);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(182, 40);
    ctx.lineTo(205, 58);
    ctx.lineTo(178, 72);
    ctx.stroke();
  } else {
    ctx.save();
    ctx.translate(128, 64);
    ctx.rotate(-0.06);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = DOODLE_PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-108, -36, 216, 72, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = DOODLE_PALETTE.ink;
    ctx.font = 'bold 34px "Patrick Hand", "Comic Sans MS", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 2);
    ctx.restore();
  }
}

function createScribbleSprite(text: string, kind: 'star' | 'cloud' | 'note' | 'arrow'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  drawScribbleCanvas(ctx, text, kind);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(kind === 'note' ? 3.8 : 2.3, kind === 'note' ? 1.9 : 1.15, 1);
  return sprite;
}

function buildZoneProps(outlineCtrl: DoodleOutlineController): {
  group: THREE.Group;
  clouds: THREE.Object3D[];
} {
  const group = new THREE.Group();
  const clouds: THREE.Object3D[] = [];
  const outlineMat = outlineCtrl.material;

  const makeProp = (
    geo: THREE.BufferGeometry,
    color: string,
    seed: number,
    castShadow = false,
  ) => {
    applyVertexWobble(geo, seed, 0.016);
    const mesh = new THREE.Mesh(geo, createDoodleToonMaterial({ color }));
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    addOutlineMesh(mesh, outlineMat);
    return mesh;
  };

  // Taman Permen (bottom-left / bottom-right edge): giant lollipops
  const lollipopPositions: Array<[number, number, string]> = [
    [-10.2, 7.6, DOODLE_PALETTE.pink],
    [-10.4, 4.2, DOODLE_PALETTE.yellow],
    [10.2, 6.8, DOODLE_PALETTE.pink],
  ];
  lollipopPositions.forEach(([x, z, col], i) => {
    const stick = makeProp(new THREE.CylinderGeometry(0.08, 0.09, 1.75, 8), '#FFFFFF', i + 1, true);
    stick.position.set(x, 0.88, z);
    const head = makeProp(new THREE.CylinderGeometry(0.6, 0.6, 0.26, 12), col, i + 10, true);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.96, 0);
    const swirl = makeProp(new THREE.TorusGeometry(0.32, 0.06, 6, 14), '#FFFFFF', i + 14, false);
    swirl.position.set(0, 0.96, 0.13);
    stick.add(head, swirl);
    group.add(stick);
  });

  // Cute tiny pastel daisies framing the notebook edges
  const daisySpots: Array<[number, number, string]> = [
    [-9.6, 9.5, DOODLE_PALETTE.pink],
    [-8.5, 9.7, DOODLE_PALETTE.blue],
    [9.6, 9.2, DOODLE_PALETTE.mint],
    [9.7, -9.2, DOODLE_PALETTE.pink],
  ];
  daisySpots.forEach(([dx, dz, col], i) => {
    const stem = makeProp(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 6), DOODLE_PALETTE.mint, 110 + i);
    stem.position.set(dx, 0.18, dz);
    const petal = makeProp(new THREE.TorusGeometry(0.15, 0.075, 6, 6), col, 120 + i);
    petal.rotation.x = Math.PI / 2;
    petal.position.set(0, 0.2, 0);
    const core = makeProp(new THREE.SphereGeometry(0.09, 7, 7), DOODLE_PALETTE.yellow, 130 + i);
    core.position.set(0, 0.22, 0);
    stem.add(petal, core);
    group.add(stem);
  });

  // Hutan Ngantuk (right edge): sleepy mushrooms & rounded trees
  const treePositions: Array<[number, number]> = [
    [10.4, 1.5],
    [10.5, -2.2],
    [-10.3, 0.2],
  ];
  treePositions.forEach(([x, z], i) => {
    const trunk = makeProp(new THREE.CylinderGeometry(0.18, 0.25, 1.1, 7), '#D4A373', i + 20, true);
    trunk.position.set(x, 0.55, z);
    const crown = makeProp(new THREE.IcosahedronGeometry(0.75, 1), DOODLE_PALETTE.mint, i + 30, true);
    crown.position.set(0, 0.95, 0);
    trunk.add(crown);
    group.add(trunk);
  });

  // Gunung Es Cemong (mid-top edges): ice cones / crystal peaks
  const icePositions: Array<[number, number]> = [
    [-10.4, -4.0],
    [10.4, -5.2],
  ];
  icePositions.forEach(([x, z], i) => {
    const peak = makeProp(new THREE.ConeGeometry(0.8, 1.9, 6), DOODLE_PALETTE.blue, i + 40, true);
    peak.position.set(x, 0.95, z);
    const cap = makeProp(new THREE.SphereGeometry(0.45, 7, 7), '#FFFFFF', i + 50);
    cap.position.set(0, 0.85, 0);
    peak.add(cap);
    group.add(peak);
  });

  // Kastil Awan (top edge near 100): mini castle tower
  const tower = makeProp(new THREE.CylinderGeometry(0.55, 0.68, 2.0, 7), DOODLE_PALETTE.purple, 61, true);
  tower.position.set(-10.1, 1.0, -8.3);
  const roof = makeProp(new THREE.ConeGeometry(0.75, 1.0, 7), DOODLE_PALETTE.orange, 62, true);
  roof.position.set(0, 1.4, 0);
  tower.add(roof);
  group.add(tower);

  // Floating doodle clouds
  const cloudSpots: Array<[number, number, number]> = [
    [-8.8, 2.5, -10.6],
    [3.5, 2.8, -10.8],
    [9.8, 2.3, -9.8],
  ];
  cloudSpots.forEach(([x, y, z], i) => {
    const cloudGroup = new THREE.Group();
    const p1 = makeProp(new THREE.SphereGeometry(0.5, 7, 7), '#FFFFFF', 70 + i);
    const p2 = makeProp(new THREE.SphereGeometry(0.66, 7, 7), '#FFFFFF', 75 + i);
    p2.position.set(0.55, 0.14, 0);
    const p3 = makeProp(new THREE.SphereGeometry(0.46, 7, 7), '#FFFFFF', 80 + i);
    p3.position.set(1.08, -0.04, 0);
    cloudGroup.add(p1, p2, p3);
    cloudGroup.position.set(x, y, z);
    cloudGroup.userData.baseX = x;
    cloudGroup.userData.baseY = y;
    cloudGroup.userData.phase = i * 2.1;
    clouds.push(cloudGroup);
    group.add(cloudGroup);
  });

  // Toybox Artist Desk props framing the sketchbook (perimeter, zero gameplay interference)
  // 1. Giant wooden yellow art pencil on right-front desk margin
  const pencilGroup = new THREE.Group();
  const pencilBody = makeProp(new THREE.CylinderGeometry(0.32, 0.32, 7.6, 6), DOODLE_PALETTE.yellow, 91);
  pencilBody.rotation.z = Math.PI / 2;
  const pencilTipWood = makeProp(new THREE.ConeGeometry(0.32, 1.15, 6), '#F2C99A', 92);
  pencilTipWood.rotation.z = Math.PI / 2;
  pencilTipWood.position.x = -4.35;
  const pencilLead = makeProp(new THREE.ConeGeometry(0.11, 0.42, 6), DOODLE_PALETTE.ink, 93);
  pencilLead.rotation.z = Math.PI / 2;
  pencilLead.position.x = -4.78;
  const pencilFerrule = makeProp(new THREE.CylinderGeometry(0.33, 0.33, 0.55, 8), '#D6DCE5', 94);
  pencilFerrule.rotation.z = Math.PI / 2;
  pencilFerrule.position.x = 4.05;
  const pencilEraser = makeProp(new THREE.CylinderGeometry(0.31, 0.31, 0.65, 8), DOODLE_PALETTE.pink, 95);
  pencilEraser.rotation.z = Math.PI / 2;
  pencilEraser.position.x = 4.62;
  pencilGroup.add(pencilBody, pencilTipWood, pencilLead, pencilFerrule, pencilEraser);
  pencilGroup.position.set(5.4, -0.05, 11.4);
  pencilGroup.rotation.y = 0.24;
  group.add(pencilGroup);

  // 2. Pastel Mint Eraser block near left-front edge
  const eraserMesh = makeProp(new THREE.BoxGeometry(2.1, 0.55, 1.15), DOODLE_PALETTE.mint, 96);
  const eraserSleeve = makeProp(new THREE.BoxGeometry(1.1, 0.6, 1.2), DOODLE_PALETTE.paper, 97);
  eraserMesh.add(eraserSleeve);
  eraserMesh.position.set(-12.2, -0.08, 9.6);
  eraserMesh.rotation.y = -0.35;
  group.add(eraserMesh);

  // 3. Wooden craft ruler along right side of desk
  const rulerMesh = makeProp(new THREE.BoxGeometry(1.15, 0.14, 10.6), '#E7C18E', 98);
  rulerMesh.position.set(12.2, -0.28, -1.2);
  rulerMesh.rotation.y = -0.08;
  group.add(rulerMesh);

  // 4. Pastel ink marker near top-left desk corner
  const markerGroup = new THREE.Group();
  const markerBarrel = makeProp(new THREE.CylinderGeometry(0.28, 0.28, 4.4, 8), '#FFFDF7', 99);
  markerBarrel.rotation.x = Math.PI / 2;
  const markerCap = makeProp(new THREE.CylinderGeometry(0.3, 0.3, 1.35, 8), DOODLE_PALETTE.blue, 100);
  markerCap.rotation.x = Math.PI / 2;
  markerCap.position.z = 2.6;
  markerGroup.add(markerBarrel, markerCap);
  markerGroup.position.set(-12.5, -0.08, -5.6);
  markerGroup.rotation.y = 0.22;
  group.add(markerGroup);

  return { group, clouds };
}

export function buildBoardVisuals(outlineCtrl: DoodleOutlineController): BoardVisuals {
  const group = new THREE.Group();

  // 1a. Outer birch artist desk surface
  const deskGeo = new THREE.PlaneGeometry(66, 54);
  deskGeo.rotateX(-Math.PI / 2);
  const deskMat = new THREE.MeshToonMaterial({
    map: createDeskSurfaceTexture(),
    gradientMap: getToonGradientMap(),
  });
  const deskMesh = new THREE.Mesh(deskGeo, deskMat);
  deskMesh.position.y = -0.36;
  deskMesh.receiveShadow = true;
  group.add(deskMesh);

  // 1b. Kraft spiral notebook cover backing
  const coverGeo = createRoundedSlabGeometry(20.6, 0.22, 20.6, 0.72);
  const coverMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.deskWoodDeep });
  const coverMesh = new THREE.Mesh(coverGeo, coverMat);
  coverMesh.position.y = -0.24;
  coverMesh.receiveShadow = true;
  addOutlineMesh(coverMesh, outlineCtrl.material);
  group.add(coverMesh);

  // 1c. Cream bullet-journal paper page sitting on notebook cover
  const paperGeo = new THREE.PlaneGeometry(19.2, 19.2);
  paperGeo.rotateX(-Math.PI / 2);
  const tableMat = new THREE.MeshToonMaterial({
    map: createPaperTableTexture(),
    gradientMap: getToonGradientMap(),
  });
  const tableMesh = new THREE.Mesh(paperGeo, tableMat);
  tableMesh.position.y = 0.01;
  tableMesh.receiveShadow = true;
  group.add(tableMesh);

  // 1d. Instanced metallic spiral wire rings along left notebook spine (2 draw calls)
  const spiralCount = 18;
  const spiralGeo = new THREE.TorusGeometry(0.32, 0.065, 6, 12);
  const spiralMat = createDoodleToonMaterial({ color: '#C8CEDB' });
  const spiralMesh = new THREE.InstancedMesh(spiralGeo, spiralMat, spiralCount);
  const spiralOutline = new THREE.InstancedMesh(spiralGeo, outlineCtrl.instancedMaterial, spiralCount);
  const spiralDummy = new THREE.Object3D();
  for (let s = 0; s < spiralCount; s++) {
    spiralDummy.position.set(-10.22, 0.04, -8.5 + s * 1.0);
    spiralDummy.rotation.set(0, Math.PI / 2, 0.14);
    spiralDummy.updateMatrix();
    spiralMesh.setMatrixAt(s, spiralDummy.matrix);
    spiralOutline.setMatrixAt(s, spiralDummy.matrix);
  }
  spiralMesh.instanceMatrix.needsUpdate = true;
  spiralOutline.instanceMatrix.needsUpdate = true;
  group.add(spiralMesh, spiralOutline);

  // 1e. Washi tape strips pinning the sketchbook corners
  const tapeConfigs: Array<[number, number, number, string]> = [
    [-9.25, 9.25, -0.68, DOODLE_PALETTE.mint],
    [9.25, 9.25, 0.72, DOODLE_PALETTE.pink],
    [-9.25, -9.25, 0.68, DOODLE_PALETTE.yellow],
    [9.25, -9.25, -0.7, DOODLE_PALETTE.blue],
  ];
  const tapeGeo = new THREE.PlaneGeometry(2.1, 0.56);
  tapeGeo.rotateX(-Math.PI / 2);
  tapeConfigs.forEach(([tx, tz, rot, col]) => {
    const tapeMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const tape = new THREE.Mesh(tapeGeo, tapeMat);
    tape.position.set(tx, 0.025, tz);
    tape.rotation.y = rot;
    group.add(tape);
  });

  // 2. Instanced 100 Tile Slabs (1 draw call + 1 outline draw call!)
  const slabHeight = 0.34;
  const slabGeo = createRoundedSlabGeometry(TILE_SPACING * 0.88, slabHeight, TILE_SPACING * 0.88, 0.22);
  applyVertexWobble(slabGeo, 7, 0.014);
  const slabMat = createDoodleToonMaterial({ color: '#FFFFFF' });
  const instancedSlabs = new THREE.InstancedMesh(slabGeo, slabMat, 100);
  instancedSlabs.castShadow = true;
  instancedSlabs.receiveShadow = true;

  const instancedOutlines = new THREE.InstancedMesh(
    slabGeo,
    outlineCtrl.instancedMaterial,
    100,
  );

  // 3. Instanced 100 Tile Top Caps with custom ShaderMaterial atlas (1 draw call!)
  const classicAtlasTex = createTileAtlasTexture(false);
  const sprintAtlasTex = createTileAtlasTexture(true);
  const topGeo = new THREE.PlaneGeometry(TILE_SPACING * 0.78, TILE_SPACING * 0.78);
  topGeo.rotateX(-Math.PI / 2);
  const cellOffsets = new Float32Array(100 * 2);

  for (let i = 0; i < 100; i++) {
    const col = i % 10;
    const row = Math.floor(i / 10);
    cellOffsets[i * 2] = col * 0.1;
    // Canvas row 0 is top of image -> WebGL UV y = 0.9 - row * 0.1
    cellOffsets[i * 2 + 1] = 0.9 - row * 0.1;
  }
  topGeo.setAttribute('aCellOffset', new THREE.InstancedBufferAttribute(cellOffsets, 2));

  const topMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uAtlas: { value: classicAtlasTex },
    },
    vertexShader: `
      attribute vec2 aCellOffset;
      varying vec2 vAtlasUv;
      void main() {
        vAtlasUv = uv * 0.1 + aCellOffset;
        vec4 worldPos = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          worldPos = instanceMatrix * worldPos;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      varying vec2 vAtlasUv;
      void main() {
        vec4 c = texture2D(uAtlas, vAtlasUv);
        if (c.a < 0.05) discard;
        gl_FragColor = c;
      }
    `,
  });

  const instancedTops = new THREE.InstancedMesh(topGeo, topMat, 100);

  const tileTopY: number[] = new Array(101).fill(0.45);
  const tileBaseScaleY: number[] = new Array(101).fill(1);
  const tileBoingY: number[] = new Array(101).fill(0);
  const tileBoingScaleXZ: number[] = new Array(101).fill(1);
  const tileBaseColors: THREE.Color[] = Array.from({ length: 101 }, () => new THREE.Color('#FFFFFF'));
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const mutedOutOfZoneColor = new THREE.Color('#D5CEC2');
  let activeZoneLimit = 100;
  let currentLanguage: 'id' | 'en' = 'en';

  const writeTileMatrix = (tileId: number) => {
    const idx = tileId - 1;
    const coord = getTileGridCoord(tileId);
    const scaleY = tileBaseScaleY[tileId];
    const boingY = tileBoingY[tileId];
    const sxz = tileBoingScaleXZ[tileId];

    // Keep grid aisles crisp and tidy without random yaw twist jitter
    dummy.position.set(coord.x, 0.05 + boingY, coord.z);
    dummy.scale.set(sxz, scaleY, sxz);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    instancedSlabs.setMatrixAt(idx, dummy.matrix);
    instancedOutlines.setMatrixAt(idx, dummy.matrix);

    const topY = 0.05 + (slabHeight + 0.085) * scaleY + boingY + 0.005;
    tileTopY[tileId] = topY;
    dummy.position.set(coord.x, topY, coord.z);
    dummy.scale.set(sxz, 1, sxz);
    dummy.updateMatrix();
    instancedTops.setMatrixAt(idx, dummy.matrix);
  };

  const milestoneTiles = new Set<number>([
    1,
    100,
    ...BOARD_LAYOUT.ladders.map((l) => l.from),
    ...BOARD_LAYOUT.snakes.map((s) => s.from),
  ]);

  for (let tileId = 1; tileId <= 100; tileId++) {
    const zone: ZoneId = getZoneForTile(tileId);
    const theme = ZONE_THEME[zone];
    const isAlt = tileId % 2 === 0;
    const heightScale = tileId === 100 ? 1.14 : milestoneTiles.has(tileId) ? 1.05 : 0.96;
    tileBaseScaleY[tileId] = heightScale;

    if (tileId === 1) {
      tmpColor.set(DOODLE_PALETTE.mint);
    } else if (tileId === 100) {
      tmpColor.set(DOODLE_PALETTE.yellow);
    } else {
      tmpColor.set(isAlt ? theme.slabBase : theme.slabAlt);
    }
    tileBaseColors[tileId].copy(tmpColor);
    instancedSlabs.setColorAt(tileId - 1, tmpColor);
    writeTileMatrix(tileId);
  }
  instancedSlabs.instanceMatrix.needsUpdate = true;
  if (instancedSlabs.instanceColor) instancedSlabs.instanceColor.needsUpdate = true;
  instancedOutlines.instanceMatrix.needsUpdate = true;
  instancedTops.instanceMatrix.needsUpdate = true;

  group.add(instancedSlabs, instancedOutlines, instancedTops);

  // 4. Thematic zone props + clouds
  const props = buildZoneProps(outlineCtrl);
  group.add(props.group);

  // 5. 2D Scribble sprites neatly framing outside board edges (zero tile occlusion)
  const scribbles: Array<{ sprite: THREE.Sprite; baseY: number; phase: number }> = [];
  const noteScribbles: Array<{ sprite: THREE.Sprite; idText: string; enText: string }> = [];
  const scribbleConfigs: Array<[string, string, 'star' | 'cloud' | 'note' | 'arrow', number, number, number]> = [
    ['Mulai!', 'Start!', 'note', -8.8, 0.85, 10.65],
    ['Awas Ular!', 'Watch Snakes!', 'note', 10.6, 1.05, 2.2],
    ['Menuju Bos!', 'To Boss!', 'note', -8.4, 1.2, -10.8],
    ['', '', 'star', -11.0, 1.6, 8.6],
    ['', '', 'star', 10.8, 1.75, -8.8],
    ['', '', 'star', 0.2, 1.4, 10.8],
    ['', '', 'arrow', -5.4, 0.65, 10.6],
    ['', '', 'cloud', 6.8, 2.0, 10.7],
  ];
  scribbleConfigs.forEach(([idTxt, enTxt, kind, x, y, z], idx) => {
    const sp = createScribbleSprite(enTxt, kind);
    sp.position.set(x, y, z);
    scribbles.push({ sprite: sp, baseY: y, phase: idx * 0.9 });
    if (kind === 'note') {
      noteScribbles.push({ sprite: sp, idText: idTxt, enText: enTxt });
    }
    group.add(sp);
  });

  // 6. Active Tile Beacon Ring + Soft Golden Aura Pillar + Landing Preview Rings + 3D FHE Padlock Beacons
  const beaconGeo = new THREE.RingGeometry(0.56, 0.74, 24);
  beaconGeo.rotateX(-Math.PI / 2);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: DOODLE_PALETTE.yellow,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const beaconRing = new THREE.Mesh(beaconGeo, beaconMat);
  beaconRing.visible = false;
  group.add(beaconRing);

  const pillarGeo = new THREE.CylinderGeometry(0.56, 0.68, 0.72, 18, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: DOODLE_PALETTE.yellow,
    transparent: true,
    opacity: 0.17,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beaconPillar = new THREE.Mesh(pillarGeo, pillarMat);
  beaconPillar.visible = false;
  group.add(beaconPillar);
  let activeBeaconTileId: number | null = 1;

  // Pooled 14 landing-preview halos
  const previewGeo = new THREE.RingGeometry(0.58, 0.79, 24);
  previewGeo.rotateX(-Math.PI / 2);
  const previewKindColorsDefault: Record<TilePreviewMarker['kind'], string> = {
    normal: DOODLE_PALETTE.yellow,
    ladder: DOODLE_PALETTE.mint,
    snake: DOODLE_PALETTE.pink,
    boss: DOODLE_PALETTE.orange,
    bounced: DOODLE_PALETTE.coral,
    special: DOODLE_PALETTE.purple,
    trap: '#FF2E63',
    aim: DOODLE_PALETTE.blue,
  };
  const previewKindColorsCb: Record<TilePreviewMarker['kind'], string> = {
    normal: '#E69F00',
    ladder: '#009E73',
    snake: '#D55E00',
    boss: '#CC79A7',
    bounced: '#0072B2',
    special: '#56B4E9',
    trap: '#F0E442',
    aim: '#56B4E9',
  };
  let colorblindMode = false;
  let latestPreviews: TilePreviewMarker[] = [];
  const getPreviewColor = (kind: TilePreviewMarker['kind']): string =>
    (colorblindMode ? previewKindColorsCb : previewKindColorsDefault)[kind];
  const previewRings = Array.from({ length: 14 }, () => {
    const mat = new THREE.MeshBasicMaterial({
      color: DOODLE_PALETTE.yellow,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(previewGeo, mat);
    ring.visible = false;
    group.add(ring);
    return ring;
  });

  // Pooled 4 hovering 3D FHE Padlock Beacons (rendered ONLY above local player's own planted Secret Traps!)
  const lockBodyGeo = new THREE.BoxGeometry(0.36, 0.3, 0.18);
  const lockShackleGeo = new THREE.TorusGeometry(0.11, 0.036, 6, 12, Math.PI);
  const lockCoreGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8);
  lockCoreGeo.rotateX(Math.PI / 2);
  const lockBodyMat = createDoodleToonMaterial({ color: '#FF3D77' });
  const lockShackleMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.yellow });
  const lockCoreMat = new THREE.MeshBasicMaterial({ color: DOODLE_PALETTE.ink });
  const trapBeacons = Array.from({ length: 4 }, () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(lockBodyGeo, lockBodyMat);
    addOutlineMesh(body, outlineCtrl.material);
    const shackle = new THREE.Mesh(lockShackleGeo, lockShackleMat);
    shackle.position.y = 0.14;
    addOutlineMesh(shackle, outlineCtrl.material);
    const keyhole = new THREE.Mesh(lockCoreGeo, lockCoreMat);
    keyhole.position.set(0, -0.02, 0.01);
    g.add(body, shackle, keyhole);
    g.visible = false;
    group.add(g);
    return g;
  });

  // Floating 3D Aiming Target Pin (highlights selected tile when aiming a Secret Trap)
  const aimPinGroup = new THREE.Group();
  const aimCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.42, 6),
    createDoodleToonMaterial({ color: DOODLE_PALETTE.blue }),
  );
  aimCone.rotation.x = Math.PI;
  addOutlineMesh(aimCone, outlineCtrl.material);
  const aimCap = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.15, 0),
    createDoodleToonMaterial({ color: DOODLE_PALETTE.yellow }),
  );
  aimCap.position.y = 0.24;
  addOutlineMesh(aimCap, outlineCtrl.material);
  aimPinGroup.add(aimCone, aimCap);
  aimPinGroup.visible = false;
  group.add(aimPinGroup);

  // Ambient pastel sketchbook sparkle dust drifting above tabletop (1 single Points draw call!)
  const sparkleCount = 40;
  const sparklePos = new Float32Array(sparkleCount * 3);
  const sparkleBaseY = new Float32Array(sparkleCount);
  const sparklePhases = new Float32Array(sparkleCount);
  for (let i = 0; i < sparkleCount; i++) {
    sparklePos[i * 3] = (Math.random() - 0.5) * 22;
    const by = 1.4 + Math.random() * 4.4;
    sparklePos[i * 3 + 1] = by;
    sparklePos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    sparkleBaseY[i] = by;
    sparklePhases[i] = Math.random() * Math.PI * 2;
  }
  const sparkleGeo = new THREE.BufferGeometry();
  sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
  const spCanvas = document.createElement('canvas');
  spCanvas.width = 32;
  spCanvas.height = 32;
  const spCtx = spCanvas.getContext('2d')!;
  const spGrad = spCtx.createRadialGradient(16, 16, 1, 16, 16, 15);
  spGrad.addColorStop(0, 'rgba(255, 245, 195, 1)');
  spGrad.addColorStop(0.45, 'rgba(255, 224, 130, 0.75)');
  spGrad.addColorStop(1, 'rgba(255, 224, 130, 0)');
  spCtx.fillStyle = spGrad;
  spCtx.fillRect(0, 0, 32, 32);
  const spTex = new THREE.CanvasTexture(spCanvas);
  const sparkleMat = new THREE.PointsMaterial({
    map: spTex,
    size: 0.36,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ambientSparkles = new THREE.Points(sparkleGeo, sparkleMat);
  group.add(ambientSparkles);

  // Tile 1 Start Flagpole landmark on outer corner so pawns have full room
  const c1 = getTileGridCoord(1);
  const flagGroup = new THREE.Group();
  const flagPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.35, 6),
    createDoodleToonMaterial({ color: '#FFFFFF' }),
  );
  flagPole.position.y = 0.68;
  addOutlineMesh(flagPole, outlineCtrl.material);
  const flagPennant = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.6, 3),
    createDoodleToonMaterial({ color: DOODLE_PALETTE.mint }),
  );
  flagPennant.rotation.z = -Math.PI / 2;
  flagPennant.position.set(0.28, 1.15, 0);
  addOutlineMesh(flagPennant, outlineCtrl.material);
  flagGroup.add(flagPole, flagPennant);
  flagGroup.position.set(c1.x - 0.76, (tileTopY[1] ?? 0.45) - 0.05, c1.z + 0.76);
  group.add(flagGroup);

  // Finish Crown Pedestal + Orbiting Mini Stars + Twin Goal Turrets
  const crownGroup = new THREE.Group();
  const c100 = getTileGridCoord(100);
  const crownMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.yellow });
  const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.24, 6), crownMat);
  addOutlineMesh(crownBase, outlineCtrl.material);
  crownGroup.add(crownBase);
  for (let p = 0; p < 5; p++) {
    const angle = (p / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), crownMat);
    spike.position.set(Math.cos(angle) * 0.2, 0.18, Math.sin(angle) * 0.2);
    addOutlineMesh(spike, outlineCtrl.material);
    crownGroup.add(spike);
  }
  const crownOrbitGroup = new THREE.Group();
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2;
    const star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.085, 0),
      createDoodleToonMaterial({ color: s === 1 ? DOODLE_PALETTE.mint : DOODLE_PALETTE.yellow }),
    );
    star.position.set(Math.cos(a) * 0.52, 0.28 + (s % 2) * 0.1, Math.sin(a) * 0.52);
    addOutlineMesh(star, outlineCtrl.material);
    crownOrbitGroup.add(star);
  }
  crownGroup.add(crownOrbitGroup);
  crownGroup.position.set(c100.x - 0.62, (tileTopY[100] ?? 0.5) + 0.48, c100.z - 0.62);
  group.add(crownGroup);

  const turretMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.purple });
  const turretRoofMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.coral });
  const turretFinialMat = createDoodleToonMaterial({ color: DOODLE_PALETTE.yellow });
  const finishTurrets: THREE.Mesh[] = [];
  [-0.78, 0.78].forEach((ox) => {
    const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 6), turretMat);
    tBase.position.set(c100.x + ox, (tileTopY[100] ?? 0.5) + 0.35, c100.z - 0.88);
    addOutlineMesh(tBase, outlineCtrl.material);
    const tCap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.38, 6), turretRoofMat);
    tCap.position.set(0, 0.62, 0);
    addOutlineMesh(tCap, outlineCtrl.material);
    const tStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), turretFinialMat);
    tStar.position.set(0, 0.26, 0);
    addOutlineMesh(tStar, outlineCtrl.material);
    tCap.add(tStar);
    tBase.add(tCap);
    finishTurrets.push(tBase);
    group.add(tBase);
  });

  const goldGoalColor = new THREE.Color(DOODLE_PALETTE.yellow);

  return {
    group,
    tileTopY,
    setTileBoing: (tileId: number, offsetY: number, scaleXZ = 1) => {
      if (tileId < 1 || tileId > 100) return;
      tileBoingY[tileId] = offsetY;
      tileBoingScaleXZ[tileId] = scaleXZ;
      writeTileMatrix(tileId);
      instancedSlabs.instanceMatrix.needsUpdate = true;
      instancedOutlines.instanceMatrix.needsUpdate = true;
      instancedTops.instanceMatrix.needsUpdate = true;
    },
    setActiveTile: (tileId: number | null) => {
      activeBeaconTileId = tileId;
      if (tileId === null || tileId < 1 || tileId > 100) {
        beaconRing.visible = false;
        beaconPillar.visible = false;
      } else {
        const coord = getTileGridCoord(tileId);
        const topY = tileTopY[tileId] ?? 0.45;
        beaconRing.visible = true;
        beaconRing.position.set(coord.x, topY + 0.03, coord.z);
        beaconPillar.visible = true;
        beaconPillar.position.set(coord.x, topY + 0.38, coord.z);
      }
    },
    setPreviewTiles: (previews: TilePreviewMarker[]) => {
      latestPreviews = previews;
      let trapIdx = 0;
      let aimTileId = 0;
      for (let i = 0; i < previewRings.length; i++) {
        const ring = previewRings[i];
        const marker = previews[i];
        if (!marker || marker.tileId < 1 || marker.tileId > 100) {
          ring.visible = false;
          ring.userData.kind = undefined;
          continue;
        }
        const coord = getTileGridCoord(marker.tileId);
        const topY = tileTopY[marker.tileId] ?? 0.45;
        ring.visible = true;
        ring.userData.kind = marker.kind;
        ring.position.set(coord.x, topY + 0.036, coord.z);
        (ring.material as THREE.MeshBasicMaterial).color.set(getPreviewColor(marker.kind));

        if (marker.kind === 'trap' && trapIdx < trapBeacons.length) {
          const beacon = trapBeacons[trapIdx++];
          beacon.visible = true;
          beacon.position.set(coord.x, topY + 0.62, coord.z);
          beacon.userData.baseY = topY + 0.62;
        } else if (marker.kind === 'aim' && aimTileId === 0) {
          aimTileId = marker.tileId;
        }
      }
      for (let t = trapIdx; t < trapBeacons.length; t++) {
        trapBeacons[t].visible = false;
      }
      if (aimTileId > 0) {
        const coord = getTileGridCoord(aimTileId);
        const topY = tileTopY[aimTileId] ?? 0.45;
        aimPinGroup.visible = true;
        aimPinGroup.position.set(coord.x, topY + 0.78, coord.z);
        aimPinGroup.userData.baseY = topY + 0.78;
      } else {
        aimPinGroup.visible = false;
      }
    },
    setColorblindMode: (enabled: boolean) => {
      colorblindMode = enabled;
      for (let i = 0; i < previewRings.length; i++) {
        const ring = previewRings[i];
        const marker = latestPreviews[i];
        if (!ring.visible || !marker) continue;
        (ring.material as THREE.MeshBasicMaterial).color.set(getPreviewColor(marker.kind));
      }
    },
    setLanguage: (lang: 'id' | 'en') => {
      if (currentLanguage === lang) return;
      currentLanguage = lang;
      for (const note of noteScribbles) {
        const mat = note.sprite.material as THREE.SpriteMaterial;
        const tex = mat.map as THREE.CanvasTexture | null;
        const canvas = tex?.image as HTMLCanvasElement | undefined;
        const ctx = canvas?.getContext('2d');
        if (tex && ctx) {
          drawScribbleCanvas(ctx, lang === 'en' ? note.enText : note.idText, 'note');
          tex.needsUpdate = true;
        }
      }
    },
    setActiveZoneLimit: (finishTile: number) => {
      const clamped = finishTile > 0 && finishTile < 100 ? finishTile : 100;
      if (clamped === activeZoneLimit) return;
      activeZoneLimit = clamped;
      const isSprint = clamped === 30;
      topMat.uniforms.uAtlas.value = isSprint ? sprintAtlasTex : classicAtlasTex;
      for (let tileId = 1; tileId <= 100; tileId++) {
        if (isSprint && tileId === 30) {
          tmpColor.copy(goldGoalColor);
        } else if (tileId <= clamped) {
          tmpColor.copy(tileBaseColors[tileId]);
        } else {
          tmpColor.copy(tileBaseColors[tileId]).lerp(mutedOutOfZoneColor, 0.74);
        }
        instancedSlabs.setColorAt(tileId - 1, tmpColor);
      }
      if (instancedSlabs.instanceColor) {
        instancedSlabs.instanceColor.needsUpdate = true;
      }
      const cGoal = getTileGridCoord(clamped);
      const goalTopY = tileTopY[clamped] ?? 0.5;
      const xOff = isSprint ? 0.62 : -0.62;
      crownGroup.position.set(cGoal.x + xOff, goalTopY + 0.48, cGoal.z - 0.62);
      if (finishTurrets.length >= 2) {
        const zOff = isSprint ? -0.78 : -0.88;
        finishTurrets[0].position.set(cGoal.x - 0.78, goalTopY + 0.35, cGoal.z + zOff);
        finishTurrets[1].position.set(cGoal.x + 0.78, goalTopY + 0.35, cGoal.z + zOff);
      }
    },
    updateIdle: (elapsedSec: number, reducedMotion: boolean) => {
      const amp = reducedMotion ? 0.15 : 1;
      for (const c of props.clouds) {
        const bx = c.userData.baseX as number;
        const by = c.userData.baseY as number;
        const ph = c.userData.phase as number;
        c.position.x = bx + Math.sin(elapsedSec * 0.35 + ph) * 0.65 * amp;
        c.position.y = by + Math.cos(elapsedSec * 0.7 + ph) * 0.15 * amp;
      }
      for (const s of scribbles) {
        s.sprite.position.y = s.baseY + Math.sin(elapsedSec * 1.4 + s.phase) * 0.12 * amp;
        const pulse = 1 + Math.sin(elapsedSec * 2.2 + s.phase) * 0.04 * amp;
        s.sprite.material.opacity = 0.84 + Math.sin(elapsedSec * 2.6 + s.phase) * 0.16 * amp;
        s.sprite.scale.y = s.sprite.scale.x * 0.5 * pulse;
      }
      if (activeBeaconTileId !== null && beaconRing.visible) {
        const pulse = 1 + Math.sin(elapsedSec * 5.2) * 0.1 * amp;
        beaconRing.scale.set(pulse, pulse, 1);
        beaconRing.rotation.z = elapsedSec * 0.9 * amp;
        beaconPillar.scale.set(0.95 + Math.sin(elapsedSec * 3.8) * 0.07 * amp, 1, 0.95 + Math.sin(elapsedSec * 3.8) * 0.07 * amp);
        pillarMat.opacity = 0.13 + Math.sin(elapsedSec * 3.2) * 0.05 * amp;
      }
      for (let i = 0; i < previewRings.length; i++) {
        const ring = previewRings[i];
        if (!ring.visible) continue;
        const kind = ring.userData.kind as TilePreviewMarker['kind'] | undefined;
        const speed = colorblindMode && kind === 'snake' ? 7.8 : 4.4;
        const baseScale = colorblindMode && kind === 'ladder' ? 1.07 : 1;
        const pulse = baseScale + Math.sin(elapsedSec * speed + i * 0.7) * 0.08 * amp;
        ring.scale.set(pulse, pulse, 1);
      }
      for (let t = 0; t < trapBeacons.length; t++) {
        const tb = trapBeacons[t];
        if (!tb.visible) continue;
        const by = (tb.userData.baseY as number) || 1.0;
        tb.position.y = by + Math.sin(elapsedSec * 3.2 + t * 1.4) * 0.12 * amp;
        tb.rotation.y = elapsedSec * 1.6 * amp + t;
      }
      if (aimPinGroup.visible) {
        const by = (aimPinGroup.userData.baseY as number) || 1.15;
        aimPinGroup.position.y = by + Math.abs(Math.sin(elapsedSec * 4.0)) * 0.18 * amp;
        aimPinGroup.rotation.y = elapsedSec * 2.2 * amp;
      }
      if (!reducedMotion) {
        const posAttr = sparkleGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < sparkleCount; i++) {
          posAttr.setY(i, sparkleBaseY[i] + Math.sin(elapsedSec * 0.9 + sparklePhases[i]) * 0.35);
        }
        posAttr.needsUpdate = true;
      }
      flagGroup.rotation.y = Math.sin(elapsedSec * 2.2) * 0.18 * amp;
      crownGroup.rotation.y = elapsedSec * 0.8 * amp;
      crownOrbitGroup.rotation.y = -elapsedSec * 1.9 * amp;
      crownGroup.position.y = (tileTopY[activeZoneLimit] ?? 0.5) + 0.48 + Math.sin(elapsedSec * 2.4) * 0.08 * amp;
    },
    getTileWorldTop: (tileId: number) => {
      const coord = getTileGridCoord(tileId);
      return new THREE.Vector3(coord.x, tileTopY[tileId] ?? 0.45, coord.z);
    },
  };
}
