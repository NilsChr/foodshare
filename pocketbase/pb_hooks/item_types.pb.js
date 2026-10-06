/// <reference path="../pb_data/types.d.ts" />

// Sets `items.product_type` when an item is added or renamed, so the app can show offers
// that share no words with the name ("kaffe" -> coffee -> "ALI FILTERMALT"). Only in groups
// that compare offers. Most names resolve from the cache or the type list instantly; a new
// name costs one Jev request (~300 ms). If that fails the item is saved without a type and
// the offers_classify cron fills it in later. See product_types.js.
//
// Access rules run inside e.next(), after this. JSVM handlers run isolated, so the helpers
// live in product_types.js.

onRecordCreateRequest((e) => {
  const types = require(`${__hooks}/product_types.js`)
  if (types.comparesOffers(e.app, e.record.getString("space"))) {
    e.record.set("product_type", types.resolveName(e.app, e.record.getString("name")))
  }
  e.next()
}, "items")

onRecordUpdateRequest((e) => {
  const name = e.record.getString("name")
  if (name.trim().toLowerCase() !== e.record.original().getString("name").trim().toLowerCase()) {
    const types = require(`${__hooks}/product_types.js`)
    e.record.set("product_type", types.comparesOffers(e.app, e.record.getString("space")) ? types.resolveName(e.app, name) : "")
  }
  e.next()
}, "items")
