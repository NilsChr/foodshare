/// <reference path="../pb_data/types.d.ts" />

// Classifies flyer offers with TypeSafe AI's Jev model (a classifier: it picks one of the
// given choices and returns probabilities, no free text):
//   category      store section, for filtering offers (the flyer API has none)
//   product_type  e.g. "coffee", to match list items that share no words with the
//                 heading (see product_types.js)
//
// Two requests per offer (~500 ms): the category goes with the product group question,
// then the type within the group (classifyProduct in product_types.js).
// Offers keep their classification across syncs, and every answer is also kept in
// `offer_labels` after the offer expires, so an offer whose text Jev labelled in an earlier
// week is not sent again. Only public flyer text is sent. Without TYPESAFE_API_KEY this does nothing.
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

// Key of an offer's text in `offer_labels`: heading and description without amounts, prices
// or punctuation, so next week's "Polarkaviar 180g ... Førpris 44,90" finds this week's label.
function labelKey(record) {
  const { normalize } = require(`${__hooks}/product_types.js`)
  return $security.sha256(normalize(record.getString("heading")) + "\n" + normalize(record.getString("description")))
}

// The label Jev gave this text before, or null.
function storedLabel(app, key) {
  try {
    return app.findFirstRecordByData("offer_labels", "key", key)
  } catch (_) {
    return null
  }
}

function saveLabel(app, key, record) {
  try {
    const label = new Record(app.findCollectionByNameOrId("offer_labels"))
    label.load({
      key: key,
      heading: record.getString("heading"),
      description: record.getString("description"),
      category: record.getString("category"),
      product_type: record.getString("product_type"),
    })
    app.save(label)
  } catch (_) {
    // Saved meanwhile by another run; the answer is the same.
  }
}

// Classifies offers missing a category or product type, then list items missing a product
// type, then checks which offers list items mean (offer_matches.js), until `seconds` have
// passed. Returns counts and the Jev input tokens used (the cost). Stops early on rate
// limits or outages; the next run continues where this one stopped.
function classifyOffers(app, seconds) {
  const types = require(`${__hooks}/product_types.js`)
  if (types.classifier(app) === "local") return classifyOffersLocal(app, seconds)
  if (!$os.getenv("TYPESAFE_API_KEY")) return { skipped: "TYPESAFE_API_KEY is not set" }

  const deadline = Date.now() + seconds * 1000
  const result = { classified: 0, reused: 0, remaining: 0, items: 0, matched: 0, tokens: 0, stopped: "" }
  const usage = { tokens: 0 }
  const todo = app.findRecordsByFilter("offers", "category = '' || product_type = ''", "-discount_pct", 0, 0)
  const category = {
    type: "choice",
    instructions: "Which section of a Norwegian grocery store is this flyer product in?",
    criteria: CRITERIA,
  }
  for (const record of todo) {
    if (Date.now() > deadline) break
    const key = labelKey(record)
    const known = storedLabel(app, key)
    if (known) {
      record.set("category", known.getString("category"))
      record.set("product_type", known.getString("product_type"))
      app.save(record)
      result.classified++
      result.reused++
      continue
    }
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
    saveLabel(app, key, record)
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

// The same with the local classifier (product_types.js). It labels all offers, not only
// new ones: ~1200 take well under a second. Offers whose text Jev labelled before
// (`offer_labels`) keep Jev's label; the model only guesses the rest. No offer matches: the local classifier has no model for them, so
// items keep what they have (unchecked items show their type's offers as similar).
function classifyOffersLocal(app, seconds) {
  const types = require(`${__hooks}/product_types.js`)
  const deadline = Date.now() + seconds * 1000
  const result = { classified: 0, reused: 0, remaining: 0, items: 0, matched: 0, tokens: 0, stopped: "" }
  const offers = app.findRecordsByFilter("offers", "", "-discount_pct", 0, 0)
  const BATCH = 500
  for (let start = 0; start < offers.length; start += BATCH) {
    const batch = offers.slice(start, start + BATCH)
    let labels
    try {
      labels = types.classifyLocal(batch.map((o) => ({ heading: o.getString("heading"), description: o.getString("description") })), 30)
    } catch (err) {
      result.stopped = String(err)
      break
    }
    batch.forEach((record, i) => {
      const known = storedLabel(app, labelKey(record))
      if (known) {
        record.set("category", known.getString("category"))
        record.set("product_type", known.getString("product_type"))
        app.save(record)
        result.classified++
        result.reused++
        return
      }
      if (CRITERIA[labels[i].category.choice]) record.set("category", labels[i].category.choice)
      record.set("product_type", types.localType(labels[i]))
      app.save(record)
      result.classified++
    })
  }
  result.remaining = offers.length - result.classified
  if (!result.stopped) result.items = types.backfillItems(app, deadline)
  return result
}

module.exports = { classifyOffers }
