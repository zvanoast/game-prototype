import Phaser from "phaser";
import {
  TILE_SIZE,
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
  OBSTACLES,
} from "shared";

export class TilemapManager {
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallPositions: { x: number; y: number }[] = [];

  constructor(private scene: Phaser.Scene) {
    this.buildTilemap();
  }

  private buildTilemap() {
    // Tile indices:
    // 0 = floor (dark concrete)
    // 1 = wall (storage unit, beveled)
    // 2 = wall-top (lighter, south-facing depth)
    // 3 = floor accent (slightly lighter, scattered)
    // 4 = wall edge horizontal
    // 5 = wall edge vertical

    // Seed a simple RNG for deterministic floor accent placement
    const rng = this.simpleRng(42);

    // Build base data array (0 = floor, 1 = wall)
    const isWall: boolean[][] = [];
    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      isWall[row] = [];
      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        isWall[row][col] =
          row === 0 ||
          row === MAP_HEIGHT_TILES - 1 ||
          col === 0 ||
          col === MAP_WIDTH_TILES - 1;
      }
    }

    // Place interior obstacles
    for (const obs of OBSTACLES) {
      for (let r = obs.y; r < obs.y + obs.h && r < MAP_HEIGHT_TILES; r++) {
        for (let c = obs.x; c < obs.x + obs.w && c < MAP_WIDTH_TILES; c++) {
          isWall[r][c] = true;
        }
      }
    }

    // Generate tile data with tile classification
    const data: number[][] = [];
    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        if (isWall[row][col]) {
          // Classify wall tile
          const belowIsFloor =
            row + 1 < MAP_HEIGHT_TILES && !isWall[row + 1][col];

          if (belowIsFloor) {
            // South-facing wall edge — use wall-top (lighter, gives depth)
            rowData.push(2);
          } else {
            // Standard wall tile
            rowData.push(1);
          }
        } else {
          // Floor tile — scatter accent tiles (~10%)
          if (rng() < 0.1) {
            rowData.push(3);
          } else {
            rowData.push(0);
          }
        }
      }
      data.push(rowData);
    }

    // Collect wall positions for minimap
    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        if (isWall[row][col]) {
          this.wallPositions.push({
            x: col * TILE_SIZE + TILE_SIZE / 2,
            y: row * TILE_SIZE + TILE_SIZE / 2,
          });
        }
      }
    }

    // Create Phaser tilemap from data
    this.tilemap = this.scene.make.tilemap({
      data,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    const tileset = this.tilemap.addTilesetImage(
      "tileset",
      "tileset",
      TILE_SIZE,
      TILE_SIZE,
      0,
      0
    )!;

    this.wallLayer = this.tilemap.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setDepth(-1);

    // Set collision on all wall tile indices (1, 2, 4, 5)
    this.wallLayer.setCollision([1, 2, 4, 5]);
  }

  /** Simple seeded PRNG (mulberry32) for deterministic accent placement */
  private simpleRng(seed: number): () => number {
    let s = seed;
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  getWallLayer(): Phaser.Tilemaps.TilemapLayer {
    return this.wallLayer;
  }

  getWallPositions(): { x: number; y: number }[] {
    return this.wallPositions;
  }

  getTilemap(): Phaser.Tilemaps.Tilemap {
    return this.tilemap;
  }
}
