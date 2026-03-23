'use strict';

/**
 * Generates placeholder PNG icons required by the Teams app manifest:
 *   color.png   — 192x192, solid #4f8cff (infynk brand blue)
 *   outline.png — 32x32,   solid white (replace with transparent-bg outline before submitting)
 *
 * Run once:  node manifest/generate-icons.js
 * Then replace both files with your actual brand artwork.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC-32 ────────────────────────────────────────────────────────────────────

function buildCrcTable() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}

const CRC_TABLE = buildCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG helpers ───────────────────────────────────────────────────────────────

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function makePng(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // colour type: RGB (no alpha)

  // Raw scanlines: filter byte 0 (None) + RGB pixels per row
  const rowBytes = 1 + width * 3;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      raw[base + 1 + x * 3 + 0] = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }

  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, chunk('IHDR', ihdrData), idat, iend]);
}

// ── Generate files ────────────────────────────────────────────────────────────

const dir = __dirname;

fs.writeFileSync(path.join(dir, 'color.png'), makePng(192, 192, 0x4f, 0x8c, 0xff));
console.log('✓ color.png   — 192×192 placeholder (#4f8cff)');

fs.writeFileSync(path.join(dir, 'outline.png'), makePng(32, 32, 255, 255, 255));
console.log('✓ outline.png — 32×32 placeholder (white)');

console.log('\nReplace these placeholders with your actual brand artwork before');
console.log('uploading the manifest zip to Microsoft Teams.');
