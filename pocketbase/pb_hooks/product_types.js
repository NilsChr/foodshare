/// <reference path="../pb_data/types.d.ts" />

// Product types ("coffee", "milk", "sausage") link shopping list items to flyer offers
// that share no words: "kaffe" on the list and "ALI FILTERMALT/KOKMALT" in a flyer are both
// `coffee`. The types and their flyer words come from product_types.json.
//
// Offers get their type in offers_classify.js. List items get theirs here, by name:
// shared cache (`product_names`), then the type list's names and aliases, then Jev.
// Every name is resolved once for all users.
//
// Jev picks the type in two steps, group then type within the group (TypeSafe's
// hierarchical classification). One question over all 137 types cost ~5000 input tokens
// per offer, nearly all of it the type list; the two steps cost about a quarter of that.
// Groups are by kind of product, not store section: frozen blueberries are `fruit`.
//
// Plain module (not *.pb.js): loaded with require().

const JEV_URL = "https://api.typesafe.ai/v1/systemone"
// Below this probability an answer counts as "none" (no type) rather than a guess.
// Not Jev's `confidence`, which measures how concentrated the distribution is.
const MIN_P = 0.5
// Above this probability for the likeliest group, only its types are asked about.
const SURE_GROUP = 0.8

// Keys match `group` in product_types.json.
const GROUPS = {
  meat: "Meat and poultry: chicken, pork, beef, lamb, sausages, bacon, ham, cold cuts, liver pâté (Gilde, Prior, Nortura)",
  fish: "Fish and seafood: salmon, cod, shrimp, scampi, mackerel, tuna, fish cakes, caviar (Lerøy, Mills kaviar)",
  dairy_eggs: "Milk, cheese, butter, yogurt, cream, sour cream, eggs (Tine, Synnøve, Q-meieriene, Norvegia, Jarlsberg)",
  vegetables: "Fresh vegetables, potatoes, salad, herbs, mushrooms",
  fruit: "Fresh or frozen fruit and berries (not juice or fruit-flavoured drinks)",
  bakery: "Bread, buns, cakes, tortillas, crispbread, pizza bases, lefse (Bakers, Mesterbakeren, Wasa)",
  pantry: "Dry and canned goods: pasta, rice, flour, sauces, spices, oil, coffee, tea, jam, ketchup (Toro, Idun, Evergood)",
  meals: "Ready meals: frozen pizza, fries, soups, pancakes, pies, prepared dishes (Grandiosa, Fjordland)",
  drinks: "Soft drinks, juice, cordial, water, energy drinks, iced tea, alcohol-free beer (Coca-Cola, Solo, Cevita, Burn)",
  snacks: "Chips, chocolate, candy, biscuits, nuts, ice cream (Maarud, Kims, Freia, Nidar, Diplom-Is)",
  household: "Cleaning, paper, toiletries, diapers, sunscreen, pharmacy products (Lambi, Libresse, Zalo)",
  other: "Not food or household: flowers, charcoal, clothes, toys, tools",
}

let cachedTypes = null
function types() {
  if (!cachedTypes) cachedTypes = JSON.parse(toString($os.readFile(`${__hooks}/product_types.json`))).types
  return cachedTypes
}

const INSTRUCTIONS = "a Norwegian flyer heading or shopping list item"

function groupQuestion() {
  return { type: "choice", instructions: `Which kind of grocery product is this (${INSTRUCTIONS})?`, criteria: GROUPS }
}

// The types of the given groups, each with its flyer words, which Jev needs to read
// shorthand like "filtermalt" (without them that came back as alcohol-free beer).
function productQuestion(groups) {
  const criteria = {}
  for (const t of types()) {
    if (groups.indexOf(t.group) >= 0) criteria[t.key] = t.name + ": " + t.aliases.slice(0, 6).join(", ")
  }
  criteria.none = "None of these"
  return { type: "choice", instructions: `Which grocery product type is this (${INSTRUCTIONS})?`, criteria: criteria }
}

// Sends one text and its questions to Jev. Returns the answers and the input tokens used
// (the cost), or throws with the HTTP status (401 bad key, 429 rate limited, 529 overloaded).
function askJev(text, questions, timeout) {
  const key = $os.getenv("TYPESAFE_API_KEY")
  if (!key) throw new Error("TYPESAFE_API_KEY is not set")
  const res = $http.send({
    url: JEV_URL,
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({ state: text, model: "jev-latest", questions: questions }),
    timeout: timeout,
  })
  if (res.statusCode !== 200) throw new Error("Jev HTTP " + res.statusCode)
  return { answers: res.json.answers || {}, tokens: (res.json.usage || {}).input_tokens || 0 }
}

// A choice answer's pick, or "none" when its probability is below MIN_P.
function productAnswer(answer) {
  const p = answer && answer.choice && answer.probabilities ? answer.probabilities[answer.choice] || 0 : 0
  return p >= MIN_P ? answer.choice : "none"
}

// The groups to pick the type from: the likeliest, plus the runner-up when Jev is unsure
// (brand names like "Basilicata pastasaus" can split between groups).
function likelyGroups(answer) {
  const p = (answer && answer.probabilities) || {}
  const ranked = Object.keys(GROUPS).sort((a, b) => (p[b] || 0) - (p[a] || 0))
  return (p[ranked[0]] || 0) >= SURE_GROUP ? ranked.slice(0, 1) : ranked.slice(0, 2)
}

// Product type for a text in two requests: group (plus `extra` questions on the same text,
// such as the offer's store section), then type within the group. Returns the type, the
// answers to the first request and the input tokens used. Throws like askJev.
function classifyProduct(text, timeout, extra) {
  const first = askJev(text, Object.assign({ group: groupQuestion() }, extra || {}), timeout)
  const second = askJev(text, { product: productQuestion(likelyGroups(first.answers.group)) }, timeout)
  return { type: productAnswer(second.answers.product), answers: first.answers, tokens: first.tokens + second.tokens }
}

// Same words as the app's tokens() (web/src/lib/match.ts): no amounts, units, punctuation or
// filler, so "Kaffe!", "kaffe 500 g" and "2 pk kaffe" share one cache entry.
const STOPWORDS = [
  "a", "an", "and", "of", "the", "fresh", "chopped", "diced", "sliced", "large", "small", "medium", "to", "taste",
  "og", "med", "frisk", "friske", "hakket", "stor", "store", "liten", "små", "pk", "pakke", "pakker", "boks",
  "g", "kg", "mg", "ml", "cl", "dl", "l", "ts", "ss", "tsp", "tbsp", "cup", "cups", "oz", "lb", "lbs", "stk", "pcs", "x",
]
const normalize = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    // Latin letters incl. æøå; PocketBase's JS engine has no \p{L}.
    .replace(/[^a-z\u00c0-\u024f\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && STOPWORDS.indexOf(w) < 0)
    .join(" ")

// Type key for a list item name, "none" when there is none, or "" when it could not be
// decided now (no API key, Jev unavailable); the daily offers_sync cron retries those.
// Adds the Jev input tokens used to `usage.tokens` when given.
function resolveName(app, name, usage) {
  const norm = normalize(name)
  if (!norm) return "none"

  try {
    return app.findFirstRecordByData("product_names", "name", norm).getString("product_type")
  } catch (_) {
    // Not cached yet.
  }

  let type = ""
  for (const t of types()) {
    if (normalize(t.name) === norm || t.aliases.some((a) => normalize(a) === norm)) {
      type = t.key
      break
    }
  }
  if (!type) {
    try {
      // Short timeout: the item is being saved while this runs.
      const result = classifyProduct(norm, 3)
      type = result.type
      if (usage) usage.tokens += result.tokens
    } catch (err) {
      app.logger().warn("product type lookup failed", "name", norm, "error", String(err))
      return ""
    }
  }

  try {
    const record = new Record(app.findCollectionByNameOrId("product_names"))
    record.load({ name: norm, product_type: type })
    app.save(record)
  } catch (_) {
    // Someone cached the same name meanwhile; the answer is the same.
  }
  return type
}

// Whether a group has chosen stores; types are only worth resolving then. A missing space
// is false, so the request's own validation answers.
function comparesOffers(app, spaceId) {
  try {
    return app.findRecordById("spaces", spaceId).getStringSlice("chains").length > 0
  } catch (_) {
    return false
  }
}

// Fills in types for list items that have none yet, in groups that compare offers
// (others have nothing to match). Returns how many were set.
function backfillItems(app, deadline, usage) {
  let done = 0
  const todo = app.findRecordsByFilter("items", "product_type = '' && checked = false && space.chains:length > 0", "-created", 200, 0)
  for (const item of todo) {
    if (Date.now() > deadline) break
    const type = resolveName(app, item.getString("name"), usage)
    if (!type) break
    item.set("product_type", type)
    app.save(item)
    done++
  }
  return done
}

module.exports = { types, normalize, askJev, groupQuestion, likelyGroups, productQuestion, productAnswer, classifyProduct, resolveName, comparesOffers, backfillItems }
