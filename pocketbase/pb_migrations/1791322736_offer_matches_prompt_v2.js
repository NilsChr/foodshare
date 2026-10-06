/// <reference path="../pb_data/types.d.ts" />

// The offer match question now names the item's product type ("salat" (a Salat) is the
// vegetable, not "REKESALAT"). Cached answers to the old question are dropped so every pair
// is asked again; items keep their current matches until the next offers_classify run.

migrate((app) => {
  app.db().newQuery("DELETE FROM offer_matches").execute()
}, (app) => {
  // Cache only; nothing to restore.
})
