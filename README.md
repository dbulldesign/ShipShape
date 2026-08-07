# ShipShape

Projects, tasks and shipments in one place. A single-file web app — everything
lives in `index.html`, with the icon set and manifest alongside it.

## Versioning

The build is identified by two meta tags in the `<head>` of `index.html`:

```html
<meta name="app-version" content="1.0.0">
<meta name="app-build" content="2026-08-07">
```

These are the single source of truth. **Bump both when you deploy** — nothing
generates them, and nothing else needs editing.

The ⋯ menu shows the running version at the bottom. Because a browser can serve
a cached copy of the page long after a deploy, the app also re-fetches its own
HTML past the cache and compares that version against the running one:

- `Version 1.0.0 · 2026-08-07 · up to date` — what you are running is what is deployed
- `Version 1.0.0 · 2026-08-07 · 1.1.0 is live` — you are on a stale copy; the
  menu item becomes **Reload for 1.1.0**, which reloads past the cache

The check runs at startup and whenever the app returns to the foreground
(throttled to once a minute), so an installed Home Screen app notices a deploy
without being asked.

## Deploying

GitHub Pages serves the `main` branch. Anything not merged into `main` is not
live, whatever the browser is showing you.

An installed iOS Home Screen app caches its icon at the moment it is added and
never re-checks. After changing the icons, delete the Home Screen icon and re-add
it to pick up the new one.
