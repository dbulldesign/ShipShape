# Reminders

A notification that arrives when the app is closed has to be sent by something.
iOS will not let a web app schedule one locally, so this is the only route: a
small function on Supabase that looks for work due today and pushes it.

Everything else in this repo is a static page. This is the one part that has to
be deployed, and **none of it is exercised by the app's test suite** — it cannot
run without a real Supabase project and a real push service.

## 1. Run the SQL

In the app: **⋯ → Sync setup… → Optional: reminders → Copy the SQL**, then run it
in the Supabase SQL editor. It creates `shipshape_push_subs` and the two
functions the app calls to register a device.

## 2. Make a key pair

```sh
npx web-push generate-vapid-keys
```

Two strings come back. The **public** one goes into the app; the **private** one
stays a secret on Supabase and must never reach the page.

## 3. Deploy

```sh
supabase functions deploy notify --no-verify-jwt

supabase secrets set \
  VAPID_PUBLIC_KEY=<public>  \
  VAPID_PRIVATE_KEY=<private> \
  VAPID_SUBJECT=mailto:you@example.com \
  APP_URL=https://dbulldesign.github.io/ShipShape/
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

`--no-verify-jwt` is what lets the scheduler call it. The function takes no input
and returns only counts, so there is nothing to abuse by calling it — but it does
send notifications, so treat the URL as semi-private.

## 4. Schedule it

Once a morning is usually enough. In the SQL editor:

```sql
select cron.schedule(
  'shipshape-reminders', '0 8 * * *',
  $$ select net.http_post(
       url := 'https://<project-ref>.functions.supabase.co/notify',
       headers := '{"Content-Type":"application/json"}'::jsonb
     ) $$
);
```

`pg_cron` and `pg_net` need enabling under Database → Extensions. The schedule is
UTC.

## 5. Turn it on in the app

Paste the **public** key into ⋯ → Sync setup → Reminders, and tap **Turn on
reminders**.

On iPhone the app must be on the Home Screen first — Safari refuses notification
permission to an ordinary tab, and the request will simply be denied.

## Checking it works

Call the function by hand and read the counts:

```sh
curl -X POST https://<project-ref>.functions.supabase.co/notify
# {"workspaces":1,"sent":1,"pruned":0}
```

- `workspaces: 0` — nothing is due today, so nothing was sent. Give something a
  due date of today and try again.
- `sent: 0` with a workspace found — no device is registered. Turn reminders on
  in the app, and check `shipshape_push_subs` has a row.
- `pruned` counts subscriptions the browser has dropped. They are deleted rather
  than retried forever; turning reminders on again makes a fresh one.
