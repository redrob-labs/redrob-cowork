import { inflateRawSync } from "node:zlib";

/**
 * A small ZIP writer and reader for handoff bundles: stored entries out, stored or deflated
 * entries in. Mirrors the desktop's workspace archive (apps/desktop/electron/workspace-archive.mjs)
 * so either side can open what the other writes, with the same limits.
 */

export const ZIP_LIMITS = {
  archiveBytes: 64 * 1024 * 1024,
  entries: 1024,
  entryBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
} as const;

export type ZipEntry = { name: string; data: Buffer };

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
/** General-purpose flag 11: names are UTF-8. */
const UTF8_FLAG = 0x0800;

let crcTable: Uint32Array | null = null;
export function crc32(buffer: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Relative, forward slashes, no `..`, no empty or dot segments, no drive letters, no NUL.
 * Anything else could write outside the folder it is unpacked into.
 */
export function isSafeZipPath(name: string): boolean {
  if (!name || name.length > 512 || name.includes("\0") || name.includes("\\")) return false;
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return name.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function writeZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > ZIP_LIMITS.entries) throw new ZipError("Too many entries");
  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  let total = 0;
  for (const entry of entries) {
    if (!isSafeZipPath(entry.name)) throw new ZipError(`Unsafe entry name: ${entry.name}`);
    if (seen.has(entry.name)) throw new ZipError(`Duplicate entry: ${entry.name}`);
    seen.add(entry.name);
    if (entry.data.length > ZIP_LIMITS.entryBytes) throw new ZipError(`Entry too large: ${entry.name}`);
    total += entry.data.length;
    if (total > ZIP_LIMITS.totalBytes) throw new ZipError("Bundle too large");
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + entry.data.length;
  }
  const centralBytes = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function findEndOfCentral(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let index = buffer.length - 22; index >= min; index -= 1) {
    if (buffer.readUInt32LE(index) === END_OF_CENTRAL) return index;
  }
  throw new ZipError("Not a ZIP file");
}

/** Every entry, inflated and checked against the limits and its CRC. Directories are skipped. */
export function readZip(buffer: Buffer): ZipEntry[] {
  if (buffer.length > ZIP_LIMITS.archiveBytes) throw new ZipError("Bundle too large");
  if (buffer.length < 22) throw new ZipError("Not a ZIP file");
  const end = findEndOfCentral(buffer);
  const count = buffer.readUInt16LE(end + 10);
  if (count > ZIP_LIMITS.entries) throw new ZipError("Too many entries");
  let cursor = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_HEADER) throw new ZipError("Damaged ZIP directory");
    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (!isSafeZipPath(name)) throw new ZipError(`Unsafe entry name: ${name}`);
    if (seen.has(name)) throw new ZipError(`Duplicate entry: ${name}`);
    seen.add(name);
    if (size > ZIP_LIMITS.entryBytes) throw new ZipError(`Entry too large: ${name}`);
    total += size;
    if (total > ZIP_LIMITS.totalBytes) throw new ZipError("Bundle too large");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_HEADER) throw new ZipError("Damaged ZIP entry");
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const raw = buffer.subarray(start, start + compressed);
    if (raw.length !== compressed) throw new ZipError("Truncated ZIP entry");
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: ZIP_LIMITS.entryBytes });
    else throw new ZipError(`Unsupported compression in ${name}`);
    if (data.length !== size || crc32(data) !== checksum) throw new ZipError(`Corrupt entry: ${name}`);
    entries.push({ name, data });
  }
  return entries;
}
