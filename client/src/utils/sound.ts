const MUTE_KEY = 'drawsomething_muted';

class SoundEffects {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private lastPlayedAt = 0;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(value: boolean): void {
    this.muted = value;
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.14,
    delay = 0,
    endFreq?: number
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    this.lastPlayedAt = Date.now();

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFreq),
        now + duration
      );
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playButtonClick(): void {
    this.tone(520, 0.045, 'triangle', 0.09, 0, 680);
  }

  public playFallbackClick(): void {
    if (Date.now() - this.lastPlayedAt <= 80) return;
    this.playButtonClick();
  }

  public playOptionSelect(): void {
    this.tone(480, 0.055, 'sine', 0.09, 0, 640);
    this.tone(960, 0.045, 'sine', 0.035, 0.005, 1180);
  }

  public playConfirm(): void {
    this.tone(587.33, 0.07, 'triangle', 0.11, 0);
    this.tone(880, 0.11, 'triangle', 0.12, 0.055);
  }

  public playBack(): void {
    this.tone(420, 0.055, 'triangle', 0.09, 0, 300);
  }

  public playCopy(): void {
    this.tone(783.99, 0.06, 'sine', 0.09, 0);
    this.tone(1046.5, 0.09, 'sine', 0.1, 0.05);
  }

  public playToggle(on: boolean): void {
    if (on) {
      this.tone(440, 0.06, 'triangle', 0.09, 0, 660);
    } else {
      this.tone(560, 0.06, 'triangle', 0.08, 0, 340);
    }
  }

  public playUndo(): void {
    this.tone(520, 0.065, 'triangle', 0.09, 0, 340);
  }

  public playRedo(): void {
    this.tone(360, 0.065, 'triangle', 0.09, 0, 560);
  }

  public playClear(): void {
    this.tone(620, 0.05, 'triangle', 0.09, 0, 460);
    this.tone(460, 0.05, 'triangle', 0.09, 0.04, 320);
    this.tone(320, 0.08, 'triangle', 0.08, 0.08, 190);
  }

  public playReroll(): void {
    this.tone(440, 0.06, 'triangle', 0.1, 0);
    this.tone(554.37, 0.06, 'triangle', 0.1, 0.05);
    this.tone(659.25, 0.09, 'triangle', 0.11, 0.1);
  }

  public playGiveUp(): void {
    this.tone(340, 0.12, 'triangle', 0.1, 0, 260);
    this.tone(240, 0.18, 'triangle', 0.1, 0.1, 165);
  }

  public playError(): void {
    this.tone(220, 0.09, 'triangle', 0.1, 0, 165);
  }

  public playTileClick(): void {
    this.tone(560, 0.06, 'triangle', 0.12, 0, 740);
  }

  public playTileRemove(): void {
    this.tone(420, 0.06, 'triangle', 0.1, 0, 290);
  }

  public playWrongGuess(): void {
    this.tone(210, 0.14, 'sawtooth', 0.1, 0, 145);
    this.tone(160, 0.18, 'sawtooth', 0.1, 0.11, 110);
  }

  public playCorrectGuess(): void {
    this.tone(523.25, 0.11, 'triangle', 0.16, 0);
    this.tone(659.25, 0.11, 'triangle', 0.16, 0.08);
    this.tone(783.99, 0.13, 'triangle', 0.16, 0.16);
    this.tone(1046.5, 0.28, 'triangle', 0.18, 0.25);
  }

  public playBomb(): void {
    this.tone(240, 0.28, 'sawtooth', 0.18, 0, 52);
    this.tone(120, 0.34, 'square', 0.11, 0.04, 38);
  }

  public playTick(): void {
    this.tone(880, 0.04, 'sine', 0.06);
  }

  public playTurnStart(): void {
    this.tone(440, 0.09, 'sine', 0.12, 0);
    this.tone(587.33, 0.14, 'sine', 0.14, 0.09);
  }

  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5];
    notes.forEach((n, i) => {
      this.tone(
        n,
        i === notes.length - 1 ? 0.36 : 0.12,
        'triangle',
        0.16,
        i * 0.1
      );
    });
  }
}

export const soundFX = new SoundEffects();
