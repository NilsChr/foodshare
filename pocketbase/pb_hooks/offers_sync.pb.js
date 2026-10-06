/// <reference path="../pb_data/types.d.ts" />

// Keeps the shared `offers` collection in sync with this week's grocery flyers, and sorts
// new offers into store sections. Logic lives in offers_sync.js and offers_classify.js.
//
// Cron offers_sync: daily at 04:17 UTC (flyers switch at local midnight).
// Cron offers_classify: every 10 minutes, at most 4 minutes of work, so runs never overlap.
// POST /api/foodshare/offers-sync      (superuser)  -> { fetched, created, updated, deleted }
// POST /api/foodshare/offers-classify  (superuser)  -> { classified, remaining, stopped }

cronAdd("offers_sync", "17 4 * * *", () => {
  try {
    const result = require(`${__hooks}/offers_sync.js`).syncOffers($app)
    $app.logger().info("offers sync", "fetched", result.fetched, "created", result.created, "updated", result.updated, "deleted", result.deleted)
  } catch (err) {
    $app.logger().error("offers sync failed", "error", String(err))
  }
})

cronAdd("offers_classify", "*/10 * * * *", () => {
  try {
    const result = require(`${__hooks}/offers_classify.js`).classifyOffers($app, 240)
    // Quiet when there was nothing to do.
    if (result.classified || result.stopped) {
      $app.logger().info("offers classify", "classified", result.classified, "remaining", result.remaining, "stopped", result.stopped)
    }
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
