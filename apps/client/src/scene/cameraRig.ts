import * as THREE from 'three';

export type CameraMode = 'showcase' | 'overview' | 'follow' | 'challenge' | 'victory';

export class DoodleCameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  private readonly currentTarget = new THREE.Vector3(0, 0, 2);
  private readonly desiredTarget = new THREE.Vector3(0, 0, 2);
  private readonly followTarget = new THREE.Vector3(0, 0, 2);
  private readonly tmpDesiredPos = new THREE.Vector3();
  private mode: CameraMode = 'showcase';
  private shakeTime = 0;
  private shakeDuration = 0.25;
  private shakeIntensity = 0.28;
  private victoryOrbitAngle = 0;
  private showcaseOrbitAngle = 0.35;

  // User drag-orbit & wheel-zoom offsets (bounded for tabletop comfort)
  private userYaw = 0;
  private userPitch = 0;
  private userZoom = 1;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 110);
    this.camera.position.set(0, 17, 13.5);
    this.camera.lookAt(this.currentTarget);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // Slightly widen FOV on narrow portrait phones so board edges stay clear
    this.camera.fov = aspect < 0.78 ? 50 : aspect < 1.0 ? 46 : 42;
    this.camera.updateProjectionMatrix();
  }

  public setFollowPoint(pos: THREE.Vector3): void {
    this.followTarget.copy(pos);
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === 'victory') {
      this.victoryOrbitAngle = 0;
    }
    if (mode === 'challenge') {
      this.userYaw *= 0.25;
      this.userPitch *= 0.25;
    }
  }

  public addOrbitDelta(dxPx: number, dyPx: number): void {
    this.userYaw = THREE.MathUtils.clamp(this.userYaw - dxPx * 0.0045, -0.68, 0.68);
    this.userPitch = THREE.MathUtils.clamp(this.userPitch + dyPx * 0.0032, -0.22, 0.28);
  }

  public addZoomDelta(deltaY: number): void {
    this.userZoom = THREE.MathUtils.clamp(this.userZoom + deltaY * 0.0008, 0.72, 1.38);
  }

  public resetUserOrbit(): void {
    this.userYaw = 0;
    this.userPitch = 0;
    this.userZoom = 1;
  }

  public triggerShake(durationSec = 0.25, intensity = 0.26): void {
    this.shakeTime = durationSec;
    this.shakeDuration = durationSec;
    this.shakeIntensity = intensity;
  }

  public update(dtSec: number, elapsedSec: number, reducedMotion: boolean): void {
    const aspectPullback = this.camera.aspect < 0.85 ? 1.24 : 1.0;

    let baseDist = 14.2 * aspectPullback;
    let baseHeight = 20.2 * aspectPullback;

    if (this.mode === 'showcase') {
      this.desiredTarget.set(-1.6, 0.4, 0.2);
      this.showcaseOrbitAngle += dtSec * (reducedMotion ? 0.04 : 0.14);
      baseDist = 17.5 * aspectPullback;
      baseHeight = 14.5 * aspectPullback;
    } else if (this.mode === 'overview') {
      this.desiredTarget.set(0, 0, 0.3);
      baseDist = 15.2 * aspectPullback;
      baseHeight = 21.8 * aspectPullback;
    } else if (this.mode === 'follow') {
      this.desiredTarget.set(
        THREE.MathUtils.clamp(this.followTarget.x * 0.62, -4.5, 4.5),
        0,
        THREE.MathUtils.clamp(this.followTarget.z * 0.62, -4.5, 4.5),
      );
      baseDist = 10.6 * aspectPullback;
      baseHeight = 15.1 * aspectPullback;
    } else if (this.mode === 'challenge') {
      this.desiredTarget.copy(this.followTarget);
      baseDist = (10.6 / 1.15) * aspectPullback;
      baseHeight = (15.1 / 1.15) * aspectPullback;
    } else if (this.mode === 'victory') {
      this.desiredTarget.copy(this.followTarget);
      this.victoryOrbitAngle += dtSec * (reducedMotion ? 0.15 : 0.65);
      baseDist = 7.4;
      baseHeight = 6.2;
    }

    const alpha = 1 - Math.exp(-dtSec / 0.32);
    this.currentTarget.lerp(this.desiredTarget, alpha);

    const swayAmt = reducedMotion ? 0 : 0.22;
    const swayX = Math.sin(elapsedSec * 0.45) * swayAmt;
    const swayY = Math.cos(elapsedSec * 0.35) * swayAmt * 0.5;

    let desiredCamX: number;
    let desiredCamY: number;
    let desiredCamZ: number;

    if (this.mode === 'victory') {
      desiredCamX = this.currentTarget.x + Math.sin(this.victoryOrbitAngle) * baseDist;
      desiredCamZ = this.currentTarget.z + Math.cos(this.victoryOrbitAngle) * baseDist;
      desiredCamY = this.currentTarget.y + baseHeight;
    } else if (this.mode === 'showcase') {
      const orbit = this.showcaseOrbitAngle + this.userYaw;
      const distZ = baseDist * this.userZoom;
      desiredCamX = this.currentTarget.x + Math.sin(orbit) * distZ;
      desiredCamZ = this.currentTarget.z + Math.cos(orbit) * distZ;
      desiredCamY = this.currentTarget.y + baseHeight * (1 + this.userPitch);
    } else {
      const radiusHoriz = baseDist * this.userZoom;
      const yaw = this.userYaw;
      desiredCamX = this.currentTarget.x + Math.sin(yaw) * radiusHoriz + swayX;
      desiredCamZ = this.currentTarget.z + Math.cos(yaw) * radiusHoriz;
      desiredCamY = this.currentTarget.y + baseHeight * this.userZoom * (1 + this.userPitch) + swayY;
    }

    this.tmpDesiredPos.set(desiredCamX, desiredCamY, desiredCamZ);
    this.camera.position.lerp(this.tmpDesiredPos, alpha);

    if (this.shakeTime > 0 && !reducedMotion) {
      this.shakeTime = Math.max(0, this.shakeTime - dtSec);
      const ratio = this.shakeTime / this.shakeDuration;
      const amp = this.shakeIntensity * ratio;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp * 0.7;
    }

    this.camera.lookAt(this.currentTarget);
  }
}
