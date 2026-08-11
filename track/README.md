# Carrier status

A tracking number in the app used to be a link and nothing more: to find out
where a parcel actually was, you left the app and read the carrier's page.

This is the piece that answers instead. The app sends it a list of numbers, it
asks the carriers, and it replies with one line of plain text per number —
"Departed FedEx location, Memphis TN". The app stores that on the parcel, so the
status syncs to your other devices like any other field.

Like `notify/`, this has to be deployed, and **none of it is exercised by the
app's test suite** — nothing here can run without real carrier credentials.

## Why it cannot be done in the page

Every carrier API needs credentials, and a key in a web page is a key given away
to anyone who opens the developer tools. None of them send CORS headers either,
so the browser would refuse the call regardless. A function on your own Supabase
project keeps the keys server-side and is the only route.

## What it does and does not do

It reads nothing and writes nothing. No tables, no service role key, no
schedule. That means:

- The app works exactly as it does today with this not deployed. The "Check
  status" button only appears once a function URL is configured, and a failed
  call is a toast, not a broken shipment.
- Status is a cache on the parcel, not a source of truth. You can redeploy,
  break or delete this function without touching any data.
- Nothing is stored here that could leak a workspace: the request is a list of
  tracking numbers and nothing else.

## 1. Get credentials for the carriers you use

Each is free for tracking volumes like this. You only need the ones you actually
ship with — an unconfigured carrier is skipped, not an error.

| Carrier | Where | What you need |
| --- | --- | --- |
| UPS | developer.ups.com → an app with the Tracking API | client id + secret |
| FedEx | developer.fedex.com → a project with Track API | client id + secret |
| DHL Express | developer.dhl.com → Shipment Tracking – Unified | API key |

USPS is not included: its API needs an account-bound registration that behaves
differently enough to be worth adding only if you use it. See "Adding a carrier"
below.

## 2. Deploy

From the dashboard — **Edge Functions → Deploy a new function**, name it
`track`, paste `index.ts` from this directory — or from a terminal:

```sh
supabase functions deploy track --no-verify-jwt
```

Then set only the secrets for the carriers you have:

```sh
supabase secrets set \
  UPS_CLIENT_ID=… UPS_CLIENT_SECRET=… \
  FEDEX_CLIENT_ID=… FEDEX_CLIENT_SECRET=… \
  DHL_API_KEY=… \
  APP_ORIGIN=https://dbulldesign.github.io
```

`APP_ORIGIN` is optional and defaults to `*`. Setting it to your own origin means
only your copy of the app can call the function from a browser.

To test against the carriers' sandboxes rather than production, set `UPS_BASE` /
`FEDEX_BASE` to the test hosts they give you.

`--no-verify-jwt` is what lets the page call it without a Supabase session. The
function only forwards tracking numbers to carriers, so there is nothing to abuse
by calling it beyond spending your own API quota — treat the URL as semi-private.

## 3. Use it

The app works out this function's URL from the reminders function URL in **⋯ →
Sync setup…** — same project, `/track` instead of `/notify`. Open a shipment with
a tracking number and press **Check status**.

A carrier saying "delivered" marks that parcel received, and a shipment whose
parcels are all received moves to Delivered. That is the one place the status
does more than display.

## Checking it works

```sh
curl -X POST https://<project-ref>.functions.supabase.co/track \
  -H 'content-type: application/json' \
  -d '{"numbers":[{"n":"1Z999AA10123456784"}]}'
# {"results":[{"n":"1Z999AA10123456784","text":"Delivered","where":"Memphis, TN","delivered":true}],"skipped":[]}
```

- Everything in `skipped` and nothing in `results` — the carrier for those
  numbers has no credentials set, or the carrier could not be worked out from the
  number's shape. Setting the carrier by hand in the app fixes the second case.
- A number in `skipped` with credentials set usually means the carrier has no
  record of it yet. Labels often take a few hours to appear.

## Adding a carrier

Write one function of the shape

```ts
async function acme(n: string): Promise<Result | null>
```

returning `{ n, text, where, delivered }` or `null`, and add it to `ADAPTERS`
under the key the app uses for that carrier. Fail soft: return `null` for
anything unexpected rather than throwing, so one carrier being down cannot spoil
a request covering several.
