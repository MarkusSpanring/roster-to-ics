/**
 * RFC 5545 compliant iCalendar (.ics) generator.
 * Zero external dependencies.
 */

class IcsWriter {
  /**
   * Escape text according to RFC 5545 section 3.3.11.
   * Backslash, semicolon, comma, and newline must be escaped.
   */
  static escapeText(str) {
    if (!str) return "";
    return String(str)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  /**
   * Format a Date into local YYYYMMDDTHHMMSS for Europe/Vienna TZID.
   * Assumes the Date object represents the wall-clock time in Vienna.
   */
  static formatLocalDateTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}${m}${d}T${h}${min}${s}`;
  }

  /**
   * Format UTC timestamp for DTSTAMP: YYYYMMDDTHHMMSSZ
   */
  static formatUtcDateTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    const y = date.getUTCFullYear();
    const m = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const h = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const s = pad(date.getUTCSeconds());
    return `${y}${m}${d}T${h}${min}${s}Z`;
  }

  /**
   * Fold lines longer than 75 octets (RFC 5545 section 3.1).
   */
  static foldLine(line) {
    const maxLen = 75;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(line);

    if (encoded.length <= maxLen) {
      return line;
    }

    const chunks = [];
    let curOffset = 0;

    // First line can have up to 75 bytes
    // Continuation lines can have up to 74 bytes (because of leading space byte)
    let isFirst = true;

    while (curOffset < line.length) {
      const allowedBytes = isFirst ? maxLen : maxLen - 1;
      let count = 0;
      let sliceEnd = curOffset;

      while (sliceEnd < line.length) {
        const nextCharBytes = encoder.encode(line[sliceEnd]).length;
        if (count + nextCharBytes > allowedBytes) {
          break;
        }
        count += nextCharBytes;
        sliceEnd++;
      }

      if (sliceEnd === curOffset) {
        // Fallback for huge unicode glyph
        sliceEnd++;
      }

      const part = line.slice(curOffset, sliceEnd);
      chunks.push(isFirst ? part : " " + part);
      isFirst = false;
      curOffset = sliceEnd;
    }

    return chunks.join("\r\n");
  }

  /**
   * Generate an ICS string from selected events.
   * @param {Array<object>} events - list of event objects
   * @returns {string} ICS formatted string
   */
  static buildIcs(events) {
    const lines = [];
    const nowUtc = this.formatUtcDateTime(new Date());

    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//dienstplan//EN");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");

    // Static Europe/Vienna timezone definition
    lines.push("BEGIN:VTIMEZONE");
    lines.push("TZID:Europe/Vienna");
    lines.push("LAST-MODIFIED:20240101T000000Z");
    lines.push("BEGIN:DAYLIGHT");
    lines.push("TZNAME:CEST");
    lines.push("TZOFFSETFROM:+0100");
    lines.push("TZOFFSETTO:+0200");
    lines.push("DTSTART:19700329T020000");
    lines.push("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    lines.push("END:DAYLIGHT");
    lines.push("BEGIN:STANDARD");
    lines.push("TZNAME:CET");
    lines.push("TZOFFSETFROM:+0200");
    lines.push("TZOFFSETTO:+0100");
    lines.push("DTSTART:19701025T030000");
    lines.push("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    lines.push("END:STANDARD");
    lines.push("END:VTIMEZONE");

    const checkedEvents = events.filter((e) => e.checked);

    for (const event of checkedEvents) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${event.uid}`);
      lines.push(`DTSTAMP:${nowUtc}`);
      lines.push(`DTSTART;TZID=Europe/Vienna:${this.formatLocalDateTime(event.start)}`);
      lines.push(`DTEND;TZID=Europe/Vienna:${this.formatLocalDateTime(event.end)}`);

      if (event.title) {
        lines.push(`SUMMARY:${this.escapeText(event.title)}`);
      }
      if (event.room) {
        lines.push(`LOCATION:${this.escapeText(event.room)}`);
      }
      if (event.type) {
        lines.push(`DESCRIPTION:${this.escapeText(event.type)}`);
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    // Fold each line and join with CRLF
    return lines.map((line) => this.foldLine(line)).join("\r\n") + "\r\n";
  }
}
