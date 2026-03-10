# Function Tracker Reference Notes

## Events Table (View Enquiries page)
- Columns: Date Created | Event Date | Occasion | Contact Name | Company | Guests | [edit] [delete]
- Search bar at top right
- Pagination at bottom: "Showing 1 to 5 of 5 entries"
- Contact names are clickable blue links
- Edit (pencil) and Delete (trash) icons per row

## Calendar (Month View)
- Navigation: < > today | add event | [delete icon] | month / week / wk/hm / day / list / [settings gear]
- Event cards on calendar cells show:
  - Event title (bold)
  - Time range (e.g. "18:00 - 22:00")
  - Status (e.g. "Tentative", "Confirmed", "Function Pack Sent")
  - Guest count (e.g. "Guests 45")
- Colour coding:
  - BLUE = Tentative
  - GREEN = Confirmed
  - YELLOW = Function Pack Sent
  - ORANGE/RED = Final Follow Up Sent
  - TEAL/CYAN = Site Visit Scheduled
  - LIGHT YELLOW = today highlight on cell background
- Each cell has a small edit (pencil) icon top-left for quick add
- Multiple events can appear on same day (stacked cards)

## Events Table Colour Coding (same as calendar)
- Green row = Confirmed
- Blue row = Tentative
- Yellow row = Function Pack Sent
- Orange/red row = Final Follow Up Sent
- Teal = Site Visit Scheduled
- White/plain = other statuses

## Status Pipeline (from events table)
- Tentative (blue)
- Confirmed (green)
- Function Pack Sent (yellow) — equivalent to "Proposal Sent"
- Final Follow Up Sent (orange/red)
- Site Visit Scheduled (teal/cyan)
- Followed Up (light orange)

## Runsheet Style (from screenshots and description)
- Editable time slots
- FOH (Front of House) tab
- Kitchen tab
- Same runsheet data shared between FOH and Kitchen views
- Time | Duration | Title | Description | Assigned To | Category columns
- Add/delete/reorder rows
- Print/PDF export

## Key UX Patterns
- "add event" button in calendar header (prominent)
- Edit pencil icon on each calendar cell for quick-add
- Rich event cards: title + time + status + guests all visible
- Enquiries table: sortable columns with up/down arrows
- Pagination for long lists
