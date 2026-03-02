/**
 * Procedural audio generation using Web Audio API oscillators and noise.
 * All methods return AudioBuffer objects that can be played via SoundManager.
 */
export class ProceduralAudio {
  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** High blip — 880Hz sine, exponential decay, 0.08s (generic fallback) */
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

  /** Swoosh — filtered noise with fade, 0.15s (generic fallback) */
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
        const whoosh = (Math.random() * 2 - 1) * Math.sin(Math.PI * t / 0.2) * 0.2;
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
        const freq = t < 0.1 ? 523.25 : 659.25;
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

  // ─── Per-weapon shoot sounds ──────────────────────────────────────

  /** Darts: high-pitched tick, 0.05s */
  generateShoot_darts(): AudioBuffer {
    return this.createBuffer(0.05, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 80) * 0.35;
        data[i] = Math.sin(2 * Math.PI * 2200 * t) * env;
      }
    });
  }

  /** Plates: ceramic whoosh, 0.12s */
  generateShoot_plates(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.sin(Math.PI * t / 0.12) * 0.3;
        const freq = 600 + 400 * Math.sin(t * 30);
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
        if (i > 0) data[i] = data[i] * 0.5 + data[i - 1] * 0.5;
      }
    });
  }

  /** Staple gun: metallic click, 0.04s */
  generateShoot_staple_gun(): AudioBuffer {
    return this.createBuffer(0.04, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 120) * 0.4;
        const click = Math.sin(2 * Math.PI * 3000 * t) * 0.5 + (Math.random() * 2 - 1) * 0.5;
        data[i] = click * env;
      }
    });
  }

  /** Vase: heavy thunk, 0.1s */
  generateShoot_vase(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 25) * 0.5;
        const bass = Math.sin(2 * Math.PI * 180 * t);
        const mid = Math.sin(2 * Math.PI * 450 * t) * 0.3;
        data[i] = (bass + mid) * env;
      }
    });
  }

  /** Rubber band gun: snap/twang, 0.06s */
  generateShoot_rubber_band_gun(): AudioBuffer {
    return this.createBuffer(0.06, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 60) * 0.35;
        const freq = 1200 - 800 * (t / 0.06); // descending twang
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    });
  }

  // ─── Per-weapon melee sounds ──────────────────────────────────────

  /** Fists: soft thud, 0.08s */
  generateMelee_fists(): AudioBuffer {
    return this.createBuffer(0.08, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 50) * 0.25;
        data[i] = (Math.sin(2 * Math.PI * 80 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4) * env;
      }
    });
  }

  /** Hammer: heavy metal clang, 0.12s */
  generateMelee_hammer(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 20) * 0.4;
        const clang = Math.sin(2 * Math.PI * 800 * t) + Math.sin(2 * Math.PI * 1200 * t) * 0.5;
        const bass = Math.sin(2 * Math.PI * 100 * t) * 0.5;
        data[i] = (clang + bass) * env;
      }
    });
  }

  /** Lamp: glass ring, 0.15s */
  generateMelee_lamp(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 15) * 0.3;
        const ring = Math.sin(2 * Math.PI * 2000 * t) + Math.sin(2 * Math.PI * 3000 * t) * 0.3;
        data[i] = ring * env;
      }
    });
  }

  /** Frying pan: pan clang, 0.1s */
  generateMelee_frying_pan(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 25) * 0.4;
        const clang = Math.sin(2 * Math.PI * 600 * t) + Math.sin(2 * Math.PI * 900 * t) * 0.6;
        data[i] = clang * env;
      }
    });
  }

  /** Baseball bat: wooden crack, 0.08s */
  generateMelee_baseball_bat(): AudioBuffer {
    return this.createBuffer(0.08, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 40) * 0.4;
        const crack = (Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 300 * t) * 0.4;
        data[i] = crack * env;
      }
    });
  }

  /** Golf club: metal whoosh, 0.12s */
  generateMelee_golf_club(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const whooshEnv = Math.sin(Math.PI * t / 0.12) * 0.2;
        const metalEnv = Math.exp(-t * 30) * 0.3;
        const whoosh = (Math.random() * 2 - 1) * whooshEnv;
        const metal = Math.sin(2 * Math.PI * 1500 * t) * metalEnv;
        data[i] = whoosh + metal;
        if (i > 0) data[i] = data[i] * 0.4 + data[i - 1] * 0.6;
      }
    });
  }

  // ─── Consumable sounds ────────────────────────────────────────────

  /** Consumable use: ascending chime, 0.15s */
  generateConsumableUse(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const freq = 400 + 600 * (t / 0.15); // ascending
        const env = Math.sin(Math.PI * t / 0.15) * 0.3;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
      }
    });
  }

  /** Shield hit: crackling pop, 0.08s */
  generateShieldHit(): AudioBuffer {
    return this.createBuffer(0.08, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 40) * 0.35;
        const pop = Math.sin(2 * Math.PI * 1800 * t) * 0.5 + (Math.random() * 2 - 1) * 0.5;
        data[i] = pop * env;
      }
    });
  }

  /** Buff expired: descending note, 0.1s */
  generateBuffExpired(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const freq = 600 - 300 * (t / 0.1);
        const env = Math.exp(-t * 20) * 0.25;
        data[i] = Math.sin(2 * Math.PI * freq * t) * env;
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
