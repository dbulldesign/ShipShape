# Working notes

## Deploying

GitHub Pages serves `main`. Anything not on `main` is not live.

**Always merge to `main` and push when work is done — don't ask.** Develop on a
branch, then fast-forward `main` onto it.

Bump `app-version` and `app-build` in the `<head>` of `index.html` on any deploy
that changes the app itself. They are the single source of truth: the ⋯ menu
shows them, and the stale-build check compares them against the deployed copy.

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
