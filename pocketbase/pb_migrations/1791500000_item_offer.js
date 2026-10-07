/// <reference path="../pb_data/types.d.ts" />

// The flyer offer a member picked for a list item ("kyllingfilet" -> "Prior kyllingfilet 700 g").
// Not required and no cascade: when the offers sync deletes an expired offer, PocketBase clears
// the field on the items that pointed at it, and the item stays on the list.

migrate((app) => {
  const offers = app.findCollectionByNameOrId("offers")
  const items = app.findCollectionByNameOrId("items")
  items.fields.add(new RelationField({ name: "offer", collectionId: offers.id, maxSelect: 1 }))
  app.save(items)
}, (app) => {
  const items = app.findCollectionByNameOrId("items")
  items.fields.removeByName("offer")
  app.save(items)
})
