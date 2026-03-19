/**
 * pack-atlas.ts — Bin-pack individual frame PNGs into Phaser JSON hash atlases.
 *
 * Takes individual frame PNGs from assets/generated/ subdirectories and packs
 * them into atlas images with Phaser-compatible JSON metadata.
 *
 * Usage: npx tsx scripts/pack-atlas.ts
 *
 * Output:
 *   assets/generated/atlases/characters.png + characters.json
 *   assets/generated/atlases/items.png + items.json
 *   assets/generated/atlases/vehicles.png + vehicles.json
 *   assets/generated/atlases/environment.png + environment.json
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, "../public/assets/generated");
const ATLAS_DIR = path.join(ASSETS_DIR, "atlases");
const MAX_ATLAS_SIZE = 2048;

interface PackedFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  imagePath: string;
}

/**
 * Simple shelf bin-packing algorithm.
 * Sorts frames by height descending, packs left-to-right in rows.
 */
function shelfPack(
  frames: { name: string; w: number; h: number; imagePath: string }[],
  maxW: number,
  maxH: number,
): { packed: PackedFrame[]; atlasW: number; atlasH: number } {
  // Sort by height descending for better shelf packing
  const sorted = [...frames].sort((a, b) => b.h - a.h || b.w - a.w);

  const packed: PackedFrame[] = [];
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let usedW = 0;

  for (const frame of sorted) {
    // Check if frame fits on current shelf
    if (shelfX + frame.w > maxW) {
      // Start new shelf
      shelfY += shelfH;
      shelfX = 0;
      shelfH = 0;
    }

    if (shelfY + frame.h > maxH) {
      console.warn(`  [warn] Atlas overflow — frame ${frame.name} doesn't fit in ${maxW}×${maxH}`);
      continue;
    }

    packed.push({
      name: frame.name,
      x: shelfX,
      y: shelfY,
      w: frame.w,
      h: frame.h,
      imagePath: frame.imagePath,
    });

    shelfX += frame.w;
    usedW = Math.max(usedW, shelfX);
    shelfH = Math.max(shelfH, frame.h);
  }

  const atlasH = shelfY + shelfH;

  // Round up to power of 2 for GPU efficiency
  const po2W = nextPow2(usedW);
  const po2H = nextPow2(atlasH);

  return { packed, atlasW: Math.min(po2W, maxW), atlasH: Math.min(po2H, maxH) };
}

function nextPow2(n: number): number {
  let v = 1;
  while (v < n) v <<= 1;
  return v;
}

/**
 * Build a Phaser JSON hash atlas from packed frames.
 */
function buildPhaserJsonHash(
  packed: PackedFrame[],
  atlasW: number,
  atlasH: number,
  imageFileName: string,
): object {
  const frames: Record<string, object> = {};

  for (const f of packed) {
    frames[f.name] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
    };
  }

  return {
    frames,
    meta: {
      app: "storage-wars-pack-atlas",
      version: "1.0",
      image: imageFileName,
      format: "RGBA8888",
      size: { w: atlasW, h: atlasH },
      scale: "1",
    },
  };
}

/**
 * Scan a directory for PNG frame files matching a prefix pattern.
 */
async function scanFrames(
  dir: string,
  prefix: string,
  exclude?: RegExp,
): Promise<{ name: string; w: number; h: number; imagePath: string }[]> {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(
    (f) => f.startsWith(prefix) && f.endsWith(".png") && !f.endsWith("_raw.png"),
  );

  if (exclude) {
    const filtered = files.filter((f) => !exclude.test(f));
    files.length = 0;
    files.push(...filtered);
  }

  const results: { name: string; w: number; h: number; imagePath: string }[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const img = await loadImage(filePath);
      results.push({
        name: file.replace(".png", ""),
        w: img.width,
        h: img.height,
        imagePath: filePath,
      });
    } catch (err) {
      console.warn(`  [warn] Failed to load ${file}: ${err}`);
    }
  }

  return results;
}

/**
 * Build atlas image and JSON for a set of frames.
 */
async function buildAtlas(
  name: string,
  frames: { name: string; w: number; h: number; imagePath: string }[],
): Promise<boolean> {
  if (frames.length === 0) {
    console.log(`  [skip] No frames for ${name} atlas`);
    return false;
  }

  console.log(`  Packing ${name} atlas (${frames.length} frames)...`);

  const { packed, atlasW, atlasH } = shelfPack(frames, MAX_ATLAS_SIZE, MAX_ATLAS_SIZE);

  // Create atlas image
  const canvas = createCanvas(atlasW, atlasH);
  const ctx = canvas.getContext("2d");

  for (const frame of packed) {
    const img = await loadImage(frame.imagePath);
    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h);
  }

  // Write atlas PNG
  const pngPath = path.join(ATLAS_DIR, `${name}.png`);
  fs.writeFileSync(pngPath, canvas.toBuffer("image/png"));

  // Write Phaser JSON
  const jsonData = buildPhaserJsonHash(packed, atlasW, atlasH, `${name}.png`);
  const jsonPath = path.join(ATLAS_DIR, `${name}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

  console.log(`  ✓ ${name}.png (${atlasW}×${atlasH}) + ${name}.json (${packed.length} frames)`);
  return true;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("=== Atlas Packer ===\n");

  // Ensure output directory
  fs.mkdirSync(ATLAS_DIR, { recursive: true });

  // Characters atlas
  console.log("Characters:");
  const charFrames = await scanFrames(
    path.join(ASSETS_DIR, "characters"),
    "char_",
  );
  await buildAtlas("characters", charFrames);
  console.log();

  // Items atlas (pickups + projectiles)
  console.log("Items:");
  const pickupFrames = await scanFrames(path.join(ASSETS_DIR, "items"), "pickup_");
  const projFrames = await scanFrames(path.join(ASSETS_DIR, "items"), "proj_");
  await buildAtlas("items", [...pickupFrames, ...projFrames]);
  console.log();

  // Vehicles atlas
  console.log("Vehicles:");
  const vehicleFrames = await scanFrames(path.join(ASSETS_DIR, "vehicles"), "vehicle_");
  await buildAtlas("vehicles", vehicleFrames);
  console.log();

  // Environment atlas
  console.log("Environment:");
  const envFrames = await scanFrames(path.join(ASSETS_DIR, "environment"), "env_");
  await buildAtlas("environment", envFrames);
  console.log();

  console.log("=== Done ===");
  console.log("Atlases written to assets/generated/atlases/");
  console.log("Run `npm run dev` to test in-game.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
