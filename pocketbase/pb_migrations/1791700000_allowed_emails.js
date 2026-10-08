/// <reference path="../pb_data/types.d.ts" />

// Invite only: new accounts need their email in `allowed_emails` (or a pending space invite);
// see pb_hooks/invite_only.pb.js. A row with email "*" opens sign-up to everyone.
// Managed by superusers in the dashboard; no API access for users.

migrate((app) => {
  const allowed = new Collection({
    type: "base",
    name: "allowed_emails",
    fields: [
      // Text, not email, so "*" fits. Compared case-insensitively.
      { name: "email", type: "text", required: true, max: 254 },
      { name: "note", type: "text", max: 200 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_allowed_emails_email ON allowed_emails (email COLLATE NOCASE)"],
  })
  app.save(allowed)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("allowed_emails"))
})
