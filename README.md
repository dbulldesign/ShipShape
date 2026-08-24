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

## Emails on a task

The question is usually "which email was this about", and the answer is a link
that reopens the actual message.

**From the new Outlook, use Copy link to message.** Open the message, ⋯ → *Copy
link to message*, then paste it into a task's **Links** field, or drop it straight
onto the row. The chip on the row opens the message again. This is the route that
works, and it works from the new Outlook, Outlook on the web, and Outlook mobile.

**Dragging a message out of the new Outlook does not work, and cannot be made
to.** It is a limitation of Outlook itself, not of this app: the new Outlook is a
web app in a WebView and does not offer a dragged message to anything outside
itself. Microsoft's own guidance is to save the message to a folder first.

What each route gives you:

| From | What to do | What you get |
| --- | --- | --- |
| New Outlook / web | ⋯ → Copy link to message, then paste or drop | a link that reopens the message |
| Classic Outlook | drag the message onto the app | subject as the title (Chrome and Edge only — Firefox drops nothing) |
| Either | drag the message to a folder, then drop the `.msg` | subject as the title |
| Either | save as `.eml`, then drop it | subject, sender and date |
| Either | copy the message, paste into the composer | first line as the title |

Dropped **onto a row** it attaches to that task. Dropped **anywhere else** it
makes a new task — in the current project, if you are looking at one.

A `.msg` is an OLE container and this app will not parse one in the page, so what
it reads is the filename — which is the subject, because that is what Outlook
names the file. A `.eml` is plain RFC 822 text, so the headers are read properly.

## Keeping Supabase awake

A free Supabase project pauses after about seven days without database activity,
and a paused project does not wake itself: each device carries on working from
its own copy, the cloud icon turns red, and nothing syncs until the project is
restored by hand in the dashboard.

`.github/workflows/keepalive.yml` runs one query a day so that never happens. It
needs two values — **Settings → Secrets and variables → Actions**, on either tab:
Secrets to keep them hidden, Variables to be able to read them back later.

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the anon public key, the same one in the app's sync sheet |

Neither is much of a secret: the project URL is in every request the app makes,
and the key is the publishable one. The workspace key — the value that actually
guards your data — is deliberately not among them. The workflow calls
`shipshape_pull` with a key belonging to nobody, which still runs a real `SELECT`
— the thing that counts as activity — while reading none of your data.

Until both are set the workflow does nothing and says so. That is the reason to
leave it in place if you would rather not switch it on: it costs nothing and is
one setting away later.

Use **Actions → Keep Supabase awake → Run workflow** to try it immediately. A red
run is the useful signal: the messages distinguish a rejected key, missing SQL,
and a project that could not be reached at all.

Two things it is not:

- Not a backup. The free plan keeps no server-side snapshots, so
  **⋯ → Settings → Save a backup file** is still the only copy that exists.
- Not eternal. GitHub disables scheduled workflows in a repository with no
  activity for 60 days, emailing the owner first; any push re-enables it. That
  covers a holiday comfortably.

## Deploying

GitHub Pages serves the `main` branch. Anything not merged into `main` is not
live, whatever the browser is showing you.

An installed iOS Home Screen app caches its icon at the moment it is added and
never re-checks. After changing the icons, delete the Home Screen icon and re-add
it to pick up the new one.
