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

## Sheets

The detail sheet doubles as a docked column above 1200px, so it lives inside
`#app` rather than beside it. A docked pane is not modal: no scrim, no focus trap,
and `sheetOpen()` reports false for it so background pulls are not held off while
it sits open. `syncDock()` handles the window being resized across that
threshold.

## The two functions

`notify/` sends reminders, `track/` asks carriers where a parcel is. Both are
deploy-it-yourself and **neither can be tested here** — one needs a real push
service, the other real carrier credentials. Both are optional: with neither
deployed the app works as it always did, and `track` reads and writes nothing, so
parcel status is only ever a cache on the parcel.

Realtime is a broadcast channel, never postgres_changes: the tables have RLS with
no policies, so the anon key cannot read them and change events would be invisible
to it. The broadcast says only "something moved"; each device then pulls through
the security-definer functions. Every failure path falls back to the 15-second
poll, so this must never become load-bearing.

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
