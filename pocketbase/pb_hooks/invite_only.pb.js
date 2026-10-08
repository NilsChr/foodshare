/// <reference path="../pb_data/types.d.ts" />

// Invite only: a new account (email code, password or Google sign-up) is created only for an
// email listed in `allowed_emails`, or one with a pending space invite. A row with email "*"
// lets anyone sign up. Existing accounts and superusers are not affected.
// Refused sign-ups get 403, which the login page shows as an invite-only notice.
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
