import Phaser from "phaser";
import {
  TILE_SIZE,
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
  OBSTACLES,
} from "shared";

/** Height of south-facing wall front sprites (client-only visual) */
export const WALL_FRONT_HEIGHT = 32;

export class TilemapManager {
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallTopLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallPositions: { x: number; y: number }[] = [];
  private wallFrontPositions: { x: number; y: number }[] = [];

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

    // Build base data array
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

    // Generate separate floor and wall-top data arrays
    const floorData: number[][] = [];
    const wallTopData: number[][] = [];

    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      const floorRow: number[] = [];
      const wallRow: number[] = [];

      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        // Floor layer: always has a floor tile (even under walls)
        if (rng() < 0.1) {
          floorRow.push(3); // accent
        } else {
          floorRow.push(0); // standard floor
        }

        if (isWall[row][col]) {
          const belowIsFloor =
            row + 1 < MAP_HEIGHT_TILES && !isWall[row + 1][col];

          if (belowIsFloor) {
            wallRow.push(2); // wall-top (south-facing edge)
          } else {
            wallRow.push(1); // standard wall
          }
        } else {
          wallRow.push(-1); // empty (no wall here)
        }
      }

      floorData.push(floorRow);
      wallTopData.push(wallRow);
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

    // Compute wall-front positions: every wall tile with a non-wall tile (or OOB) below it
    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        if (!isWall[row][col]) continue;
        const belowRow = row + 1;
        const belowIsWall = belowRow < MAP_HEIGHT_TILES && isWall[belowRow][col];
        if (!belowIsWall) {
          // Position = the tile just below the wall's bottom edge
          this.wallFrontPositions.push({
            x: col * TILE_SIZE,
            y: belowRow * TILE_SIZE,
          });
        }
      }
    }

    // Create Phaser tilemap for floor layer
    this.tilemap = this.scene.make.tilemap({
      data: floorData,
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

    // Floor layer (always behind everything)
    this.floorLayer = this.tilemap.createLayer(0, tileset, 0, 0)!;
    this.floorLayer.setDepth(-2);

    // Wall-top layer: separate tilemap for walls only
    const wallMap = this.scene.make.tilemap({
      data: wallTopData,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    const wallTileset = wallMap.addTilesetImage(
      "tileset",
      "tileset",
      TILE_SIZE,
      TILE_SIZE,
      0,
      0
    )!;

    this.wallTopLayer = wallMap.createLayer(0, wallTileset, 0, 0)!;
    this.wallTopLayer.setDepth(-1);

    // Set collision on all wall tile indices (1, 2, 4, 5)
    this.wallTopLayer.setCollision([1, 2, 4, 5]);
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
    return this.wallTopLayer;
  }

  getWallPositions(): { x: number; y: number }[] {
    return this.wallPositions;
  }

  /** Returns pixel positions for south-facing wall fronts (tile below wall's bottom edge) */
  getWallFrontPositions(): { x: number; y: number }[] {
    return this.wallFrontPositions;
  }

  getTilemap(): Phaser.Tilemaps.Tilemap {
    return this.tilemap;
  }
}
