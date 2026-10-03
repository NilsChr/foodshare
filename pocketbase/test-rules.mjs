// Checks API rules against the live PocketBase using three test users.
// Usage: node --env-file=.env pocketbase/test-rules.mjs
// Ensures alice/bob/eve@foodshare.test exist (password TEST_USER_PASSWORD), runs the
// scenarios, then deletes the space it created.

const { POCKETBASE_URL: url, POCKETBASE_USER, POCKETBASE_PASS, TEST_USER_PASSWORD: pw } = process.env;

async function call(token, method, path, body) {
  const res = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const admin = (
  await call(null, "POST", "/api/collections/_superusers/auth-with-password", {
    identity: POCKETBASE_USER,
    password: POCKETBASE_PASS,
  })
).body.token;

async function login(name) {
  const email = `${name}@foodshare.test`;
  let r = await call(null, "POST", "/api/collections/users/auth-with-password", { identity: email, password: pw });
  if (r.status !== 200) {
    await call(admin, "POST", "/api/collections/users/records", {
      email,
      password: pw,
      passwordConfirm: pw,
      name: name[0].toUpperCase() + name.slice(1),
      verified: true,
    });
    r = await call(null, "POST", "/api/collections/users/auth-with-password", { identity: email, password: pw });
  }
  return { token: r.body.token, id: r.body.record.id, email };
}

let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} (got ${actual}, want ${expected})`);
}

const alice = await login("alice");
const bob = await login("bob");
const eve = await login("eve");

const space = (await call(alice.token, "POST", "/api/collections/spaces/records", { name: "Rules test", owner: alice.id })).body;
check("alice creates space", !!space.id, true);
check("space create with other owner rejected",
  (await call(eve.token, "POST", "/api/collections/spaces/records", { name: "x", owner: alice.id })).status, 400);

check("alice joins own space",
  (await call(alice.token, "POST", "/api/collections/memberships/records", { space: space.id, user: alice.id })).status, 200);
check("bob cannot join uninvited",
  (await call(bob.token, "POST", "/api/collections/memberships/records", { space: space.id, user: bob.id })).status, 400);
check("eve cannot add bob",
  (await call(eve.token, "POST", "/api/collections/memberships/records", { space: space.id, user: bob.id })).status, 400);

const item = (await call(alice.token, "POST", "/api/collections/items/records", { space: space.id, name: "Milk" })).body;
check("member creates item", !!item.id, true);
check("eve cannot view item", (await call(eve.token, "GET", `/api/collections/items/records/${item.id}`)).status, 404);
check("eve lists no items",
  (await call(eve.token, "GET", `/api/collections/items/records?filter=${encodeURIComponent(`space="${space.id}"`)}`)).body.totalItems, 0);
check("eve cannot create item in space",
  (await call(eve.token, "POST", "/api/collections/items/records", { space: space.id, name: "x" })).status, 400);

const stock = (await call(alice.token, "POST", "/api/collections/pantry/records", { space: space.id, name: "Rice" })).body;
check("member adds pantry item", !!stock.id, true);
check("eve cannot view pantry item", (await call(eve.token, "GET", `/api/collections/pantry/records/${stock.id}`)).status, 404);
check("eve cannot add to pantry",
  (await call(eve.token, "POST", "/api/collections/pantry/records", { space: space.id, name: "x" })).status, 400);

const invite = (await call(alice.token, "POST", "/api/collections/invites/records", {
  space: space.id, email: bob.email, invited_by: alice.id, space_name: space.name, inviter_name: "Alice",
})).body;
check("alice invites bob", !!invite.id, true);
check("bob sees invite", (await call(bob.token, "GET", `/api/collections/invites/records/${invite.id}`)).status, 200);
check("eve does not see invite", (await call(eve.token, "GET", `/api/collections/invites/records/${invite.id}`)).status, 404);
check("eve cannot use bob's invite",
  (await call(eve.token, "POST", "/api/collections/memberships/records", { space: space.id, user: eve.id })).status, 400);
check("bob accepts invite",
  (await call(bob.token, "POST", "/api/collections/memberships/records", { space: space.id, user: bob.id })).status, 200);
check("bob deletes invite", (await call(bob.token, "DELETE", `/api/collections/invites/records/${invite.id}`)).status, 204);
check("bob views item", (await call(bob.token, "GET", `/api/collections/items/records/${item.id}`)).status, 200);
check("bob sees alice's name", (await call(bob.token, "GET", `/api/collections/users/records/${alice.id}`)).body.name, "Alice");
check("eve cannot see alice", (await call(eve.token, "GET", `/api/collections/users/records/${alice.id}`)).status, 404);
check("bob cannot move item to other space",
  (await call(bob.token, "PATCH", `/api/collections/items/records/${item.id}`, { space: "xxxxxxxxxxxxxxx" })).status, 404);
check("bob cannot take ownership",
  (await call(bob.token, "PATCH", `/api/collections/spaces/records/${space.id}`, { owner: bob.id })).status, 404);
check("bob renames space",
  (await call(bob.token, "PATCH", `/api/collections/spaces/records/${space.id}`, { name: "Renamed" })).status, 200);
check("bob cannot delete space", (await call(bob.token, "DELETE", `/api/collections/spaces/records/${space.id}`)).status, 404);
check("alice deletes space", (await call(alice.token, "DELETE", `/api/collections/spaces/records/${space.id}`)).status, 204);
check("item cascade-deleted", (await call(admin, "GET", `/api/collections/items/records/${item.id}`)).status, 404);
check("pantry cascade-deleted", (await call(admin, "GET", `/api/collections/pantry/records/${stock.id}`)).status, 404);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
