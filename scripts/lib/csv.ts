import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

/** Parses one CSV line into fields, handling double-quoted fields (GTFS files quote every field). */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Streams a (potentially very large) GTFS CSV file line-by-line, calling
 * `onRow` with an object keyed by header column name for every data row that
 * passes `filter` (checked cheaply, before allocating the full row object, to
 * keep memory usage low for multi-hundred-MB files like shapes.txt).
 */
export async function streamCsv(
  filePath: string,
  onRow: (row: Record<string, string>) => void,
): Promise<void> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  let headers: string[] | null = null;

  for await (const rawLine of rl) {
    if (rawLine.length === 0) continue;
    // GTFS files are frequently saved with a leading UTF-8 BOM, which would
    // otherwise corrupt the first header column's name (e.g. "\uFEFFroute_id").
    const line = headers === null ? rawLine.replace(/^\uFEFF/, "") : rawLine;
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }
    onRow(row);
  }
}
