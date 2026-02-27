import Phaser from "phaser";
import {
  TILE_SIZE,
  MAP_WIDTH_TILES,
  MAP_HEIGHT_TILES,
} from "shared";

/** Rectangular obstacle definition in tile coordinates */
interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 18 hardcoded interior obstacles (tile coordinates)
const OBSTACLES: Obstacle[] = [
  // Top-left quadrant
  { x: 8, y: 8, w: 3, h: 1 },
  { x: 5, y: 14, w: 1, h: 4 },
  { x: 12, y: 5, w: 2, h: 2 },
  { x: 15, y: 12, w: 4, h: 1 },
  // Top-right quadrant
  { x: 40, y: 6, w: 2, h: 3 },
  { x: 50, y: 10, w: 3, h: 1 },
  { x: 55, y: 5, w: 1, h: 5 },
  { x: 45, y: 15, w: 5, h: 1 },
  // Bottom-left quadrant
  { x: 6, y: 45, w: 4, h: 1 },
  { x: 10, y: 50, w: 1, h: 3 },
  { x: 15, y: 48, w: 2, h: 2 },
  { x: 20, y: 55, w: 3, h: 1 },
  // Bottom-right quadrant
  { x: 48, y: 48, w: 2, h: 2 },
  { x: 42, y: 52, w: 1, h: 4 },
  { x: 55, y: 45, w: 3, h: 1 },
  { x: 50, y: 55, w: 4, h: 1 },
  // Center area
  { x: 30, y: 30, w: 4, h: 4 },
  { x: 28, y: 25, w: 1, h: 3 },
];

export class TilemapManager {
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallPositions: { x: number; y: number }[] = [];

  constructor(private scene: Phaser.Scene) {
    this.buildTilemap();
  }

  private buildTilemap() {
    // Generate the 2D map data array (0 = floor, 1 = wall)
    const data: number[][] = [];
    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        // Perimeter walls
        if (
          row === 0 ||
          row === MAP_HEIGHT_TILES - 1 ||
          col === 0 ||
          col === MAP_WIDTH_TILES - 1
        ) {
          rowData.push(1);
        } else {
          rowData.push(0);
        }
      }
      data.push(rowData);
    }

    // Place interior obstacles
    for (const obs of OBSTACLES) {
      for (let r = obs.y; r < obs.y + obs.h && r < MAP_HEIGHT_TILES; r++) {
        for (let c = obs.x; c < obs.x + obs.w && c < MAP_WIDTH_TILES; c++) {
          data[r][c] = 1;
        }
      }
    }

    // Collect wall positions for minimap
    for (let row = 0; row < MAP_HEIGHT_TILES; row++) {
      for (let col = 0; col < MAP_WIDTH_TILES; col++) {
        if (data[row][col] === 1) {
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
      "tileset",  // key matches the generated texture name
      "tileset",
      TILE_SIZE,
      TILE_SIZE,
      0,
      0
    )!;

    this.wallLayer = this.tilemap.createLayer(0, tileset, 0, 0)!;
    this.wallLayer.setDepth(-1);

    // Set collision on wall tiles (index 1)
    this.wallLayer.setCollision(1);
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
