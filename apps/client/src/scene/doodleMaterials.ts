import * as THREE from 'three';
import { DOODLE_PALETTE } from './palette.js';

let cachedGradientMap: THREE.DataTexture | null = null;
const cachedMaterials = new Map<string, THREE.MeshToonMaterial>();

/**
 * Soft painterly cel-shading ramp with gentle transitions so curved characters
 * and accessories look smooth and sculptural rather than harshly stepped.
 */
export function getToonGradientMap(): THREE.DataTexture {
  if (cachedGradientMap) return cachedGradientMap;
  const data = new Uint8Array([
    148, 144, 156, 255,
    172, 169, 180, 255,
    196, 194, 204, 255,
    218, 216, 224, 255,
    236, 234, 240, 255,
    247, 246, 250, 255,
    253, 252, 255, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 8, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cachedGradientMap = tex;
  return tex;
}

/**
 * Returns a cached or customized MeshToonMaterial without expensive per-frame
 * screen-space shader hooks, eliminating GPU shader swaps and shimmer.
 */
export function createDoodleToonMaterial(
  options: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  const canCache =
    !options.map &&
    !options.transparent &&
    options.opacity === undefined &&
    options.side === undefined &&
    options.emissive === undefined;
  const key = canCache ? `col:${String(options.color ?? '#ffffff')}` : '';

  if (canCache && cachedMaterials.has(key)) {
    return cachedMaterials.get(key)!;
  }

  const mat = new THREE.MeshToonMaterial({
    gradientMap: getToonGradientMap(),
    ...options,
  });

  if (canCache) {
    cachedMaterials.set(key, mat);
  }
  return mat;
}

export interface DoodleOutlineController {
  material: THREE.ShaderMaterial;
  instancedMaterial: THREE.ShaderMaterial;
  setBoilingStep: (step: number) => void;
  setReducedMotion: (reduced: boolean) => void;
}

function buildOutlineShaderMaterial(
  thickness: number,
  colorHex: string,
  sharedUniforms: { uBoilStep: { value: number }; uBoilAmplitude: { value: number } },
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uInkColor: { value: new THREE.Color(colorHex) },
      uThickness: { value: thickness },
      uBoilStep: sharedUniforms.uBoilStep,
      uBoilAmplitude: sharedUniforms.uBoilAmplitude,
    },
    vertexShader: `
      uniform float uThickness;
      uniform float uBoilStep;
      uniform float uBoilAmplitude;

      void main() {
        float wave = sin(position.x * 5.2 + position.y * 4.4 + uBoilStep * 0.42)
                   * cos(position.z * 5.0 - uBoilStep * 0.35);
        float variableThick = uThickness * (0.94 + 0.09 * wave);
        float boilOffset = wave * uBoilAmplitude;
        vec3 displaced = position + normalize(normal) * (variableThick + boilOffset);

        vec4 mvPosition = vec4(displaced, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uInkColor;
      void main() {
        gl_FragColor = vec4(uInkColor, 1.0);
      }
    `,
  });
}

export function createOutlineController(thickness = 0.032): DoodleOutlineController {
  const shared = {
    uBoilStep: { value: 0 },
    uBoilAmplitude: { value: 0.0022 },
  };
  const material = buildOutlineShaderMaterial(thickness, DOODLE_PALETTE.ink, shared);
  const instancedMaterial = buildOutlineShaderMaterial(thickness * 0.88, DOODLE_PALETTE.ink, shared);

  return {
    material,
    instancedMaterial,
    setBoilingStep: (step: number) => {
      shared.uBoilStep.value = step;
    },
    setReducedMotion: (reduced: boolean) => {
      shared.uBoilAmplitude.value = reduced ? 0 : 0.0022;
    },
  };
}

/**
 * Adds subtle hand-crafted vertex wobble without tearing shared seams.
 */
export function applyVertexWobble(
  geometry: THREE.BufferGeometry,
  seed = 1,
  amplitude = 0.022,
): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  if (!pos) return geometry;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const qx = Math.round(x * 100);
    const qy = Math.round(y * 100);
    const qz = Math.round(z * 100);
    const h1 = Math.sin(qx * 12.9898 + qy * 78.233 + qz * 37.719 + seed) * 43758.5453;
    const h2 = Math.sin(qx * 39.346 + qy * 11.135 + qz * 83.155 + seed * 2.1) * 29432.123;
    const h3 = Math.sin(qx * 73.156 + qy * 52.235 + qz * 19.832 + seed * 3.7) * 18534.789;
    const dx = ((h1 - Math.floor(h1)) - 0.5) * 2 * amplitude;
    const dy = ((h2 - Math.floor(h2)) - 0.5) * 2 * amplitude;
    const dz = ((h3 - Math.floor(h3)) - 0.5) * 2 * amplitude;
    pos.setXYZ(i, x + dx, y + dy, z + dz);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function addOutlineMesh(
  mesh: THREE.Mesh,
  outlineMat: THREE.Material,
): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  outline.name = `${mesh.name || 'mesh'}_outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
  return outline;
}

/**
 * Generates warm artist craft-table surface texture (birch grain + cutting-mat feel).
 */
export function createDeskSurfaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = DOODLE_PALETTE.deskWood;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle horizontal wood planks & warm tonal variation
  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = (y / 64) % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(130,90,45,0.05)';
    ctx.fillRect(0, y, 512, 64);
    ctx.strokeStyle = 'rgba(92, 64, 34, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Soft wavy wood fibers
  ctx.strokeStyle = 'rgba(130, 88, 42, 0.09)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 42; i++) {
    const baseY = (i / 42) * 512;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 32; x <= 512; x += 64) {
      const wave = Math.sin(x * 0.02 + i * 1.3) * 6;
      ctx.lineTo(x, baseY + wave);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates crisp spiral-sketchbook spread texture for the game board mat.
 */
export function createPaperTableTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = DOODLE_PALETTE.paper;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle sketchbook border shadow
  ctx.strokeStyle = 'rgba(36, 34, 45, 0.18)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 1016, 1016);

  // Fine dot-grid & ruled lines like a real bullet journal
  ctx.fillStyle = 'rgba(43, 42, 51, 0.10)';
  for (let y = 40; y < 1000; y += 36) {
    for (let x = 96; x < 990; x += 36) {
      ctx.fillRect(x, y, 2, 2);
    }
  }

  ctx.strokeStyle = 'rgba(106, 184, 250, 0.22)';
  ctx.lineWidth = 2;
  for (let y = 76; y < 1000; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  // Twin red/pink sketchbook margin line
  ctx.strokeStyle = 'rgba(242, 158, 179, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(82, 0);
  ctx.lineTo(82, 1024);
  ctx.stroke();

  // Soft decorative corner doodle squiggle
  ctx.strokeStyle = 'rgba(36, 34, 45, 0.16)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(960, 960, 26, 0, Math.PI * 1.5);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
