import Phaser from "phaser";
import { TILE_SIZE, PLAYER_RADIUS, ALL_VEHICLE_IDS, getVehicleConfig } from "shared";
import { ATLAS_KEYS, ATLAS_PATHS } from "../sprites/SpriteManifest";
import { SpriteRegistry } from "../sprites/SpriteRegistry";

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

    // Load generated sprite atlases (optional — gracefully skip if missing)
    for (const [category, key] of Object.entries(ATLAS_KEYS)) {
      const paths = ATLAS_PATHS[category as keyof typeof ATLAS_PATHS];
      if (paths) {
        this.load.atlas(key, paths.image, paths.json);
      }
    }

    // Suppress load errors for missing generated atlases (they're optional)
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      const atlasValues = Object.values(ATLAS_KEYS) as string[];
      if (atlasValues.includes(file.key)) {
        console.log(`BootScene: optional atlas "${file.key}" not found, using procedural fallback`);
      }
    });
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
    this.generateVehicleTextures();
    this.generateDummyTexture();
    this.generateWallFrontTexture();
    this.generateShadowTexture();
    this.generateMiscTextures();
    this.registerAnimations();

    // Initialize SpriteRegistry and pre-register directional animations
    const registry = new SpriteRegistry(this);
    if (registry.hasGeneratedCharacters) {
      for (let i = 0; i < CHARACTER_DEFS.length; i++) {
        registry.registerAllCharacterAnims(i);
      }
      console.log("BootScene: generated character atlases detected, directional anims registered");
    }

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

  // ─── Projectile textures (tilesheet extraction + procedural fallback) ──

  /** Tilesheet [col, row] → output pixel size for each projectile type */
  private static readonly PROJ_TILE_PICKS: { key: string; col: number; row: number; size: number }[] = [
    { key: "proj_default",         col: 21, row: 5,  size: 8  },
  ];

  private generateProjectileTextures() {
    const K = 64; // Kenney tile size
    const source = this.textures.get("kenney_tilesheet").getSourceImage() as HTMLImageElement;

    for (const pick of BootScene.PROJ_TILE_PICKS) {
      const canvas = document.createElement("canvas");
      canvas.width = pick.size;
      canvas.height = pick.size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, pick.col * K, pick.row * K, K, K, 0, 0, pick.size, pick.size);

      // Check for non-transparent pixels — fall back to procedural if tile was empty
      const pixels = ctx.getImageData(0, 0, pick.size, pick.size).data;
      let hasContent = false;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 10) { hasContent = true; break; }
      }

      if (hasContent) {
        const tex = this.textures.createCanvas(pick.key, pick.size, pick.size);
        if (tex) {
          const destCtx = tex.getContext();
          destCtx.drawImage(canvas, 0, 0);
          tex.refresh();
          tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      } else {
        this.generateProceduralProjectile(pick.key, pick.size);
      }
    }

    // "projectile" alias (pool defaultKey in CombatManager) — same as proj_default
    if (!this.textures.exists("projectile")) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffff00, 1);
      gfx.fillCircle(4, 4, 4);
      gfx.generateTexture("projectile", 8, 8);
      gfx.destroy();
    } else {
      // Copy proj_default into "projectile" alias
      const src = this.textures.get("proj_default").getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const sz = 8;
      const c = document.createElement("canvas");
      c.width = sz; c.height = sz;
      c.getContext("2d")!.drawImage(src, 0, 0, sz, sz);
      const tex = this.textures.createCanvas("projectile", sz, sz);
      if (tex) {
        tex.getContext().drawImage(c, 0, 0);
        tex.refresh();
        tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

  }

  /** Procedural fallback when a tilesheet tile is empty */
  private generateProceduralProjectile(key: string, size: number) {
    const gfx = this.add.graphics();
    gfx.fillStyle(0xffff00, 1);
    gfx.fillCircle(size / 2, size / 2, size / 2);
    gfx.generateTexture(key, size, size);
    gfx.destroy();
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

    // Oboe silhouette
    const oboeGfx = this.add.graphics();
    oboeGfx.fillStyle(0xffffff, 1);
    oboeGfx.fillRect(7, 1, 2, 13); // body tube
    oboeGfx.fillRect(5, 13, 6, 2); // bell flare
    oboeGfx.fillRect(7, 0, 2, 2);  // mouthpiece
    oboeGfx.generateTexture("pickup_oboe", 16, 16);
    oboeGfx.destroy();

    // Signed Baseball Bat silhouette
    const batGfx = this.add.graphics();
    batGfx.fillStyle(0xffffff, 1);
    batGfx.fillRect(7, 2, 3, 12); // handle
    batGfx.fillRect(5, 0, 7, 4);  // barrel
    batGfx.lineStyle(1, 0xcccccc, 0.5);
    batGfx.lineBetween(6, 3, 10, 1); // signature mark
    batGfx.generateTexture("pickup_signed_baseball_bat", 16, 16);
    batGfx.destroy();

    // Ceremonial Sword silhouette
    const swordGfx = this.add.graphics();
    swordGfx.fillStyle(0xffffff, 1);
    swordGfx.fillRect(7, 0, 2, 10);  // blade
    swordGfx.fillRect(4, 10, 8, 2);  // crossguard
    swordGfx.fillRect(7, 11, 2, 4);  // grip
    swordGfx.generateTexture("pickup_ceremonial_sword", 16, 16);
    swordGfx.destroy();

    // Skis silhouette
    const skisGfx = this.add.graphics();
    skisGfx.fillStyle(0xffffff, 1);
    skisGfx.fillRect(4, 1, 2, 14);  // left ski
    skisGfx.fillRect(10, 1, 2, 14); // right ski
    skisGfx.fillRect(3, 14, 4, 1);  // left tip
    skisGfx.fillRect(9, 14, 4, 1);  // right tip
    skisGfx.generateTexture("pickup_skis", 16, 16);
    skisGfx.destroy();

    // Kayak silhouette
    const kayakGfx = this.add.graphics();
    kayakGfx.fillStyle(0xffffff, 1);
    kayakGfx.fillTriangle(8, 0, 3, 8, 13, 8);  // bow
    kayakGfx.fillRect(3, 8, 10, 4);              // hull
    kayakGfx.fillTriangle(3, 12, 13, 12, 8, 16); // stern
    kayakGfx.generateTexture("pickup_kayak", 16, 16);
    kayakGfx.destroy();

    // Rusty Power Drill silhouette
    const drillGfx = this.add.graphics();
    drillGfx.fillStyle(0xffffff, 1);
    drillGfx.fillRect(3, 4, 8, 5);  // body
    drillGfx.fillRect(4, 8, 4, 5);  // grip
    drillGfx.fillRect(11, 5, 4, 3); // drill bit
    drillGfx.generateTexture("pickup_rusty_power_drill", 16, 16);
    drillGfx.destroy();

    // Indian Rug silhouette
    const rugGfx = this.add.graphics();
    rugGfx.fillStyle(0xffffff, 1);
    rugGfx.fillRect(2, 3, 12, 10); // rug body
    rugGfx.lineStyle(1, 0xcccccc, 0.5);
    rugGfx.lineBetween(4, 5, 12, 5);  // pattern line 1
    rugGfx.lineBetween(4, 8, 12, 8);  // pattern line 2
    rugGfx.lineBetween(4, 11, 12, 11); // pattern line 3
    rugGfx.generateTexture("pickup_indian_rug", 16, 16);
    rugGfx.destroy();

    // --- Ranged / Throwable weapon pickups ---

    // Records silhouette (vinyl disc)
    const recordsGfx = this.add.graphics();
    recordsGfx.fillStyle(0xffffff, 1);
    recordsGfx.fillCircle(8, 8, 6);
    recordsGfx.fillStyle(0x000000, 1);
    recordsGfx.fillCircle(8, 8, 2); // center hole
    recordsGfx.generateTexture("pickup_records", 16, 16);
    recordsGfx.destroy();

    // Box of Antiques silhouette
    const boxGfx = this.add.graphics();
    boxGfx.fillStyle(0xffffff, 1);
    boxGfx.fillRect(2, 4, 12, 9); // box
    boxGfx.lineStyle(1, 0xcccccc, 0.5);
    boxGfx.lineBetween(2, 4, 14, 4); // lid line
    boxGfx.fillRect(6, 2, 4, 3); // handle flap
    boxGfx.generateTexture("pickup_box_of_antiques", 16, 16);
    boxGfx.destroy();

    // Knife Set silhouette
    const knifeGfx = this.add.graphics();
    knifeGfx.fillStyle(0xffffff, 1);
    knifeGfx.fillRect(3, 2, 2, 10); // blade 1
    knifeGfx.fillRect(7, 3, 2, 9);  // blade 2
    knifeGfx.fillRect(11, 4, 2, 8); // blade 3
    knifeGfx.fillRect(2, 12, 12, 2); // block
    knifeGfx.generateTexture("pickup_knife_set", 16, 16);
    knifeGfx.destroy();

    // Rare Coins silhouette
    const coinsGfx = this.add.graphics();
    coinsGfx.fillStyle(0xffffff, 1);
    coinsGfx.fillCircle(6, 6, 4);   // coin 1
    coinsGfx.fillCircle(10, 9, 4);  // coin 2
    coinsGfx.fillCircle(5, 11, 3);  // coin 3
    coinsGfx.generateTexture("pickup_rare_coins", 16, 16);
    coinsGfx.destroy();

    // Paint Cans silhouette
    const paintGfx = this.add.graphics();
    paintGfx.fillStyle(0xffffff, 1);
    paintGfx.fillRect(3, 4, 10, 10); // can body
    paintGfx.fillRect(4, 2, 8, 3);   // lid
    paintGfx.fillRect(6, 1, 4, 2);   // handle
    paintGfx.generateTexture("pickup_paint_cans", 16, 16);
    paintGfx.destroy();

    // Microwave silhouette
    const microGfx = this.add.graphics();
    microGfx.fillStyle(0xffffff, 1);
    microGfx.fillRect(1, 3, 14, 10); // body
    microGfx.fillStyle(0x000000, 1);
    microGfx.fillRect(3, 5, 8, 6);   // window
    microGfx.fillStyle(0xffffff, 1);
    microGfx.fillRect(12, 5, 2, 2);  // button
    microGfx.fillRect(12, 9, 2, 2);  // button
    microGfx.generateTexture("pickup_microwave", 16, 16);
    microGfx.destroy();

    // BB Gun silhouette
    const bbGfx = this.add.graphics();
    bbGfx.fillStyle(0xffffff, 1);
    bbGfx.fillRect(2, 6, 12, 3);  // barrel
    bbGfx.fillRect(4, 8, 4, 5);   // stock/grip
    bbGfx.fillRect(13, 5, 2, 4);  // muzzle
    bbGfx.generateTexture("pickup_bb_gun", 16, 16);
    bbGfx.destroy();
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

  // ─── Vehicle textures (per-vehicle placeholder shapes) ──────────────

  private generateVehicleTextures() {
    const size = 40; // vehicle sprite size

    for (const vehicleId of ALL_VEHICLE_IDS) {
      const config = getVehicleConfig(vehicleId);
      if (!config) continue;

      const key = `vehicle_${vehicleId}`;
      const gfx = this.add.graphics();
      gfx.fillStyle(config.color, 1);

      // Draw distinct shapes per vehicle
      switch (vehicleId) {
        case "office_chair":
          // Circle with smaller circles for wheels
          gfx.fillCircle(size / 2, size / 2, size / 3);
          gfx.fillStyle(0x333333, 1);
          gfx.fillCircle(size / 4, size - 6, 3);
          gfx.fillCircle(size * 3 / 4, size - 6, 3);
          gfx.fillCircle(size / 4, 6, 3);
          gfx.fillCircle(size * 3 / 4, 6, 3);
          break;
        case "red_wagon":
          // Rectangle with wheels
          gfx.fillRect(4, 10, size - 8, size - 20);
          gfx.fillStyle(0x333333, 1);
          gfx.fillCircle(10, size - 6, 4);
          gfx.fillCircle(size - 10, size - 6, 4);
          // Handle
          gfx.lineStyle(2, 0x666666, 1);
          gfx.lineBetween(size / 2, 10, size / 2, 2);
          break;
        case "golf_cart":
          // Larger rectangle with canopy
          gfx.fillRect(4, 6, size - 8, size - 12);
          gfx.fillStyle(0xffffff, 0.4);
          gfx.fillRect(6, 8, size - 12, 10); // windshield
          gfx.fillStyle(0x333333, 1);
          gfx.fillCircle(10, size - 4, 4);
          gfx.fillCircle(size - 10, size - 4, 4);
          break;
        case "jet_ski":
          // Pointed front, wider back
          gfx.fillTriangle(size / 2, 2, 6, size - 4, size - 6, size - 4);
          gfx.fillStyle(0xffffff, 0.3);
          gfx.fillRect(size / 2 - 4, 12, 8, 4); // handlebars
          break;
        case "fork_lift":
          // Boxy with forks
          gfx.fillRect(6, 6, size - 12, size - 12);
          gfx.fillStyle(0x888888, 1);
          gfx.fillRect(2, 2, 4, size / 2); // left fork
          gfx.fillRect(size - 6, 2, 4, size / 2); // right fork
          gfx.fillStyle(0x333333, 1);
          gfx.fillCircle(10, size - 4, 4);
          gfx.fillCircle(size - 10, size - 4, 4);
          break;
        default:
          gfx.fillCircle(size / 2, size / 2, size / 3);
          break;
      }

      gfx.generateTexture(key, size, size);
      gfx.destroy();
    }
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

  // ─── Wall-front texture (south-facing wall face for 3/4 view) ──────

  private generateWallFrontTexture() {
    const T = TILE_SIZE; // 32
    const K = 64;        // Kenney tile size

    // Use the wall tile (col=0, row=1) but darken it for the front face
    const source = this.textures.get("kenney_tilesheet").getSourceImage() as HTMLImageElement;
    const [col, row] = TILE_PICKS[1]; // wall tile

    const canvas = document.createElement("canvas");
    canvas.width = T;
    canvas.height = T;
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(source, col * K, row * K, K, K, 0, 0, T, T);

    // Darken to distinguish from wall tops
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, T, T);

    const tex = this.textures.createCanvas("wall_front", T, T);
    if (tex) {
      const destCtx = tex.getContext();
      destCtx.drawImage(canvas, 0, 0);
      tex.refresh();
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  // ─── Shadow ellipse texture (for entity drop shadows) ─────────────

  private generateShadowTexture() {
    const w = 32;
    const h = 16;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    const tex = this.textures.createCanvas("shadow", w, h);
    if (tex) {
      const destCtx = tex.getContext();
      destCtx.drawImage(canvas, 0, 0);
      tex.refresh();
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
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
