import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, isMaskable = false) {
  // Simple uncompressed / deflated RGBA PNG generator
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Background gradient (#0f172a to #2563eb)
      const t = (x + y) / (width + height);
      let r = Math.round(15 * (1 - t) + 37 * t);
      let g = Math.round(23 * (1 - t) + 99 * t);
      let b = Math.round(42 * (1 - t) + 235 * t);
      let a = 255;

      const cardX = width * 0.18;
      const cardY = height * 0.22;
      const cardW = width * 0.64;
      const cardH = height * 0.64;

      // Card boundary
      const inCard = x >= cardX && x <= cardX + cardW && y >= cardY && y <= cardY + cardH;
      if (inCard) {
        // Calendar top header banner
        if (y < cardY + cardH * 0.22) {
          r = 37; g = 99; b = 235; // blue #2563eb
        } else {
          r = 255; g = 255; b = 255; // white body

          // Schedule rows / bars inside calendar body
          const relX = x - (cardX + cardW * 0.1);
          const relW = cardW * 0.8;
          const localX = x - cardX;
          const localY = y - cardY;

          // Row 1
          if (localY >= cardH * 0.32 && localY <= cardH * 0.48 && localX >= cardW * 0.1 && localX <= cardW * 0.9) {
            r = 239; g = 246; b = 255; // light blue row bg
            if (localX >= cardW * 0.15 && localX <= cardW * 0.35) {
              r = 37; g = 99; b = 235; // blue bar
            } else if (localX >= cardW * 0.4 && localX <= cardW * 0.75) {
              r = 203; g = 213; b = 225; // gray bar
            }
          }
          // Row 2
          else if (localY >= cardH * 0.54 && localY <= cardH * 0.70 && localX >= cardW * 0.1 && localX <= cardW * 0.9) {
            r = 255; g = 251; b = 235; // light amber row bg
            if (localX >= cardW * 0.15 && localX <= cardW * 0.35) {
              r = 245; g = 158; b = 11; // amber bar
            } else if (localX >= cardW * 0.4 && localX <= cardW * 0.8) {
              r = 203; g = 213; b = 225; // gray bar
            }
          }
          // Row 3
          else if (localY >= cardH * 0.76 && localY <= cardH * 0.92 && localX >= cardW * 0.1 && localX <= cardW * 0.9) {
            r = 240; g = 253; b = 244; // light green row bg
            if (localX >= cardW * 0.15 && localX <= cardW * 0.35) {
              r = 16; g = 185; b = 129; // green bar
            } else if (localX >= cardW * 0.4 && localX <= cardW * 0.7) {
              r = 203; g = 213; b = 225; // gray bar
            }
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  // Simple CRC32
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const compressed = zlib.deflateSync(rawData);
  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const pubDir = path.resolve('public');
if (!fs.existsSync(pubDir)) {
  fs.mkdirSync(pubDir, { recursive: true });
}

fs.writeFileSync(path.join(pubDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(pubDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(pubDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), createPng(180, 180, false));
fs.writeFileSync(path.join(pubDir, 'favicon.ico'), createPng(32, 32, false));

console.log('Schedule Calendar PWA PNG Icons generated successfully!');
