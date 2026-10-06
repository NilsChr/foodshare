/// <reference path="../pb_data/types.d.ts" />

// Keeps the shared `offers` collection in sync with this week's grocery flyers, then sorts
// new offers into store sections and checks which offers list items mean. Logic lives in
// offers_sync.js, offers_classify.js and offer_matches.js.
//
// Cron offers_sync: daily at 04:17 UTC (flyers switch at local midnight). The sync is ~45
// requests to the flyer API; classifying then sends only what is new to Jev, for at most
// 20 minutes (a whole new week of ~1200 offers takes ~5). New list items are checked when
// they are added; the next run catches up on any check that failed then.
// OFFERS_CRON=off (env, set by docker-compose locally) leaves the cron out, so a local
// PocketBase never sends offers to Jev on its own.
// POST /api/foodshare/offers-sync      (superuser)  -> { fetched, created, updated, deleted }
// POST /api/foodshare/offers-classify  (superuser)  -> { classified, remaining, items, matched, tokens, stopped }

if ($os.getenv("OFFERS_CRON") !== "off") cronAdd("offers_sync", "17 4 * * *", () => {
  try {
    const result = require(`${__hooks}/offers_sync.js`).syncOffers($app)
    $app.logger().info("offers sync", "fetched", result.fetched, "created", result.created, "updated", result.updated, "deleted", result.deleted)
  } catch (err) {
    $app.logger().error("offers sync failed", "error", String(err))
  }
  try {
    const result = require(`${__hooks}/offers_classify.js`).classifyOffers($app, 1200)
    $app.logger().info("offers classify", "classified", result.classified, "remaining", result.remaining, "items", result.items, "matched", result.matched, "tokens", result.tokens, "stopped", result.stopped)
  } catch (err) {
    $app.logger().error("offers classify failed", "error", String(err))
  }
})

routerAdd("POST", "/api/foodshare/offers-sync", (e) => {
  try {
    return e.json(200, require(`${__hooks}/offers_sync.js`).syncOffers(e.app))
  } catch (err) {
    throw new BadRequestError("Offers sync failed: " + err)
  }
}, $apis.requireSuperuserAuth())

// Classifies for up to 60 seconds; call again until `remaining` is 0.
routerAdd("POST", "/api/foodshare/offers-classify", (e) => {
  try {
    return e.json(200, require(`${__hooks}/offers_classify.js`).classifyOffers(e.app, 60))
  } catch (err) {
    throw new BadRequestError("Offers classify failed: " + err)
  }
}, $apis.requireSuperuserAuth())
