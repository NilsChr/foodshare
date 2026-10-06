/// <reference path="../pb_data/types.d.ts" />

// Classifies flyer offers with TypeSafe AI's Jev model (a classifier: it picks one of the
// given choices and returns probabilities, no free text):
//   category      store section, for filtering offers (the flyer API has none)
//   product_type  e.g. "coffee", to match list items that share no words with the
//                 heading (see product_types.js)
//
// Two requests per offer (~500 ms): the category goes with the product group question,
// then the type within the group (classifyProduct in product_types.js).
// Offers keep their classification across syncs, so after the first run only new offers
// are sent. Only public flyer text is sent. Without TYPESAFE_API_KEY this does nothing.
//
// Plain module (not *.pb.js): loaded with require() from offers_sync.pb.js.

// Keys match the `offers.category` select values. The first ten are the app's default
// store sections, so the app can map them onto a group's own sections.
const CRITERIA = {
  vegetables: "Vegetables, potatoes, salad, herbs, mushrooms",
  fruit: "Fresh fruit and berries",
  bakery: "Bread, buns, rolls, cakes, tortillas, crispbread",
  meat_fish: "Fresh or chilled meat, chicken, sausages, cold cuts, fish, seafood",
  dairy_eggs: "Milk, cheese, butter, yogurt, cream, eggs",
  pantry: "Dry and canned goods: pasta, rice, flour, sauces, spices, coffee, tea, cereal, spreads",
  frozen: "Frozen food: pizza, ice cream, frozen vegetables, frozen fish",
  snacks: "Chocolate, candy, chips, crisps, nuts, biscuits, snack bars",
  drinks: "Soft drinks, juice, water, energy drinks, beer",
  household: "Cleaning, paper towels, toilet paper, toiletries, soap, personal care",
  other: "Not food or household: clothes, decorations, tools, toys, pet food, car care",
}

// Classifies offers missing a category or product type, then list items missing a product
// type, then checks which offers list items mean (offer_matches.js), until `seconds` have
// passed. Returns counts and the Jev input tokens used (the cost). Stops early on rate
// limits or outages; the next run continues where this one stopped.
function classifyOffers(app, seconds) {
  if (!$os.getenv("TYPESAFE_API_KEY")) return { skipped: "TYPESAFE_API_KEY is not set" }
  const types = require(`${__hooks}/product_types.js`)

  const deadline = Date.now() + seconds * 1000
  const result = { classified: 0, remaining: 0, items: 0, matched: 0, tokens: 0, stopped: "" }
  const usage = { tokens: 0 }
  const todo = app.findRecordsByFilter("offers", "category = '' || product_type = ''", "-discount_pct", 0, 0)
  const category = {
    type: "choice",
    instructions: "Which section of a Norwegian grocery store is this flyer product in?",
    criteria: CRITERIA,
  }
  for (const record of todo) {
    if (Date.now() > deadline) break
    let product
    try {
      product = types.classifyProduct((record.getString("heading") + "\n" + record.getString("description")).trim(), 20, { category: category })
    } catch (err) {
      result.stopped = String(err)
      break
    }
    usage.tokens += product.tokens
    const section = (product.answers.category || {}).choice
    if (!CRITERIA[section]) {
      result.stopped = "unexpected answer: " + JSON.stringify(product.answers).slice(0, 200)
      break
    }
    record.set("category", section)
    record.set("product_type", product.type)
    app.save(record)
    result.classified++
  }
  result.remaining = todo.length - result.classified

  if (!result.stopped) {
    result.items = types.backfillItems(app, deadline, usage)
    result.matched = require(`${__hooks}/offer_matches.js`).backfillMatches(app, deadline, usage)
  }
  result.tokens = usage.tokens
  return result
}

module.exports = { classifyOffers }
