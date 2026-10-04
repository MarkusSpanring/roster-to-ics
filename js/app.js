/**
 * Duty Roster → Calendar Web Application Logic
 */

const FIELDS = [
  { key: "date", label: "Date", aliases: ["datum", "date", "tag"], required: true },
  { key: "start", label: "Start", aliases: ["von", "beg", "beginn", "start", "ab"], required: true },
  { key: "end", label: "End", aliases: ["bis", "ende", "end", "schluss"], required: false },
  { key: "title", label: "Title", aliases: ["kurztitel", "vorstellung", "titel", "title", "stück", "produktion"], required: true },
  { key: "room", label: "Room", aliases: ["raum", "ort", "bühne", "room", "location"], required: false },
  { key: "type", label: "Type", aliases: ["terminart", "typ", "art", "type"], required: false },
];

const GERMAN_MONTHS = {
  jan: 0,
  jän: 0,
  jaen: 0,
  feb: 1,
  mär: 2,
  maer: 2,
  mar: 2,
  apr: 3,
  mai: 4,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  dez: 11,
  dec: 11,
};

let rawRows = [];
let headerRowIndex = -1;
let headers = [];
let columnMapping = {};
let tempMapping = {};
let parsedEvents = [];
let defaultMonthYear = "dienstplan";
let currentFileName = "";

// DOM Elements
const fileInput = document.getElementById("file");
const exportBtn = document.getElementById("export");
const settingsBtn = document.getElementById("settings-btn");
const statusEl = document.getElementById("status");
const statusChipEl = document.getElementById("status-chip");
const statusIconEl = document.getElementById("status-icon");
const calendarEl = document.getElementById("calendar");
const legendEl = document.getElementById("calendar-legend");

// Modal Elements
const settingsModal = document.getElementById("settings-modal");
const modalDescEl = document.getElementById("modal-desc");
const modalCloseBtn = document.getElementById("modal-close");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalApplyBtn = document.getElementById("modal-apply-btn");
const sampleEntryContainer = document.getElementById("sample-entry-container");
const previewTableEl = document.getElementById("preview-table");
const mappingFieldsEl = document.getElementById("mapping-fields");

// Theme Toggle Elements & Logic
const themeToggleBtn = document.getElementById("theme-toggle");
const themeIconEl = document.getElementById("theme-icon");
const THEME_STORAGE_KEY = "dienstplan_theme";

function initTheme() {
  let theme = "light";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch (e) {
    // Ignore storage errors
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (themeIconEl) themeIconEl.textContent = "☀️";
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (themeIconEl) themeIconEl.textContent = "🌙";
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (e) {
      // Ignore storage errors
    }
  });
}

initTheme();

// File input handler: instantly opens the import settings modal
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  currentFileName = file.name;
  setStatus(`Reading ${file.name}...`, "⏳", "loading");
  exportBtn.disabled = true;
  calendarEl.innerHTML = "";
  legendEl.hidden = true;

  try {
    rawRows = await XlsxReader.read(file);
    if (!rawRows || rawRows.length === 0) {
      setStatus("The uploaded file is empty.", "⚠️", "warning");
      return;
    }

    headerRowIndex = detectHeaderRow(rawRows);
    headers = rawRows[headerRowIndex].map((h) => h.trim());

    initAutoMapping();

    // Open import settings modal directly upon file selection
    openSettingsModal();
    setStatus(`Configuring import for ${currentFileName}...`, "⚙️", "default");
  } catch (err) {
    console.error(err);
    setStatus(`Error reading file: ${err.message}`, "❌", "error");
  }
});

function setStatus(text, icon = "ℹ️", state = "default") {
  statusEl.textContent = text;
  statusIconEl.textContent = icon;
  statusChipEl.className = `status-chip ${state}`;
}

/**
 * Detect the header row.
 * Searches for known header markers such as "Datum" or "Date",
 * or falls back to the row with the most populated columns.
 */
function detectHeaderRow(rows) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (row.some((cell) => /^(datum|date)$/i.test(cell.trim()))) {
      return r;
    }
  }

  // Fallback: row with most non-empty columns
  let bestIdx = 0;
  let maxCount = 0;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const count = rows[r].filter((c) => c.trim().length > 0).length;
    if (count > maxCount) {
      maxCount = count;
      bestIdx = r;
    }
  }
  return bestIdx;
}

const STORAGE_KEY = "dienstplan_saved_mapping";

function loadSavedMapping() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveMappingToStorage(mapping) {
  try {
    const toSave = {};
    for (const field of FIELDS) {
      const idx = mapping[field.key];
      if (typeof idx === "number" && idx >= 0 && idx < headers.length) {
        toSave[field.key] = {
          name: headers[idx],
          index: idx,
        };
      } else {
        toSave[field.key] = { name: null, index: -1 };
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    // Ignore storage quota or access errors
  }
}

/**
 * Automatically match fields with headers.
 * Prioritizes user's previously saved preferences before standard aliases.
 */
function initAutoMapping() {
  const saved = loadSavedMapping();
  columnMapping = {};

  for (const field of FIELDS) {
    let matchedIdx = -1;

    // 1. Try matching with user's previously saved mapping for this field
    if (saved && saved[field.key]) {
      const savedItem = saved[field.key];
      if (typeof savedItem.name === "string" && savedItem.name.trim()) {
        const foundByName = headers.findIndex(
          (h) => h.toLowerCase() === savedItem.name.toLowerCase().trim()
        );
        if (foundByName !== -1) {
          matchedIdx = foundByName;
        }
      }
      if (
        matchedIdx === -1 &&
        typeof savedItem.index === "number" &&
        savedItem.index >= 0 &&
        savedItem.index < headers.length
      ) {
        matchedIdx = savedItem.index;
      }
    }

    // 2. Exact alias match
    if (matchedIdx === -1) {
      for (const alias of field.aliases) {
        const idx = headers.findIndex((h) => h.toLowerCase() === alias.toLowerCase());
        if (idx !== -1) {
          matchedIdx = idx;
          break;
        }
      }
    }

    // 3. Partial alias match if not found
    if (matchedIdx === -1) {
      for (const alias of field.aliases) {
        const idx = headers.findIndex((h) => h.toLowerCase().includes(alias.toLowerCase()));
        if (idx !== -1) {
          matchedIdx = idx;
          break;
        }
      }
    }

    columnMapping[field.key] = matchedIdx;
  }
}

function indexToColLetter(idx) {
  let letter = "";
  while (idx >= 0) {
    letter = String.fromCharCode((idx % 26) + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

// Modal handling
function openSettingsModal() {
  tempMapping = { ...columnMapping };
  if (currentFileName) {
    modalDescEl.textContent = `File: ${currentFileName} (Header detected at row ${headerRowIndex + 1}). Adjust column mappings below; the sample calendar entry updates in real-time.`;
  }
  renderMappingUI();
  renderPreviewTable();
  updateSampleEntryPreview();

  settingsModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeSettingsModal() {
  settingsModal.hidden = true;
  document.body.style.overflow = "";
}

settingsBtn.addEventListener("click", openSettingsModal);
modalCloseBtn.addEventListener("click", closeSettingsModal);
modalCancelBtn.addEventListener("click", closeSettingsModal);

modalApplyBtn.addEventListener("click", () => {
  columnMapping = { ...tempMapping };
  saveMappingToStorage(columnMapping);
  closeSettingsModal();
  processData();
  settingsBtn.disabled = false;
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) {
    closeSettingsModal();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsModal.hidden) {
    closeSettingsModal();
  }
});

function renderMappingUI() {
  mappingFieldsEl.innerHTML = "";

  for (const field of FIELDS) {
    const item = document.createElement("div");
    item.className = "mapping-item";

    const label = document.createElement("label");
    label.innerHTML = `${field.label}${field.required ? ' <span class="req">*</span>' : ""}:`;
    label.htmlFor = `map-${field.key}`;

    const select = document.createElement("select");
    select.id = `map-${field.key}`;

    const noneOpt = document.createElement("option");
    noneOpt.value = "-1";
    noneOpt.textContent = "— Not used —";
    select.appendChild(noneOpt);

    headers.forEach((h, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      const colLetter = indexToColLetter(idx);
      opt.textContent = `[${colLetter}] ${h || `Column ${idx + 1}`}`;
      if (tempMapping[field.key] === idx) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.addEventListener("change", (e) => {
      tempMapping[field.key] = parseInt(e.target.value, 10);
      updateSampleEntryPreview();
    });

    item.appendChild(label);
    item.appendChild(select);
    mappingFieldsEl.appendChild(item);
  }
}

function renderPreviewTable() {
  previewTableEl.innerHTML = "";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headers.forEach((h, idx) => {
    const th = document.createElement("th");
    const colName = indexToColLetter(idx);
    th.innerHTML = `<span class="col-badge">${colName}</span> ${escapeHtml(h) || `(Col ${idx + 1})`}`;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  previewTableEl.appendChild(thead);

  const tbody = document.createElement("tbody");

  if (rawRows.length > 0 && headerRowIndex !== -1) {
    const dataRows = rawRows.slice(headerRowIndex + 1, headerRowIndex + 6);
    dataRows.forEach((row) => {
      const tr = document.createElement("tr");
      headers.forEach((_, idx) => {
        const td = document.createElement("td");
        td.textContent = row[idx] !== undefined ? row[idx] : "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  previewTableEl.appendChild(tbody);
}

/**
 * Live preview of a single sample calendar entry using the current tempMapping.
 */
function updateSampleEntryPreview() {
  if (!sampleEntryContainer) return;

  const dataRows = rawRows.slice(headerRowIndex + 1);
  let sampleEvent = null;
  let lastDate = null;

  for (const row of dataRows) {
    const dateVal = tempMapping.date !== -1 ? (row[tempMapping.date] || "") : "";
    const startVal = tempMapping.start !== -1 ? (row[tempMapping.start] || "") : "";
    const endVal = tempMapping.end !== -1 ? (row[tempMapping.end] || "") : "";
    const titleVal = tempMapping.title !== -1 ? (row[tempMapping.title] || "").trim() : "";
    const roomVal = tempMapping.room !== -1 ? (row[tempMapping.room] || "").trim() : "";
    const typeVal = tempMapping.type !== -1 ? (row[tempMapping.type] || "").trim() : "";

    const parsedD = parseDateCell(dateVal);
    if (parsedD) {
      lastDate = parsedD;
    }
    const effectiveDate = parsedD || (dateVal.trim() === "" ? lastDate : null);
    const startTime = parseTimeCell(startVal);

    if (effectiveDate && startTime && titleVal) {
      const startDT = new Date(
        effectiveDate.getFullYear(),
        effectiveDate.getMonth(),
        effectiveDate.getDate(),
        startTime.hours,
        startTime.minutes,
        0
      );

      let endDT = null;
      let endUnknown = false;
      const endTime = parseTimeCell(endVal);

      if (endTime) {
        endDT = new Date(
          effectiveDate.getFullYear(),
          effectiveDate.getMonth(),
          effectiveDate.getDate(),
          endTime.hours,
          endTime.minutes,
          0
        );
        if (endDT <= startDT) {
          endDT.setDate(endDT.getDate() + 1);
        }
      } else {
        endDT = new Date(startDT.getTime() + 3 * 3600 * 1000);
        endUnknown = true;
      }

      sampleEvent = {
        start: startDT,
        end: endDT,
        endUnknown,
        title: titleVal,
        room: roomVal,
        type: typeVal,
        category: getCategoryForType(typeVal),
      };
      break;
    }
  }

  if (!sampleEvent) {
    sampleEntryContainer.innerHTML = `
      <div class="sample-warning">
        <span>⚠️</span>
        <span>Cannot generate preview entry. Please ensure <strong>Date</strong>, <strong>Start</strong>, and <strong>Title</strong> columns are correctly selected.</span>
      </div>
    `;
    return;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const dateFormatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(sampleEvent.start);

  const timeLabel = `${pad(sampleEvent.start.getHours())}:${pad(sampleEvent.start.getMinutes())}`;
  const endLabel = `${pad(sampleEvent.end.getHours())}:${pad(sampleEvent.end.getMinutes())}${sampleEvent.endUnknown ? " (end unknown)" : ""}`;

  sampleEntryContainer.innerHTML = `
    <div class="sample-card">
      <div class="sample-card-header">
        <span class="sample-date-badge">📅 ${dateFormatted}</span>
        <span class="sample-time-range">🕒 ${timeLabel} – ${endLabel}</span>
      </div>
      <div class="event-item ${sampleEvent.category.className}">
        <input type="checkbox" checked disabled>
        <div class="event-details">
          <div class="event-top-row">
            <span class="event-time">${timeLabel}</span>
            ${sampleEvent.type ? `<span class="event-badge">${escapeHtml(sampleEvent.type)}</span>` : ""}
          </div>
          <span class="event-title">${escapeHtml(sampleEvent.title)}</span>
        </div>
      </div>
      <div class="sample-card-meta">
        ${sampleEvent.room ? `<span>📍 <strong>Room:</strong> ${escapeHtml(sampleEvent.room)}</span>` : "<span>📍 <em>Room: unmapped</em></span>"}
        ${sampleEvent.type ? `<span>🏷️ <strong>Type:</strong> ${escapeHtml(sampleEvent.type)}</span>` : "<span>🏷️ <em>Type: unmapped</em></span>"}
      </div>
    </div>
  `;
}

// Event Type Color-Coding Logic
const EVENT_CATEGORIES = [
  {
    key: "vorst",
    name: "Performance",
    keywords: ["vorst", "erstev", "letztev"],
    className: "cat-vorst",
  },
  {
    key: "prem",
    name: "Premiere / Revival",
    keywords: ["prem", "wa"],
    className: "cat-prem",
  },
  {
    key: "probe",
    name: "Stage Rehearsal (BOP / GP / HP)",
    keywords: ["bop", "hp", "gp", "gp öff", "ohp"],
    className: "cat-probe",
  },
  {
    key: "sitz",
    name: "Music / Room Rehearsal (OA / SondPr)",
    keywords: ["oa", "ositz", "sondpr", "probe"],
    className: "cat-sitz",
  },
  {
    key: "konz",
    name: "Concert / Ball",
    keywords: ["konz", "ball"],
    className: "cat-konz",
  },
  {
    key: "schul",
    name: "School Event",
    keywords: ["schul"],
    className: "cat-schul",
  },
];

function getCategoryForType(typeStr) {
  if (!typeStr) return { key: "other", name: "Other", className: "cat-other" };
  const lower = typeStr.toLowerCase().trim();

  for (const cat of EVENT_CATEGORIES) {
    if (cat.keywords.some((k) => lower.includes(k))) {
      return cat;
    }
  }

  return { key: "other", name: "Other", className: "cat-other" };
}

/**
 * Robust date parser supporting:
 * - DD.MM.YYYY and DD.MM.YY with optional day-of-week prefixes (e.g. "So, 01.11.26")
 * - DD Mon YYYY / DD Mon YY (e.g. "01 Dez 2026")
 * - Excel serial date numbers
 * Returns null if the cell does not contain a recognizable date.
 */
function parseDateCell(val) {
  if (!val) return null;
  val = String(val).trim();
  if (!val) return null;

  // 1. Excel serial number
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // 2. DD.MM.YYYY or DD.MM.YY anywhere in string (e.g. "So, 01.11.26" or "01.11.2026")
  const dotMatch = val.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10) - 1;
    let year = parseInt(dotMatch[3], 10);
    if (year < 100) year += 2000;
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // 3. DD Mon YYYY / DD Mon YY (e.g. "01 Dez 2026")
  const wordMatch = val.match(/(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]+)\.?\s+(\d{2,4})/);
  if (wordMatch) {
    const day = parseInt(wordMatch[1], 10);
    const mStr = wordMatch[2].toLowerCase();
    let year = parseInt(wordMatch[3], 10);
    if (year < 100) year += 2000;
    const month = GERMAN_MONTHS[mStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // 4. Fallback standard Date.parse (only if resolves to plausible date)
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
}

/**
 * Robust time parser. Returns null for empty, "?", "-?-", or invalid times.
 */
function parseTimeCell(val) {
  if (!val) return null;
  val = String(val).trim();

  // If contains question mark or dash-only placeholder
  if (/[?]/.test(val) || /^[-:\s]+$/.test(val)) {
    return null;
  }

  // Excel day fraction (e.g., 0.458333)
  const num = Number(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
  }

  const match = val.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return { hours, minutes };
    }
  }

  return null;
}

function processData() {
  for (const field of FIELDS) {
    if (field.required && columnMapping[field.key] === -1) {
      setStatus(`Missing mapping for required field: ${field.label}. Open Settings to select.`, "⚠️", "warning");
      calendarEl.innerHTML = "";
      legendEl.hidden = true;
      exportBtn.disabled = true;
      return;
    }
  }

  parsedEvents = [];
  let skippedCount = 0;
  let lastSeenDate = null;

  const dataRows = rawRows.slice(headerRowIndex + 1);

  dataRows.forEach((row) => {
    const dateVal = columnMapping.date !== -1 ? (row[columnMapping.date] || "") : "";
    const startVal = columnMapping.start !== -1 ? (row[columnMapping.start] || "") : "";
    const endVal = columnMapping.end !== -1 ? (row[columnMapping.end] || "") : "";
    const titleVal = columnMapping.title !== -1 ? (row[columnMapping.title] || "").trim() : "";
    const roomVal = columnMapping.room !== -1 ? (row[columnMapping.room] || "").trim() : "";
    const typeVal = columnMapping.type !== -1 ? (row[columnMapping.type] || "").trim() : "";

    // Ignore completely empty rows
    if (!dateVal && !startVal && !titleVal) {
      return;
    }

    const parsedD = parseDateCell(dateVal);
    if (parsedD) {
      lastSeenDate = parsedD;
    }
    const eventDate = parsedD || (dateVal.trim() === "" ? lastSeenDate : null);
    const startTime = parseTimeCell(startVal);

    if (!eventDate || !startTime || !titleVal) {
      skippedCount++;
      return;
    }

    const startDateTime = new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      startTime.hours,
      startTime.minutes,
      0
    );

    let endDateTime = null;
    let endUnknown = false;
    const endTime = parseTimeCell(endVal);

    if (endTime) {
      endDateTime = new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate(),
        endTime.hours,
        endTime.minutes,
        0
      );
      // Spans past midnight
      if (endDateTime <= startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }
    } else {
      // Missing or "?" -> default 3 hours duration
      endDateTime = new Date(startDateTime.getTime() + 3 * 3600 * 1000);
      endUnknown = true;
    }

    // Stable UID
    const dateStr = startDateTime.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = `${String(startTime.hours).padStart(2, "0")}${String(startTime.minutes).padStart(2, "0")}`;
    const slug = (str) =>
      str.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const uid = `${dateStr}T${timeStr}-${slug(titleVal)}-${slug(roomVal || "event")}@dienstplan`;

    const category = getCategoryForType(typeVal);

    parsedEvents.push({
      uid,
      start: startDateTime,
      end: endDateTime,
      endUnknown,
      title: titleVal,
      room: roomVal,
      type: typeVal,
      category,
      checked: true,
    });
  });

  // Sort events chronologically
  parsedEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

  if (parsedEvents.length > 0) {
    const firstEvent = parsedEvents[0];
    const y = firstEvent.start.getFullYear();
    const m = String(firstEvent.start.getMonth() + 1).padStart(2, "0");
    defaultMonthYear = `dienstplan-${y}-${m}`;
  }

  renderLegend();
  renderCalendar();
  updateStatus(skippedCount);
}

function renderLegend() {
  legendEl.innerHTML = "";
  if (parsedEvents.length === 0) {
    legendEl.hidden = true;
    return;
  }

  const presentCategories = new Set(parsedEvents.map((e) => e.category.key));
  const activeList = EVENT_CATEGORIES.filter((c) => presentCategories.has(c.key));

  if (presentCategories.has("other")) {
    activeList.push({ key: "other", name: "Other", className: "cat-other" });
  }

  if (activeList.length === 0) {
    legendEl.hidden = true;
    return;
  }

  const label = document.createElement("span");
  label.className = "legend-label";
  label.textContent = "Event Types:";
  legendEl.appendChild(label);

  for (const cat of activeList) {
    const item = document.createElement("div");
    item.className = `legend-item ${cat.className}`;
    item.innerHTML = `<span class="legend-swatch"></span><span>${cat.name}</span>`;
    legendEl.appendChild(item);
  }

  legendEl.hidden = false;
}

function updateStatus(skippedCount = 0) {
  const selectedCount = parsedEvents.filter((e) => e.checked).length;
  const totalCount = parsedEvents.length;

  let msg = `${selectedCount} of ${totalCount} appointments selected.`;
  if (skippedCount > 0) {
    msg += ` (${skippedCount} non-event rows ignored).`;
  }
  setStatus(msg, "📅", "success");

  exportBtn.disabled = selectedCount === 0;
}

function renderCalendar() {
  calendarEl.innerHTML = "";

  if (parsedEvents.length === 0) {
    setStatus("No valid appointments found in the file with current mappings.", "⚠️", "warning");
    exportBtn.disabled = true;
    return;
  }

  // Group events by Month (key: YYYY-MM)
  const monthGroups = new Map();
  for (const event of parsedEvents) {
    const key = `${event.start.getFullYear()}-${String(event.start.getMonth() + 1).padStart(2, "0")}`;
    if (!monthGroups.has(key)) {
      monthGroups.set(key, []);
    }
    monthGroups.get(key).push(event);
  }

  for (const [monthKey, events] of monthGroups.entries()) {
    const [yearStr, monthStr] = monthKey.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    const monthContainer = document.createElement("section");
    monthContainer.className = "month-container";

    const titleEl = document.createElement("h2");
    const monthName = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
    }).format(new Date(year, monthIndex, 1));
    titleEl.textContent = monthName;
    monthContainer.appendChild(titleEl);

    const grid = document.createElement("div");
    grid.className = "calendar-grid";

    // Day of week headers (Mon - Sun)
    const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const dh of dayHeaders) {
      const hCell = document.createElement("div");
      hCell.className = "day-header";
      hCell.textContent = dh;
      grid.appendChild(hCell);
    }

    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    // Monday-based offset (0 for Mon, 6 for Sun)
    const leadingEmptyDays = (firstDayOfMonth.getDay() + 6) % 7;

    for (let i = 0; i < leadingEmptyDays; i++) {
      const blankCell = document.createElement("div");
      blankCell.className = "day-cell empty";
      grid.appendChild(blankCell);
    }

    const dayEventsMap = new Map();
    for (const ev of events) {
      const dayNum = ev.start.getDate();
      if (!dayEventsMap.has(dayNum)) {
        dayEventsMap.set(dayNum, []);
      }
      dayEventsMap.get(dayNum).push(ev);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("div");
      cell.className = "day-cell";

      const dayDate = new Date(year, monthIndex, day);
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      if (isWeekend) {
        cell.classList.add("weekend");
      }

      const numEl = document.createElement("div");
      numEl.className = "day-number";
      numEl.textContent = String(day);
      cell.appendChild(numEl);

      const eventsList = dayEventsMap.get(day) || [];
      const eventsContainer = document.createElement("div");
      eventsContainer.className = "day-events";

      for (const ev of eventsList) {
        const evRow = document.createElement("label");
        evRow.className = `event-item ${ev.category.className}${ev.checked ? "" : " off"}`;

        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = ev.checked;

        chk.addEventListener("change", (e) => {
          e.stopPropagation();
          ev.checked = chk.checked;
          if (ev.checked) {
            evRow.classList.remove("off");
          } else {
            evRow.classList.add("off");
          }
          updateStatus();
        });

        const pad = (n) => String(n).padStart(2, "0");
        const timeLabel = `${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}`;
        const endLabel = `${pad(ev.end.getHours())}:${pad(ev.end.getMinutes())}`;

        const detailsDiv = document.createElement("div");
        detailsDiv.className = "event-details";

        const topRow = document.createElement("div");
        topRow.className = "event-top-row";

        const timeSpan = document.createElement("span");
        timeSpan.className = "event-time";
        timeSpan.textContent = timeLabel;
        topRow.appendChild(timeSpan);

        if (ev.type) {
          const badgeSpan = document.createElement("span");
          badgeSpan.className = "event-badge";
          badgeSpan.textContent = ev.type;
          topRow.appendChild(badgeSpan);
        }

        const titleSpan = document.createElement("span");
        titleSpan.className = "event-title";
        titleSpan.textContent = ev.title;

        detailsDiv.appendChild(topRow);
        detailsDiv.appendChild(titleSpan);

        // Tooltip text
        const tooltipLines = [
          ev.title,
          `${pad(ev.start.getDate())}.${pad(ev.start.getMonth() + 1)}.${ev.start.getFullYear()}, ${timeLabel}–${endLabel}${ev.endUnknown ? " (end unknown)" : ""}`,
        ];
        if (ev.room) tooltipLines.push(`Room: ${ev.room}`);
        if (ev.type) tooltipLines.push(`Type: ${ev.type}`);
        evRow.title = tooltipLines.join("\n");

        evRow.appendChild(chk);
        evRow.appendChild(detailsDiv);
        eventsContainer.appendChild(evRow);
      }

      cell.appendChild(eventsContainer);
      grid.appendChild(cell);
    }

    monthContainer.appendChild(grid);
    calendarEl.appendChild(monthContainer);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

exportBtn.addEventListener("click", () => {
  const checkedEvents = parsedEvents.filter((e) => e.checked);
  if (checkedEvents.length === 0) return;

  const icsText = IcsWriter.buildIcs(checkedEvents);
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${defaultMonthYear}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
