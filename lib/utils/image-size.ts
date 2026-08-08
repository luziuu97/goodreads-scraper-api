/**
 * Lightweight server-side image dimension & format analyzer.
 * Parses JPEG, PNG, WEBP, and GIF headers from binary buffers without external native dependencies.
 */

export type ImageDimensions = {
  width: number | null;
  height: number | null;
  pixelCount: number | null;
  format: string | null;
};

/**
 * Parse image dimensions from a binary Buffer.
 */
export function parseImageDimensionsFromBuffer(buffer: Buffer): ImageDimensions {
  if (!buffer || buffer.length < 8) {
    return { width: null, height: null, pixelCount: null, format: null };
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    if (buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) {
        return {
          width,
          height,
          pixelCount: width * height,
          format: "png",
        };
      }
    }
  }

  // 2. GIF: GIF87a or GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    if (buffer.length >= 10) {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      if (width > 0 && height > 0) {
        return {
          width,
          height,
          pixelCount: width * height,
          format: "gif",
        };
      }
    }
  }

  // 3. WEBP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 30 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    const chunkType = buffer.toString("ascii", 12, 16);
    if (chunkType === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      if (width > 0 && height > 0) {
        return {
          width,
          height,
          pixelCount: width * height,
          format: "webp",
        };
      }
    } else if (chunkType === "VP8L" && buffer.length >= 25) {
      const b0 = buffer[21];
      const b1 = buffer[22];
      const b2 = buffer[23];
      const b3 = buffer[24];
      const b4 = buffer[25] || 0;
      const width = ((b0 | (b1 << 8) | ((b2 & 0x3f) << 16)) & 0x3fff) + 1;
      const height =
        ((((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) & 0x3fff) + 1);
      if (width > 0 && height > 0) {
        return {
          width,
          height,
          pixelCount: width * height,
          format: "webp",
        };
      }
    } else if (chunkType === "VP8X" && buffer.length >= 30) {
      const width =
        (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
      const height =
        (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
      if (width > 0 && height > 0) {
        return {
          width,
          height,
          pixelCount: width * height,
          format: "webp",
        };
      }
    }
  }

  // 4. JPEG: 0xFF 0xD8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];

      // SOF0..SOF15 markers (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 8 < buffer.length) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) {
            return {
              width,
              height,
              pixelCount: width * height,
              format: "jpeg",
            };
          }
        }
        break;
      } else {
        if (offset + 3 >= buffer.length) break;
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2) break;
        offset += 2 + length;
      }
    }
  }

  return { width: null, height: null, pixelCount: null, format: null };
}

/**
 * Fetch an image from a URL and compute its dimensions, pixelCount, and format.
 * Utilizes a strict timeout (default 3s) so calling this never blocks operations indefinitely.
 */
export async function getImageDimensions(
  url: string,
  timeoutMs: number = 3000
): Promise<ImageDimensions> {
  if (!url || !url.trim() || !/^https?:\/\//i.test(url.trim())) {
    return { width: null, height: null, pixelCount: null, format: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "goodreads-scraper-api/1.0 (+https://gdscraper.bookishnearby.com)",
        // Request first 32KB to read image headers
        Range: "bytes=0-32767",
      },
    });

    if (!res.ok && res.status !== 206) {
      return { width: null, height: null, pixelCount: null, format: null };
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return parseImageDimensionsFromBuffer(buffer);
  } catch {
    return { width: null, height: null, pixelCount: null, format: null };
  } finally {
    clearTimeout(timer);
  }
}
