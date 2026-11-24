export type MusicTrack = 'menu' | 'game' | null;

const MUSIC_ENABLED_KEY = 'drawsomething_music_enabled';
const MUSIC_VOLUME_KEY = 'drawsomething_music_volume';
const DEFAULT_VOLUME = 0.55;
const STEPS_PER_BAR = 8;
const TOTAL_STEPS = 64;

interface BarHarmony {
  chord: number[];
  bassRoot: number;
  bassFifth: number;
}

interface TrackArrangement {
  bpm: number;
  urgentBpm?: number;
  bars: BarHarmony[];
  melody: Array<number | null>;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Warm arcade-chill loop in C major (8 bars x 8 eighth-notes)
const MENU_TRACK: TrackArrangement = {
  bpm: 108,
  bars: [
    { chord: [60, 64, 67, 71], bassRoot: 48, bassFifth: 55 }, // Cmaj7
    { chord: [60, 64, 67, 69], bassRoot: 45, bassFifth: 52 }, // Am7
    { chord: [62, 65, 69, 72], bassRoot: 50, bassFifth: 57 }, // Dm7
    { chord: [59, 62, 65, 67], bassRoot: 43, bassFifth: 55 }, // G7
    { chord: [60, 64, 65, 69], bassRoot: 41, bassFifth: 48 }, // Fmaj7
    { chord: [59, 62, 64, 67], bassRoot: 40, bassFifth: 47 }, // Em7
    { chord: [62, 65, 69, 72], bassRoot: 50, bassFifth: 57 }, // Dm7
    { chord: [59, 62, 65, 67], bassRoot: 43, bassFifth: 50 }, // G7
  ],
  melody: [
    // Bar 1 (Cmaj7)
    76, null, 79, 76, 72, null, 74, null,
    // Bar 2 (Am7)
    76, null, 72, null, 69, null, 72, 74,
    // Bar 3 (Dm7)
    77, null, 76, 74, 72, null, 69, null,
    // Bar 4 (G7)
    74, null, 71, 67, 71, null, 74, null,
    // Bar 5 (Fmaj7)
    76, 77, 79, null, 77, 76, 72, null,
    // Bar 6 (Em7)
    76, null, 74, 72, 71, null, 67, null,
    // Bar 7 (Dm7)
    69, 72, 74, null, 76, null, 74, 72,
    // Bar 8 (G7)
    74, null, 79, null, 74, null, 71, null,
  ],
};

// Upbeat playful loop in G major (8 bars x 8 eighth-notes)
const GAME_TRACK: TrackArrangement = {
  bpm: 124,
  urgentBpm: 138,
  bars: [
    { chord: [67, 71, 74], bassRoot: 43, bassFifth: 50 }, // G
    { chord: [66, 69, 74], bassRoot: 50, bassFifth: 57 }, // D
    { chord: [64, 67, 71], bassRoot: 40, bassFifth: 47 }, // Em
    { chord: [60, 64, 67], bassRoot: 48, bassFifth: 55 }, // C
    { chord: [67, 71, 74], bassRoot: 43, bassFifth: 50 }, // G
    { chord: [66, 69, 74], bassRoot: 50, bassFifth: 57 }, // D
    { chord: [60, 64, 67], bassRoot: 48, bassFifth: 55 }, // C
    { chord: [66, 69, 74], bassRoot: 50, bassFifth: 57 }, // D
  ],
  melody: [
    // Bar 1 (G)
    79, null, 74, 76, 79, null, 83, null,
    // Bar 2 (D)
    81, null, 78, 74, 78, null, 81, null,
    // Bar 3 (Em)
    79, 78, 76, null, 74, 76, 79, null,
    // Bar 4 (C)
    76, null, 72, 76, 79, null, 76, null,
    // Bar 5 (G)
    79, null, 83, 81, 79, null, 74, null,
    // Bar 6 (D)
    78, 81, 86, null, 81, null, 78, null,
    // Bar 7 (C)
    76, null, 79, 83, 84, null, 79, null,
    // Bar 8 (D)
    81, null, 78, 74, 76, 78, 81, null,
  ],
};

class BackgroundMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabled: boolean;
  private volume: number;
  private currentTrack: MusicTrack = null;
  private urgent = false;

  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private fadeTimerId: ReturnType<typeof setTimeout> | null = null;
  private stepIndex = 0;
  private nextNoteTime = 0;
  private hidden = false;
  private gestureHooked = false;
  private waitingGesture = false;
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.enabled = localStorage.getItem(MUSIC_ENABLED_KEY) !== '0';
      const rawVol = Number(localStorage.getItem(MUSIC_VOLUME_KEY));
      this.volume = Number.isFinite(rawVol)
        ? Math.min(1, Math.max(0, rawVol))
        : DEFAULT_VOLUME;

      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    } else {
      this.enabled = true;
      this.volume = DEFAULT_VOLUME;
    }
  }

  private emitChange(): void {
    for (const fn of this.listeners) {
      fn();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getVolume(): number {
    return this.volume;
  }

  public isWaitingGesture(): boolean {
    return this.waitingGesture;
  }

  public isPlaying(): boolean {
    return (
      this.enabled &&
      this.currentTrack !== null &&
      this.schedulerId !== null &&
      !this.hidden &&
      this.ctx?.state === 'running'
    );
  }

  private effectiveGain(): number {
    // Keep background music comfortable underneath UI and SFX
    return Math.max(0.0001, this.volume * 0.34);
  }

  private ensureGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setValueAtTime(3200, this.ctx.currentTime);
      this.filterNode.Q.setValueAtTime(0.6, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.filterNode.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private hookUserGesture(): void {
    if (this.gestureHooked || typeof window === 'undefined') return;
    this.gestureHooked = true;
    this.waitingGesture = true;

    const resumeOnGesture = () => {
      this.removeGestureHook();
      this.unlock();
    };

    window.addEventListener('pointerdown', resumeOnGesture, {
      capture: true,
      once: true,
    });
    window.addEventListener('keydown', resumeOnGesture, {
      capture: true,
      once: true,
    });
    this.emitChange();
  }

  private removeGestureHook(): void {
    this.gestureHooked = false;
    this.waitingGesture = false;
  }

  private handleVisibilityChange = (): void => {
    this.hidden = document.hidden;
    if (this.hidden) {
      this.pausePlayback();
    } else if (this.enabled && this.currentTrack) {
      this.startPlayback(true);
    }
    this.emitChange();
  };

  public unlock(): void {
    if (!this.enabled || !this.currentTrack) return;
    const ctx = this.ensureGraph();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          this.waitingGesture = false;
          if (this.enabled && this.currentTrack && !this.hidden) {
            this.startPlayback(true);
          }
          this.emitChange();
        })
        .catch(() => {
          this.hookUserGesture();
        });
    } else {
      this.waitingGesture = false;
      if (!this.hidden) {
        this.startPlayback(true);
      }
      this.emitChange();
    }
  }

  public setEnabled(value: boolean): void {
    this.enabled = value;
    if (typeof window !== 'undefined') {
      localStorage.setItem(MUSIC_ENABLED_KEY, value ? '1' : '0');
    }

    if (!value) {
      this.pausePlayback();
      this.waitingGesture = false;
    } else if (this.currentTrack && !this.hidden) {
      this.unlock();
    }
    this.emitChange();
  }

  public setVolume(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    this.volume = clamped;
    if (typeof window !== 'undefined') {
      localStorage.setItem(MUSIC_VOLUME_KEY, String(clamped));
    }

    if (this.ctx && this.masterGain && this.enabled && this.schedulerId) {
      this.masterGain.gain.setTargetAtTime(
        this.effectiveGain(),
        this.ctx.currentTime,
        0.04
      );
    }
    this.emitChange();
  }

  public setUrgent(urgent: boolean): void {
    this.urgent = urgent;
  }

  public setTrack(track: MusicTrack): void {
    if (track === this.currentTrack) return;

    if (this.fadeTimerId) {
      clearTimeout(this.fadeTimerId);
      this.fadeTimerId = null;
    }

    if (track === null) {
      this.currentTrack = null;
      this.pausePlayback();
      this.emitChange();
      return;
    }

    const wasPlaying = this.schedulerId !== null && this.ctx?.state === 'running';
    if (wasPlaying && this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(
        Math.max(0.0001, this.masterGain.gain.value),
        now
      );
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      this.fadeTimerId = setTimeout(() => {
        this.fadeTimerId = null;
        this.currentTrack = track;
        this.stepIndex = 0;
        if (this.enabled && !this.hidden) {
          this.startPlayback(true);
        }
        this.emitChange();
      }, 150);
    } else {
      this.currentTrack = track;
      this.stepIndex = 0;
      if (this.enabled && !this.hidden) {
        this.startPlayback(true);
      }
      this.emitChange();
    }
  }

  public stop(): void {
    if (this.fadeTimerId) {
      clearTimeout(this.fadeTimerId);
      this.fadeTimerId = null;
    }
    this.currentTrack = null;
    this.urgent = false;
    this.pausePlayback();
    this.emitChange();
  }

  private startPlayback(fadeIn: boolean): void {
    if (!this.enabled || !this.currentTrack || this.hidden) return;
    const ctx = this.ensureGraph();
    if (!ctx || !this.masterGain) return;

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running' && this.enabled && this.currentTrack) {
            this.waitingGesture = false;
            this.beginScheduler(fadeIn);
            this.emitChange();
          }
        })
        .catch(() => {
          this.hookUserGesture();
        });

      // Browsers keep ctx suspended synchronously outside a gesture handler
      if (ctx.state === 'suspended') {
        this.hookUserGesture();
        return;
      }
    }

    this.beginScheduler(fadeIn);
  }

  private beginScheduler(fadeIn: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.schedulerId) return;

    const now = this.ctx.currentTime;
    this.nextNoteTime = now + 0.04;
    this.masterGain.gain.cancelScheduledValues(now);
    if (fadeIn) {
      this.masterGain.gain.setValueAtTime(0.0001, now);
      this.masterGain.gain.exponentialRampToValueAtTime(
        this.effectiveGain(),
        now + 0.25
      );
    } else {
      this.masterGain.gain.setValueAtTime(this.effectiveGain(), now);
    }

    this.schedulerId = setInterval(() => this.tick(), 35);
    this.emitChange();
  }

  private pausePlayback(): void {
    if (this.schedulerId) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.04);
    }
  }

  private tick(): void {
    if (!this.ctx || !this.enabled || !this.currentTrack || this.hidden) return;
    if (this.ctx.state !== 'running') return;

    const arrangement =
      this.currentTrack === 'menu' ? MENU_TRACK : GAME_TRACK;
    const bpm =
      this.currentTrack === 'game' && this.urgent && arrangement.urgentBpm
        ? arrangement.urgentBpm
        : arrangement.bpm;
    const stepDur = 60 / bpm / 2; // Eighth-note duration

    // Recover gracefully if browser throttled timers
    if (this.nextNoteTime < this.ctx.currentTime - 0.5) {
      this.nextNoteTime = this.ctx.currentTime + 0.04;
    }

    const lookAhead = 0.12;
    while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
      this.scheduleStep(arrangement, this.stepIndex, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.stepIndex = (this.stepIndex + 1) % TOTAL_STEPS;
    }
  }

  private scheduleStep(
    arrangement: TrackArrangement,
    step: number,
    time: number,
    stepDur: number
  ): void {
    const barIdx = Math.floor(step / STEPS_PER_BAR);
    const stepInBar = step % STEPS_PER_BAR;
    const harmony = arrangement.bars[barIdx];
    const isGame = this.currentTrack === 'game';

    // 1. Soft chord pad on bar downbeat (and gentle bounce on beat 3 in game track)
    if (stepInBar === 0) {
      this.playChord(
        harmony.chord,
        time,
        isGame ? stepDur * 3.6 : stepDur * 7.2,
        isGame ? 0.07 : 0.085
      );
    } else if (isGame && stepInBar === 4) {
      this.playChord(harmony.chord, time, stepDur * 2.8, 0.055);
    }

    // 2. Bassline
    if (stepInBar === 0 || stepInBar === 4) {
      this.playBass(harmony.bassRoot, time, stepDur * 1.4, isGame ? 0.22 : 0.17);
    } else if (stepInBar === 3 || stepInBar === 6) {
      this.playBass(
        harmony.bassFifth,
        time,
        stepDur * 0.9,
        isGame ? 0.16 : 0.11
      );
    }

    // 3. Lead melody (marimba / arcade pluck)
    const melodyMidi = arrangement.melody[step];
    if (melodyMidi !== null) {
      this.playLead(melodyMidi, time, stepDur * 1.35, isGame ? 0.2 : 0.18);
    }

    // 4. Light percussion
    if (stepInBar === 0 || stepInBar === 4) {
      this.playKick(time, isGame ? 0.2 : 0.13);
    }
    if (stepInBar % 2 === 1) {
      this.playShaker(time, isGame ? 0.045 : 0.028);
    }
    if (isGame && (stepInBar === 2 || stepInBar === 6)) {
      this.playWoodblock(time, 0.05);
    }
  }

  private playLead(
    midi: number,
    time: number,
    duration: number,
    volume: number
  ): void {
    if (!this.ctx || !this.filterNode) return;
    const freq = midiToFreq(midi);

    const osc = this.ctx.createOscillator();
    const harmonic = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(freq * 2, time);

    const harmonicGain = this.ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.18, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    harmonic.start(time);
    osc.stop(time + duration + 0.02);
    harmonic.stop(time + duration + 0.02);
  }

  private playChord(
    notes: number[],
    time: number,
    duration: number,
    volumePerVoice: number
  ): void {
    if (!this.ctx || !this.filterNode) return;

    for (const midi of notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(midiToFreq(midi), time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(volumePerVoice, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      gain.connect(this.filterNode);
      osc.start(time);
      osc.stop(time + duration + 0.02);
    }
  }

  private playBass(
    midi: number,
    time: number,
    duration: number,
    volume: number
  ): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  private playKick(time: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private playShaker(time: number, volume: number): void {
    if (!this.ctx || !this.filterNode || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(4800, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.filterNode);
    src.start(time);
    src.stop(time + 0.05);
  }

  private playWoodblock(time: number, volume: number): void {
    if (!this.ctx || !this.filterNode) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, time);
    osc.frequency.exponentialRampToValueAtTime(640, time + 0.04);

    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}

export const musicEngine = new BackgroundMusicEngine();
