/**
 * Dienstplan / Duty Roster Web Application Logic
 */

const DEFAULT_HEADERS = [
  "Datum",
  "Tag",
  "Typ",
  "Raum",
  "Von",
  "Bis",
  "Kurztitel",
  "Eigentümer",
  "Terminart",
  "Dispo extern",
];

const FIELDS = [
  { key: "date", label: "Date", default: "Datum", required: true },
  { key: "room", label: "Room", default: "Raum", required: false },
  { key: "start", label: "Start", default: "Von", required: true },
  { key: "end", label: "End", default: "Bis", required: false },
  { key: "title", label: "Title", default: "Kurztitel", required: true },
  { key: "type", label: "Type", default: "Terminart", required: false },
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
let headers = [...DEFAULT_HEADERS];
let columnMapping = {};
let parsedEvents = [];
let defaultMonthYear = "dienstplan";
let tempMapping = {};

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
const modalCloseBtn = document.getElementById("modal-close");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalApplyBtn = document.getElementById("modal-apply-btn");
const previewTableEl = document.getElementById("preview-table");
const mappingFieldsEl = document.getElementById("mapping-fields");

// Initialise default column mappings
function initDefaultMapping() {
  columnMapping = {};
  for (const field of FIELDS) {
    const idx = headers.findIndex((h) => h.toLowerCase() === field.default.toLowerCase());
    columnMapping[field.key] = idx !== -1 ? idx : -1;
  }
}

initDefaultMapping();

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setStatus("Reading spreadsheet...", "⏳", "loading");
  exportBtn.disabled = true;
  calendarEl.innerHTML = "";
  legendEl.hidden = true;

  try {
    rawRows = await XlsxReader.read(file);
    if (!rawRows || rawRows.length === 0) {
      setStatus("The uploaded file is empty.", "⚠️", "warning");
      return;
    }

    updateHeadersFromRows();
    processData();
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

function updateHeadersFromRows() {
  headerRowIndex = rawRows.findIndex((row) => row.some((cell) => cell.trim().length > 0));
  if (headerRowIndex === -1) {
    setStatus("Could not find any header rows in the file.", "⚠️", "warning");
    return;
  }

  headers = rawRows[headerRowIndex].map((h) => h.trim());

  // Re-verify mappings against newly loaded headers
  for (const field of FIELDS) {
    // If current mapped index is out of bounds or unmapped, attempt auto-match
    if (columnMapping[field.key] === -1 || columnMapping[field.key] >= headers.length) {
      const idx = headers.findIndex((h) => h.toLowerCase() === field.default.toLowerCase());
      columnMapping[field.key] = idx !== -1 ? idx : -1;
    }
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
  renderPreviewTable();
  renderMappingUI();
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
  closeSettingsModal();

  if (rawRows.length > 0) {
    processData();
  } else {
    setStatus("Column mapping saved. Choose an .xlsx file to import.", "✅", "success");
  }
});

// Close modal when clicking outside or pressing Escape
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
    const dataRows = rawRows.slice(headerRowIndex + 1, headerRowIndex + 6); // preview first 5 data rows
    dataRows.forEach((row) => {
      const tr = document.createElement("tr");
      headers.forEach((_, idx) => {
        const td = document.createElement("td");
        td.textContent = row[idx] !== undefined ? row[idx] : "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } else {
    // Show placeholder row before upload
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = headers.length;
    td.className = "preview-empty-hint";
    td.textContent = "No file loaded yet. Standard column headers are shown above. Upload an .xlsx file to preview its rows.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  previewTableEl.appendChild(tbody);
}

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
    });

    item.appendChild(label);
    item.appendChild(select);
    mappingFieldsEl.appendChild(item);
  }
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

function parseDateCell(val, lastDate) {
  if (!val || !val.trim()) {
    return lastDate ? new Date(lastDate.getTime()) : null;
  }

  val = val.trim();

  // Check Excel serial number (e.g. 46357)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  // Check DD.MM.YYYY
  const dotMatch = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10) - 1;
    const year = parseInt(dotMatch[3], 10);
    return new Date(year, month, day);
  }

  // Check "01 Dez 2026" or "1 Dez 2026"
  const wordMatch = val.match(/^(\d{1,2})\.?\s+([A-Za-zÄäÖöÜü]+)\.?\s+(\d{4})$/);
  if (wordMatch) {
    const day = parseInt(wordMatch[1], 10);
    const mStr = wordMatch[2].toLowerCase();
    const year = parseInt(wordMatch[3], 10);
    const month = GERMAN_MONTHS[mStr];
    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Fallback: standard Date.parse
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
}

function parseTimeCell(val) {
  if (!val) return null;
  val = String(val).trim();

  // Excel day fraction (e.g., 0.458333)
  const num = Number(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes };
  }

  const match = val.match(/^(\d{1,2}):(\d{2})/);
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

  dataRows.forEach((row, rowIndex) => {
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

    const eventDate = parseDateCell(dateVal, lastSeenDate);
    if (eventDate) {
      lastSeenDate = eventDate;
    }

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
      // If end time is earlier or equal to start time, it spans past midnight
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

  // Find all categories that actually appear in the events
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
    msg += ` (${skippedCount} rows skipped due to missing date, time, or title).`;
  }
  setStatus(msg, "📅", "success");

  exportBtn.disabled = selectedCount === 0;
}

function renderCalendar() {
  calendarEl.innerHTML = "";

  if (parsedEvents.length === 0) {
    setStatus("No valid appointments found in the file.", "⚠️", "warning");
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

    // Days map
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
