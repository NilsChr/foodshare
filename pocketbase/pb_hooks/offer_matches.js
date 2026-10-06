/// <reference path="../pb_data/types.d.ts" />

// Which offers of an item's product type it really means. The type alone is too coarse:
// "parmesan" is `cheese_yellow` like "SYNNØVE GULOST", but no shopper wanting parmesan
// takes gulost. Jev rates each such offer against the item name as one of
//   same       what the shopper means ("gulost" ~ "NORVEGIA VELLAGRET")
//   related    same kind of product, but not what they asked for ("norvegia" ~ "SYNNØVE GULOST")
//   unrelated  a misclassified offer ("pølser" ~ "Wienerbakst")
// The contrast with "related" matters: asked yes/no, Jev accepted anything similar.
// The offer's product type goes in the question so Jev can read flyer shorthand
// ("ALI FILTERMALT" is coffee).
//
// The probability of `same` is cached per normalized name and offer (`offer_matches`), so each
// pair is asked once for all users; items store the offers at or above MIN_P
// (`items.offer_matches`) for the app. One request per item name and up to BATCH offers,
// ~0.5 s. Offers sharing words with the name are matched in the app and need no check.
// Measure prompt changes with pocketbase/test-offer-matches.mjs.
//
// Plain module (not *.pb.js): loaded with require().

const MIN_P = 0.6
const BATCH = 30

// The question about one offer for the list item `name`. Shared with the test script.
function matchQuestion(name, heading, description, typeName) {
  const detail = String(description || "").split("\n")[0].slice(0, 80)
  return {
    type: "choice",
    instructions: `Flyer product: "${heading}" — ${detail} (product type: ${typeName || "unknown"}). How does it relate to the list item "${name}"?`,
    criteria: {
      same: `It is "${name}": a shopper who wrote "${name}" would happily buy it`,
      related: `Similar or same category, but a shopper who wrote "${name}" wanted something else (another variety, type or product)`,
      unrelated: `Not "${name}" at all`,
    },
  }
}

// The confirmed offer ids for an item, or null when not checked yet.
function confirmedOffers(item) {
  const raw = item.getString("offer_matches")
  return raw && raw !== "null" ? JSON.parse(raw) : null
}

// Sets `offer_matches` on an item (not saved): the offers of its type in its group's stores
// that Jev confirms. Returns false when Jev could not be asked; the item is then left as is
// and the daily cron tries again. Adds the Jev input tokens used to `usage.tokens` when given.
function matchItem(app, item, timeout, usage) {
  const types = require(`${__hooks}/product_types.js`)
  const type = item.getString("product_type")
  if (!type || type === "none") {
    item.set("offer_matches", type ? [] : null)
    return true
  }
  const name = types.normalize(item.getString("name"))
  let chains = []
  try {
    chains = app.findRecordById("spaces", item.getString("space")).getStringSlice("chains")
  } catch (_) {
    // Space gone; nothing to match.
  }
  const offers = app.findRecordsByFilter("offers", "product_type = {:type}", "", 0, 0, { type: type })
    .filter((o) => chains.indexOf(o.getString("chain")) >= 0)

  const p = {}
  for (const m of app.findRecordsByFilter("offer_matches", "name = {:name}", "", 0, 0, { name: name })) {
    p[m.getString("offer")] = m.getFloat("p")
  }
  const todo = offers.filter((o) => !(o.id in p))
  const typeDef = types.types().find((t) => t.key === type)
  for (let start = 0; start < todo.length; start += BATCH) {
    const batch = todo.slice(start, start + BATCH)
    const questions = {}
    batch.forEach((o, i) => {
      questions["o" + i] = matchQuestion(name, o.getString("heading"), o.getString("description"), typeDef && typeDef.name)
    })
    let answers
    try {
      const res = types.askJev(`Norwegian shopping list item: "${name}"`, questions, timeout)
      answers = res.answers
      if (usage) usage.tokens += res.tokens
    } catch (err) {
      app.logger().warn("offer match check failed", "name", name, "error", String(err))
      return false
    }
    const collection = app.findCollectionByNameOrId("offer_matches")
    batch.forEach((o, i) => {
      const answer = answers["o" + i]
      if (!answer || !answer.probabilities) return
      p[o.id] = answer.probabilities.same || 0
      try {
        const record = new Record(collection)
        record.load({ name: name, offer: o.id, p: p[o.id] })
        app.save(record)
      } catch (_) {
        // Someone cached the same pair meanwhile.
      }
    })
  }
  item.set("offer_matches", offers.filter((o) => p[o.id] >= MIN_P).map((o) => o.id))
  return true
}

// Brings `offer_matches` up to date on open items in groups with stores: after new offers,
// a type change, or a failed check. Only pairs not in the cache cost a Jev request.
// Returns how many items changed.
function backfillMatches(app, deadline, usage) {
  let done = 0
  const todo = app.findRecordsByFilter("items", "product_type != '' && checked = false && space.chains:length > 0", "-created", 500, 0)
  for (const item of todo) {
    if (Date.now() > deadline) break
    const before = JSON.stringify(confirmedOffers(item))
    if (!matchItem(app, item, 20, usage)) break
    if (JSON.stringify(confirmedOffers(item)) === before) continue
    app.save(item)
    done++
  }
  return done
}

module.exports = { MIN_P, matchQuestion, matchItem, backfillMatches }
