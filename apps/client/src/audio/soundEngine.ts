// Note frequency helpers (Hz) in F Major / F Lydian cozy tabletop palette
const N = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, Bb2: 116.54, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08, B3: 246.94,
  C4: 261.63, Cs4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, Bb5: 932.33,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, F6: 1396.91,
} as const;

interface MusicBarSpec {
  chord: number[];
  bass: (number | null)[];
  melody: (number | null)[];
  bell?: (number | null)[];
  padLevel?: number;
  groove?: 'calm' | 'walk' | 'chorus';
}

/**
 * 32-bar (~68.6s at 112 BPM) cozy tabletop soundtrack arranged in 4 evolving sections:
 * A (Bars 1-8): Sunny Sketchbook Walk
 * B (Bars 9-16): Playful Dice Bounce
 * C (Bars 17-24): Warm Tea-Break Bridge
 * D (Bars 25-32): Cloudtop Finale Chorus & Turnaround
 */
const BGM_SCORE: MusicBarSpec[] = [
  // --- Section A: Sunny Sketchbook Walk (Bars 1-8) ---
  { chord: [N.F3, N.A3, N.C4, N.E4], bass: [N.F2, null, null, N.C3, N.F2, null, N.C3, null], melody: [N.A4, null, N.C5, null, N.E5, null, N.C5, N.D5], groove: 'walk' },
  { chord: [N.D3, N.F3, N.A3, N.C4], bass: [N.D2, null, null, N.A2, N.D3, null, N.A2, null], melody: [N.C5, null, N.A4, N.G4, N.F4, null, N.G4, N.A4], groove: 'walk' },
  { chord: [N.Bb3, N.D4, N.F4, N.A4], bass: [N.Bb2, null, null, N.F2, N.Bb2, null, N.D3, null], melody: [N.D5, null, N.C5, N.Bb4, N.A4, null, N.G4, N.F4], groove: 'walk' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.C2, null, null, N.G2, N.C3, null, N.G2, null], melody: [N.G4, null, N.A4, N.Bb4, N.C5, null, null, null], groove: 'walk' },
  { chord: [N.F3, N.A3, N.C4, N.E4], bass: [N.F2, null, null, N.C3, N.F2, null, N.A2, null], melody: [N.A4, null, N.C5, N.D5, N.E5, null, N.F5, N.E5], bell: [null, null, null, null, N.C6, null, null, null], groove: 'walk' },
  { chord: [N.D3, N.F3, N.A3, N.C4], bass: [N.D2, null, null, N.A2, N.D3, null, N.F2, null], melody: [N.D5, null, N.C5, N.A4, N.F4, null, N.A4, null], groove: 'walk' },
  { chord: [N.G3, N.Bb3, N.D4, N.F4], bass: [N.G2, null, null, N.D3, N.C3, null, N.G2, null], melody: [N.Bb4, N.A4, N.G4, N.F4, N.G4, null, N.E4, null], groove: 'walk' },
  { chord: [N.F3, N.A3, N.C4, N.E4], bass: [N.F2, null, null, N.C3, N.F2, null, null, N.C3], melody: [N.F4, null, null, N.C5, N.A4, null, N.G4, null], bell: [N.F5, null, N.A5, null, N.C6, null, null, null], groove: 'walk' },

  // --- Section B: Playful Dice Bounce (Bars 9-16) ---
  { chord: [N.G3, N.Bb3, N.D4, N.F4], bass: [N.G2, null, N.D3, null, N.G2, null, N.D3, N.G2], melody: [N.D5, null, N.D5, N.C5, N.Bb4, null, N.A4, N.G4], bell: [null, N.G5, null, null, N.D5, null, null, null], groove: 'chorus' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.C2, null, N.G2, null, N.C3, null, N.Bb2, N.G2], melody: [N.C5, null, N.C5, N.Bb4, N.A4, null, N.G4, N.E4], bell: [null, N.E5, null, null, N.Bb5, null, null, null], groove: 'chorus' },
  { chord: [N.A3, N.C4, N.E4, N.G4], bass: [N.A2, null, N.E3, null, N.A2, null, N.E3, null], melody: [N.E5, null, N.C5, N.A4, N.G4, null, N.E4, N.G4], groove: 'chorus' },
  { chord: [N.D3, N.F3, N.A3, N.C4], bass: [N.D2, null, N.A2, null, N.D3, null, N.C3, null], melody: [N.A4, null, N.D5, null, N.F5, null, N.E5, N.D5], bell: [null, null, null, null, N.A5, null, null, null], groove: 'chorus' },
  { chord: [N.Bb3, N.D4, N.F4, N.A4], bass: [N.Bb2, null, N.F2, null, N.Bb2, null, N.F2, null], melody: [N.D5, N.C5, N.Bb4, N.A4, N.G4, null, N.F4, N.G4], groove: 'chorus' },
  { chord: [N.G3, N.Bb3, N.D4, N.F4], bass: [N.G2, null, N.D3, null, N.G2, null, N.B2, null], melody: [N.A4, null, N.Bb4, null, N.D5, null, N.C5, null], groove: 'chorus' },
  { chord: [N.C3, N.F3, N.G3, N.Bb3], bass: [N.C2, null, null, N.G2, N.C3, null, N.C2, null], melody: [N.G4, N.A4, N.Bb4, N.C5, N.D5, null, N.C5, null], bell: [N.G5, null, null, N.E5, null, null, N.C5, null], groove: 'chorus' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.C3, null, N.G2, null, N.C2, null, N.E2, null], melody: [N.E5, null, N.D5, null, N.C5, null, N.G4, null], groove: 'walk' },

  // --- Section C: Cozy Tea-Break Bridge (Bars 17-24) ---
  { chord: [N.Bb3, N.D4, N.F4, N.A4], bass: [N.Bb2, null, null, null, N.F2, null, N.Bb2, null], melody: [N.F5, null, null, N.E5, N.D5, null, N.A4, null], bell: [N.A5, null, null, null, N.F5, null, null, null], padLevel: 0.036, groove: 'calm' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.Bb2, null, null, null, N.G2, null, N.C3, null], melody: [N.E5, null, null, N.D5, N.C5, null, N.G4, null], bell: [N.G5, null, null, null, N.E5, null, null, null], padLevel: 0.036, groove: 'calm' },
  { chord: [N.A3, N.C4, N.E4, N.G4], bass: [N.A2, null, null, null, N.E2, null, N.A2, null], melody: [N.C5, null, N.B4, N.C5, N.E5, null, N.G5, null], bell: [null, null, N.E5, null, null, null, N.C6, null], padLevel: 0.036, groove: 'calm' },
  { chord: [N.D3, N.F3, N.A3, N.C4], bass: [N.D2, null, null, null, N.A2, null, N.D3, null], melody: [N.F5, null, N.E5, N.D5, N.C5, null, N.A4, null], bell: [null, null, null, null, N.A5, null, null, null], padLevel: 0.036, groove: 'calm' },
  { chord: [N.G3, N.Bb3, N.D4, N.F4], bass: [N.G2, null, null, N.D3, N.G2, null, null, null], melody: [N.Bb4, null, N.C5, N.D5, N.F5, null, N.D5, null], bell: [N.D5, null, N.G5, null, N.Bb5, null, null, null], padLevel: 0.035, groove: 'calm' },
  { chord: [N.C3, N.F3, N.A3, N.Bb3], bass: [N.C2, null, null, N.G2, N.C3, null, null, null], melody: [N.C5, null, N.Bb4, N.A4, N.G4, null, N.C5, null], padLevel: 0.035, groove: 'calm' },
  { chord: [N.F3, N.A3, N.C4, N.E4], bass: [N.F2, null, null, N.C3, N.F2, null, N.E2, null], melody: [N.A4, null, N.C5, N.E5, N.F5, null, N.E5, N.C5], bell: [N.C6, null, null, null, N.A5, null, null, null], groove: 'walk' },
  { chord: [N.A3, N.Cs4, N.E4, N.G4], bass: [N.A2, null, null, N.E2, N.A2, null, N.C3, null], melody: [N.E5, null, N.D5, N.Cs4, N.E4, null, N.A4, null], groove: 'walk' },

  // --- Section D: Cloudtop Finale Chorus & Turnaround (Bars 25-32) ---
  { chord: [N.Bb3, N.D4, N.F4, N.A4], bass: [N.Bb2, null, N.F2, null, N.Bb2, null, N.D3, null], melody: [N.F5, null, N.D5, N.C5, N.D5, null, N.F5, null], bell: [N.D6, null, N.A5, null, N.F5, null, null, null], groove: 'chorus' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.C2, null, N.G2, null, N.C3, null, N.E3, null], melody: [N.E5, null, N.C5, N.Bb4, N.C5, null, N.E5, null], bell: [N.C6, null, N.G5, null, N.E5, null, null, null], groove: 'chorus' },
  { chord: [N.A3, N.C4, N.E4, N.G4], bass: [N.A2, null, N.E3, null, N.A2, null, N.E3, null], melody: [N.G5, null, N.E5, N.C5, N.E5, null, N.C5, null], bell: [N.E6, null, null, N.C6, null, null, N.G5, null], groove: 'chorus' },
  { chord: [N.D3, N.F3, N.A3, N.C4], bass: [N.D2, null, N.A2, null, N.D3, null, N.C3, null], melody: [N.F5, null, N.E5, N.D5, N.C5, null, N.A4, N.C5], bell: [null, N.A5, null, null, N.F5, null, null, null], groove: 'chorus' },
  { chord: [N.G3, N.Bb3, N.D4, N.F4], bass: [N.G2, null, N.D3, null, N.G2, null, N.Bb2, null], melody: [N.D5, N.E5, N.F5, N.D5, N.Bb4, null, N.D5, null], groove: 'chorus' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.C2, null, N.G2, null, N.C3, null, N.G2, null], melody: [N.C5, N.D5, N.E5, N.C5, N.G4, null, N.A4, N.Bb4], groove: 'chorus' },
  { chord: [N.F3, N.A3, N.C4, N.E4], bass: [N.F2, null, N.C3, null, N.F2, null, N.D2, null], melody: [N.C5, null, N.F5, N.E5, N.C5, null, N.A4, null], bell: [N.F5, null, N.A5, null, N.C6, null, N.F6, null], groove: 'walk' },
  { chord: [N.C3, N.E3, N.G3, N.Bb3], bass: [N.G2, null, N.C3, null, N.C2, null, N.G2, null], melody: [N.G4, null, N.A4, N.Bb4, N.C5, null, N.G4, null], bell: [null, null, null, null, N.E5, null, N.C5, null], groove: 'walk' },
];

export class DoodleSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private muted = false;
  private volume = 0.72;
  private musicEnabled = true;

  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private musicStep = 0;
  private readonly stepDurationSec = 0.268; // 112 BPM eighth notes (~68.6s full 32-bar loop)

  private createCozyRoomImpulse(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.48);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let prev = 0;
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.7);
        const white = (Math.random() * 2 - 1) * decay;
        // One-pole lowpass so room tail feels wooden and warm, never metallic
        prev = prev * 0.65 + white * 0.35;
        data[i] = prev * 0.55;
      }
    }
    return impulse;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Slightly softened pink-leaning noise for organic rattles & brushes
      data[i] = (lastOut + 0.18 * white) / 1.18;
      lastOut = data[i];
    }
    return buffer;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.volume;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 3.8;
      comp.attack.value = 0.005;
      comp.release.value = 0.16;

      master.connect(comp);
      comp.connect(ctx.destination);

      const sfxFilter = ctx.createBiquadFilter();
      sfxFilter.type = 'lowpass';
      sfxFilter.frequency.value = 6800;
      sfxFilter.Q.value = 0.5;

      const sfx = ctx.createGain();
      sfx.gain.value = 0.92;
      sfx.connect(sfxFilter);
      sfxFilter.connect(master);

      const bgmFilter = ctx.createBiquadFilter();
      bgmFilter.type = 'lowpass';
      bgmFilter.frequency.value = 3600;
      bgmFilter.Q.value = 0.4;

      const bgm = ctx.createGain();
      bgm.gain.value = 0.78;
      bgm.connect(bgmFilter);
      bgmFilter.connect(master);

      const reverb = ctx.createConvolver();
      reverb.buffer = this.createCozyRoomImpulse(ctx);
      const reverbWet = ctx.createGain();
      reverbWet.gain.value = 0.24;
      reverb.connect(reverbWet);
      reverbWet.connect(master);

      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.16;
      sfx.connect(sfxSend);
      sfxSend.connect(reverb);

      const bgmSend = ctx.createGain();
      bgmSend.gain.value = 0.3;
      bgm.connect(bgmSend);
      bgmSend.connect(reverb);

      this.masterGain = master;
      this.compressor = comp;
      this.sfxBus = sfx;
      this.bgmBus = bgm;
      this.reverbNode = reverb;
      this.noiseBuffer = this.createNoiseBuffer(ctx);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.musicEnabled && !this.muted && !this.schedulerTimer) {
      this.startMusicLoop();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    if (muted) {
      this.stopMusicLoop();
    } else if (this.musicEnabled) {
      this.startMusicLoop();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (enabled && !this.muted) {
      this.startMusicLoop();
    } else {
      this.stopMusicLoop();
    }
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public vibrate(pattern: number | number[]): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore on unsupported devices
      }
    }
  }

  /**
   * Warm marimba / kalimba note synthesizer using fundamental + gentle octave overtone.
   */
  private playMarimbaNote(
    freq: number,
    durationSec: number,
    peakGain: number,
    startTime: number,
    bus: 'sfx' | 'bgm',
    cutoffHz = 2800,
  ): void {
    const ctx = this.ctx;
    const targetBus = bus === 'bgm' ? this.bgmBus : this.sfxBus;
    if (!ctx || !targetBus) return;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(450, cutoffHz * 0.45), startTime + durationSec);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0008, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + 0.011);
    env.gain.exponentialRampToValueAtTime(0.0008, startTime + durationSec);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, startTime);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, startTime);
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.28, startTime);
    overtoneGain.gain.exponentialRampToValueAtTime(0.02, startTime + Math.min(0.14, durationSec * 0.5));

    osc1.connect(filter);
    osc2.connect(overtoneGain);
    overtoneGain.connect(filter);
    filter.connect(env);
    env.connect(targetBus);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + durationSec + 0.03);
    osc2.stop(startTime + durationSec + 0.03);
  }

  private playWarmVoice(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    peakGain: number,
    startTime: number,
    bus: 'sfx' | 'bgm',
    attackSec = 0.015,
    cutoffHz = 3400,
  ): void {
    const ctx = this.ctx;
    const targetBus = bus === 'bgm' ? this.bgmBus : this.sfxBus;
    if (!ctx || !targetBus) return;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (Math.abs(freqEnd - freqStart) > 0.5) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(35, freqEnd), startTime + durationSec);
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, startTime);

    gain.gain.setValueAtTime(0.0008, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + attackSec);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + durationSec);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(targetBus);

    osc.start(startTime);
    osc.stop(startTime + durationSec + 0.03);
  }

  private playFilteredNoise(
    durationSec: number,
    filterType: BiquadFilterType,
    freqHz: number,
    q: number,
    peakGain: number,
    startTime: number,
    bus: 'sfx' | 'bgm',
  ): void {
    const ctx = this.ctx;
    const targetBus = bus === 'bgm' ? this.bgmBus : this.sfxBus;
    if (!ctx || !targetBus || !this.noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqHz, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0008, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(targetBus);

    src.start(startTime);
    src.stop(startTime + durationSec + 0.02);
  }

  // --- Look-ahead BGM Scheduler ---

  private startMusicLoop(): void {
    if (this.schedulerTimer) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.nextStepTime < ctx.currentTime) {
      this.nextStepTime = ctx.currentTime + 0.05;
    }

    this.schedulerTimer = setInterval(() => {
      if (this.muted || !this.musicEnabled || !this.ctx || this.ctx.state !== 'running') return;
      const horizon = this.ctx.currentTime + 0.18;
      while (this.nextStepTime < horizon) {
        this.scheduleMusicStep(this.musicStep, this.nextStepTime);
        this.nextStepTime += this.stepDurationSec;
        this.musicStep = (this.musicStep + 1) % (BGM_SCORE.length * 8);
      }
    }, 65);
  }

  private stopMusicLoop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.nextStepTime = 0;
  }

  private scheduleMusicStep(globalStep: number, when: number): void {
    const barIdx = Math.floor(globalStep / 8) % BGM_SCORE.length;
    const stepInBar = globalStep % 8;
    const bar = BGM_SCORE[barIdx];
    const groove = bar.groove ?? 'walk';
    // Tiny human velocity nuance so melody breathes organically
    const velJitter = 0.92 + Math.sin(globalStep * 1.7) * 0.08;

    // 1. Warm chord pad on beat 1 (plus gentle chord bloom on beat 3 in calm/chorus)
    if (stepInBar === 0 || (groove !== 'walk' && stepInBar === 4)) {
      const padVol = (bar.padLevel ?? 0.022) * (stepInBar === 0 ? 1 : 0.72);
      const padDur = stepInBar === 0 && groove === 'walk' ? this.stepDurationSec * 7.2 : this.stepDurationSec * 3.6;
      bar.chord.forEach((f, idx) => {
        this.playWarmVoice(f, f, padDur, 'sine', padVol, when + idx * 0.014, 'bgm', 0.06, 1900);
      });
    }

    // 2. Acoustic round upright bass
    const bassFreq = bar.bass[stepInBar];
    if (bassFreq) {
      this.playWarmVoice(bassFreq, bassFreq * 0.996, 0.36, 'triangle', 0.052 * velJitter, when, 'bgm', 0.012, 620);
    }

    // 3. Cozy Kalimba/Marimba lead melody
    const melFreq = bar.melody[stepInBar];
    if (melFreq) {
      this.playMarimbaNote(melFreq, 0.38, 0.056 * velJitter, when, 'bgm', 2900);
    }

    // 4. Delicate celesta bell counter-melody
    const bellFreq = bar.bell?.[stepInBar];
    if (bellFreq) {
      this.playWarmVoice(bellFreq, bellFreq, 0.52, 'sine', 0.024 * velJitter, when + 0.008, 'bgm', 0.008, 3400);
    }

    // 5. Soft tabletop percussion (kick thump, wood rim, airy brush shaker)
    if (groove !== 'calm') {
      if (stepInBar === 0 || (groove === 'chorus' && stepInBar === 4)) {
        this.playWarmVoice(96, 48, 0.11, 'sine', 0.055, when, 'bgm', 0.004, 340);
      }
      if (groove === 'chorus' && (stepInBar === 2 || stepInBar === 6)) {
        this.playFilteredNoise(0.032, 'bandpass', 1450, 2.5, 0.016, when, 'bgm');
      }
      if (stepInBar % 2 === 1) {
        this.playFilteredNoise(0.028, 'highpass', 3800, 0.8, 0.012 * velJitter, when, 'bgm');
      }
    } else if (stepInBar === 0) {
      this.playWarmVoice(88, 50, 0.12, 'sine', 0.04, when, 'bgm', 0.006, 280);
    }
  }

  // --- Crafted Smooth SFX ---

  public playUiClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playMarimbaNote(698.46, 0.075, 0.14, t, 'sfx', 3200);
    this.playFilteredNoise(0.018, 'bandpass', 1900, 2.2, 0.045, t, 'sfx');
  }

  public playDiceRattle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const base = ctx.currentTime;
    const offsets = [0, 0.062, 0.132, 0.195, 0.258];
    offsets.forEach((off, i) => {
      const pitch = 290 + (i % 3) * 75;
      this.playFilteredNoise(0.04, 'bandpass', 1250 + i * 160, 2.4, 0.09, base + off, 'sfx');
      this.playMarimbaNote(pitch, 0.048, 0.095, base + off, 'sfx', 2400);
    });
  }

  public playDiceLand(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playWarmVoice(145, 58, 0.12, 'sine', 0.22, t, 'sfx', 0.004, 480);
    this.playMarimbaNote(440, 0.085, 0.16, t, 'sfx', 2600);
    this.playMarimbaNote(587.33, 0.09, 0.12, t + 0.055, 'sfx', 3000);
    this.vibrate(14);
  }

  public playBoing(stepIndex = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const scale = [N.F4, N.G4, N.A4, N.C5, N.D5, N.F5, N.G5, N.A5];
    const freq = scale[stepIndex % scale.length];
    this.playWarmVoice(freq * 0.78, freq * 1.06, 0.11, 'sine', 0.17, t, 'sfx', 0.008, 2800);
    this.playMarimbaNote(freq, 0.11, 0.11, t, 'sfx', 2600);
    this.vibrate(8);
  }

  public playLadderClimb(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [N.F4, N.G4, N.A4, N.C5, N.D5, N.F5, N.A5];
    notes.forEach((f, i) => {
      this.playMarimbaNote(f, 0.18, 0.15, t + i * 0.075, 'sfx', 3600);
      if (i >= 4) {
        this.playWarmVoice(f * 2, f * 2, 0.22, 'sine', 0.06, t + i * 0.075, 'sfx', 0.008, 4800);
      }
    });
  }

  public playSnakeBite(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Playful cartoon bassoon/slide-whistle downward whoosh
    this.playWarmVoice(520, 145, 0.34, 'triangle', 0.18, t, 'sfx', 0.012, 1600);
    this.playWarmVoice(260, 78, 0.36, 'sine', 0.17, t + 0.02, 'sfx', 0.015, 720);
    this.playWarmVoice(125, 58, 0.16, 'sine', 0.2, t + 0.28, 'sfx', 0.005, 420);
    this.vibrate([35, 25, 60]);
  }

  public playChallengeSuccess(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const arp = [N.F5, N.A5, N.C6, N.G5, N.F6];
    arp.forEach((f, i) => {
      this.playMarimbaNote(f, i === arp.length - 1 ? 0.38 : 0.18, 0.17, t + i * 0.075, 'sfx', 4200);
      this.playWarmVoice(f, f, i === arp.length - 1 ? 0.42 : 0.16, 'sine', 0.1, t + i * 0.075, 'sfx', 0.01, 4500);
    });
  }

  public playChallengeFail(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Sympathetic soft muted woodwind cadence
    this.playWarmVoice(392.0, 349.23, 0.18, 'triangle', 0.16, t, 'sfx', 0.018, 1200);
    this.playWarmVoice(349.23, 293.66, 0.26, 'triangle', 0.15, t + 0.15, 'sfx', 0.018, 980);
    this.playWarmVoice(174.61, 146.83, 0.28, 'sine', 0.14, t + 0.15, 'sfx', 0.018, 650);
  }

  public playTimerTick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playMarimbaNote(1046.5, 0.045, 0.075, t, 'sfx', 2400);
  }

  public playBubblePop(pitchBoost = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 390 + (pitchBoost % 7) * 58;
    this.playWarmVoice(base, base * 1.95, 0.085, 'sine', 0.18, t, 'sfx', 0.005, 3600);
    this.playFilteredNoise(0.022, 'bandpass', base * 2.2, 2.5, 0.04, t, 'sfx');
    this.vibrate(8);
  }

  public playBeatCue(accent = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playMarimbaNote(accent ? N.D5 : N.A4, 0.075, accent ? 0.16 : 0.11, t, 'sfx', 2600);
    if (accent) {
      this.playFilteredNoise(0.03, 'bandpass', 1800, 2.0, 0.055, t, 'sfx');
    }
  }

  public playItemUse(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => {
      this.playWarmVoice(f, f * 1.01, 0.22, 'sine', 0.13, t + i * 0.052, 'sfx', 0.008, 4400);
    });
  }

  public playWheelTick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playFilteredNoise(0.02, 'bandpass', 2100, 3.2, 0.075, t, 'sfx');
  }

  public playShopBuy(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playMarimbaNote(N.F5, 0.14, 0.16, t, 'sfx', 3800);
    this.playMarimbaNote(N.C6, 0.24, 0.18, t + 0.075, 'sfx', 4400);
    this.playWarmVoice(N.F6, N.F6, 0.28, 'sine', 0.09, t + 0.14, 'sfx', 0.008, 4800);
    this.vibrate(14);
  }

  public playComboSpark(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [N.F5, N.A5, N.C6, N.E6].forEach((f, i) => {
      this.playMarimbaNote(f, 0.16, 0.14, t + i * 0.05, 'sfx', 4400);
    });
  }

  public playConfettiFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const fanfare = [N.F5, N.A5, N.C6, N.E6, N.F6];
    fanfare.forEach((f, i) => {
      this.playMarimbaNote(f, 0.42, 0.17, t + i * 0.085, 'sfx', 4800);
      this.playWarmVoice(f * 0.5, f * 0.5, 0.55, 'sine', 0.1, t + i * 0.085, 'sfx', 0.02, 2600);
    });
    this.vibrate([25, 25, 55]);
  }

  public playTurnReady(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playMarimbaNote(N.C5, 0.12, 0.13, t, 'sfx', 3600);
    this.playMarimbaNote(N.F5, 0.22, 0.16, t + 0.075, 'sfx', 4200);
    this.vibrate(12);
  }
}
