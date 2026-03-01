/**
 * Procedural audio generation using Web Audio API oscillators and noise.
 * All methods return AudioBuffer objects that can be played via SoundManager.
 */
export class ProceduralAudio {
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** High blip — 880Hz sine, exponential decay, 0.08s */
  generateShoot(): AudioBuffer {
    return this.createBuffer(0.08, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 40);
        data[i] = Math.sin(2 * Math.PI * 880 * t) * env * 0.4;
      }
    });
  }

  /** Swoosh — filtered noise with fade, 0.15s */
  generateMeleeSwing(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.sin(Math.PI * t / 0.15) * 0.3;
        const noise = (Math.random() * 2 - 1);
        // Simple low-pass via averaging
        data[i] = noise * env;
        if (i > 0) data[i] = data[i] * 0.3 + data[i - 1] * 0.7;
      }
    });
  }

  /** Thud — 120Hz sine + noise burst, 0.1s */
  generateMeleeHit(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 30);
        const sine = Math.sin(2 * Math.PI * 120 * t) * 0.5;
        const noise = (Math.random() * 2 - 1) * 0.3;
        data[i] = (sine + noise) * env;
      }
    });
  }

  /** Big blip — 440→1200Hz sweep, 0.12s */
  generateChargedShot(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const freq = 440 + (1200 - 440) * (t / 0.12);
        const env = Math.exp(-t * 15) * 0.5;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    });
  }

  /** Whoosh — noise fade in/out, 0.2s */
  generateDash(): AudioBuffer {
    return this.createBuffer(0.2, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.sin(Math.PI * t / 0.2) * 0.25;
        data[i] = (Math.random() * 2 - 1) * env;
        if (i > 0) data[i] = data[i] * 0.4 + data[i - 1] * 0.6;
      }
    });
  }

  /** Whoosh + thud combined, 0.2s */
  generateDashStrike(): AudioBuffer {
    return this.createBuffer(0.2, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        // Whoosh in first half
        const whoosh = (Math.random() * 2 - 1) * Math.sin(Math.PI * t / 0.2) * 0.2;
        // Thud in second half
        const thudEnv = t > 0.1 ? Math.exp(-(t - 0.1) * 30) : 0;
        const thud = Math.sin(2 * Math.PI * 100 * t) * thudEnv * 0.4;
        data[i] = whoosh + thud;
      }
    });
  }

  /** Crunch — low noise burst, 0.06s */
  generateImpact(): AudioBuffer {
    return this.createBuffer(0.06, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 60) * 0.4;
        data[i] = (Math.random() * 2 - 1) * env;
      }
    });
  }

  /** Descending tone — 400→100Hz sine, 0.4s */
  generateDeath(): AudioBuffer {
    return this.createBuffer(0.4, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const freq = 400 - 300 * (t / 0.4);
        const env = Math.exp(-t * 4) * 0.4;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    });
  }

  /** Quick noise tick, 0.05s */
  generateDamage(): AudioBuffer {
    return this.createBuffer(0.05, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 80) * 0.3;
        data[i] = (Math.random() * 2 - 1) * env;
      }
    });
  }

  /** Chime — C5→E5 two-tone, 0.2s */
  generatePickup(): AudioBuffer {
    return this.createBuffer(0.2, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const freq = t < 0.1 ? 523.25 : 659.25; // C5 → E5
        const env = Math.exp(-t * 10) * 0.3;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    });
  }

  /** Click — 80Hz saw + noise spike, 0.15s */
  generateLockerOpen(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 30) * 0.35;
        // Sawtooth at 80Hz
        const saw = ((t * 80) % 1) * 2 - 1;
        const noise = (Math.random() * 2 - 1) * 0.5;
        data[i] = (saw * 0.6 + noise * 0.4) * env;
      }
    });
  }

  /** Beep — 660Hz square wave, 0.1s */
  generateCountdownBeep(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 15) * 0.3;
        const sq = Math.sign(Math.sin(2 * Math.PI * 660 * t));
        data[i] = sq * env;
      }
    });
  }

  /** Fanfare — C4+E4+G4 chord, 0.3s */
  generateMatchStart(): AudioBuffer {
    return this.createBuffer(0.3, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 6) * 0.2;
        const c4 = Math.sin(2 * Math.PI * 261.63 * t);
        const e4 = Math.sin(2 * Math.PI * 329.63 * t);
        const g4 = Math.sin(2 * Math.PI * 392.0 * t);
        data[i] = (c4 + e4 + g4) * env;
      }
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private createBuffer(
    duration: number,
    fill: (buf: AudioBuffer) => void
  ): AudioBuffer {
    const length = Math.ceil(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    fill(buf);
    return buf;
  }
}
