/// <reference path="../pb_data/types.d.ts" />

// Jev's labels for flyer offers, kept after the offers expire. Chains run the same products
// week after week, so an offer whose text was labelled before is not sent to Jev again
// (see pb_hooks/offers_classify.js), and the local classifier trains on every label ever
// bought (classifier/export.py). Server-only.

migrate((app) => {
  const labels = new Collection({
    type: "base",
    name: "offer_labels",
    fields: [
      // Hash of heading and description without amounts, prices or punctuation (labelKey in offers_classify.js).
      { name: "key", type: "text", required: true, max: 64 },
      { name: "heading", type: "text", max: 200 },
      { name: "description", type: "text", max: 1000 },
      { name: "category", type: "text", max: 40 },
      { name: "product_type", type: "text", max: 40 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_offer_labels_key ON offer_labels (key)"],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  app.save(labels)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("offer_labels"))
})
