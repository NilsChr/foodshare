/// <reference path="../pb_data/types.d.ts" />

// Sets `items.product_type` when an item is added or renamed, so the app can show offers
// that share no words with the name ("kaffe" -> coffee -> "ALI FILTERMALT"). Only in groups
// that compare offers. Most names resolve from the cache or the type list instantly; a new
// name costs one Jev request (~300 ms). If that fails the item is saved without a type and
// the daily offers_sync cron fills it in. See product_types.js.
//
// Then `items.offer_matches`: which offers of that type the name really means, also
// checked by Jev (offer_matches.js; cached, ~0.5 s for a new name). On failure it stays
// unset (the app shows the type's offers as similar) and the daily cron fills it in.
//
// Access rules run inside e.next(), after this. JSVM handlers run isolated, so the helpers
// live in product_types.js and offer_matches.js.

onRecordCreateRequest((e) => {
  const types = require(`${__hooks}/product_types.js`)
  if (types.comparesOffers(e.app, e.record.getString("space"))) {
    e.record.set("product_type", types.resolveName(e.app, e.record.getString("name")))
    require(`${__hooks}/offer_matches.js`).matchItem(e.app, e.record, 5)
  }
  e.next()
}, "items")

onRecordUpdateRequest((e) => {
  const name = e.record.getString("name")
  if (name.trim().toLowerCase() !== e.record.original().getString("name").trim().toLowerCase()) {
    const types = require(`${__hooks}/product_types.js`)
    const compares = types.comparesOffers(e.app, e.record.getString("space"))
    e.record.set("product_type", compares ? types.resolveName(e.app, name) : "")
    e.record.set("offer_matches", null)
    if (compares) require(`${__hooks}/offer_matches.js`).matchItem(e.app, e.record, 5)
  }
  e.next()
}, "items")
