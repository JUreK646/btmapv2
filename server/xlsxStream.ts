import { readZipDirectory, readZipEntryText, zipEntryStream, type ZipEntry } from './zip.ts';

const unescapeXml = (text: string) => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&amp;/g, '&');

const columnIndex = (letters: string) => {
  let index = 0;
  for (let i = 0; i < letters.length; i++) index = index * 26 + (letters.charCodeAt(i) - 64);
  return index - 1;
};

const textOf = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('');

/** Cells of one `<row>` element; empty cells are left as holes. */
export function parseSheetRow(rowXml: string, sharedStrings: string[]): string[] {
  const cells: string[] = [];
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const body = m[3];
    if (!body) continue;
    const attrs = m[2];
    if (attrs.includes('t="inlineStr"')) { cells[columnIndex(m[1])] = unescapeXml(textOf(body)); continue; }
    const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (value === undefined) continue;
    cells[columnIndex(m[1])] = attrs.includes('t="s"') ? (sharedStrings[Number(value)] ?? '') : unescapeXml(value);
  }
  return cells;
}

/** The sheet names of a workbook, in order. */
export async function sheetNames(xlsxPath: string): Promise<string[]> {
  const entries = readZipDirectory(xlsxPath);
  const workbook = entries.find(e => e.name === 'xl/workbook.xml');
  if (!workbook) throw new Error('Plik nie jest skoroszytem Excela (brak xl/workbook.xml).');
  return [...(await readZipEntryText(xlsxPath, workbook)).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => unescapeXml(m[1]));
}

/**
 * Rows of one sheet of an .xlsx file, streamed. The sheet XML is never held in memory as a whole,
 * so registers of several hundred megabytes can be read.
 */
export async function* streamSheetRows(xlsxPath: string, sheetName: string): AsyncGenerator<string[]> {
  const entries = readZipDirectory(xlsxPath);
  const entry = (name: string) => entries.find(e => e.name === name);
  const text = async (e: ZipEntry | undefined) => (e ? readZipEntryText(xlsxPath, e) : '');

  const workbook = await text(entry('xl/workbook.xml'));
  const sheet = [...workbook.matchAll(/<sheet ([^>]*)\/?>/g)].map(m => m[1]).find(attrs => unescapeXml(attrs.match(/name="([^"]*)"/)?.[1] || '') === sheetName);
  if (!sheet) throw new Error(`Skoroszyt nie ma arkusza „${sheetName}”.`);
  const relId = sheet.match(/r:id="([^"]+)"/)?.[1];
  const rels = await text(entry('xl/_rels/workbook.xml.rels'));
  const relation = [...rels.matchAll(/<Relationship ([^>]*)\/?>/g)].map(m => m[1]).find(attrs => attrs.includes(`Id="${relId}"`));
  const target = relation?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error(`Nie znaleziono danych arkusza „${sheetName}”.`);
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheetEntry = entry(sheetPath);
  if (!sheetEntry) throw new Error(`Brak pliku arkusza „${sheetName}” (${sheetPath}).`);

  const sharedStrings = [...(await text(entry('xl/sharedStrings.xml'))).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unescapeXml(textOf(m[1])));

  let buffer = '';
  const stream = zipEntryStream(xlsxPath, sheetEntry);
  stream.setEncoding('utf8');
  for await (const chunk of stream) {
    buffer += chunk;
    let at = 0;
    for (;;) {
      let start = buffer.indexOf('<row', at);
      // Not <rowBreaks> or another element that merely starts with "row".
      while (start >= 0 && start + 4 < buffer.length && !/[\s>/]/.test(buffer[start + 4])) start = buffer.indexOf('<row', start + 4);
      if (start < 0 || start + 4 >= buffer.length) break;
      const selfClosing = buffer.indexOf('/>', start);
      const open = buffer.indexOf('>', start);
      if (open < 0) break;
      // An empty row is written as <row .../>.
      if (selfClosing >= 0 && selfClosing + 1 === open) { yield []; at = open + 1; continue; }
      const end = buffer.indexOf('</row>', open);
      if (end < 0) break;
      yield parseSheetRow(buffer.slice(open + 1, end), sharedStrings);
      at = end + 6;
    }
    buffer = buffer.slice(at);
  }
}
