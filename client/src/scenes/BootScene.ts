import Phaser from "phaser";
import { TILE_SIZE, PLAYER_RADIUS } from "shared";

// All 9 selectable characters from the Kenney atlas (gun pose — facing right with weapon)
export const CHARACTER_DEFS: { frame: string; name: string }[] = [
  { frame: "manBlue_gun.png", name: "Blue" },
  { frame: "hitman1_gun.png", name: "Hitman" },
  { frame: "soldier1_gun.png", name: "Soldier" },
  { frame: "survivor1_gun.png", name: "Survivor" },
  { frame: "manBrown_gun.png", name: "Brown" },
  { frame: "manOld_gun.png", name: "Veteran" },
  { frame: "womanGreen_gun.png", name: "Green" },
  { frame: "robot1_gun.png", name: "Robot" },
  { frame: "zoimbie1_gun.png", name: "Zombie" },
];

/**
 * Build (or rebuild) a player spritesheet texture from a Kenney atlas frame.
 * Creates an 11-frame horizontal strip at PLAYER_RADIUS*2 per frame.
 * If the texture already exists, it is destroyed first.
 */
export function buildPlayerSheet(
  scene: Phaser.Scene,
  atlasFrameName: string,
  textureKey = "player_sheet"
) {
  const size = PLAYER_RADIUS * 2; // 32
  const frameCount = 11;

  const atlasFrame = scene.textures.getFrame("kenney_chars", atlasFrameName);
  const source = atlasFrame.source.image as HTMLImageElement;

  const canvas = document.createElement("canvas");
  canvas.width = size * frameCount;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const sw = atlasFrame.cutWidth;
  const sh = atlasFrame.cutHeight;
  const sx = atlasFrame.cutX;
  const sy = atlasFrame.cutY;

  const scale = Math.min(size / sw, size / sh);
  const dw = sw * scale;
  const dh = sh * scale;

  for (let f = 0; f < frameCount; f++) {
    const ox = f * size;
    const dx = ox + (size - dw) / 2;
    const dy = (size - dh) / 2;

    if (f >= 8) {
      const deathPhase = f - 8;
      const deathScale = 1 - deathPhase * 0.15;
      const alpha = 1 - deathPhase * 0.25;
      ctx.globalAlpha = alpha;
      const ddw = dw * deathScale;
      const ddh = dh * deathScale;
      ctx.drawImage(source, sx, sy, sw, sh,
        ox + (size - ddw) / 2, (size - ddh) / 2, ddw, ddh);
      ctx.globalAlpha = 1;
    } else {
      let yOff = 0;
      if (f >= 2 && f <= 5) {
        yOff = [0, -1, 0, 1][f - 2];
      }
      ctx.drawImage(source, sx, sy, sw, sh, dx, dy + yOff, dw, dh);
    }
  }

  // Destroy old texture if it exists (needed for rebuild in GameScene)
  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey);
  }

  const canvasTex = scene.textures.createCanvas(textureKey, canvas.width, canvas.height);
  if (canvasTex) {
    const destCtx = canvasTex.getContext();
    destCtx.drawImage(canvas, 0, 0);
    canvasTex.refresh();
    canvasTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    for (let f = 0; f < frameCount; f++) {
      canvasTex.add(f, 0, f * size, 0, size, size);
    }
  }
}

// Kenney tilesheet layout: 64x64 tiles, 27 cols × 20 rows
// Tile picks (col, row) — selected from visual inspection of tilesheet_complete.png
const TILE_PICKS: [number, number][] = [
  [0, 10],  // 0: Floor — light gray concrete
  [0, 1],   // 1: Wall — dark brown with trim
  [0, 7],   // 2: Wall-top — lighter gray for depth
  [1, 10],  // 3: Floor accent — gray concrete variant
  [2, 1],   // 4: Wall edge horizontal
  [0, 3],   // 5: Wall edge vertical
];

// Tile for locker (col, row) — a dark cabinet/crate tile
const LOCKER_TILE: [number, number] = [10, 4];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Load character spritesheet atlas (all 9 character types × 6 poses)
    this.load.atlasXML(
      "kenney_chars",
      "assets/spritesheet_characters.png",
      "assets/spritesheet_characters.xml"
    );
    // Load tilesheet as a plain image (we'll extract tiles in create())
    this.load.image("kenney_tilesheet", "assets/tilesheet_complete.png");
  }

  create() {
    // Apply nearest-neighbor filtering to pixel-art source textures
    // so they stay crisp when scaled, even with global antialias on
    for (const key of ["kenney_chars", "kenney_tilesheet"]) {
      const tex = this.textures.get(key);
      if (tex?.source?.[0]?.glTexture) {
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    this.generateTileset();
    this.generatePlayerSheet();
    this.generateCharacterSheets();
    this.generateCharacterPreviews();
    this.generateProjectileTextures();
    this.generateLockerTextures();
    this.generatePickupTextures();
    this.generateConsumablePickupTextures();
    this.generateDummyTexture();
    this.generateMiscTextures();
    this.registerAnimations();

    // Apply nearest-neighbor to all generated sprite textures so pixel art stays crisp
    this.textures.each((tex) => {
      if (tex.key !== "__DEFAULT" && tex.key !== "__MISSING" && tex.key !== "__WHITE") {
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }, this);

    console.log("BootScene: all assets generated (Kenney)");
    this.scene.start("MenuScene");
  }

  // ─── Tileset (6 tiles from Kenney tilesheet) ─────────────────────────

  private generateTileset() {
    const T = TILE_SIZE; // 32 (game tile size)
    const K = 64;        // Kenney tile size

    const source = this.textures.get("kenney_tilesheet").getSourceImage() as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = T * TILE_PICKS.length;
    canvas.height = T;
    const ctx = canvas.getContext("2d")!;

    for (let i = 0; i < TILE_PICKS.length; i++) {
      const [col, row] = TILE_PICKS[i];
      // Extract 64x64 tile from source, draw scaled to 32x32
      ctx.drawImage(source, col * K, row * K, K, K, i * T, 0, T, T);
    }

    const tex = this.textures.createCanvas("tileset", canvas.width, canvas.height);
    if (tex) {
      const destCtx = tex.getContext();
      destCtx.drawImage(canvas, 0, 0);
      tex.refresh();
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  // ─── Player spritesheet (11 frames × 32px from Kenney char) ──────────

  private generatePlayerSheet() {
    // Build default player_sheet from the first character (Blue)
    buildPlayerSheet(this, CHARACTER_DEFS[0].frame);
  }

  // ─── Per-character spritesheets (full 11-frame sheets for each) ──────

  private generateCharacterSheets() {
    // Build an 11-frame spritesheet for each character so remote players
    // can have animated models matching their chosen character.
    for (let i = 0; i < CHARACTER_DEFS.length; i++) {
      buildPlayerSheet(this, CHARACTER_DEFS[i].frame, `player_sheet_${i}`);
    }
  }

  // ─── Character preview textures (48×48 for menu selection) ──────────

  private generateCharacterPreviews() {
    const previewSize = 48;

    for (let i = 0; i < CHARACTER_DEFS.length; i++) {
      const frameName = CHARACTER_DEFS[i].frame;
      const atlasFrame = this.textures.getFrame("kenney_chars", frameName);
      if (!atlasFrame) continue;

      const source = atlasFrame.source.image as HTMLImageElement;
      const sw = atlasFrame.cutWidth;
      const sh = atlasFrame.cutHeight;
      const sx = atlasFrame.cutX;
      const sy = atlasFrame.cutY;

      const scale = Math.min(previewSize / sw, previewSize / sh);
      const dw = sw * scale;
      const dh = sh * scale;

      const canvas = document.createElement("canvas");
      canvas.width = previewSize;
      canvas.height = previewSize;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, sx, sy, sw, sh,
        (previewSize - dw) / 2, (previewSize - dh) / 2, dw, dh);

      const tex = this.textures.createCanvas(`char_preview_${i}`, previewSize, previewSize);
      if (tex) {
        const destCtx = tex.getContext();
        destCtx.drawImage(canvas, 0, 0);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
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

    // Vase: large purple circle (12x12)
    const vaseGfx = this.add.graphics();
    vaseGfx.fillStyle(0x8844aa, 1);
    vaseGfx.fillCircle(6, 6, 6);
    vaseGfx.lineStyle(1, 0xaa66cc, 0.5);
    vaseGfx.strokeCircle(6, 6, 4);
    vaseGfx.generateTexture("proj_vase", 12, 12);
    vaseGfx.destroy();

    // Rubber band gun: tiny yellow line (4x2)
    const rbGfx = this.add.graphics();
    rbGfx.fillStyle(0xffdd44, 1);
    rbGfx.fillRect(0, 0, 4, 2);
    rbGfx.generateTexture("proj_rubber_band_gun", 4, 2);
    rbGfx.destroy();
  }

  // ─── Locker textures (from Kenney tilesheet) ─────────────────────────

  private generateLockerTextures() {
    const T = TILE_SIZE;
    const K = 64;
    const [col, row] = LOCKER_TILE;

    const source = this.textures.get("kenney_tilesheet").getSourceImage() as HTMLImageElement;

    // Locker closed: extract tile from tilesheet
    {
      const canvas = document.createElement("canvas");
      canvas.width = T;
      canvas.height = T;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, col * K, row * K, K, K, 0, 0, T, T);

      // Add padlock detail overlay
      ctx.fillStyle = "#ddaa33";
      ctx.fillRect(T / 2 - 2, T / 2 + 4, 4, 4);

      const tex = this.textures.createCanvas("locker_closed", T, T);
      if (tex) {
        const destCtx = tex.getContext();
        destCtx.drawImage(canvas, 0, 0);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // Locker open: same tile but darkened
    {
      const canvas = document.createElement("canvas");
      canvas.width = T;
      canvas.height = T;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, col * K, row * K, K, K, 0, 0, T, T);
      // Darken overlay to indicate opened
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, T, T);

      const tex = this.textures.createCanvas("locker_open", T, T);
      if (tex) {
        const destCtx = tex.getContext();
        destCtx.drawImage(canvas, 0, 0);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
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

    // Baseball bat silhouette
    const batGfx = this.add.graphics();
    batGfx.fillStyle(0xffffff, 1);
    batGfx.fillRect(7, 2, 3, 12); // handle
    batGfx.fillRect(5, 0, 7, 4);  // barrel
    batGfx.generateTexture("pickup_baseball_bat", 16, 16);
    batGfx.destroy();

    // Golf club silhouette
    const golfGfx = this.add.graphics();
    golfGfx.fillStyle(0xffffff, 1);
    golfGfx.fillRect(7, 1, 2, 12); // shaft
    golfGfx.fillRect(4, 12, 8, 3); // head
    golfGfx.generateTexture("pickup_golf_club", 16, 16);
    golfGfx.destroy();

    // Vase silhouette
    const vaseGfx = this.add.graphics();
    vaseGfx.fillStyle(0xffffff, 1);
    vaseGfx.fillCircle(8, 7, 5);   // body
    vaseGfx.fillRect(6, 1, 4, 3);  // neck
    vaseGfx.fillRect(5, 12, 6, 2); // base
    vaseGfx.generateTexture("pickup_vase", 16, 16);
    vaseGfx.destroy();

    // Rubber band gun silhouette
    const rbgGfx = this.add.graphics();
    rbgGfx.fillStyle(0xffffff, 1);
    rbgGfx.fillRect(2, 5, 12, 3);  // barrel
    rbgGfx.fillRect(4, 7, 4, 6);   // grip
    rbgGfx.fillTriangle(13, 4, 14, 8, 11, 8); // front sight
    rbgGfx.generateTexture("pickup_rubber_band_gun", 16, 16);
    rbgGfx.destroy();
  }

  // ─── Consumable pickup textures ─────────────────────────────────────

  private generateConsumablePickupTextures() {
    // Health pack: green cross
    const healthGfx = this.add.graphics();
    healthGfx.fillStyle(0x44ff44, 1);
    healthGfx.fillRect(5, 2, 6, 12);  // vertical bar
    healthGfx.fillRect(2, 5, 12, 6);  // horizontal bar
    healthGfx.generateTexture("pickup_health_pack", 16, 16);
    healthGfx.destroy();

    // Speed boost: lightning bolt (cyan)
    const speedGfx = this.add.graphics();
    speedGfx.fillStyle(0x44ddff, 1);
    speedGfx.fillTriangle(8, 1, 4, 8, 9, 7);   // top
    speedGfx.fillTriangle(7, 9, 12, 8, 8, 15);  // bottom
    speedGfx.generateTexture("pickup_speed_boost", 16, 16);
    speedGfx.destroy();

    // Shield: shield shape (purple)
    const shieldGfx = this.add.graphics();
    shieldGfx.fillStyle(0xdd88ff, 1);
    shieldGfx.fillCircle(8, 6, 6);     // top dome
    shieldGfx.fillTriangle(2, 6, 14, 6, 8, 15); // bottom point
    shieldGfx.generateTexture("pickup_shield", 16, 16);
    shieldGfx.destroy();

    // Damage boost: star burst (red)
    const dmgGfx = this.add.graphics();
    dmgGfx.fillStyle(0xff4444, 1);
    // Star shape via overlapping triangles
    dmgGfx.fillTriangle(8, 1, 5, 11, 14, 5);
    dmgGfx.fillTriangle(8, 15, 2, 5, 11, 11);
    dmgGfx.generateTexture("pickup_damage_boost", 16, 16);
    dmgGfx.destroy();
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
    // Generic animations for local player (references player_sheet)
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

    // Per-character animations for remote players (references player_sheet_N)
    for (let i = 0; i < CHARACTER_DEFS.length; i++) {
      const sheet = `player_sheet_${i}`;

      this.anims.create({
        key: `player_idle_${i}`,
        frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: 1 }),
        frameRate: 2,
        repeat: -1,
      });

      this.anims.create({
        key: `player_walk_${i}`,
        frames: this.anims.generateFrameNumbers(sheet, { start: 2, end: 5 }),
        frameRate: 8,
        repeat: -1,
      });

      this.anims.create({
        key: `player_attack_${i}`,
        frames: this.anims.generateFrameNumbers(sheet, { start: 6, end: 7 }),
        frameRate: 12,
        repeat: 0,
      });

      this.anims.create({
        key: `player_death_${i}`,
        frames: this.anims.generateFrameNumbers(sheet, { start: 8, end: 10 }),
        frameRate: 6,
        repeat: 0,
      });
    }
  }
}
