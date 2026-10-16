/// <reference path="../pb_data/types.d.ts" />

// Invite only: a new account (email code, password or Google sign-up) is created only for an
// email listed in `allowed_emails`, or one with a pending space invite. A row with email "*"
// lets anyone sign up. Existing accounts and superusers are not affected.
// Refused sign-ups get 403, which the login page shows as an invite-only notice.
// Admins manage the list in the app (pb_migrations/*_allowed_emails_admin.js).
//
// Note: JSVM handlers run isolated, so the check is repeated inside each handler.

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const email = String(e.record.get("email") || "").trim().toLowerCase()
    const allowed =
      e.app.countRecords("allowed_emails", $dbx.exp("lower(email) IN ({:email}, '*')", { email: email })) > 0 ||
      e.app.countRecords("invites", $dbx.exp("lower(email) = {:email}", { email: email })) > 0
    if (!email || !allowed) throw new ForbiddenError("Foodshare is invite only for now.")
  }
  e.next()
}, "users")

onRecordAuthWithOAuth2Request((e) => {
  if (e.isNewRecord) {
    const email = String((e.oAuth2User && e.oAuth2User.email) || "").trim().toLowerCase()
    const allowed =
      e.app.countRecords("allowed_emails", $dbx.exp("lower(email) IN ({:email}, '*')", { email: email })) > 0 ||
      e.app.countRecords("invites", $dbx.exp("lower(email) = {:email}", { email: email })) > 0
    if (!email || !allowed) throw new ForbiddenError("Foodshare is invite only for now.")
  }
  e.next()
}, "users")

// An allowed email is only needed until its account exists: then the row is removed, so the
// list holds no emails beyond those still waiting to sign up. Runs for every way an account is made.
onRecordAfterCreateSuccess((e) => {
  const email = String(e.record.get("email") || "").trim().toLowerCase()
  if (email) {
    for (const row of e.app.findAllRecords("allowed_emails", $dbx.exp("lower(email) = {:email}", { email: email }))) {
      e.app.delete(row)
    }
  }
  e.next()
}, "users")

// Admins add emails in the app: stored lowercased, and not for an email that already has an
// account (the row would never be used, so never removed). Only superusers can add "*".
onRecordCreateRequest((e) => {
  const email = String(e.record.get("email") || "").trim().toLowerCase()
  e.record.set("email", email)
  if (email === "*") {
    if (!e.hasSuperuserAuth()) throw new ForbiddenError("Only superusers can open sign-up to everyone.")
  } else {
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new BadRequestError("Enter a valid email.")
    if (e.app.countRecords("users", $dbx.exp("lower(email) = {:email}", { email: email })) > 0) {
      throw new BadRequestError("This email already has an account.")
    }
  }
  e.next()
}, "allowed_emails")
