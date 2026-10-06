/// <reference path="../pb_data/types.d.ts" />

// Product types ("coffee", "milk", "sausage") link shopping list items to flyer offers
// that share no words: "kaffe" on the list and "ALI FILTERMALT/KOKMALT" in a flyer are both
// `coffee`. The types and their flyer words come from product_types.json.
//
// Offers get their type in offers_classify.js. List items get theirs here, by name:
// shared cache (`product_names`), then the type list's names and aliases, then Jev.
// Every name is resolved once for all users.
//
// Plain module (not *.pb.js): loaded with require().

const JEV_URL = "https://api.typesafe.ai/v1/systemone"
// Below this confidence an answer counts as "none" (no type) rather than a guess.
const MIN_CONFIDENCE = 0.5

let cachedTypes = null
function types() {
  if (!cachedTypes) cachedTypes = JSON.parse(toString($os.readFile(`${__hooks}/product_types.json`))).types
  return cachedTypes
}

// The choice question for Jev: each type with its flyer words, which it needs to read
// shorthand like "filtermalt" (without them that came back as alcohol-free beer).
function productQuestion() {
  const criteria = {}
  for (const t of types()) criteria[t.key] = t.name + ": " + t.aliases.slice(0, 6).join(", ")
  criteria.none = "None of these, or not a grocery product"
  return {
    type: "choice",
    instructions: "Which grocery product type is this (a Norwegian flyer heading or shopping list item)?",
    criteria: criteria,
  }
}

// Sends one text and its questions to Jev. Returns the answers, or throws with the HTTP
// status (401 bad key, 429 rate limited, 529 overloaded).
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
  return res.json.answers || {}
}

// A product answer as a type key, or "none" when unsure.
function productAnswer(answer) {
  return answer && answer.choice && answer.confidence >= MIN_CONFIDENCE ? answer.choice : "none"
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
function resolveName(app, name) {
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
      type = productAnswer(askJev(norm, { product: productQuestion() }, 3).product)
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
function backfillItems(app, deadline) {
  let done = 0
  const todo = app.findRecordsByFilter("items", "product_type = '' && checked = false && space.chains:length > 0", "-created", 200, 0)
  for (const item of todo) {
    if (Date.now() > deadline) break
    const type = resolveName(app, item.getString("name"))
    if (!type) break
    item.set("product_type", type)
    app.save(item)
    done++
  }
  return done
}

module.exports = { types, normalize, askJev, productQuestion, productAnswer, resolveName, comparesOffers, backfillItems }
