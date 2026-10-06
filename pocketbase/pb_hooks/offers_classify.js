/// <reference path="../pb_data/types.d.ts" />

// Sorts flyer offers into store sections with TypeSafe AI's Jev model (a classifier: it
// picks one of the given choices and returns probabilities, no free text). The flyer API
// has no categories, and keyword matching only covered about 45% of offers.
//
// One request per offer (~250 ms, ~600 input tokens). Offers keep their category across
// syncs, so after the first run only new offers are classified. Only public flyer text is
// sent. Without TYPESAFE_API_KEY this does nothing and offers stay uncategorized.
//
// Plain module (not *.pb.js): loaded with require() from offers_sync.pb.js.

const URL = "https://api.typesafe.ai/v1/systemone"

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

// Classifies offers without a category, until `seconds` have passed. Returns counts.
// Stops early on rate limits or outages; the next run continues where this one stopped.
function classifyOffers(app, seconds) {
  const key = $os.getenv("TYPESAFE_API_KEY")
  if (!key) return { skipped: "TYPESAFE_API_KEY is not set" }

  const deadline = Date.now() + seconds * 1000
  const result = { classified: 0, remaining: 0, stopped: "" }
  const todo = app.findRecordsByFilter("offers", "category = ''", "-discount_pct", 0, 0)
  for (const record of todo) {
    if (Date.now() > deadline) break
    const res = $http.send({
      url: URL,
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        state: (record.getString("heading") + "\n" + record.getString("description")).trim(),
        model: "jev-latest",
        questions: {
          category: {
            type: "choice",
            instructions: "Which section of a Norwegian grocery store is this flyer product in?",
            criteria: CRITERIA,
          },
        },
      }),
      timeout: 20,
    })
    if (res.statusCode !== 200) {
      // 401: bad key. 429/529: rate limited or overloaded. Either way, try again next run.
      result.stopped = "HTTP " + res.statusCode
      break
    }
    const choice = ((res.json.answers || {}).category || {}).choice
    if (!CRITERIA[choice]) {
      result.stopped = "unexpected answer: " + JSON.stringify(res.json).slice(0, 200)
      break
    }
    record.set("category", choice)
    app.save(record)
    result.classified++
  }
  result.remaining = todo.length - result.classified
  return result
}

module.exports = { classifyOffers }
