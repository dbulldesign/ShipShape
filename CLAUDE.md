# Working notes

## Deploying

GitHub Pages serves `main`. Anything not on `main` is not live.

**Always merge to `main` and push when work is done — don't ask.** Develop on a
branch, then fast-forward `main` onto it.

Bump `app-version` and `app-build` in the `<head>` of `index.html` on any deploy
that changes the app itself. They are the single source of truth: the ⋯ menu
shows them, and the stale-build check compares them against the deployed copy.

Bump `CACHE` in `sw.js` to match the new `app-version` at the same time. The
cache name is the only thing that retires the old cached files, so a deploy that
forgets it can leave icons or the barcode reader stale indefinitely. HTML is
fetched network-first, so the page itself still updates either way.

`sw.js` must never answer a request carrying `?vcheck=` — that is the page
re-fetching its own HTML to find out whether it is stale, and a cached answer
would compare a copy against itself and always agree.

## The list

The list is patched in place, not rebuilt. `rowNode` decides whether a row can be
kept by comparing `t.u` plus `rowCtx` — the handful of things outside the task
that its markup depends on. **Every mutation of a task must set `t.u=now()`**, or
its row will not repaint. Anything new that `rowHTML` reads from outside the task
has to go into `rowCtx` for the same reason.

Never rebuild a container that holds a row. Detaching a node between pointerdown
and pointerup makes the browser drop the click entirely — that is why saving a
field on blur used to swallow the click that caused it, and why a background sync
landing mid-tap could swallow a tap. `patch()` exists to avoid it.

## Gestures

Anything that claims a touch must lock its axis first. The row swipe always did;
pull-to-refresh did not, so a sideways swipe along the day strip — which drifts
downwards a little, as they all do — started a refresh and `preventDefault()`
then cancelled the strip's own scrolling. A gesture beginning inside a sideways
scroller (`inHScroller`: the day strip, the suggestion row, a `pre` block) has to
clear a higher bar before the pull claims it.

## Views

`week` is a real view, not a mode: `view.v` holds the ISO date of the week's
Sunday, so paging and a re-render agree on which week you were looking at. Week
starts Sunday to match the month calendar's grid — don't introduce a second idea
of where a week begins. It is reachable from a List/Week control at the top of
Scheduled, because on a phone the sidebar is `display:none` and the palette wants
a keyboard.

Anything bounded at both ends can hide late work. The week grid says how much is
overdue from before it and leads there; a view that quietly drops late work is
worse than no view.

Search is global, so a query can return completed and undated work. Per-day
grouping, the week grid and the mode control all stand down while a query is
running — a day heading over a completed task is a lie.

`emptyHTML()` asks about the query **before** the view. A fruitless search from
the All tab used to answer "All clear · Add a task to get going", which replies to
a question nobody asked.

## The composer's notation

`#project @maker >destination !flag` plus dates, and one thing that is this
business's own rather than general: **a PO is always five digits after `PO`**.
`PO_RE` accepts `PO 41785`, `PO41785`, `PO#41785`, `PO: 41785`, `P.O. 41785`.

- `(?!\d)` earns its place as much as `\d{5}`. A longer run is a tracking number
  or a phone number, and half-eating one would be worse than ignoring it. Tested
  against `PO 4178`, `PO 417850`, `PO 1234567890`, `Apollo 41785`, `POST 41785`,
  `Repo 41785`, `Deposit 41785` — none of them match.
- Taken out of the line **before** `extractDate` runs, so no date pattern can
  reach into the digits.
- A PO means something has been ordered, so it infers Shipment the way a maker or
  a destination does. Picking Task keeps the number.
- Read in three places, not one: the composer, the detail sheet's title (after
  `#dpo` is read, or the field's own empty value overwrites it), and once over
  every existing title at load, for numbers written before the parser existed.
  The back-fill fills an empty field and never rewrites the title — reworded
  titles are not migration's business.
- Typing nothing but `PO 41785` makes that the title. The composer will not submit
  without one, and the number arriving before anyone has named the line is a real
  way to work.

## Emails, and what a drop can carry

`t.links` holds URLs on the task — a hundred bytes each and meaningless away from
the task they explain, so not their own record kind. **http(s) only**: a dropped
`javascript:` or `data:` URL turned into a clickable chip would be a hole.

The new Outlook cannot drag a message into a browser at all — it is a web app in a
WebView and offers nothing outward. Classic Outlook does, as a `.msg` File, in
Chromium only. So the route that actually works is Outlook's own *Copy link to
message*, and everything else is a fallback:

- `text/uri-list` and `text/plain` are both read, not the first that answers: a
  mail client puts the bare URL in one and the subject in the other, so taking
  only one loses either the link or its name.
- `.eml` is RFC 822 text — headers unfolded, then Subject/From/Date.
- `.msg` is an OLE container, so the filename is all there is. That is fine:
  Outlook names the file after the subject.
- `outsideDrag()` gates all of it on `dragId` being null. An internal row drag
  means "file this under that project" and must not be read as an inbound drop.

## Chips are doors

A row chip that names something the app can show navigates to it: project, maker,
destination, whose-move — and the PO chip runs `po:` search, because a PO gathers
a whole order across several crates and makers. This is the only way to reach the maker and destination
views from a phone. The class is `go`, not `nav` — `.nav` is the sidebar item and
carries `width:100%`, which stretches a chip to its full 200px allowance and
stacks them one per line. Not while `selMode`: there a tap anywhere in the row
means "pick this one".

## Storage is the constraint

localStorage gives a page about 5MB — measured at 5056KB, not assumed. Most of
the app is text and nowhere near it; images are the whole problem.

**Tasks have no photos, and that was a decision, not an omission.** They were
built (own record kind `pic`, compressed, budgeted) and taken out again: four
photos on one item spent a tenth of the entire store on a single row, which is
the wrong trade for this app. Don't rebuild it without a store that isn't
localStorage.

- Only the board takes images. Nothing is stored as handed over: 1000px longest
  edge, JPEG 0.6 — about 70KB for a real photo, 180KB for a noisy one. The board
  did keep raw files behind a 2MB check, and two of them made a **4.5MB**
  document that was re-pulled every fifteen seconds. `shrinkStoredImages()`
  squeezes what is already stored, once, only downwards, because it runs on
  every load.
- `createImageBitmap` takes a Blob and honours EXIF orientation; it **rejects a
  string**. Already-stored data URLs need an `<img>`, which needs no orientation
  handling because a canvas-produced URL has no EXIF left.
- Removing a feature has to give the space back. `migrate()` drops any stored
  `pics` and tombstones them, and `loadAll()` writes that through immediately —
  nothing saves during boot, so otherwise the old copy sits there until the next
  edit, which on a full store is the edit that cannot succeed.
- `KINDS` is a whitelist, not a lookup with a fallback. It used to default to
  `tasks` for an unknown kind, which would have poured leftover `pic` rows into
  the task list. A *missing* kind still means task — the earliest rows had none.
- A deleted record is swept from **every** list, not the one its kind names: a
  tombstone carries no kind, so it goes out labelled `task`. Before this, a maker
  deleted on one device survived on all the others.
- Archiving never removed anything. `prune()` does, over a year old, only when
  asked, and it says what it frees first.

## The clock

A timer is one record with a `start` and an `end`. Running means `end` is null, so
elapsed is **always computed and never stored** — which is the whole reason a
timer started on the phone reads correctly on the laptop without the two clocks
agreeing on anything past the epoch, and why a reload a week later still knows
what it was doing.

One timer at a time is the decision the rest rests on: nothing to pick between
when stopping, no arithmetic to explain, and "is something running" has one
answer.

- Two devices apart can each start one and the merge keeps both. `oneRunner()`
  closes the older at the moment the newer began — the same answer on every
  device from the same records, so they converge with no round trip. It runs after
  a pull, not only at load, and because it writes, the result has to be pushed.
- `running()` takes the latest `start` in a single pass rather than the first
  match, so even the transient two-live state reads the same everywhere.
- The ticking digits are written straight into their two nodes by `tickClock()`.
  Never through `render()`: the list is patched by signature, and repainting it
  every second would fight every gesture on the page. The interval only exists
  while something runs.
- The row shows a dot, not a clock, for the same reason — and the running task's
  id is in `rowCtx`, or the dot never appears or never leaves.
- `timeByTask` is tallied once per render. `timeOn()` used to filter the whole log
  per row, which is quadratic and only shows up on a long list.
- An entry is editable after the fact, because a stopwatch is only honest if it
  can be corrected — timers get left running over lunch and started twenty
  minutes late. Times are edited as a **day plus two clock times**, since that is
  how anyone thinks about it; `start` and `end` stay absolute ms underneath so
  nothing else in the tracker changes. An end at or before the start means it ran
  past midnight, which is an evening rather than a mistake, so it rolls to the
  next day and says so. A running entry offers no end to edit.
- The row opens the editor from a handler **on the row**, checked after the
  restart, the delete and the project chip have had their say. It was first built
  as a full-size target laid *under* the contents, which never worked: a tap on
  the title hits the title, and `closest()` walks ancestors, not whatever happens
  to be behind. Only the thin blank padding was ever clickable.
- An entry's `label` is a snapshot taken at start. Time logged is a record, not a
  pointer: renaming or deleting the task must not make the hours unreadable, which
  is also why `prune()` leaves time entries alone.

## Settings

One sheet, `#setsheet`, holds every preference: list sort/group/row height, the
"last seven days" card, effects, sound, a hand-off to sync setup, backups and
About. The ⋯ menu is actions only. Anything with a colon in a menu label — "Sort:
Smart", "Rows: compact" — was a preference pretending to be a command, and enough
of them accumulated to push the menu off the bottom of a phone. Add preferences
here, not there. `renderSettings()` is re-run by `renderData()` while the sheet is
open, so it never shows stale state.

## Effects

Delivery is the exception to the shape: everything else throws outward from the
row, which is "well done", and a parcel arriving is not that feeling. `fxDeliver`
falls in from above and ripples on landing, ignores the chosen style (a shipment
arriving is the same event whichever style you picked) and still obeys amount,
reduced motion and the concurrency cap. The ripple is a circle for a reason — it
started as a rounded rectangle the width of the row and looked right for exactly
one frame, because completing something re-sorts the list and left the box framing
whichever unrelated row slid into that space. Every effect is fixed-position at
the row's old coordinates; keep them shapes that belong to the effect, not to
whatever ends up underneath.


Finishing something runs `celebrate()` — sparks, confetti or fireworks, all drawn
from divs and the Web Animations API, no library and no download. Settings live in
the Effects sheet (⋯ → Effects…), per device with the other look-and-feel prefs:
style, when (everything / milestones / never), how much, and sound. A milestone is
a project finished or a shipment delivered, and those celebrate even in milestones
mode. `prefers-reduced-motion` skips the lot regardless.

Measure the row, not the tick: a burst centred on the 23px checkbox throws
everything up over the header. Two concurrent effects are the cap — a flurry of
completions must not pile up hundreds of animating nodes.

## Sheets

The detail sheet doubles as a docked column above 1200px, so it lives inside
`#app` rather than beside it. A docked pane is not modal: no scrim, no focus trap,
and `sheetOpen()` reports false for it so background pulls are not held off while
it sits open. `syncDock()` handles the window being resized across that
threshold.

Sheet titles are sticky. The sync sheet is long enough to scroll, and its ✕ used
to leave with the content — on a phone that means no visible way out. The same
goes for the ⋯ menu, which is capped to the viewport and scrolls: it grew past
the bottom of a phone screen and everything below the fold was unreachable.

## The two functions

`notify/` sends reminders, `track/` asks carriers where a parcel is. Both are
deploy-it-yourself and **neither can be tested here** — one needs a real push
service, the other real carrier credentials. Both are optional: with neither
deployed the app works as it always did, and `track` reads and writes nothing, so
parcel status is only ever a cache on the parcel.

Realtime is a broadcast channel, never postgres_changes: the tables have RLS with
no policies, so the anon key cannot read them and change events would be invisible
to it. The broadcast says only "something moved"; each device then pulls through
the security-definer functions.

**The poll stays at 15 seconds whether or not the socket says it is joined.** A
socket can join and then deliver nothing — broadcast disabled on the project, or
an iPhone suspending the connection without closing it — and both devices then
believe they are live while nothing arrives. Slowing the poll on `rtJoined` turned
a 15-second lag into a two-minute one and looked exactly like sync being broken.
The nudge is an accelerator; it must never be what sync depends on.

A push must always be retried. The only thing that asks for one is an edit, so a
single failure used to leave those changes on the device until the next unrelated
edit — which on a phone is most of the time. `pending()` answers "is there
anything unsent" in either scheme, and `resume()` catches up both directions on
regaining the network, the tab or the app.

## Ideas vs tasks

"New idea" in the + menu opens `#isheet` in place — a popup like the task
composer, on whatever page you are on. It writes into the board's localStorage
and, with sync on, pull-merges-pushes the workspace's board document itself
(`mergeBoard` is a documented copy of the board's `mergeStates`), so the idea
reaches other devices without the board page ever opening. The board listens for
cross-tab `storage` events and merges, so two open tabs cannot clobber each
other. `board.html#new` still exists for the richer capture (images) the sheet
links to.

## The board is a pane, not a page

The board loads into `#boardpane` — an iframe inside `#main` — at every width, so
`view.t==='board'` is a real view and the chrome, sidebar and scroll position all
survive the switch. It stays a *separate document*: its own state, its own merge
rules, its own record in the workspace. Only the shell is shared. `board.html`
opened directly hands over to `index.html#view=board`, keeping any deep link, so
there is one way in and no way to end up on a bare page.

- `?embed=1` **and** `parent!==window` is what means embedded. The flag alone is
  not enough, or a stray `?embed=1` in a real tab strips the chrome and leaves no
  way out.
- That check, and the desktop hand-over, live in a `<script>` in `<head>`. Both
  have to run before anything else: the class because the chrome it hides would
  otherwise paint once and be taken away, and the redirect because the board's own
  `#p=` and `#new` handlers `replaceState` the hash away — a redirect further down
  the file had nothing left to forward.
- Embedded, the board's whole `.hrow` goes. Its ⋯ sat directly beneath the
  shell's own, so the board's export and import are offered by `#moreMenu` under
  `body[data-board]` and reach into the pane by clicking its buttons — same
  origin, so a click, not a message.
- **One poll.** Each page owning a 15-second timer was fine while they were
  separate pages, since only one ever ran. In one tab that is two polls for one
  workspace, so `__ssBoardPull` stands in for the board's interval under embed and
  the app's existing tick calls it.
- `body[data-board]`, not `#app[data-board]`: `#fab`, `#tabbar` and the menus live
  outside `#app`, so a descendant selector on it silently misses them.
- An overlay inside the pane is fixed to *that* document, so it stops at the
  pane's edge and the shell's bottom tab bar paints straight over it. Standalone
  this never came up — `.overlay` is z-index 60 and the board's own bar is 40 — so
  the board calls `parent.__ssBoardModal` and the shell hides `#tabbar` while a
  board modal or its sync panel is up. `syncBoard()` clears the flag on the way
  out, or leaving mid-modal would strand the bar hidden.
- The phone keeps the board's original `padding-bottom` on `main`; only a desktop,
  which has no bottom bar, gets that space back. The pane deliberately extends
  under the tab bar, so the padding is what clears it.
- `#boardpane` is `overflow:hidden` with a full-height frame. iOS has historically
  laid an iframe out at its content height rather than scrolling it, and a
  fixed-height pane that clips is the shape that behaves there.

## The board

`board.html` is the Everything Board — a capture-anything companion page (notes,
links, images, #tags, [[wiki links]], kanban, mind map). It is its own file but
shares Shipshape's design system wholesale: same tokens, fonts, light/dark, sheet
behaviour, and on the phone the same six-tab bottom bar (Board is the sixth tab on
both pages; cross-page tabs use `index.html#view=<t>`). Its type/project palettes
are constant iOS hexes, not var() — the code builds `${color}22` alpha variants,
which a var() reference cannot survive. The integration points beyond the look
are four: it reads
`shipshape:sync` from localStorage (never writes it), it syncs as one document in
`shipshape_state` under `<workspace>:board` — beside, never touching, Shipshape's
own row — it is in the service worker shell, and a card's `projectId` may be
`ss:<shipshape project id>`, a *reference* to a Shipshape job resolved from
`shipshape:v3` at render time. Jobs are never copied into board state — one
owner for a job's name and colour — so board-native projects and job links
coexist. Deep links: `board.html#p=<projectId>` and `index.html#project=<id>`.

Its sync follows the same rules as the main app: 15-second poll, retried pushes,
resume() both ways — plus one of its own: the board re-renders wholesale, so a
quiet pull defers while a pointer is down, a drag is live, the modal is open or
the capture bar holds text (`uiBusy()`), or it steals the gesture. Both pages
flush their debounced localStorage write on pagehide — without that, an edit
followed within ~300ms by a hop to the other page silently lost the write.

The mind map is desktop-only: the tab and the dashboard nudge that point at it
hide below 861px (one `[data-view="map"]` rule catches both), and the view falls
back to home if the window shrinks while on it. Threading still works on a phone
through [[wiki links]] and the sheet's "Connect to another idea".

The mind map handles node taps in `pointerup`, not `click`: pointerdown captures
the pointer to the box, and with capture held Chrome retargets the click at the
box, so a click listener never learns which node was tapped. Version lives in
index.html; bump `CACHE` for board changes too, since the shell caches it.

## Icons

App icons — `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`,
`icon-maskable-512.png` — must be **full-bleed and opaque**. iOS and Android
apply their own mask, so a tile with rounded corners baked in gets rounded twice
and shows a pale frame around it.

Tab favicons — `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `favicon.ico`
— keep the rounded tile, because nothing masks those.

`icon.svg` is the vector master for the app icons; `favicon.svg` is a simplified
cut of the same ship that stays legible at 16-32px. Rasterize with element
screenshots, not a CSS-percentage-sized page — headless Chrome lays out shorter
than the requested window and silently leaves a transparent margin.

iOS caches a Home Screen icon at the moment the app is added and never
re-checks. After changing the icons, delete the Home Screen icon and re-add it.
