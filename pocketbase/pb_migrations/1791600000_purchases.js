/// <reference path="../pb_data/types.d.ts" />

// Picked flyer offers that were bought: one record per crossed-off item with a picked offer,
// written when the basket is cleared. A copy of the offer's heading and prices, since offers
// are deleted when they expire. Totals (such as money saved) are summed from these; records
// are not edited or deleted by members, so the history stays whole.

migrate((app) => {
  const MEMBER = "space.memberships_via_space.user ?= @request.auth.id"
  const spaces = app.findCollectionByNameOrId("spaces")
  const chains = app.findCollectionByNameOrId("chains")
  const users = app.findCollectionByNameOrId("users")
  const purchases = new Collection({
    type: "base",
    name: "purchases",
    fields: [
      { name: "space", type: "relation", collectionId: spaces.id, maxSelect: 1, required: true, cascadeDelete: true },
      // The list item's name and the offer's heading ("kyllingfilet", "KYLLINGFILET").
      { name: "name", type: "text", required: true, max: 120 },
      { name: "heading", type: "text", max: 200 },
      { name: "chain", type: "relation", collectionId: chains.id, maxSelect: 1 },
      { name: "price", type: "number", min: 0 },
      // 0 when the flyer gave no before-price.
      { name: "pre_price", type: "number", min: 0 },
      { name: "bought_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_purchases_space ON purchases (space)"],
    listRule: MEMBER,
    viewRule: MEMBER,
    createRule: `${MEMBER} && @request.body.bought_by = @request.auth.id`,
    updateRule: null,
    deleteRule: null,
  })
  app.save(purchases)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("purchases"))
})
