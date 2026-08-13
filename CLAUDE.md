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

## Settings

One sheet, `#setsheet`, holds every preference: list sort/group/row height, the
"last seven days" card, effects, sound, a hand-off to sync setup, backups and
About. The ⋯ menu is actions only. Anything with a colon in a menu label — "Sort:
Smart", "Rows: compact" — was a preference pretending to be a command, and enough
of them accumulated to push the menu off the bottom of a phone. Add preferences
here, not there. `renderSettings()` is re-run by `renderData()` while the sheet is
open, so it never shows stale state.

## Effects

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
