import { closeSync, createReadStream, createWriteStream, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

/**
 * Extracts a ZIP archive (which is also what an .xlsx file is) into a directory.
 *
 * Done in-process instead of shelling out to `tar -xf`: bsdtar on Windows and macOS reads ZIP,
 * but GNU tar in the Linux container does not, and archive names must never reach a shell.
 * Supports stored and deflated entries; ZIP64 and encrypted archives are rejected.
 * Returns the extracted file names.
 */
export async function extractZip(zipPath: string, destDir: string): Promise<string[]> {
  const fd = openSync(zipPath, 'r');
  const read = (position: number, length: number) => {
    const buffer = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
      const n = readSync(fd, buffer, done, length - done, position + done);
      if (n <= 0) throw new Error('Archiwum ZIP jest uszkodzone (nieoczekiwany koniec pliku).');
      done += n;
    }
    return buffer;
  };

  const entries: Array<{ name: string; method: number; compressedSize: number; dataStart: number }> = [];
  try {
    const size = fstatSync(fd).size;
    // The end-of-central-directory record sits at the end, after an optional comment of up to 64 KiB.
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = read(size - tailLength, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Plik nie jest archiwum ZIP.');
    const count = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error('Archiwa ZIP64 nie są obsługiwane.');

    const directory = read(directoryOffset, directorySize);
    const root = resolve(destDir);
    let at = 0;
    for (let i = 0; i < count; i++) {
      if (at + 46 > directory.length || directory.readUInt32LE(at) !== 0x02014b50) throw new Error('Archiwum ZIP jest uszkodzone (katalog centralny).');
      const flags = directory.readUInt16LE(at + 8);
      const method = directory.readUInt16LE(at + 10);
      const compressedSize = directory.readUInt32LE(at + 20);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      const localOffset = directory.readUInt32LE(at + 42);
      const name = directory.toString('utf8', at + 46, at + 46 + nameLength).replace(/\\/g, '/');
      at += 46 + nameLength + extraLength + commentLength;

      if (flags & 1) throw new Error('Zaszyfrowane archiwa ZIP nie są obsługiwane.');
      // An entry must stay inside the destination ("zip slip").
      const target = resolve(root, name);
      if (target !== root && !target.startsWith(root + sep)) throw new Error(`Archiwum ZIP zawiera niedozwoloną ścieżkę: ${name}`);
      if (name.endsWith('/')) { mkdirSync(target, { recursive: true }); continue; }
      if (method !== 0 && method !== 8) throw new Error(`Nieobsługiwana metoda kompresji ZIP (${method}) w pliku ${name}.`);

      const local = read(localOffset, 30);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('Archiwum ZIP jest uszkodzone (nagłówek pliku).');
      entries.push({ name, method, compressedSize, dataStart: localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28) });
    }
  } finally {
    closeSync(fd);
  }

  for (const entry of entries) {
    const target = resolve(destDir, entry.name);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.compressedSize === 0) { writeFileSync(target, ''); continue; }
    const source = createReadStream(zipPath, { start: entry.dataStart, end: entry.dataStart + entry.compressedSize - 1 });
    if (entry.method === 0) await pipeline(source, createWriteStream(target));
    else await pipeline(source, createInflateRaw(), createWriteStream(target));
  }
  return entries.map(entry => entry.name);
}
