/// <reference path="../pb_data/types.d.ts" />

// Admins (users.admin) manage the invite-only list in the app instead of the dashboard.
// They can list, add and remove emails, but not the "*" row that opens sign-up to everyone;
// that stays with superusers. Rows are deleted once the account exists (pb_hooks/invite_only.pb.js),
// so an email is only kept until its owner signs up.

const ADMIN = "@request.auth.admin = true"

migrate((app) => {
  const allowed = app.findCollectionByNameOrId("allowed_emails")
  unmarshal({
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: `${ADMIN} && @request.body.email != "*"`,
    updateRule: null,
    deleteRule: `${ADMIN} && email != "*"`,
  }, allowed)
  app.save(allowed)

  // Rows for emails that already signed up are no longer needed.
  for (const row of app.findAllRecords("allowed_emails", $dbx.exp("email != '*' AND lower(email) IN (SELECT lower(email) FROM users)"))) {
    app.delete(row)
  }
}, (app) => {
  const allowed = app.findCollectionByNameOrId("allowed_emails")
  unmarshal({ listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null }, allowed)
  app.save(allowed)
})
