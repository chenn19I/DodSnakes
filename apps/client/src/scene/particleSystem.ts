import * as THREE from 'three';
import { DOODLE_PALETTE } from './palette.js';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  vRot: number;
  scale: number;
  life: number;
  maxLife: number;
  gravity: number;
  color: THREE.Color;
}

const CONFETTI_COLORS = [
  DOODLE_PALETTE.pink,
  DOODLE_PALETTE.yellow,
  DOODLE_PALETTE.mint,
  DOODLE_PALETTE.blue,
  DOODLE_PALETTE.orange,
  DOODLE_PALETTE.purple,
].map((hex) => new THREE.Color(hex));

export class DoodleParticleSystem {
  public readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly maxParticles = 240;
  private cursor = 0;

  constructor() {
    const geo = new THREE.OctahedronGeometry(0.14, 0);
    const mat = new THREE.MeshToonMaterial({ color: '#FFFFFF' });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        vRot: 0,
        scale: 0,
        life: 0,
        maxLife: 1,
        gravity: 9,
        color: new THREE.Color('#FFFFFF'),
      });
      this.dummy.position.set(0, -50, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color('#FFFFFF'));
    }
  }

  private emitOne(opts: Partial<Particle> & { x: number; y: number; z: number }): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.maxParticles;
    p.active = true;
    p.x = opts.x;
    p.y = opts.y;
    p.z = opts.z;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 2;
    p.vz = opts.vz ?? 0;
    p.rotX = Math.random() * Math.PI * 2;
    p.rotY = Math.random() * Math.PI * 2;
    p.vRot = opts.vRot ?? 5;
    p.scale = opts.scale ?? 1;
    p.life = 0;
    p.maxLife = opts.maxLife ?? 0.8;
    p.gravity = opts.gravity ?? 9;
    p.color.copy(opts.color ?? CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
  }

  public spawnDustPuff(pos: THREE.Vector3, reducedMotion: boolean): void {
    const count = reducedMotion ? 2 : 7;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 0.8 + Math.random() * 0.9;
      this.emitOne({
        x: pos.x,
        y: pos.y + 0.08,
        z: pos.z,
        vx: Math.cos(a) * spd,
        vy: 0.6 + Math.random() * 0.7,
        vz: Math.sin(a) * spd,
        scale: 0.7 + Math.random() * 0.4,
        maxLife: 0.42,
        gravity: 2.5,
        color: new THREE.Color(DOODLE_PALETTE.paperWarm),
      });
    }
  }

  public spawnStarBurst(pos: THREE.Vector3, reducedMotion: boolean): void {
    const count = reducedMotion ? 3 : 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const spd = 1.6 + Math.random() * 1.8;
      this.emitOne({
        x: pos.x,
        y: pos.y + 0.35,
        z: pos.z,
        vx: Math.cos(a) * spd,
        vy: 2.5 + Math.random() * 2.0,
        vz: Math.sin(a) * spd,
        scale: 0.95,
        maxLife: 0.75,
        gravity: 8,
        color: new THREE.Color(i % 2 === 0 ? DOODLE_PALETTE.yellow : DOODLE_PALETTE.pink),
      });
    }
  }

  public spawnConfetti(pos: THREE.Vector3, reducedMotion: boolean, count = 28): void {
    const actualCount = reducedMotion ? Math.min(5, count) : count;
    for (let i = 0; i < actualCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 3.4;
      this.emitOne({
        x: pos.x + (Math.random() - 0.5) * 0.6,
        y: pos.y + 0.6 + Math.random() * 0.5,
        z: pos.z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * spd,
        vy: 3.6 + Math.random() * 3.5,
        vz: Math.sin(a) * spd,
        vRot: 8,
        scale: 0.75 + Math.random() * 0.55,
        maxLife: 1.35 + Math.random() * 0.45,
        gravity: 6.5,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      });
    }
  }

  public update(dtSec: number): void {
    let anyDirty = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyDirty = true;
      p.life += dtSec;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dummy.position.set(0, -50, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.vy -= p.gravity * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.z += p.vz * dtSec;
      p.rotX += p.vRot * dtSec;
      p.rotY += p.vRot * 0.7 * dtSec;

      const fade = 1 - p.life / p.maxLife;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.rotX, p.rotY, 0);
      this.dummy.scale.setScalar(p.scale * Math.min(1, fade * 1.4));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    }

    if (anyDirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
