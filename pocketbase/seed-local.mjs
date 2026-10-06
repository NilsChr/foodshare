// Local development data: a demo user and this week's offers. Idempotent.
// Refuses to run against anything but a local server, so it can never touch production.
// Usage: run by `docker compose up` (service "setup").

const { POCKETBASE_URL: url, POCKETBASE_USER: user, POCKETBASE_PASS: pass, DEMO_USER: demoUser, DEMO_PASS: demoPass } = process.env;
if (!url || !user || !pass || !demoUser || !demoPass) throw new Error("POCKETBASE_URL, POCKETBASE_USER, POCKETBASE_PASS, DEMO_USER and DEMO_PASS are required");
if (!/^http:\/\/(localhost|127\.0\.0\.1|pocketbase)(:\d+)?$/.test(url)) throw new Error(`seed-local only runs against a local server, not ${url}`);

async function api(path, init = {}) {
  const res = await fetch(url + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

let token = "";
token = (
  await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: user, password: pass }),
  })
).token;

const filter = encodeURIComponent(`email = "${demoUser}"`);
const { items } = await api(`/api/collections/users/records?filter=${filter}`);
if (items.length) {
  console.log("demo user exists:", demoUser);
} else {
  await api("/api/collections/users/records", {
    method: "POST",
    body: JSON.stringify({ email: demoUser, password: demoPass, passwordConfirm: demoPass, name: "Demo", verified: true }),
  });
  console.log("created demo user:", demoUser);
}

// The nightly cron would fill offers too; sync now so they are there from the start.
try {
  console.log("offers sync:", await api("/api/foodshare/offers-sync", { method: "POST" }));
} catch (err) {
  console.warn("offers sync failed (the app works without offers):", err.message);
}
