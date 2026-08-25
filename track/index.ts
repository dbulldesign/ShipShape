// Supabase Edge Function: ask the carriers where a parcel is.
//
// The app cannot ask them itself. Every carrier wants credentials, and none of
// them allow a call from a browser — no CORS, and a key in a page is a key given
// away. So the page sends a list of numbers here, this holds the keys, and it
// answers with one line of plain text per number.
//
// It is deliberately stateless: it reads nothing and writes nothing. The app
// stores what comes back on the parcel itself, so the status syncs with
// everything else and this function can be redeployed, broken or removed without
// touching any data.
//
// Deploy and configure it — see README.md in this directory.
//
// Not exercised by the app's test suite: nothing here can run without real
// carrier credentials. Every adapter fails soft — a carrier that is not
// configured, or that answers with something unexpected, produces no line for
// that number rather than an error for the whole request.

type Ask = { n: string; carrier?: string };
type Result = { n: string; text: string; where?: string; delivered?: boolean };

const env = (k: string) => Deno.env.get(k) ?? "";

const CORS = {
  "Access-Control-Allow-Origin": env("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ---------- carrier detection, same shapes the app recognises ---------- */
const clean = (s: string) => (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

function detect(n: string): string {
  const c = clean(n);
  if (/^1Z[0-9A-Z]{16}$/.test(c)) return "ups";
  if (/^(\d{12}|\d{15}|\d{20}|\d{34})$/.test(c)) return "fedex";
  if (/^\d{10}$/.test(c)) return "dhl";
  // 91–95 are the USPS IMpb prefixes; the first pass listed 94 twice and left 91 out
  if (/^9[1-5]\d{20}$/.test(c) || /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c)) return "usps";
  return "";
}

/* ---------- token caching ----------
   Both UPS and FedEx hand out short-lived bearer tokens for client credentials.
   One request here can cover a dozen numbers, so the token is kept for the life
   of the isolate rather than fetched per number. */
const tokens = new Map<string, { v: string; exp: number }>();
async function token(key: string, get: () => Promise<{ v: string; ttl: number } | null>) {
  const hit = tokens.get(key);
  if (hit && hit.exp > Date.now() + 30_000) return hit.v;
  const got = await get();
  if (!got) return "";
  tokens.set(key, { v: got.v, exp: Date.now() + got.ttl * 1000 });
  return got.v;
}

/* ---------- UPS ---------- */
async function upsToken() {
  const id = env("UPS_CLIENT_ID"), secret = env("UPS_CLIENT_SECRET");
  if (!id || !secret) return null;
  const base = env("UPS_BASE") || "https://onlinetools.ups.com";
  const r = await fetch(`${base}/security/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${id}:${secret}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { v: j.access_token as string, ttl: Number(j.expires_in ?? 3000) };
}
async function ups(n: string): Promise<Result | null> {
  const t = await token("ups", upsToken);
  if (!t) return null;
  const base = env("UPS_BASE") || "https://onlinetools.ups.com";
  const r = await fetch(
    `${base}/api/track/v1/details/${encodeURIComponent(clean(n))}?locale=en_US&returnSignature=false`,
    { headers: { Authorization: `Bearer ${t}`, transId: crypto.randomUUID(), transactionSrc: "shipshape" } },
  );
  if (!r.ok) return null;
  const j = await r.json();
  const pkg = j?.trackResponse?.shipment?.[0]?.package?.[0];
  const act = pkg?.activity?.[0];
  if (!act) return null;
  const status = act.status?.description ?? "";
  const loc = act.location?.address;
  return {
    n: clean(n),
    text: status || "In the network",
    where: [loc?.city, loc?.stateProvince ?? loc?.country].filter(Boolean).join(", "),
    delivered: (act.status?.type ?? "") === "D" || /delivered/i.test(status),
  };
}

/* ---------- FedEx ---------- */
async function fedexToken() {
  const id = env("FEDEX_CLIENT_ID"), secret = env("FEDEX_CLIENT_SECRET");
  if (!id || !secret) return null;
  const base = env("FEDEX_BASE") || "https://apis.fedex.com";
  const r = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { v: j.access_token as string, ttl: Number(j.expires_in ?? 3000) };
}
async function fedex(n: string): Promise<Result | null> {
  const t = await token("fedex", fedexToken);
  if (!t) return null;
  const base = env("FEDEX_BASE") || "https://apis.fedex.com";
  const r = await fetch(`${base}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      includeDetailedScans: false,
      trackingInfo: [{ trackingNumberInfo: { trackingNumber: clean(n) } }],
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  const st = res?.latestStatusDetail;
  if (!st) return null;
  const loc = st.scanLocation;
  return {
    n: clean(n),
    text: st.description ?? st.statusByLocale ?? "In the network",
    where: [loc?.city, loc?.stateOrProvinceCode ?? loc?.countryCode].filter(Boolean).join(", "),
    delivered: (st.derivedCode ?? "") === "DL" || /delivered/i.test(st.description ?? ""),
  };
}

/* ---------- DHL Express, API-key only ---------- */
async function dhl(n: string): Promise<Result | null> {
  const key = env("DHL_API_KEY");
  if (!key) return null;
  const r = await fetch(
    `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(clean(n))}`,
    { headers: { "DHL-API-Key": key } },
  );
  if (!r.ok) return null;
  const j = await r.json();
  const s = j?.shipments?.[0];
  const ev = s?.status;
  if (!ev) return null;
  return {
    n: clean(n),
    text: ev.description ?? ev.status ?? "In the network",
    where: ev.location?.address?.addressLocality ?? "",
    delivered: (s.status?.statusCode ?? "") === "delivered",
  };
}

const ADAPTERS: Record<string, (n: string) => Promise<Result | null>> = { ups, fedex, dhl };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });

  let asks: Ask[] = [];
  try {
    const body = await req.json();
    asks = Array.isArray(body?.numbers) ? body.numbers.slice(0, 40) : [];
  } catch {
    return Response.json({ error: "bad json" }, { status: 400, headers: CORS });
  }

  const results: Result[] = [];
  const skipped: string[] = [];
  await Promise.all(asks.map(async (a) => {
    const n = clean(a.n);
    if (!n) return;
    const carrier = (a.carrier || detect(n)).toLowerCase();
    const fn = ADAPTERS[carrier];
    if (!fn) { skipped.push(n); return; }
    try {
      const got = await fn(n);
      if (got) results.push(got); else skipped.push(n);
    } catch {
      skipped.push(n);
    }
  }));

  return Response.json({ results, skipped }, { headers: CORS });
});
