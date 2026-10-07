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
// Shared offer data: readable when signed in, written only by the server hooks.
const chains = (await call(eve.token, "GET", "/api/collections/chains/records?perPage=1")).body;
check("signed-in user lists chains", chains.totalItems > 0, true);
check("anonymous lists no offers", (await call(null, "GET", "/api/collections/offers/records?perPage=1")).body.totalItems, 0);
check("user cannot create offer",
  (await call(eve.token, "POST", "/api/collections/offers/records", { key: "x", chain: chains.items[0].id, heading: "x" })).status, 403);
check("user cannot edit chain",
  (await call(eve.token, "PATCH", `/api/collections/chains/records/${chains.items[0].id}`, { name: "x" })).status, 403);
check("user cannot read product name cache",
  (await call(eve.token, "GET", "/api/collections/product_names/records")).status, 403);
check("bob picks group stores",
  (await call(bob.token, "PATCH", `/api/collections/spaces/records/${space.id}`, { chains: [chains.items[0].id] })).status, 200);
check("eve cannot pick stores for the group",
  (await call(eve.token, "PATCH", `/api/collections/spaces/records/${space.id}`, { chains: [] })).status, 404);

// Recipe prices: members only, and the recipe must be in the same space.
const recipe = (await call(alice.token, "POST", "/api/collections/recipes/records", { space: space.id, title: "Taco" })).body;
const price = (await call(alice.token, "POST", "/api/collections/recipe_prices/records", {
  space: space.id, recipe: recipe.id, chain: chains.items[0].id, lines: [{ name: "Paprika", price: 15 }], total: 15,
})).body;
check("member adds recipe price", !!price.id, true);
check("eve cannot view recipe price", (await call(eve.token, "GET", `/api/collections/recipe_prices/records/${price.id}`)).status, 404);
check("eve cannot add recipe price",
  (await call(eve.token, "POST", "/api/collections/recipe_prices/records", { space: space.id, recipe: recipe.id, chain: chains.items[0].id })).status, 400);
const eveSpace = (await call(eve.token, "POST", "/api/collections/spaces/records", { name: "Eve test", owner: eve.id })).body;
await call(eve.token, "POST", "/api/collections/memberships/records", { space: eveSpace.id, user: eve.id });
check("eve cannot price alice's recipe from her own space",
  (await call(eve.token, "POST", "/api/collections/recipe_prices/records", { space: eveSpace.id, recipe: recipe.id, chain: chains.items[0].id })).status, 400);
check("recipe price cannot be edited",
  (await call(alice.token, "PATCH", `/api/collections/recipe_prices/records/${price.id}`, { total: 1 })).status, 403);
check("eve deletes her space", (await call(eve.token, "DELETE", `/api/collections/spaces/records/${eveSpace.id}`)).status, 204);

// A picked offer: members set it; the offers sync deleting the offer clears it from the item.
const offer = (await call(admin, "POST", "/api/collections/offers/records", { key: "rules-test", chain: chains.items[0].id, heading: "Test offer" })).body;
check("bob picks an offer for the item",
  (await call(bob.token, "PATCH", `/api/collections/items/records/${item.id}`, { offer: offer.id })).body.offer, offer.id);
await call(admin, "DELETE", `/api/collections/offers/records/${offer.id}`);
const kept = (await call(alice.token, "GET", `/api/collections/items/records/${item.id}`)).body;
check("expired offer cleared from item", kept.offer, "");

// Purchases: members record their own; nobody edits or deletes them.
const purchase = (await call(bob.token, "POST", "/api/collections/purchases/records", {
  space: space.id, name: "kyllingfilet", heading: "KYLLINGFILET", chain: chains.items[0].id, price: 67.9, pre_price: 89.9, bought_by: bob.id,
})).body;
check("member records a purchase", !!purchase.id, true);
check("purchase as someone else rejected",
  (await call(bob.token, "POST", "/api/collections/purchases/records", { space: space.id, name: "x", bought_by: alice.id })).status, 400);
check("eve cannot record a purchase in the group",
  (await call(eve.token, "POST", "/api/collections/purchases/records", { space: space.id, name: "x", bought_by: eve.id })).status, 400);
check("eve cannot view purchase", (await call(eve.token, "GET", `/api/collections/purchases/records/${purchase.id}`)).status, 404);
check("purchase cannot be edited",
  (await call(alice.token, "PATCH", `/api/collections/purchases/records/${purchase.id}`, { pre_price: 1000 })).status, 403);
check("purchase cannot be deleted", (await call(alice.token, "DELETE", `/api/collections/purchases/records/${purchase.id}`)).status, 403);

check("alice deletes space",(await call(alice.token, "DELETE", `/api/collections/spaces/records/${space.id}`)).status, 204);
check("item cascade-deleted", (await call(admin, "GET", `/api/collections/items/records/${item.id}`)).status, 404);
check("recipe price cascade-deleted", (await call(admin, "GET", `/api/collections/recipe_prices/records/${price.id}`)).status, 404);
check("purchase cascade-deleted", (await call(admin, "GET", `/api/collections/purchases/records/${purchase.id}`)).status, 404);
check("pantry cascade-deleted",(await call(admin, "GET", `/api/collections/pantry/records/${stock.id}`)).status, 404);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
