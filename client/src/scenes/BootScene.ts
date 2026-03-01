import Phaser from "phaser";
import { TILE_SIZE, PLAYER_RADIUS } from "shared";
import { WAREHOUSE_THEME } from "shared";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    this.generateTileset();
    this.generatePlayerSheet();
    this.generateProjectileTextures();
    this.generateLockerTextures();
    this.generatePickupTextures();
    this.generateDummyTexture();
    this.generateMiscTextures();
    this.registerAnimations();

    console.log("BootScene: all assets generated");
    this.scene.start("MenuScene");
  }

  // ─── Tileset (6 tiles) ──────────────────────────────────────────────

  private generateTileset() {
    const T = TILE_SIZE;
    const theme = WAREHOUSE_THEME;
    const tsGfx = this.add.graphics();

    // Index 0: Floor — dark concrete with subtle grid lines
    tsGfx.fillStyle(theme.floorColor, 1);
    tsGfx.fillRect(0, 0, T, T);
    tsGfx.lineStyle(1, 0x333355, 0.2);
    tsGfx.strokeRect(0, 0, T, T);

    // Index 1: Wall — storage unit, beveled
    tsGfx.fillStyle(theme.wallColor, 1);
    tsGfx.fillRect(T, 0, T, T);
    tsGfx.lineStyle(1, theme.wallHighlight, 0.6);
    tsGfx.strokeRect(T, 0, T, T);
    tsGfx.lineStyle(1, theme.wallShadow, 0.5);
    tsGfx.strokeRect(T + 2, 2, T - 4, T - 4);

    // Index 2: Wall-top — lighter shade for depth (south-facing wall)
    tsGfx.fillStyle(theme.wallHighlight, 1);
    tsGfx.fillRect(T * 2, 0, T, T);
    tsGfx.lineStyle(1, theme.wallColor, 0.4);
    tsGfx.strokeRect(T * 2, 0, T, T);

    // Index 3: Floor accent — slightly lighter concrete for variety
    tsGfx.fillStyle(theme.floorAccentColor, 1);
    tsGfx.fillRect(T * 3, 0, T, T);
    tsGfx.lineStyle(1, 0x3a3a50, 0.15);
    tsGfx.strokeRect(T * 3, 0, T, T);

    // Index 4: Wall edge horizontal — top/bottom facing walls
    tsGfx.fillStyle(theme.wallColor, 1);
    tsGfx.fillRect(T * 4, 0, T, T);
    // Highlight on top edge
    tsGfx.fillStyle(theme.wallHighlight, 0.7);
    tsGfx.fillRect(T * 4, 0, T, 3);
    // Shadow on bottom edge
    tsGfx.fillStyle(theme.wallShadow, 0.7);
    tsGfx.fillRect(T * 4, T - 3, T, 3);

    // Index 5: Wall edge vertical — left/right facing walls
    tsGfx.fillStyle(theme.wallColor, 1);
    tsGfx.fillRect(T * 5, 0, T, T);
    // Highlight on left edge
    tsGfx.fillStyle(theme.wallHighlight, 0.7);
    tsGfx.fillRect(T * 5, 0, 3, T);
    // Shadow on right edge
    tsGfx.fillStyle(theme.wallShadow, 0.7);
    tsGfx.fillRect(T * 5 + T - 3, 0, 3, T);

    tsGfx.generateTexture("tileset", T * 6, T);
    tsGfx.destroy();
  }

  // ─── Player spritesheet (11 frames × 32px) ─────────────────────────

  private generatePlayerSheet() {
    const size = PLAYER_RADIUS * 2; // 32
    const frameCount = 11;
    const canvas = document.createElement("canvas");
    canvas.width = size * frameCount;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    for (let f = 0; f < frameCount; f++) {
      const ox = f * size;
      const cx = ox + size / 2;
      const cy = size / 2;

      if (f <= 1) {
        // Idle frames (0-1): subtle body bob
        const bob = f === 0 ? 0 : -1;
        this.drawPlayerFrame(ctx, cx, cy + bob, size);
      } else if (f <= 5) {
        // Walk frames (2-5): leg alternation + sway
        const swayMap = [0, 1, 0, -1];
        const sway = swayMap[f - 2];
        const legPhase = f - 2; // 0,1,2,3
        this.drawPlayerFrame(ctx, cx + sway, cy, size, legPhase);
      } else if (f <= 7) {
        // Attack frames (6-7): arm extended
        this.drawPlayerFrame(ctx, cx, cy, size, -1, true, f - 6);
      } else {
        // Death frames (8-10): collapse/shrink
        const deathPhase = f - 8; // 0,1,2
        this.drawPlayerFrame(ctx, cx, cy, size, -1, false, 0, deathPhase);
      }
    }

    // Use Phaser's createCanvas for a synchronous texture, then add frames manually
    const canvasTex = this.textures.createCanvas("player_sheet", canvas.width, canvas.height);
    if (canvasTex) {
      const destCtx = canvasTex.getContext();
      destCtx.drawImage(canvas, 0, 0);
      canvasTex.refresh();
      // Manually add frames (sourceIndex 0 = the single canvas source)
      for (let f = 0; f < frameCount; f++) {
        canvasTex.add(f, 0, f * size, 0, size, size);
      }
    }
  }

  private drawPlayerFrame(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    walkPhase = -1,
    attacking = false,
    attackFrame = 0,
    deathPhase = -1
  ) {
    const r = PLAYER_RADIUS;

    // Death collapse
    if (deathPhase >= 0) {
      const scale = 1 - deathPhase * 0.25;
      const alpha = 1 - deathPhase * 0.3;
      ctx.globalAlpha = alpha;

      // Flat body
      ctx.fillStyle = "#cccccc";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * scale * 0.8, r * scale * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head
      ctx.fillStyle = "#dddddd";
      ctx.beginPath();
      ctx.arc(cx + 4 * scale, cy, 5 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      return;
    }

    // Body (rectangular torso)
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(cx - 6, cy - 7, 12, 14);

    // Head (oval, slightly ahead of body)
    ctx.fillStyle = "#dddddd";
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy - 3, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (two nubs at bottom)
    if (walkPhase >= 0) {
      const legOffsets = [
        [-3, 3],   // phase 0: legs together-ish
        [-5, 5],   // phase 1: legs apart
        [-3, 3],   // phase 2: together
        [-1, 1],   // phase 3: crossed
      ];
      const [l, rr] = legOffsets[walkPhase % 4];
      ctx.fillStyle = "#aaaaaa";
      ctx.fillRect(cx + l - 2, cy + 7, 4, 5);
      ctx.fillRect(cx + rr - 2, cy + 7, 4, 5);
    } else {
      // Idle/attack legs
      ctx.fillStyle = "#aaaaaa";
      ctx.fillRect(cx - 5, cy + 7, 4, 4);
      ctx.fillRect(cx + 1, cy + 7, 4, 4);
    }

    // Arms
    if (attacking) {
      // Extended arm forward (pointing right)
      const extend = attackFrame === 0 ? 10 : 14;
      ctx.fillStyle = "#bbbbbb";
      ctx.fillRect(cx + 4, cy - 3, extend, 4);
      // Back arm
      ctx.fillRect(cx - 8, cy + 1, 6, 4);
    } else {
      // Normal arm nubs
      ctx.fillStyle = "#bbbbbb";
      ctx.fillRect(cx - 9, cy - 2, 5, 4);
      ctx.fillRect(cx + 4, cy - 2, 5, 4);
    }

    // Direction indicator (small triangle pointing right)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(cx + r - 2, cy);
    ctx.lineTo(cx + r - 8, cy - 4);
    ctx.lineTo(cx + r - 8, cy + 4);
    ctx.closePath();
    ctx.fill();
  }

  // ─── Projectile textures ────────────────────────────────────────────

  private generateProjectileTextures() {
    // Default yellow circle (4x4)
    const defaultGfx = this.add.graphics();
    defaultGfx.fillStyle(0xffff00, 1);
    defaultGfx.fillCircle(2, 2, 2);
    defaultGfx.generateTexture("projectile", 4, 4);
    defaultGfx.generateTexture("proj_default", 4, 4);
    defaultGfx.destroy();

    // Darts: thin red needle (4x6)
    const dartGfx = this.add.graphics();
    dartGfx.fillStyle(0xff4444, 1);
    dartGfx.fillRect(1, 0, 2, 6);
    dartGfx.fillStyle(0xff6666, 1);
    dartGfx.fillRect(0, 0, 4, 2);
    dartGfx.generateTexture("proj_darts", 4, 6);
    dartGfx.destroy();

    // Plates: white disc (10x10)
    const plateGfx = this.add.graphics();
    plateGfx.fillStyle(0xeeeeff, 1);
    plateGfx.fillCircle(5, 5, 5);
    plateGfx.lineStyle(1, 0xccccdd, 0.6);
    plateGfx.strokeCircle(5, 5, 3);
    plateGfx.generateTexture("proj_plates", 10, 10);
    plateGfx.destroy();

    // Staple gun: orange rect (3x3)
    const stapleGfx = this.add.graphics();
    stapleGfx.fillStyle(0xff8800, 1);
    stapleGfx.fillRect(0, 0, 3, 3);
    stapleGfx.generateTexture("proj_staple_gun", 3, 3);
    stapleGfx.destroy();

    // Charged shot: orange glow (8x8)
    const chargedGfx = this.add.graphics();
    chargedGfx.fillStyle(0xff8800, 0.4);
    chargedGfx.fillCircle(4, 4, 4);
    chargedGfx.fillStyle(0xffaa00, 1);
    chargedGfx.fillCircle(4, 4, 2.5);
    chargedGfx.generateTexture("proj_charged", 8, 8);
    chargedGfx.destroy();
  }

  // ─── Locker textures ────────────────────────────────────────────────

  private generateLockerTextures() {
    const T = TILE_SIZE;

    // Locker closed: metal gray with handle and padlock detail
    const closedGfx = this.add.graphics();
    // Base
    closedGfx.fillStyle(0x556677, 1);
    closedGfx.fillRect(0, 0, T, T);
    // Top highlight
    closedGfx.fillStyle(0x778899, 1);
    closedGfx.fillRect(0, 0, T, 3);
    // Border
    closedGfx.lineStyle(1, 0x44556b, 1);
    closedGfx.strokeRect(0, 0, T, T);
    // Door line (vertical center)
    closedGfx.lineStyle(1, 0x44556b, 0.6);
    closedGfx.lineBetween(T / 2, 2, T / 2, T - 2);
    // Handle (small rect)
    closedGfx.fillStyle(0xcccccc, 1);
    closedGfx.fillRect(T / 2 + 2, T / 2 - 3, 4, 6);
    // Padlock detail
    closedGfx.fillStyle(0xddaa33, 1);
    closedGfx.fillRect(T / 2 - 1, T / 2 + 5, 4, 4);
    closedGfx.generateTexture("locker_closed", T, T);
    closedGfx.destroy();

    // Locker open: dark interior with hinge detail
    const openGfx = this.add.graphics();
    // Dark interior
    openGfx.fillStyle(0x1a1a2e, 1);
    openGfx.fillRect(0, 0, T, T);
    // Door ajar on right side
    openGfx.fillStyle(0x445566, 0.6);
    openGfx.fillRect(T - 6, 0, 6, T);
    // Border
    openGfx.lineStyle(1, 0x333344, 1);
    openGfx.strokeRect(0, 0, T, T);
    // Hinges
    openGfx.fillStyle(0x888888, 1);
    openGfx.fillRect(T - 4, 4, 3, 3);
    openGfx.fillRect(T - 4, T - 7, 3, 3);
    openGfx.generateTexture("locker_open", T, T);
    openGfx.destroy();
  }

  // ─── Pickup textures (per-weapon silhouettes) ───────────────────────

  private generatePickupTextures() {
    // Generic pickup (white circle, still used as fallback)
    const pickupGfx = this.add.graphics();
    pickupGfx.fillStyle(0xffffff, 1);
    pickupGfx.fillCircle(8, 8, 6);
    pickupGfx.lineStyle(1, 0xffffff, 0.5);
    pickupGfx.strokeCircle(8, 8, 7);
    pickupGfx.generateTexture("pickup", 16, 16);
    pickupGfx.destroy();

    // Hammer silhouette
    const hammerGfx = this.add.graphics();
    hammerGfx.fillStyle(0xffffff, 1);
    hammerGfx.fillRect(6, 3, 4, 10); // handle
    hammerGfx.fillRect(2, 1, 12, 4);  // head
    hammerGfx.generateTexture("pickup_hammer", 16, 16);
    hammerGfx.destroy();

    // Lamp silhouette
    const lampGfx = this.add.graphics();
    lampGfx.fillStyle(0xffffff, 1);
    lampGfx.fillRect(7, 4, 2, 9); // pole
    lampGfx.fillTriangle(3, 2, 13, 2, 8, 6); // shade (triangle)
    lampGfx.fillRect(5, 13, 6, 2); // base
    lampGfx.generateTexture("pickup_lamp", 16, 16);
    lampGfx.destroy();

    // Frying pan silhouette
    const panGfx = this.add.graphics();
    panGfx.fillStyle(0xffffff, 1);
    panGfx.fillCircle(8, 6, 5); // pan head
    panGfx.fillRect(6, 10, 4, 5); // handle
    panGfx.generateTexture("pickup_frying_pan", 16, 16);
    panGfx.destroy();

    // Darts silhouette
    const dartsGfx = this.add.graphics();
    dartsGfx.fillStyle(0xffffff, 1);
    dartsGfx.fillRect(3, 7, 10, 2); // dart body
    dartsGfx.fillTriangle(13, 5, 13, 11, 15, 8); // tip
    dartsGfx.fillRect(1, 5, 3, 6); // flight
    dartsGfx.generateTexture("pickup_darts", 16, 16);
    dartsGfx.destroy();

    // Plates silhouette (circle approximation of plate shape)
    const platesGfx = this.add.graphics();
    platesGfx.fillStyle(0xffffff, 1);
    platesGfx.fillCircle(8, 8, 6);
    platesGfx.lineStyle(1, 0xcccccc, 0.6);
    platesGfx.strokeCircle(8, 8, 3);
    platesGfx.generateTexture("pickup_plates", 16, 16);
    platesGfx.destroy();

    // Staple gun silhouette
    const stapleGfx = this.add.graphics();
    stapleGfx.fillStyle(0xffffff, 1);
    stapleGfx.fillRect(3, 4, 10, 5); // body
    stapleGfx.fillRect(4, 8, 4, 5);  // grip
    stapleGfx.fillRect(12, 5, 2, 3); // muzzle
    stapleGfx.generateTexture("pickup_staple_gun", 16, 16);
    stapleGfx.destroy();
  }

  // ─── Dummy sprite (target mannequin) ────────────────────────────────

  private generateDummyTexture() {
    const T = TILE_SIZE;
    const dummyGfx = this.add.graphics();
    // Outer ring
    dummyGfx.lineStyle(2, 0xff4444, 1);
    dummyGfx.strokeCircle(T / 2, T / 2, T / 2 - 2);
    // Middle ring
    dummyGfx.lineStyle(2, 0xff8888, 1);
    dummyGfx.strokeCircle(T / 2, T / 2, T / 2 - 6);
    // Inner ring
    dummyGfx.lineStyle(2, 0xffcccc, 1);
    dummyGfx.strokeCircle(T / 2, T / 2, T / 2 - 10);
    // Center dot
    dummyGfx.fillStyle(0xff0000, 1);
    dummyGfx.fillCircle(T / 2, T / 2, 3);
    // Stick (below)
    dummyGfx.fillStyle(0x886644, 1);
    dummyGfx.fillRect(T / 2 - 2, T - 4, 4, 4);
    dummyGfx.generateTexture("dummy", T, T);
    dummyGfx.destroy();
  }

  // ─── Misc textures ──────────────────────────────────────────────────

  private generateMiscTextures() {
    // Muzzle flash: 12x12 white circle
    const flashGfx = this.add.graphics();
    flashGfx.fillStyle(0xffffff, 1);
    flashGfx.fillCircle(6, 6, 6);
    flashGfx.generateTexture("muzzle_flash", 12, 12);
    flashGfx.destroy();

    // Particle: 4x4 white circle
    const particleGfx = this.add.graphics();
    particleGfx.fillStyle(0xffffff, 1);
    particleGfx.fillCircle(2, 2, 2);
    particleGfx.generateTexture("particle", 4, 4);
    particleGfx.destroy();
  }

  // ─── Animations ─────────────────────────────────────────────────────

  private registerAnimations() {
    this.anims.create({
      key: "player_idle",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 0, end: 1 }),
      frameRate: 2,
      repeat: -1,
    });

    this.anims.create({
      key: "player_walk",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 2, end: 5 }),
      frameRate: 8,
      repeat: -1,
    });

    this.anims.create({
      key: "player_attack",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 6, end: 7 }),
      frameRate: 12,
      repeat: 0,
    });

    this.anims.create({
      key: "player_death",
      frames: this.anims.generateFrameNumbers("player_sheet", { start: 8, end: 10 }),
      frameRate: 6,
      repeat: 0,
    });
  }
}
