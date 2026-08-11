// Supabase Edge Function: send a reminder for anything due today or overdue.
//
// Deploy and schedule it — see README.md in this directory. It reads the same
// tables the app writes, so it needs the service role key, which is why this
// runs on a server and not in the page.
//
// Not exercised by the app's test suite: nothing here can run without a real
// Supabase project and a real push service.

import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const APP_URL = Deno.env.get("APP_URL") ?? "https://dbulldesign.github.io/ShipShape/";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

const today = () => new Date().toISOString().slice(0, 10);

/** Whether an item wants a reminder today, and what to say about it.
 *
 *  The plain case is "due on or before today". On top of that an item can carry
 *  `remind`, a number of days to be told ahead of time, and a shipment can have
 *  an `eta` that matters sooner than the due date does. So the date to measure
 *  against is the earlier of due and eta, and the reminder opens `remind` days
 *  before it — which is why this cannot simply be a `due <= today` filter.
 *
 *  Archived items are out. So is anything already done. */
function wanted(t: Record<string, unknown>): string | null {
  if (!t || t.done || t.arch) return null;
  const due = typeof t.due === "string" ? t.due : "";
  const eta = typeof t.eta === "string" ? t.eta : "";
  const when = [due, eta].filter(Boolean).sort()[0];
  if (!when) return null;
  const lead = Number(t.remind) > 0 ? Number(t.remind) : 0;
  const open = new Date(when + "T00:00:00Z");
  open.setUTCDate(open.getUTCDate() - lead);
  if (open.toISOString().slice(0, 10) > today()) return null;
  const title = (t.title as string) ?? "Untitled";
  // say why it is being mentioned early, or it reads as a mistake
  if (lead && when > today()) {
    const days = Math.round((+new Date(when + "T00:00:00Z") - +new Date(today() + "T00:00:00Z")) / 864e5);
    return `${title} — in ${days} day${days === 1 ? "" : "s"}`;
  }
  return title;
}

/** Everything wanting a reminder today, per workspace. Reads whichever table the
 *  workspace uses: the per-item one if it has rows, else the whole document. */
async function dueByWorkspace(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const seen = new Set<string>();

  const items = await (await rest("shipshape_items?select=ws,data&data=not.is.null")).json();
  for (const row of items ?? []) {
    seen.add(row.ws);
    const line = wanted(row.data);
    if (!line) continue;
    if (!out.has(row.ws)) out.set(row.ws, []);
    out.get(row.ws)!.push(line);
  }

  const docs = await (await rest("shipshape_state?select=id,data")).json();
  for (const row of docs ?? []) {
    if (seen.has(row.id)) continue;                   // per-item rows win
    for (const t of row.data?.tasks ?? []) {
      const line = wanted(t);
      if (!line) continue;
      if (!out.has(row.id)) out.set(row.id, []);
      out.get(row.id)!.push(line);
    }
  }
  return out;
}

Deno.serve(async () => {
  const due = await dueByWorkspace();
  const subs = await (await rest("shipshape_push_subs?select=ws,endpoint,keys")).json();
  let sent = 0, gone = 0;

  for (const s of subs ?? []) {
    const titles = due.get(s.ws);
    if (!titles?.length) continue;
    const body = titles.length === 1
      ? titles[0]
      : `${titles[0]} and ${titles.length - 1} more`;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify({
          title: `${titles.length} due`,
          body,
          url: APP_URL,
          // A repeat send under the same tag replaces the earlier one, and iOS
          // does that silently — no banner. One tag a day suits the scheduled
          // run; the clock time keeps hand-triggered tests alerting.
          tag: `due-${today()}-${new Date().getHours()}${new Date().getMinutes()}`,
        }),
      );
      sent++;
    } catch (e) {
      // 404/410 means the browser dropped the subscription: stop trying it
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await rest(
          `shipshape_push_subs?ws=eq.${encodeURIComponent(s.ws)}&endpoint=eq.${encodeURIComponent(s.endpoint)}`,
          { method: "DELETE" },
        );
        gone++;
      }
    }
  }
  return Response.json({ workspaces: due.size, sent, pruned: gone });
});
