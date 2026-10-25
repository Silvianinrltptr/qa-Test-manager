// Robust RFC-4180 compliant CSV parser that correctly handles:
// - Multiline cell contents (e.g. numbered Test Steps with \n inside quotes)
// - Commas inside quoted fields (e.g. "username: admin, password: Pass123!")
// - Escaped double quotes ("" -> ")
// - UTF-8 Byte Order Mark (\uFEFF)
// - Windows (CRLF) and Unix (LF) newlines
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, '');
  const parsedRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < clean.length) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        currentCell = '';
        if (currentRow.some(c => c.length > 0)) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        if (currentRow.some(c => c.length > 0)) {
          parsedRows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  // Push final remaining cell and row
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      parsedRows.push(currentRow);
    }
  }

  if (parsedRows.length === 0) {
    return { headers: [], rows: [] };
  }

  // Row 0 contains column headers (strip any outer quotes and trim)
  const headers = parsedRows[0].map(h => h.replace(/^["']|["']$/g, '').trim()).filter(Boolean);

  // Subsequent rows are data records mapped to headers
  const rows = parsedRows.slice(1)
    .filter(row => row.some(c => c.length > 0))
    .map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const val = row[idx];
        obj[h] = val !== undefined && val !== null ? val.trim() : '';
      });
      return obj;
    });

  return { headers, rows };
}

// Robust XLSX/XLS parser that uses array-of-arrays representation to preserve
// the exact worksheet header row and map all data cells without loss
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseXLSX(buffer: ArrayBuffer, XLSX: any): { headers: string[]; rows: Record<string, string>[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];

  // header: 1 returns raw array-of-arrays (row 0 is header row)
  const rawAoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as (string | number)[][];
  if (!rawAoa || rawAoa.length === 0) return { headers: [], rows: [] };

  const headers = (rawAoa[0] || []).map(h => String(h ?? '').trim()).filter(Boolean);

  const rows = rawAoa.slice(1)
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''))
    .map(row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const val = row[idx];
        obj[h] = val !== undefined && val !== null ? String(val).trim() : '';
      });
      return obj;
    });

  return { headers, rows };
}
