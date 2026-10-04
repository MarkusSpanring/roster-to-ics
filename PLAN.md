# Goal
Exporter for my work schedule into a ICAL file

# Input
The input is an xlsx file (e.g. /home/max/Desktop/dienstplan/2026-Dezember_NEUES FORMAT-unverbindliche Vorschau.xlsx)

The relevant columns are:
- Datum
- Raum
- Von
- Bis
- Kurztitel
- Terminart

The format of the xlsx file should always be the same, however, in case it changes in the future I would like to be able to modify which columns to import

# Tech Stack

You are free to choose the best option. The only criteria is, that it has as little dependencies as possible and can be easily installed by a non technical person (the main user will be on MAC). Ideally, the app runs fully in the browser and does not need any dependencies at all.

# Features

- Not all rows are relevant for the individual person. The main feature should therefore be which appointments are relevant and which are not e.g. by a checkbox.
- For some appointments the duration is not fixed (indicated with a ?). For these appointments create a default duration of 3h.
- The main view should be a large calendar view showing the individual apointments of that day. Keep it simple and only show the full informatoin when hovering over a event.
- When everything is done, the fnal artefact should be an exported ICAL or ics file that can be imported in a calendar

