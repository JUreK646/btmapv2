import {crc32, deflateRawSync} from 'node:zlib';

/** Builds a ZIP archive in memory for tests. Entries listed in `stored` are written uncompressed. */
export function makeZip(entries: Record<string, string | Buffer>, stored: string[] = []): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const isDirectory = name.endsWith('/');
    const method = isDirectory || stored.includes(name) ? 0 : 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const columnName = (index: number) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A minimal .xlsx workbook with one sheet of text cells, laid out the way Excel writes it. */
export function makeXlsx(rows: string[][]): Buffer {
  const strings: string[] = [];
  const index = (text: string) => { let i = strings.indexOf(text); if (i < 0) i = strings.push(text) - 1; return i; };
  const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cell === '' ? '' : `<c r="${columnName(c)}${r + 1}" t="s"><v>${index(cell)}</v></c>`).join('')}</row>`).join('');
  return makeZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/': '',
    'xl/worksheets/': '',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData>${sheet}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<?xml version="1.0" encoding="UTF-8"?><sst>${strings.map(s => `<si><t>${escapeXml(s)}</t></si>`).join('')}</sst>`,
  });
}
