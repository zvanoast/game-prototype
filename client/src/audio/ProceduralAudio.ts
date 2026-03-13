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

  // ─── Per-weapon shoot/throw sounds ───────────────────────────────

  /** Records: vinyl whoosh, 0.08s */
  generateShoot_records(): AudioBuffer {
    return this.createBuffer(0.08, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 40) * 0.3;
        const whoosh = (Math.random() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 400 * t) * 0.5;
        data[i] = whoosh * env;
        if (i > 0) data[i] = data[i] * 0.4 + data[i - 1] * 0.6;
      }
    });
  }

  /** Box of Antiques: clatter, 0.1s */
  generateShoot_box_of_antiques(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 30) * 0.35;
        const clatter = (Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 600 * t) * 0.4;
        data[i] = clatter * env;
      }
    });
  }

  /** Knife Set: sharp flick, 0.05s */
  generateShoot_knife_set(): AudioBuffer {
    return this.createBuffer(0.05, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 80) * 0.4;
        data[i] = Math.sin(2 * Math.PI * 2500 * t) * env;
      }
    });
  }

  /** Rare Coins: metallic ping, 0.06s */
  generateShoot_rare_coins(): AudioBuffer {
    return this.createBuffer(0.06, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 50) * 0.3;
        const ping = Math.sin(2 * Math.PI * 3200 * t) + Math.sin(2 * Math.PI * 4800 * t) * 0.3;
        data[i] = ping * env;
      }
    });
  }

  /** Paint Cans: sloshy thunk, 0.1s */
  generateShoot_paint_cans(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 25) * 0.4;
        const thunk = Math.sin(2 * Math.PI * 200 * t) * 0.5;
        const slosh = (Math.random() * 2 - 1) * 0.5;
        data[i] = (thunk + slosh) * env;
        if (i > 0) data[i] = data[i] * 0.5 + data[i - 1] * 0.5;
      }
    });
  }

  /** Microwave: heavy crunch, 0.15s */
  generateShoot_microwave(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 15) * 0.5;
        const bass = Math.sin(2 * Math.PI * 80 * t) * 0.6;
        const crunch = (Math.random() * 2 - 1) * 0.4;
        data[i] = (bass + crunch) * env;
      }
    });
  }

  /** BB Gun: air pop, 0.04s */
  generateShoot_bb_gun(): AudioBuffer {
    return this.createBuffer(0.04, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 100) * 0.35;
        const pop = Math.sin(2 * Math.PI * 1800 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4;
        data[i] = pop * env;
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

  /** Oboe: reedy toot, 0.12s */
  generateMelee_oboe(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 20) * 0.3;
        const reed = Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 880 * t) * 0.4;
        data[i] = reed * env;
      }
    });
  }

  /** Signed Baseball Bat: wooden crack, 0.08s */
  generateMelee_signed_baseball_bat(): AudioBuffer {
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

  /** Ceremonial Sword: metallic ring, 0.15s */
  generateMelee_ceremonial_sword(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 15) * 0.35;
        const ring = Math.sin(2 * Math.PI * 1200 * t) + Math.sin(2 * Math.PI * 1800 * t) * 0.4;
        data[i] = ring * env;
      }
    });
  }

  /** Skis: whooshy swipe, 0.1s */
  generateMelee_skis(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.sin(Math.PI * t / 0.1) * 0.3;
        const noise = (Math.random() * 2 - 1);
        data[i] = noise * env;
        if (i > 0) data[i] = data[i] * 0.3 + data[i - 1] * 0.7;
      }
    });
  }

  /** Kayak: heavy thud, 0.12s */
  generateMelee_kayak(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 18) * 0.45;
        const bass = Math.sin(2 * Math.PI * 90 * t) * 0.6;
        const crack = (Math.random() * 2 - 1) * 0.4;
        data[i] = (bass + crack) * env;
      }
    });
  }

  /** Rusty Power Drill: buzzy grind, 0.1s */
  generateMelee_rusty_power_drill(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 25) * 0.35;
        const buzz = Math.sin(2 * Math.PI * 150 * t) * Math.sin(2 * Math.PI * 1800 * t);
        const noise = (Math.random() * 2 - 1) * 0.3;
        data[i] = (buzz + noise) * env;
      }
    });
  }

  /** Indian Rug: fabric flap, 0.15s */
  generateMelee_indian_rug(): AudioBuffer {
    return this.createBuffer(0.15, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.sin(Math.PI * t / 0.15) * 0.25;
        const noise = (Math.random() * 2 - 1);
        data[i] = noise * env;
        if (i > 0) data[i] = data[i] * 0.2 + data[i - 1] * 0.8;
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

  // ─── Vehicle sounds ─────────────────────────────────────────────────

  /** Vehicle mount: gear-shift clunk, 0.12s */
  generateVehicleMount(): AudioBuffer {
    return this.createBuffer(0.12, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 25) * 0.35;
        const clunk = Math.sin(2 * Math.PI * 180 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4;
        data[i] = clunk * env;
      }
    });
  }

  /** Vehicle dismount: softer release click, 0.08s */
  generateVehicleDismount(): AudioBuffer {
    return this.createBuffer(0.08, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 50) * 0.25;
        data[i] = Math.sin(2 * Math.PI * 300 * t) * env;
      }
    });
  }

  /** Vehicle destroyed: metallic crunch + descending tone, 0.3s */
  generateVehicleDestroyed(): AudioBuffer {
    return this.createBuffer(0.3, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const freq = 300 - 200 * (t / 0.3);
        const env = Math.exp(-t * 8) * 0.4;
        const crunch = (Math.random() * 2 - 1) * 0.5;
        const tone = Math.sin(2 * Math.PI * freq * t) * 0.5;
        data[i] = (crunch + tone) * env;
      }
    });
  }

  /** Vehicle hit (run over): heavy impact, 0.1s */
  generateVehicleHit(): AudioBuffer {
    return this.createBuffer(0.1, (buf) => {
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this.ctx.sampleRate;
        const env = Math.exp(-t * 30) * 0.45;
        const bass = Math.sin(2 * Math.PI * 100 * t) * 0.7;
        const noise = (Math.random() * 2 - 1) * 0.3;
        data[i] = (bass + noise) * env;
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
