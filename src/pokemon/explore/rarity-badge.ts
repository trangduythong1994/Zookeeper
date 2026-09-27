import { deflateSync } from "node:zlib";

import type { RarityKey } from "./explore.js";

const SIZE = 128;

const BADGE_COLORS: Record<RarityKey, readonly [number, number, number]> = {
  common: [148, 163, 184],
  uncommon: [74, 222, 128],
  rare: [96, 165, 250],
  ultra_rare: [192, 132, 252],
  mythic_rare: [251, 191, 36],
};

/** Creates a small self-contained PNG so Embed thumbnails never depend on a remote image host. */
export function rarityBadgePng(rarity: RarityKey): Buffer {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const color = BADGE_COLORS[rarity];
  fillCircle(pixels, 64, 64, 58, [15, 23, 42]);
  fillCircle(pixels, 64, 64, 54, color);

  if (rarity === "common") fillCircle(pixels, 64, 64, 18, [255, 255, 255]);
  if (rarity === "uncommon") fillDiamond(pixels, 64, 64, 23, [255, 255, 255]);
  if (rarity === "rare") fillDiamond(pixels, 64, 64, 31, [255, 255, 255]);
  if (rarity === "ultra_rare") fillStar(pixels, 64, 64, 32, 14, [255, 255, 255]);
  if (rarity === "mythic_rare") {
    fillStar(pixels, 64, 64, 34, 12, [255, 255, 255]);
    fillDiamond(pixels, 32, 32, 7, [255, 255, 255]);
    fillDiamond(pixels, 96, 40, 5, [255, 255, 255]);
  }
  return encodePng(pixels, SIZE, SIZE);
}

function fillCircle(pixels: Buffer, centerX: number, centerY: number, radius: number, color: readonly number[]): void {
  for (let y = Math.max(0, centerY - radius); y <= Math.min(SIZE - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(SIZE - 1, centerX + radius); x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) setPixel(pixels, x, y, color);
    }
  }
}

function fillDiamond(pixels: Buffer, centerX: number, centerY: number, radius: number, color: readonly number[]): void {
  for (let y = Math.max(0, centerY - radius); y <= Math.min(SIZE - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(SIZE - 1, centerX + radius); x += 1) {
      if (Math.abs(x - centerX) + Math.abs(y - centerY) <= radius) setPixel(pixels, x, y, color);
    }
  }
}

function fillStar(pixels: Buffer, centerX: number, centerY: number, outerRadius: number, innerRadius: number, color: readonly number[]): void {
  for (let point = 0; point < 10; point += 1) {
    const start = (Math.PI * 2 * point) / 10 - Math.PI / 2;
    const end = (Math.PI * 2 * (point + 1)) / 10 - Math.PI / 2;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    fillTriangle(pixels, [centerX, centerY], [centerX + Math.cos(start) * radius, centerY + Math.sin(start) * radius], [centerX + Math.cos(end) * (point % 2 === 0 ? innerRadius : outerRadius), centerY + Math.sin(end) * (point % 2 === 0 ? innerRadius : outerRadius)], color);
  }
}

function fillTriangle(pixels: Buffer, first: readonly number[], second: readonly number[], third: readonly number[], color: readonly number[]): void {
  const minX = Math.max(0, Math.floor(Math.min(first[0], second[0], third[0])));
  const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(first[0], second[0], third[0])));
  const minY = Math.max(0, Math.floor(Math.min(first[1], second[1], third[1])));
  const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(first[1], second[1], third[1])));
  const area = edge(first, second, third);
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const point = [x + 0.5, y + 0.5];
    const firstWeight = edge(second, third, point) / area;
    const secondWeight = edge(third, first, point) / area;
    const thirdWeight = edge(first, second, point) / area;
    if (firstWeight >= 0 && secondWeight >= 0 && thirdWeight >= 0) setPixel(pixels, x, y, color);
  }
}

function edge(first: readonly number[], second: readonly number[], point: readonly number[]): number {
  return (point[0] - first[0]) * (second[1] - first[1]) - (point[1] - first[1]) * (second[0] - first[0]);
}

function setPixel(pixels: Buffer, x: number, y: number, color: readonly number[]): void {
  const index = (y * SIZE + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = 255;
}

function encodePng(pixels: Buffer, width: number, height: number): Buffer {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 4 + 1);
    scanlines[offset] = 0;
    pixels.copy(scanlines, offset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(scanlines)), pngChunk("IEND", Buffer.alloc(0))]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, data.length + 8)), data.length + 8);
  return chunk;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
