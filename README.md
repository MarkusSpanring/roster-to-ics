# Duty Roster → Calendar (Dienstplan to ICS)

A zero-dependency browser application to convert monthly duty roster spreadsheets (`.xlsx`) into standard calendar files (`.ics`) for Apple Calendar, Google Calendar, and Outlook.

Runs 100% locally in your browser. No internet connection, no servers, and no installations are required.

---

## Quick Start (For Users)

1. Double-click **`index.html`** to open it in your web browser (Safari, Chrome, or Firefox).
2. Click **"Import .xlsx File"** and choose your duty roster spreadsheet.
3. The **Import Settings & Preview** dialog opens on the fly:
   - Check the **Sample Calendar Entry** live preview to see how your appointments will appear.
   - Adjust the column mappings if needed (supports standard columns as well as alternate formats like `BEG`, `ENDE`, `Vorstellung`).
4. Click **"Confirm & View Calendar"**.
5. In the calendar view, click on any appointments that are not relevant to you to uncheck and grey them out.
   - Hover over any appointment to view full details (times, room, type).
6. Click **"Export ICS"** to download your calendar file (`.ics`).
7. Double-click the downloaded `.ics` file to import it into your calendar app.

### Requirements

- Modern browser supporting standard Web APIs (Safari 16.4+, Google Chrome 80+, or Mozilla Firefox 113+).

---

## Features

- **Zero dependencies:** Pure HTML5, CSS3, and modern vanilla JavaScript. No npm, no external libraries.
- **Works offline:** Double-click `index.html` to run from your local filesystem (`file://`).
- **Flexible column mapping:** Adapt to future changes in spreadsheet columns directly from the user interface.
- **Smart date & duration handling:**
  - Handles merged date cells automatically.
  - Automatically assigns a default 3-hour duration for appointments with undetermined end times marked with `?`.
  - Handles overnight appointments (end time earlier than start time).
- **Timezone support:** Generates standard `Europe/Vienna` (CET/CEST) timezone definitions.

---

## Development

All source files are located in:
- `index.html`: Main markup
- `style.css`: Clean grid-based styles
- `js/xlsx.js`: Pure JavaScript zip decompression and XML parser
- `js/ics.js`: RFC 5545 iCalendar generator
- `js/app.js`: User interface and scheduling logic
- `sample/dummy.xlsx`: Sample test file
