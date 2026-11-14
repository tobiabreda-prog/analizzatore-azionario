export const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;

// Both import entry points preserve the original UTF-8 BOM and line endings.
export async function readCsvFile(file) {
  if (!file || file.size > MAX_CSV_FILE_BYTES) throw new Error("Il CSV supera il limite di 5 MB.");
  try {
    return new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }).decode(await file.arrayBuffer());
  } catch { throw new Error("Il file deve essere un CSV codificato in UTF-8."); }
}
