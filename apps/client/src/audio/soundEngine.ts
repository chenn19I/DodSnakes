export class DoodleSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 0.7;
  private musicEnabled = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
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

  private startMusicLoop(): void {
    if (this.musicTimer) return;
    const melody = [392.0, 440.0, 523.25, 587.33, 659.25, 587.33, 523.25, 440.0];
    const bass = [196.0, 196.0, 220.0, 220.0, 261.63, 261.63, 196.0, 196.0];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.musicEnabled) return;
      const step = this.musicStep % melody.length;
      const note = melody[step];
      const bassNote = bass[step];
      this.playTone(note, note * 1.005, 0.24, 'sine', 0.045);
      if (step % 2 === 0) {
        this.playTone(bassNote, bassNote, 0.34, 'triangle', 0.035);
      }
      this.musicStep += 1;
    }, 460);
  }

  private stopMusicLoop(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
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

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.22,
    delaySec = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playUiClick(): void {
    this.playTone(540, 720, 0.06, 'sine', 0.14);
  }

  public playDiceRattle(): void {
    for (let i = 0; i < 4; i++) {
      this.playTone(220 + i * 55, 160 + i * 40, 0.055, 'square', 0.08, i * 0.065);
    }
  }

  public playDiceLand(): void {
    this.playTone(360, 580, 0.14, 'triangle', 0.22);
    this.vibrate(15);
  }

  public playBoing(stepIndex = 0): void {
    const base = 300 + (stepIndex % 6) * 35;
    this.playTone(base, base * 1.45, 0.12, 'sine', 0.2);
    this.vibrate(10);
  }

  public playLadderClimb(): void {
    const notes = [392, 440, 523, 659, 784];
    notes.forEach((n, i) => {
      this.playTone(n, n * 1.05, 0.12, 'triangle', 0.18, i * 0.09);
    });
  }

  public playSnakeBite(): void {
    this.playTone(420, 120, 0.35, 'sawtooth', 0.18);
    this.playTone(310, 95, 0.32, 'triangle', 0.16, 0.18);
    this.vibrate([45, 30, 70]);
  }

  public playChallengeSuccess(): void {
    this.playTone(523.25, 523.25, 0.1, 'triangle', 0.22, 0);
    this.playTone(659.25, 659.25, 0.1, 'triangle', 0.22, 0.09);
    this.playTone(783.99, 1046.5, 0.24, 'triangle', 0.26, 0.18);
  }

  public playChallengeFail(): void {
    this.playTone(330, 260, 0.16, 'triangle', 0.2, 0);
    this.playTone(250, 175, 0.24, 'sawtooth', 0.14, 0.14);
  }

  public playTimerTick(): void {
    this.playTone(880, 820, 0.04, 'sine', 0.08);
  }

  public playBubblePop(pitchBoost = 0): void {
    const start = 480 + (pitchBoost % 6) * 55;
    this.playTone(start, start * 1.6, 0.085, 'sine', 0.16);
    this.vibrate(8);
  }

  public playBeatCue(accent = false): void {
    this.playTone(accent ? 660 : 440, accent ? 580 : 390, 0.075, 'triangle', accent ? 0.16 : 0.11);
  }

  public playItemUse(): void {
    this.playTone(440, 660, 0.09, 'triangle', 0.16, 0);
    this.playTone(660, 880, 0.12, 'sine', 0.16, 0.08);
  }

  public playWheelTick(): void {
    this.playTone(920, 620, 0.025, 'triangle', 0.075);
  }

  public playShopBuy(): void {
    this.playTone(587.33, 659.25, 0.08, 'triangle', 0.16, 0);
    this.playTone(880, 1174.66, 0.16, 'sine', 0.18, 0.07);
    this.vibrate(14);
  }

  public playComboSpark(): void {
    [523.25, 659.25, 987.77].forEach((f, i) => {
      this.playTone(f, f * 1.06, 0.12, 'sine', 0.16, i * 0.055);
    });
  }

  public playConfettiFanfare(): void {
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    chord.forEach((f, i) => {
      this.playTone(f, f * 1.02, 0.28, 'triangle', 0.2, i * 0.08);
    });
    this.vibrate([30, 30, 60]);
  }
}
