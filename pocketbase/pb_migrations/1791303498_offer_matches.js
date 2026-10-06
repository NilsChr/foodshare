/// <reference path="../pb_data/types.d.ts" />

// Jev's check of whether a flyer offer is what a list item name means ("gulost" ~ "NORVEGIA",
// not "parmesan" ~ "SYNNØVE GULOST"). See pb_hooks/offer_matches.js.
//   offer_matches        server-only cache: normalized name + offer -> probability `p`
//   items.offer_matches  the item's confirmed offer ids, for the app; null = not checked yet

migrate((app) => {
  const offers = app.findCollectionByNameOrId("offers")
  const cache = new Collection({
    type: "base",
    name: "offer_matches",
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "offer", type: "relation", collectionId: offers.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "p", type: "number", min: 0, max: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_offer_matches_name_offer ON offer_matches (name, offer)"],
  })
  app.save(cache)

  const items = app.findCollectionByNameOrId("items")
  items.fields.add(new JSONField({ name: "offer_matches", maxSize: 20000 }))
  app.save(items)
}, (app) => {
  // Only derived data: safe to drop.
  app.delete(app.findCollectionByNameOrId("offer_matches"))
  const items = app.findCollectionByNameOrId("items")
  items.fields.removeByName("offer_matches")
  app.save(items)
})
