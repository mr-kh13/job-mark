import { inflateSync } from 'node:zlib';

const SIGNATURE_LENGTH = 8;
const COLOUR_TYPE_RGB = 2;
const COLOUR_TYPE_RGBA = 6;

const paeth = (left: number, above: number, upperLeft: number) => {
  const estimate = left + above - upperLeft;
  const toLeft = Math.abs(estimate - left);
  const toAbove = Math.abs(estimate - above);
  const toUpperLeft = Math.abs(estimate - upperLeft);
  if (toLeft <= toAbove && toLeft <= toUpperLeft) return left;
  return toAbove <= toUpperLeft ? above : upperLeft;
};

/**
 * Reads one pixel of a PNG with 8 bits per channel, RGB or RGBA, and no interlacing.
 *
 * @param png - The file's bytes.
 * @param x - The pixel's column.
 * @param y - The pixel's row.
 * @returns The pixel's red, green, blue and alpha, each 0 to 255.
 * @throws If the PNG has another layout.
 */
export function readPngPixel(png: Buffer, x: number, y: number): [number, number, number, number] {
  let width = 0;
  let colourType = 0;
  const data: Buffer[] = [];
  for (let at = SIGNATURE_LENGTH; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      const isPlain = body[8] === 8 && body[12] === 0;
      if (!isPlain) throw new Error('Only 8-bit PNGs without interlacing can be read.');
      width = body.readUInt32BE(0);
      colourType = body[9]!;
    }
    if (type === 'IDAT') data.push(body);
    at += length + 12;
  }
  if (colourType !== COLOUR_TYPE_RGB && colourType !== COLOUR_TYPE_RGBA) {
    throw new Error('Only RGB and RGBA PNGs can be read.');
  }

  const bytesPerPixel = colourType === COLOUR_TYPE_RGBA ? 4 : 3;
  const stride = width * bytesPerPixel;
  const packed = inflateSync(Buffer.concat(data));
  let above = new Uint8Array(stride);
  let row = new Uint8Array(stride);
  for (let line = 0; line <= y; line++) {
    const filter = packed[line * (stride + 1)]!;
    row = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const raw = packed[line * (stride + 1) + 1 + i]!;
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel]! : 0;
      const upperLeft = i >= bytesPerPixel ? above[i - bytesPerPixel]! : 0;
      const predictors = [
        0,
        left,
        above[i]!,
        (left + above[i]!) >> 1,
        paeth(left, above[i]!, upperLeft),
      ];
      row[i] = (raw + predictors[filter]!) & 255;
    }
    above = row;
  }
  const offset = x * bytesPerPixel;
  return [
    row[offset]!,
    row[offset + 1]!,
    row[offset + 2]!,
    bytesPerPixel === 4 ? row[offset + 3]! : 255,
  ];
}
