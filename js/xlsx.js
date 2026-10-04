/**
 * Minimal zero-dependency XLSX reader for modern browsers.
 * Uses native DecompressionStream("deflate-raw") and DOMParser.
 */

// Limits against crafted files (zip bombs, huge row/column numbers)
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_COLS = 100;

class XlsxReader {
  /**
   * Parse a File or Blob of an .xlsx document.
   * @param {File|Blob} file
   * @returns {Promise<string[][]>} 2D array of cell string values.
   */
  static async read(file) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "DecompressionStream is not supported in this browser. Please use Safari 16.4+, Chrome 80+, or Firefox 113+."
      );
    }

    const buffer = await file.arrayBuffer();
    const zipEntries = await this._parseZip(new Uint8Array(buffer));

    // Find the sheet path from workbook.xml and its relationships
    const sheetPath = await this._findFirstSheetPath(zipEntries);

    // Read shared strings if present
    const sharedStrings = await this._readSharedStrings(zipEntries);

    // Read and parse worksheet
    const sheetXmlText = await this._readZipText(zipEntries, sheetPath);
    if (!sheetXmlText) {
      throw new Error(`Worksheet XML not found at ${sheetPath}`);
    }

    return this._parseWorksheet(sheetXmlText, sharedStrings);
  }

  static async _parseZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Locate End of Central Directory (EOCD) signature: 0x06054b50
    let eocdOffset = -1;
    const maxSearch = Math.min(bytes.byteLength, 65557);
    for (let i = bytes.byteLength - 22; i >= bytes.byteLength - maxSearch; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error("Invalid ZIP file or EOCD not found.");
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    const decoder = new TextDecoder("utf-8");
    const entries = new Map();

    let cur = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(cur, true) !== 0x02014b50) {
        break;
      }
      const compressionMethod = view.getUint16(cur + 10, true);
      const compressedSize = view.getUint32(cur + 20, true);
      const uncompressedSize = view.getUint32(cur + 24, true);
      const nameLength = view.getUint16(cur + 28, true);
      const extraLength = view.getUint16(cur + 30, true);
      const commentLength = view.getUint16(cur + 32, true);
      const localHeaderOffset = view.getUint32(cur + 42, true);

      const nameBytes = bytes.subarray(cur + 46, cur + 46 + nameLength);
      const name = decoder.decode(nameBytes);

      entries.set(name, {
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });

      cur += 46 + nameLength + extraLength + commentLength;
    }

    return { bytes, view, entries };
  }

  static async _readZipEntry(zip, entryName) {
    // Normalise name (remove leading slash if present)
    const targetName = entryName.startsWith("/") ? entryName.slice(1) : entryName;
    const entry = zip.entries.get(targetName);
    if (!entry) return null;

    const { bytes, view } = zip;
    const lhOffset = entry.localHeaderOffset;
    if (view.getUint32(lhOffset, true) !== 0x04034b50) {
      throw new Error(`Invalid local header for ${targetName}`);
    }

    const lhNameLength = view.getUint16(lhOffset + 26, true);
    const lhExtraLength = view.getUint16(lhOffset + 28, true);
    const dataOffset = lhOffset + 30 + lhNameLength + lhExtraLength;
    const compressedData = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      if (compressedData.length > MAX_ENTRY_BYTES) {
        throw new Error(`Entry ${targetName} exceeds size limit (${MAX_ENTRY_BYTES} bytes).`);
      }
      return compressedData;
    }

    if (entry.compressionMethod === 8) {
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        throw new Error(`Entry ${targetName} exceeds size limit (${MAX_ENTRY_BYTES} bytes).`);
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(compressedData);
          controller.close();
        },
      });
      const decompressedStream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = decompressedStream.getReader();
      const chunks = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_ENTRY_BYTES) {
          throw new Error(`Decompressed entry ${targetName} exceeds size limit (${MAX_ENTRY_BYTES} bytes).`);
        }
        chunks.push(value);
      }

      const result = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    }

    throw new Error(`Unsupported compression method (${entry.compressionMethod}) for ${targetName}`);
  }

  static async _readZipText(zip, entryName) {
    const data = await this._readZipEntry(zip, entryName);
    if (!data) return null;
    return new TextDecoder("utf-8").decode(data);
  }

  static async _findFirstSheetPath(zipEntries) {
    const workbookXml = await this._readZipText(zipEntries, "xl/workbook.xml");
    if (!workbookXml) {
      return "xl/worksheets/sheet1.xml";
    }

    const parser = new DOMParser();
    const wbDoc = parser.parseFromString(workbookXml, "application/xml");
    const firstSheet = wbDoc.querySelector("sheet");
    if (!firstSheet) {
      return "xl/worksheets/sheet1.xml";
    }

    const rId =
      firstSheet.getAttribute("r:id") ||
      firstSheet.getAttribute("id") ||
      firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");

    if (rId) {
      const relsXml = await this._readZipText(zipEntries, "xl/_rels/workbook.xml.rels");
      if (relsXml) {
        const relsDoc = parser.parseFromString(relsXml, "application/xml");
        const relElements = relsDoc.querySelectorAll("Relationship");
        let rel = null;
        for (let i = 0; i < relElements.length; i++) {
          if (relElements[i].getAttribute("Id") === rId) {
            rel = relElements[i];
            break;
          }
        }
        if (rel) {
          let target = rel.getAttribute("Target");
          if (target) {
            if (target.startsWith("/")) return target.slice(1);
            if (!target.startsWith("xl/")) return "xl/" + target;
            return target;
          }
        }
      }
    }

    return "xl/worksheets/sheet1.xml";
  }

  static async _readSharedStrings(zipEntries) {
    const sstXml = await this._readZipText(zipEntries, "xl/sharedStrings.xml");
    if (!sstXml) return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(sstXml, "application/xml");
    const siElements = doc.querySelectorAll("si");
    const strings = [];

    for (let i = 0; i < siElements.length; i++) {
      const si = siElements[i];
      const tElements = si.querySelectorAll("t");
      let text = "";
      for (let j = 0; j < tElements.length; j++) {
        text += tElements[j].textContent || "";
      }
      strings.push(text);
    }

    return strings;
  }

  static _colRefToIndex(colRef) {
    let index = 0;
    for (let i = 0; i < colRef.length; i++) {
      index = index * 26 + (colRef.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  static _parseWorksheet(xmlText, sharedStrings) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const rowElements = doc.querySelectorAll("row");

    const rows = [];

    for (let r = 0; r < rowElements.length; r++) {
      const rowEl = rowElements[r];
      const rAttr = parseInt(rowEl.getAttribute("r"), 10);
      const rowIdx = !isNaN(rAttr) ? rAttr - 1 : r;

      if (rowIdx < 0 || rowIdx >= MAX_ROWS) continue;

      if (!rows[rowIdx]) rows[rowIdx] = [];

      const cElements = rowEl.querySelectorAll("c");
      for (let c = 0; c < cElements.length; c++) {
        const cEl = cElements[c];
        const cellRef = cEl.getAttribute("r");
        let colIdx = c;
        if (cellRef) {
          const match = cellRef.match(/^([A-Z]+)/);
          if (match) {
            colIdx = this._colRefToIndex(match[1]);
          }
        }

        if (colIdx < 0 || colIdx >= MAX_COLS) continue;

        const tType = cEl.getAttribute("t");
        let cellVal = "";

        if (tType === "s") {
          const vEl = cEl.querySelector("v");
          if (vEl && vEl.textContent) {
            const idx = parseInt(vEl.textContent.trim(), 10);
            cellVal = sharedStrings[idx] !== undefined ? sharedStrings[idx] : "";
          }
        } else if (tType === "inlineStr") {
          const tEl = cEl.querySelector("is t");
          cellVal = tEl ? tEl.textContent || "" : "";
        } else {
          const vEl = cEl.querySelector("v");
          cellVal = vEl ? vEl.textContent || "" : "";
        }

        rows[rowIdx][colIdx] = cellVal;
      }
    }

    // Normalise array and fill holes within limits
    const result = [];
    const rowCount = Math.min(rows.length, MAX_ROWS);
    let maxCols = 0;
    for (let i = 0; i < rowCount; i++) {
      const row = rows[i] || [];
      if (row.length > maxCols) maxCols = Math.min(row.length, MAX_COLS);
    }

    for (let i = 0; i < rowCount; i++) {
      const row = rows[i] || [];
      const normalizedRow = [];
      for (let j = 0; j < maxCols; j++) {
        normalizedRow.push(row[j] !== undefined ? String(row[j]) : "");
      }
      result.push(normalizedRow);
    }

    return result;
  }
}
