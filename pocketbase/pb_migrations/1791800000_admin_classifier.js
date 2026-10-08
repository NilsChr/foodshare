/// <reference path="../pb_data/types.d.ts" />

// Admins and the classifier switch.
// - users.admin: set by superusers in the dashboard. Users can read their own flag (the app
//   shows the admin section) but never set it, on sign-up or later.
// - app_settings: one record. `classifier` picks what labels offers and list items: "jev"
//   (TypeSafe's Jev, paid per request) or "local" (classifier/serve.py at CLASSIFIER_URL).
//   Only admins can read and change it; see pb_hooks/product_types.js.

const NO_ADMIN = "@request.body.admin:isset = false"

// The users collection's create and update rules as plain strings (null: superusers only).
// Read through JSON: in the JS engine the rule fields are Go pointers, not strings.
function userRules(users) {
  const json = JSON.parse(JSON.stringify(users))
  return { createRule: json.createRule, updateRule: json.updateRule }
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "admin" }))
  const rules = userRules(users)
  for (const name in rules) {
    const rule = rules[name]
    if (rule !== null) rules[name] = rule ? `(${rule}) && ${NO_ADMIN}` : NO_ADMIN
  }
  unmarshal(rules, users)
  app.save(users)

  const ADMIN = "@request.auth.admin = true"
  const settings = new Collection({
    type: "base",
    name: "app_settings",
    fields: [
      { name: "classifier", type: "select", required: true, maxSelect: 1, values: ["jev", "local"] },
    ],
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: null,
    updateRule: ADMIN,
    deleteRule: null,
  })
  app.save(settings)
  const record = new Record(settings)
  record.set("classifier", "jev")
  app.save(record)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("app_settings"))
  const users = app.findCollectionByNameOrId("users")
  const rules = userRules(users)
  for (const name in rules) {
    const rule = rules[name]
    if (rule === NO_ADMIN) rules[name] = ""
    else if (rule && rule.endsWith(`) && ${NO_ADMIN}`)) rules[name] = rule.slice(1, -(`) && ${NO_ADMIN}`.length))
  }
  unmarshal(rules, users)
  users.fields.removeByName("admin")
  app.save(users)
})
