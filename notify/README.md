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

In the app: **⋯ → Sync setup… → Reminders → Make a key pair**. The public half
fills itself in; the private half appears below it to copy. No terminal needed —
a VAPID pair is an ordinary P-256 key pair, which the browser can generate.

The **private** half goes to Supabase as a secret in step 3 and must never come
back into the app. If you would rather use a terminal, `npx web-push
generate-vapid-keys` produces the same thing.

## 3. Deploy

Either from the Supabase dashboard — **Edge Functions → Deploy a new function**,
name it `notify`, paste `index.ts` from this directory — or from a terminal:

```sh
supabase functions deploy notify --no-verify-jwt
```

Then set the secrets. In the dashboard that is **Edge Functions → Secrets**; from
a terminal:

```sh
supabase secrets set \
  VAPID_PUBLIC_KEY=<public>  \
  VAPID_PRIVATE_KEY=<private> \
  VAPID_SUBJECT=mailto:you@example.com \
  APP_URL=https://dbulldesign.github.io/ShipShape/
```

If you deploy from the dashboard, turn off "Verify JWT" in the function's
settings so the scheduler can call it.

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

The public key is already in the field if you generated it there. The function
URL fills itself in from your Supabase project URL — it is
`https://<project-ref>.supabase.co/functions/v1/notify`. Tap **Turn on
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
