# Staff-Usage Accessibility & UX Audit

**Scope:** the pages venue staff actually use on shift — the public, token-gated
"live" pages opened from a link on a phone, plus the restricted staff-mode
dashboard. Out of scope: the owner/admin dashboard, settings, and the public
marketing site (already covered by an earlier WCAG pass — see PR #125).

| Page | Route | Purpose |
|---|---|---|
| Staff Portal | `/staff/:token` | Live BEO/runsheet + staff checklist for one event |
| Staff Checklist | `/staff-checklist/:token` | Standalone event checklist |
| Daily Checklist (Live) | `/daily/:token` | Opening/closing/kitchen ops checklists |
| Shift Runsheet (Live) | `/shift/:token` | Whole-shift briefing: sections, specials, events, checklists |
| Staff Dashboard | `/dashboard` (isStaff account) | Restricted Calendar + Tasks only |

**Method:** automated scan with axe-core (WCAG 2.1 A/AA + best-practice rules)
against real seeded data, at 390px (phone) and 810px (tablet) — the realistic
device sizes for a venue floor — plus a full manual read of every file's
source for what axe cannot catch: custom-control semantics, keyboard
operability, error handling, and touch-target sizing. Findings are ranked by
impact on someone actually working a shift, not just technical severity.

---

## Top 5 findings, ranked by real-world impact

### 1. Checklist ticks can fail silently while offline — no error shown (High)
**Daily Checklist Live and Shift Runsheet Live only.** Both pages detect
online/offline state (there's a Wifi/WifiOff icon) and both have an explicit
`navigator.onLine` listener — real care went into this. But the actual tick
action ignores it:

```
// DailyChecklistLive.tsx
const toggleMutation = trpc.dailyChecklists.toggleItemByToken.useMutation({
  onSuccess: () => refetch(),
});               // ← no onError
```

```
// ShiftRunsheetLive.tsx
const toggleMut = trpc.dailyChecklists.toggleItemByToken.useMutation({ onSuccess: () => refetch() });
```

When the mutation fails — patchy venue wifi, a dropped 4G packet, the token
expiring — the optimistic UI has already shown the item as ticked
(`setOptimistic`), and nothing rolls it back or tells the person. They walk
away believing "check the float" is done; it isn't. `StaffPortal.tsx` and
`StaffChecklist.tsx` both already get this right (they revert the optimistic
state and — in StaffChecklist's case — toast an error), so the fix is to
match that pattern in the other two.
**Fix:** add `onError` to both mutations — revert the optimistic entry and
`toast.error("Couldn't save — check your connection")`.

### 2. One shared mutation object disables every checklist row at once (High)
All four pages use **one** `useMutation()` for every item's toggle, then
`disabled={toggleMutation.isPending}` on every row's button. While item A's
tap is in flight (which on slow venue wifi can be a second or more), tapping
item B does nothing — silently. There's no spinner, no opacity change, no
feedback that the tap was ignored; it just looks unresponsive. On a page
built for tapping through a list quickly during service, this reads as "the
app is broken," not "please wait."
**Fix:** key the pending state per item (e.g. `pendingId === item.id`) instead
of on the shared mutation object, so only the tapped row shows a brief
disabled/spinner state and the rest of the list stays responsive.

### 3. Checklist items are unlabeled to screen readers (High — WCAG 4.1.2)
Every checklist item on all four pages is a `<button>` that swaps a
`Square`/`CheckSquare` icon on click — there is no `role="checkbox"`,
`aria-checked`, or accessible name distinguishing checked from unchecked. A
screen-reader user (a legally blind staff member, or anyone using voice
control) hears "button" with no indication of state, on every single item.
**Fix:** `role="checkbox"` + `aria-checked={item.checked}` on the button (or
switch to a real `<input type="checkbox">` visually styled to match).

### 4. Icon-only edit/delete buttons have no accessible name (High — WCAG 4.1.2)
`DailyChecklistLive.tsx` — the pencil (edit) and trash (delete) buttons on
every checklist item carry only a `title` attribute:
```
<button onClick={...} title="Edit item"><Pencil .../></button>
<button onClick={...} title="Delete item"><Trash2 .../></button>
```
`title` is not reliably read by screen readers and never shows on a touch
screen (no hover). These buttons have no accessible name at all in practice.
The same page's "tap-again-to-confirm" delete (the button turns red in place)
compounds this: a screen-reader user gets an identical announcement both
times, and on a touch screen there's no visible cue this button is now
destructive besides colour — a genuine risk of an accidental delete from a
double-tap, which happens easily with wet or gloved hands.
**Fix:** add `aria-label="Edit item"` / `aria-label="Delete item"`; for the
confirm state, add `aria-label="Confirm delete — tap again"` and change the
button's accessible name so the state change is announced, or replace the
in-place toggle with a short "Undo" toast instead of a second destructive tap.

### 5. Header text fails contrast on every "live" page, every time (Medium-High — WCAG 1.4.3)
axe measured these against real rendered colours:

| Page | Element | Ratio found | Required |
|---|---|---|---|
| Staff Portal | `FUNCTION RUNSHEET · STAFF COPY` label | **3.92:1** | 4.5:1 |
| Staff Portal | inactive `RUNSHEET`/`CHECKLIST` tab | **2.90:1** | 4.5:1 |
| Staff Portal | checklist count badge (`1/4`) | **3.62:1** | 4.5:1 |
| Shift Runsheet Live | `DAILY SHIFT RUNSHEET` label | **2.80:1** | 4.5:1 |
| Shift Runsheet Live | `PRINT` button label | **4.24:1** | 4.5:1 |
| Shift Runsheet Live | `YOUR NAME` footer label | **2.58:1** | 4.5:1 |
| Daily Checklist Live | `+ ADD ITEM` button text | **2.25:1** | 4.5:1 |

These aren't decorative — they're the page title, the tab you tap, and the
control you use to add an item. This is worse outdoors or under bright bar
lighting than in a lab: low-contrast text on a phone screen in daylight is
often unreadable at all, not just "technically fails a ratio." Bottom-nav
labels on the staff dashboard (`text-gray-400` on white, both restricted tabs)
have the same problem.
**Fix:** darken the semi-transparent white text on coloured headers (e.g.
`text-white/60` → `text-white/85`+ or a solid light colour) and swap
`text-gray-400` labels for something closer to `text-gray-500`/`600` — check
each against the actual background with a contrast tool, not by eye.

---

## Everything else found, by page

### Staff Portal (`/staff/:token`)
- Section headers (`EVENT DETAILS`, `DIETARY & ALLERGIES`, `EVENT TIMELINE`,
  `BAR ARRANGEMENT`, etc.) are `<span>`s, not `<h2>`. The one real heading is
  the event title. This is a single long scrolling page with a dozen
  sections — exactly the case heading navigation exists for, and a
  screen-reader user currently has no way to jump between them.
- The RUNSHEET/CHECKLIST tab pair has no `role="tablist"`/`role="tab"` or
  `aria-selected` — a screen reader announces two plain buttons with no
  indication which is active, and no `aria-controls` linking to the panel.
- The page polls every 30s and silently swaps content when the manager edits
  the runsheet mid-shift; nothing is announced to assistive tech when that
  happens (minor — `aria-live="polite"` on the content region would fix it).
- Good: has a real `<main>`, has an `<h1>`, the iframe has a `title`, the
  attachment links are same-origin-restricted and have real link text, the
  checklist toggle correctly reverts and doesn't silently fail (see finding
  #1's contrast with the other two live pages).

### Staff Checklist (`/staff-checklist/:token`)
- No `<main>` landmark (axe: `landmark-one-main`, `region`) — content sits in
  plain `<div>`s.
- The progress bar (`h-1.5 bg-gold/20` with an inner width-styled div) has no
  `role="progressbar"`/`aria-valuenow` — the visible "X of Y complete" text
  nearby covers this for sighted users, but nothing links the two
  programmatically.
- Same checkbox-semantics gap as everywhere else (#3 above).
- Good: this is the one live page that already reverts on error *and* toasts
  it — this is the reference implementation the other two checklist pages
  should be brought up to.

### Daily Checklist Live (`/daily/:token`)
- No `<main>` landmark.
- No `onError` on the toggle mutation (#1).
- Edit/delete buttons have no accessible name (#4).
- The in-place delete confirm has no distinct accessible state (#4).
- Text inputs (item text, note, staff name) are labelled only by
  `placeholder`, which disappears the moment you start typing and isn't a
  substitute for a real label for anyone relying on it persisting.
- Edit/delete icon buttons are roughly 38–40px square — under the 44×44px
  minimum recommended for a touch target used by someone who may be wearing
  gloves or has wet hands (bar/kitchen context). The checklist row itself is
  a good large target (`px-4 py-3.5`) — the small icon buttons are the outlier.
- Genuinely good UX care already present: screen wake-lock while the page is
  open, online/offline detection, staff-name "checking in as" so completions
  are attributable, auto-focus into new input fields.

### Shift Runsheet Live (`/shift/:token`)
- No `<main>` landmark; section headers (`SECTIONS`, `EVENTS TODAY`,
  `RUNNING TOTAL · TODAY`) are `<span>`s, same heading-navigation gap as
  Staff Portal.
- No `onError` on the toggle mutation (#1) — same shared-mutation-object
  freeze as the others (#2).
- The Wifi/WifiOff status icon has **no** `title` or `aria-label` at all
  (Daily Checklist Live at least has neither, but this one is smaller and on
  a coloured header, making it easy to miss visually too).
- The header's accent colour is driven by the venue's own brand colour
  (`--brand` CSS variable) — a venue that picks a light or bright brand
  colour could push the already-failing white-text-on-colour contrast even
  lower. Worth a documented minimum-lightness rule when a venue sets this.
- Financial figures (day's food/drink running total) are useful for a duty
  manager but worth double-checking this is the intended audience for a link
  that could be shared informally among staff.

### Staff Dashboard (`isStaff` account, restricted to Calendar + Tasks)
- The **Calendar** tab — the default landing page and where a restricted
  staff account spends nearly all its time — has no `<h1>` anywhere (axe:
  `page-has-heading-one`). Every other tab in the app (Overview, Pipeline,
  Contacts, Tasks, Settings, …) has one; Calendar is the outlier.
- The status-colour legend row (`New Enquiry`, `Contacted`, `Confirmed`, …)
  scrolls horizontally on mobile with no keyboard access (axe:
  `scrollable-region-focusable`) — a keyboard or switch-access user can't
  reach the content past the visible edge.
- Bottom nav inactive labels (`text-gray-400`) fail contrast (#5) on both
  restricted tabs.
- The Tasks tab's `HIGH` priority badge (`text-red-600` on `bg-red-50`) is
  borderline on contrast — worth checking against the exact rendered colours
  since it's the one visual cue for urgency.
- Good precedent already in the codebase: the Pipeline kanban card
  (`Dashboard.tsx` ~line 4190) does keyboard support correctly —
  `role="button" tabIndex={0}` **and** an `onKeyDown` handler for Enter/Space.
  That's the pattern to copy anywhere a `<div onClick>` is used instead of a
  real `<button>`.

---

## One thing worth confirming, not a bug I've assumed

There are two completely different "staff" login paths in this codebase, and
they behave very differently:
- **`accountLogins.create` with `isStaff: true`** — email + password,
  genuinely restricted to Calendar + Tasks (this is what the audit above
  tested).
- **`team.create` + the `/api/team-login/:token` magic link** — no password,
  and it grants the *full* owner dashboard with no restriction at all.

I tested both while setting this audit up and the second one surprised me —
a plain link, no login, into the entire admin dashboard. It may well be
intentional (e.g. for a trusted manager rather than casual waitstaff), and
nothing here recommends changing it, but it's worth you confirming that's
the intended behaviour rather than a gap, since the two mechanisms sit right
next to each other in the code and read like they should be equivalent.

---

## Suggested order of work

1. **Fix the two silent-failure `onError` gaps (#1)** — this is a correctness
   bug with real consequences on shift, not just an accessibility nit.
2. **Per-item pending state instead of the shared mutation object (#2)** —
   same file, same visit, cheap to fix alongside #1.
3. **Checkbox semantics + icon-button labels (#3, #4)** — mechanical,
   low-risk, fixes the biggest screen-reader gaps across all four pages.
4. **Contrast fixes (#5)** — visual-only changes, easy to verify with a
   contrast checker before shipping.
5. **Headings, landmarks, tab semantics** — structural, no visual change,
   good next PR once the above ships.
6. **Touch-target sizing on Daily Checklist Live's edit/delete buttons** —
   small, isolated change.

Happy to implement any or all of this — say which, or "all of it," and I'll
open it as a PR the same way the last one went.
