// Idempotent PocketBase schema setup for Foodshare.
// Usage: node --env-file=.env pocketbase/setup.mjs
// Creates or updates every collection, then applies API rules in a second pass
// (rules may reference back-relations to collections that do not exist yet in pass one).

const { POCKETBASE_URL: url, POCKETBASE_USER: user, POCKETBASE_PASS: pass } = process.env;
if (!url || !user || !pass) throw new Error("POCKETBASE_URL, POCKETBASE_USER and POCKETBASE_PASS are required");

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

const ids = {};
for (const c of (await api("/api/collections?perPage=500")).items) ids[c.name] = c.id;

const timestamps = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const rel = (name, collection, opts = {}) => ({
  name,
  type: "relation",
  collectionId: () => ids[collection],
  maxSelect: 1,
  cascadeDelete: false,
  ...opts,
});
const text = (name, opts = {}) => ({ name, type: "text", ...opts });

// A record belongs to a space the caller is a member of.
const MEMBER = "space.memberships_via_space.user ?= @request.auth.id";

const collections = [
  {
    name: "spaces",
    fields: [text("name", { required: true, max: 80 }), rel("owner", "users", { required: true }), ...timestamps],
    rules: {
      listRule: "owner = @request.auth.id || memberships_via_space.user ?= @request.auth.id",
      viewRule: "owner = @request.auth.id || memberships_via_space.user ?= @request.auth.id",
      createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
      updateRule: "memberships_via_space.user ?= @request.auth.id && (@request.body.owner:isset = false || owner = @request.auth.id)",
      deleteRule: "owner = @request.auth.id",
    },
  },
  {
    name: "memberships",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      rel("user", "users", { required: true, cascadeDelete: true }),
      ...timestamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_memberships_space_user ON memberships (space, user)"],
    rules: {
      listRule: `user = @request.auth.id || ${MEMBER}`,
      viewRule: `user = @request.auth.id || ${MEMBER}`,
      // Join as the space owner, or with a pending invite for your email.
      createRule:
        "@request.body.user = @request.auth.id && (space.owner = @request.auth.id || " +
        "(@collection.invites.space ?= @request.body.space && @collection.invites.email ?= @request.auth.email))",
      updateRule: null,
      deleteRule: "user = @request.auth.id || space.owner = @request.auth.id",
    },
  },
  {
    name: "invites",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      { name: "email", type: "email", required: true },
      rel("invited_by", "users", { required: true, cascadeDelete: true }),
      // Denormalized so the invitee can see what they are joining before they have access.
      text("space_name", { max: 80 }),
      text("inviter_name", { max: 120 }),
      ...timestamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_invites_space_email ON invites (space, email)"],
    rules: {
      listRule: `email = @request.auth.email || ${MEMBER}`,
      viewRule: `email = @request.auth.email || ${MEMBER}`,
      createRule: `@request.body.invited_by = @request.auth.id && ${MEMBER}`,
      updateRule: null,
      deleteRule: `email = @request.auth.email || ${MEMBER}`,
    },
  },
  {
    name: "categories",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      text("name", { required: true, max: 60 }),
      text("icon", { max: 40 }),
      { name: "keywords", type: "json", maxSize: 50000 },
      { name: "sort", type: "number" },
      // Show this section under another one's header in the list; data stays separate.
      rel("group_with", "categories"),
      ...timestamps,
    ],
    rules: "member",
  },
  {
    name: "recipes",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      text("title", { required: true, max: 120 }),
      text("description", { max: 500 }),
      {
        name: "image",
        type: "file",
        maxSelect: 1,
        maxSize: 10 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
        thumbs: ["400x300", "800x600", "120x120"],
      },
      { name: "servings", type: "number", min: 0 },
      // Total cooking time in minutes; 0 = not set.
      { name: "minutes", type: "number", min: 0 },
      // [{ name: string, quantity: string }]
      { name: "ingredients", type: "json", maxSize: 100000 },
      text("instructions", { max: 20000 }),
      // Where an imported recipe came from: source id (e.g. "oda") and normalized page URL.
      // Free-text labels like "Dessert"; the space's tag list is the union over its recipes.
      { name: "tags", type: "json", maxSize: 5000 },
      text("source", { max: 40 }),
      text("source_url", { max: 500 }),
      rel("favorited_by", "users", { maxSelect: 999 }),
      rel("created_by", "users"),
      ...timestamps,
    ],
    // One import per page and space; hand-made recipes have no source_url.
    indexes: ["CREATE UNIQUE INDEX idx_recipes_space_source_url ON recipes (space, source_url) WHERE source_url != ''"],
    rules: "member",
  },
  {
    name: "items",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      text("name", { required: true, max: 120 }),
      text("quantity", { max: 40 }),
      rel("category", "categories"),
      { name: "checked", type: "bool" },
      { name: "checked_at", type: "date" },
      rel("checked_by", "users"),
      rel("added_by", "users"),
      rel("recipe", "recipes"),
      ...timestamps,
    ],
    rules: "member",
  },
  {
    name: "meals",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      // YYYY-MM-DD, local calendar day.
      text("date", { required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
      rel("recipe", "recipes"),
      text("note", { max: 120 }),
      // Recipe multiplier for this dinner (2 = doubled for leftovers); 0/1 = as written.
      { name: "factor", type: "number", min: 0, max: 10 },
      ...timestamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_meals_space_date ON meals (space, date)"],
    rules: "member",
  },
  {
    // What the household has at home; recipes are ranked by how little extra they need.
    name: "pantry",
    fields: [
      rel("space", "spaces", { required: true, cascadeDelete: true }),
      text("name", { required: true, max: 120 }),
      rel("added_by", "users"),
      ...timestamps,
    ],
    rules: "member",
  },
];

const memberRules = {
  listRule: MEMBER,
  viewRule: MEMBER,
  createRule: MEMBER,
  updateRule: `${MEMBER} && (@request.body.space:isset = false || @request.body.space = space)`,
  deleteRule: MEMBER,
};

const resolveFields = (fields) =>
  fields.map((f) => (typeof f.collectionId === "function" ? { ...f, collectionId: f.collectionId() } : f));

// Pass 1: fields and indexes, run twice so self-relations resolve once their collection exists.
for (const round of [1, 2]) for (const c of collections) {
  const existing = ids[c.name] ? await api(`/api/collections/${ids[c.name]}`) : null;
  const fields = resolveFields(c.fields).filter((f) => f.type !== "relation" || f.collectionId).map((f) => {
    const prev = existing?.fields.find((p) => p.name === f.name);
    return prev ? { ...f, id: prev.id } : f;
  });
  if (existing) {
    // Keep system fields (id) and any field we do not manage.
    const managed = new Set(fields.map((f) => f.name));
    const keep = existing.fields.filter((f) => !managed.has(f.name));
    await api(`/api/collections/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: [...keep, ...fields], indexes: c.indexes ?? existing.indexes }),
    });
    if (round === 2) console.log("updated", c.name);
  } else {
    const created = await api("/api/collections", {
      method: "POST",
      body: JSON.stringify({ name: c.name, type: "base", fields, indexes: c.indexes ?? [] }),
    });
    ids[c.name] = created.id;
    console.log("created", c.name);
  }
}

// Pass 2: API rules.
for (const c of collections) {
  const rules = c.rules === "member" ? memberRules : c.rules;
  await api(`/api/collections/${ids[c.name]}`, { method: "PATCH", body: JSON.stringify(rules) });
}

// Members of a shared space can see each other's name and avatar.
await api(`/api/collections/${ids.users}`, {
  method: "PATCH",
  body: JSON.stringify({
    listRule: "id = @request.auth.id || memberships_via_user.space.memberships_via_space.user ?= @request.auth.id",
    viewRule: "id = @request.auth.id || memberships_via_user.space.memberships_via_space.user ?= @request.auth.id",
    // Sign in with a code sent by email (needs SMTP in PocketBase settings).
    otp: { enabled: true, duration: 300, length: 6 },
  }),
});
console.log("rules applied");
