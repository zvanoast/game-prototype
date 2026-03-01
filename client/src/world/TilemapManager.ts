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
