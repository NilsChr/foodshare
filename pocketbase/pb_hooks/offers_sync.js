/// <reference path="../pb_data/types.d.ts" />

// Weekly grocery offers (kundeaviser) from Tjek's read API, the backend behind
// mattilbud.no / eTilbudsavis. The API is unofficial and unauthenticated, so keep the
// footprint small: one sequential pass, about 45 requests for all chains.
//
// The API only returns offers that are valid right now and deletes old catalogs, so
// each sync replaces the `offers` collection with exactly what it fetched.
// Approach and quirks from https://github.com/donadelicc/kundeavis-mcp.
//
// Plain module (not *.pb.js): loaded with require() from offers_sync.pb.js.

const BASE = "https://squid-api.tjek.com/v2"
const LIMIT = 100 // the API rejects anything above 100
const USER_AGENT = "Foodshare/1.0 (family meal planner)"

// Norwegian food chains (Tjek dealer id -> name). Without a dealer filter the API returns
// mostly German catalogs.
const CHAINS = {
  "257bxm": "KIWI",
  "faa0Ym": "REMA 1000",
  "4333pm": "MENY",
  "80742m": "Extra",
  "c062vm": "SPAR",
  "de79dm": "Coop Mega",
  "f5d5lm": "Coop Prix",
  "5b11sm": "Bunnpris",
  "b3e8Fm": "Joker",
  "51dawm": "Obs",
  "2686gD": "Matkroken",
  "5861Qq": "Nærbutikken",
  "e857Mm": "Europris",
  "5vk-xt": "Gigaboks",
  "b18dq1": "Jacobs",
  "pR2h9x": "Holdbart",
}

function get(path, params) {
  const query = Object.keys(params).map((k) => k + "=" + encodeURIComponent(params[k])).join("&")
  const url = BASE + "/" + path + "?" + query
  for (let attempt = 0; ; attempt++) {
    const res = $http.send({
      url: url,
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": USER_AGENT },
      timeout: 30,
    })
    if (res.statusCode === 200) return res.json
    if ((res.statusCode === 429 || res.statusCode >= 500) && attempt < 3) {
      sleep(1000 * 2 ** attempt)
      continue
    }
    throw new Error("Tjek " + path + " -> HTTP " + res.statusCode)
  }
}

// Every item of a list endpoint, walking `offset` until a short page comes back.
function getAll(path, params) {
  const all = []
  for (let offset = 0; offset <= 5000; offset += LIMIT) {
    params.limit = LIMIT
    params.offset = offset
    const page = get(path, params)
    for (const item of page) all.push(item)
    if (page.length < LIMIT) break
  }
  return all
}

// "2026-10-04T22:00:00+0000" -> "2026-10-04T22:00:00.000Z"
function isoDate(s) {
  if (!s) return ""
  const d = new Date(String(s).replace(/([+-]\d\d)(\d\d)$/, "$1:$2"))
  return isNaN(d.getTime()) ? "" : d.toISOString()
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ")

// `chainIds` maps Tjek dealer id -> `chains` record id.
function fetchOffers(chainIds) {
  const catalogs = getAll("catalogs", { dealer_ids: Object.keys(CHAINS).join(",") })

  // Chains publish one identical catalog per region; keep the richest per (chain, label, period).
  const best = {}
  for (const c of catalogs) {
    if (!chainIds[c.dealer_id] || !(c.offer_count > 0)) continue
    const key = [c.dealer_id, c.label || "", c.run_from, c.run_till].join("|")
    const prev = best[key]
    if (!prev || c.offer_count > prev.offer_count || (c.offer_count === prev.offer_count && c.id < prev.id)) best[key] = c
  }
  // Richest first, so the duplicate kept below comes from the fullest catalog.
  const picked = Object.keys(best).map((k) => best[k]).sort((a, b) => b.offer_count - a.offer_count)

  // The same product recurs across a chain's concurrent catalogs; one row per
  // (chain, product, price, size, period).
  const offers = {}
  for (const cat of picked) {
    for (const o of getAll("offers", { catalog_id: cat.id })) {
      const dealer = o.dealer_id || cat.dealer_id
      const q = o.quantity || {}
      const p = o.pricing || {}
      const key = [
        dealer, norm(o.heading), p.price, (q.size || {}).from, (q.pieces || {}).from,
        (q.unit || {}).symbol, o.run_till,
      ].join("|")
      if (offers[key]) continue
      const pre = p.pre_price > p.price ? p.pre_price : null
      offers[key] = {
        key: $security.sha256(key).slice(0, 32),
        chain: chainIds[dealer] || chainIds[cat.dealer_id],
        heading: String(o.heading || "").trim().slice(0, 200),
        description: String(o.description || "").trim().slice(0, 1000),
        price: p.price || 0,
        pre_price: pre,
        discount_pct: pre ? Math.round(((pre - p.price) / pre) * 100) : null,
        size_from: (q.size || {}).from || null,
        size_to: (q.size || {}).to || null,
        unit: (q.unit || {}).symbol || "",
        pieces: (q.pieces || {}).from || null,
        image: (o.images || {}).view || (o.images || {}).thumb || "",
        run_from: isoDate(o.run_from || cat.run_from),
        run_till: isoDate(o.run_till || cat.run_till),
      }
    }
  }
  return Object.keys(offers).map((k) => offers[k])
}

// Creates or updates a `chains` record per chain, with Tjek's logo and brand color.
// Returns Tjek dealer id -> record id.
function syncChains(app) {
  const dealers = {}
  for (const d of getAll("dealers", { dealer_ids: Object.keys(CHAINS).join(",") })) dealers[d.id] = d

  const collection = app.findCollectionByNameOrId("chains")
  const existing = {}
  for (const r of app.findAllRecords("chains")) existing[r.getString("tjek_id")] = r

  const ids = {}
  for (const tjekId of Object.keys(CHAINS)) {
    const d = dealers[tjekId] || {}
    const record = existing[tjekId] || new Record(collection)
    record.load({
      tjek_id: tjekId,
      name: CHAINS[tjekId],
      // Keep the last known logo if the API leaves it out this time.
      logo: d.logo || record.getString("logo"),
      color: /^[0-9a-f]{6}$/i.test(d.color || "") ? d.color.toLowerCase() : record.getString("color"),
    })
    app.save(record)
    ids[tjekId] = record.id
  }
  return ids
}

// Replaces the offers collection with the current offers. Returns counts.
function syncOffers(app) {
  const fresh = fetchOffers(syncChains(app))
  // An empty answer means the API changed or blocked us; keep what we have.
  if (fresh.length === 0) throw new Error("Tjek returned no offers; keeping existing data")

  const result = { fetched: fresh.length, created: 0, updated: 0, deleted: 0 }
  app.runInTransaction((txApp) => {
    const collection = txApp.findCollectionByNameOrId("offers")
    const existing = {}
    for (const r of txApp.findAllRecords("offers")) existing[r.getString("key")] = r

    for (const data of fresh) {
      let record = existing[data.key]
      if (record) {
        delete existing[data.key]
        result.updated++
      } else {
        record = new Record(collection)
        result.created++
      }
      record.load(data)
      txApp.save(record)
    }
    for (const key of Object.keys(existing)) {
      txApp.delete(existing[key])
      result.deleted++
    }
  })
  return result
}

module.exports = { syncOffers }
