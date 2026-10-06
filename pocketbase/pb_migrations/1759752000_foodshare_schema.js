/// <reference path="../pb_data/types.d.ts" />

// Foodshare's schema and API rules. PocketBase applies pending migrations when it starts,
// so deploying the image updates the database; there is no separate setup step.
//
// This first migration is idempotent on purpose: it creates what is missing and updates
// fields by name, so it works on an empty database and on one built with the old
// setup.mjs script. It never deletes collections, fields or records. Later schema
// changes go in new, smaller migration files.

migrate((app) => {
  // A record belongs to a space the caller is a member of.
  const MEMBER = "space.memberships_via_space.user ?= @request.auth.id"
  const SERVER_ONLY = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null }
  const SIGNED_IN_READ = { ...SERVER_ONLY, listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""' }
  const MEMBER_RULES = {
    listRule: MEMBER,
    viewRule: MEMBER,
    createRule: MEMBER,
    updateRule: `${MEMBER} && (@request.body.space:isset = false || @request.body.space = space)`,
    deleteRule: MEMBER,
  }

  const timestamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]
  const rel = (name, collection, opts) => ({ name, type: "relation", collection, maxSelect: 1, cascadeDelete: false, ...opts })
  const text = (name, opts) => ({ name, type: "text", ...opts })

  const collections = [
    {
      name: "spaces",
      fields: [
        text("name", { required: true, max: 80 }),
        rel("owner", "users", { required: true }),
        // Grocery chains whose offers the group compares; none = offers are not shown.
        rel("chains", "chains", { maxSelect: 99 }),
        ...timestamps,
      ],
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
      rules: MEMBER_RULES,
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
        // Free-text labels like "Dessert"; the space's tag list is the union over its recipes.
        { name: "tags", type: "json", maxSize: 5000 },
        // Where an imported recipe came from: source id (e.g. "oda") and normalized page URL.
        text("source", { max: 40 }),
        text("source_url", { max: 500 }),
        rel("favorited_by", "users", { maxSelect: 999 }),
        rel("created_by", "users"),
        ...timestamps,
      ],
      // One import per page and space; hand-made recipes have no source_url.
      indexes: ["CREATE UNIQUE INDEX idx_recipes_space_source_url ON recipes (space, source_url) WHERE source_url != ''"],
      rules: MEMBER_RULES,
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
        // Product type key (pb_hooks/product_types.json) for matching offers; set by the
        // item_types hook. "none" = no type, "" = not decided yet.
        text("product_type", { max: 40 }),
        ...timestamps,
      ],
      rules: MEMBER_RULES,
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
      rules: MEMBER_RULES,
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
      rules: MEMBER_RULES,
    },
    {
      // Grocery chains with flyer offers, shared by everyone. Written by the offers_sync hook.
      name: "chains",
      fields: [
        text("tjek_id", { required: true, max: 20 }),
        text("name", { required: true, max: 40 }),
        { name: "logo", type: "url" },
        // Brand color as 6 hex digits, no "#".
        text("color", { max: 6 }),
        ...timestamps,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_chains_tjek_id ON chains (tjek_id)"],
      rules: SIGNED_IN_READ,
    },
    {
      // This week's grocery flyer offers, shared by everyone. Written only by the
      // offers_sync hook, which replaces the contents on each run.
      name: "offers",
      fields: [
        // Hash of chain, product, price, size and period; identifies an offer across syncs.
        text("key", { required: true, max: 32 }),
        rel("chain", "chains", { required: true, cascadeDelete: true }),
        text("heading", { required: true, max: 200 }),
        text("description", { max: 1000 }),
        { name: "price", type: "number", min: 0 },
        // Only set when the flyer gives a before-price; "-40%" offers often have none.
        { name: "pre_price", type: "number", min: 0 },
        { name: "discount_pct", type: "number", min: 0, max: 100 },
        { name: "size_from", type: "number", min: 0 },
        { name: "size_to", type: "number", min: 0 },
        text("unit", { max: 20 }),
        { name: "pieces", type: "number", min: 0 },
        { name: "image", type: "url" },
        { name: "run_from", type: "date" },
        { name: "run_till", type: "date" },
        // Store section, set by the offers_classify hook; empty until classified.
        {
          name: "category",
          type: "select",
          maxSelect: 1,
          values: ["vegetables", "fruit", "bakery", "meat_fish", "dairy_eggs", "pantry", "frozen", "snacks", "drinks", "household", "other"],
        },
        // Product type key, as on items; set by offers_classify. "none" = no type, "" = not classified yet.
        text("product_type", { max: 40 }),
        ...timestamps,
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_offers_key ON offers (key)",
        "CREATE INDEX idx_offers_chain ON offers (chain)",
      ],
      rules: SIGNED_IN_READ,
    },
    {
      // Cache of list item name -> product type, shared by all groups so each name is
      // resolved once. Server-only.
      name: "product_names",
      fields: [text("name", { required: true, max: 120 }), text("product_type", { max: 40 }), ...timestamps],
      indexes: ["CREATE UNIQUE INDEX idx_product_names_name ON product_names (name)"],
      rules: SERVER_ONLY,
    },
  ]

  const FIELD_TYPES = {
    text: TextField, number: NumberField, bool: BoolField, email: EmailField, url: URLField, date: DateField,
    autodate: AutodateField, select: SelectField, file: FileField, relation: RelationField, json: JSONField,
  }

  const find = (name) => {
    try {
      return app.findCollectionByNameOrId(name)
    } catch (_) {
      return null
    }
  }

  // 1. Every collection exists, so relations and rules below can refer to any of them.
  for (const c of collections) {
    if (!find(c.name)) app.save(new Collection({ type: "base", name: c.name }))
  }

  // 2. Fields (matched by name, so existing ids and data are kept) and indexes.
  //    Fields this file does not list are left alone.
  for (const c of collections) {
    const collection = find(c.name)
    for (const def of c.fields) {
      const { type, collection: target, ...opts } = def
      if (target) opts.collectionId = find(target).id
      const existing = collection.fields.getByName(def.name)
      if (existing) opts.id = existing.id
      collection.fields.add(new FIELD_TYPES[type](opts))
    }
    if (c.indexes) unmarshal({ indexes: c.indexes }, collection)
    app.save(collection)
  }

  // 3. API rules; back-relations like memberships_via_space need every collection in place.
  for (const c of collections) {
    const collection = find(c.name)
    unmarshal(c.rules, collection)
    app.save(collection)
  }

  // Members of a shared space can see each other's name and avatar. Sign in with a code
  // sent by email (needs SMTP in PocketBase settings).
  const users = find("users")
  unmarshal({
    listRule: "id = @request.auth.id || memberships_via_user.space.memberships_via_space.user ?= @request.auth.id",
    viewRule: "id = @request.auth.id || memberships_via_user.space.memberships_via_space.user ?= @request.auth.id",
    otp: { enabled: true, duration: 300, length: 6 },
  }, users)
  app.save(users)
}, (app) => {
  // No down migration: rolling back would drop user data. Restore a backup instead.
})
