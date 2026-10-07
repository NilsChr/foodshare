/// <reference path="../pb_data/types.d.ts" />

// What a recipe cost at a store, entered by hand: one record per shop, with the price of
// each ingredient line (`lines`: [{ name, price }]) and their sum (`total`). Records are
// not edited; a wrong entry is deleted and entered again.

migrate((app) => {
  const MEMBER = "space.memberships_via_space.user ?= @request.auth.id"
  const spaces = app.findCollectionByNameOrId("spaces")
  const recipes = app.findCollectionByNameOrId("recipes")
  const chains = app.findCollectionByNameOrId("chains")
  const users = app.findCollectionByNameOrId("users")
  const prices = new Collection({
    type: "base",
    name: "recipe_prices",
    fields: [
      { name: "space", type: "relation", collectionId: spaces.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "recipe", type: "relation", collectionId: recipes.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "chain", type: "relation", collectionId: chains.id, maxSelect: 1, required: true },
      { name: "lines", type: "json", maxSize: 20000 },
      { name: "total", type: "number", min: 0 },
      { name: "created_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_recipe_prices_recipe ON recipe_prices (recipe)"],
    listRule: MEMBER,
    viewRule: MEMBER,
    // The recipe must be in the same space.
    createRule: `${MEMBER} && recipe.space = space`,
    updateRule: null,
    deleteRule: MEMBER,
  })
  app.save(prices)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("recipe_prices"))
})
