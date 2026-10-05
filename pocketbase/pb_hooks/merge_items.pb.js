/// <reference path="../pb_data/types.d.ts" />

// Shopping list items are unique per name. Adding "Milk 2 l" while "Milk 1 l" is on the list
// (not crossed off) updates that item to "Milk 3 l" and returns it instead of creating a duplicate.
// The lookup and the write run in one transaction, so two people adding the same thing at the
// same moment still end up with one item.
//
// Note: JSVM handlers run isolated, so helpers live inside the handler.

onRecordCreateRequest((e) => {
  const MAX_QUANTITY = 40 // items.quantity max length
  // Units that can be converted into each other, as multiples of the smallest one.
  const UNITS = {
    g: ["mass", 1], gr: ["mass", 1], gram: ["mass", 1], kg: ["mass", 1000],
    ml: ["volume", 1], cl: ["volume", 10], dl: ["volume", 100], l: ["volume", 1000], liter: ["volume", 1000], litre: ["volume", 1000],
  }

  function key(name) {
    return String(name || "").trim().toLowerCase().replace(/\s+/g, " ")
  }

  // "1,5 l" -> { n: 1.5, unit: "l", comma: true }; "1/2 ts" -> { n: 0.5, unit: "ts" }. Null if it doesn't start with a number.
  function parse(quantity) {
    const m = quantity.match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?\s*(.*)$/)
    if (!m) return null
    let n = parseFloat(m[1].replace(",", "."))
    if (m[2]) n /= Number(m[2])
    return { n: n, unit: m[3].trim(), comma: m[1].indexOf(",") >= 0 }
  }

  function format(n, comma) {
    const s = String(Math.round(n * 100) / 100)
    return comma ? s.replace(".", ",") : s
  }

  // "1 l" + "2 l" -> "3 l", "1 l" + "500 ml" -> "1,5 l"; anything else is joined: "1 pk + 2 boks".
  function addQuantities(a, b) {
    a = a.trim()
    b = b.trim()
    if (!a) return b
    if (!b) return a
    const pa = parse(a)
    const pb = parse(b)
    if (pa && pb) {
      const comma = pa.comma || pb.comma
      if (pa.unit.toLowerCase() === pb.unit.toLowerCase()) {
        return format(pa.n + pb.n, comma) + (pa.unit ? " " + pa.unit : "")
      }
      const ua = UNITS[pa.unit.toLowerCase()]
      const ub = UNITS[pb.unit.toLowerCase()]
      if (ua && ub && ua[0] === ub[0]) {
        const big = ua[1] >= ub[1] ? [pa.unit, ua[1]] : [pb.unit, ub[1]]
        return format((pa.n * ua[1] + pb.n * ub[1]) / big[1], comma) + " " + big[0]
      }
    }
    return a + " + " + b
  }

  const name = key(e.record.get("name"))
  const space = e.record.get("space")
  let merged = null

  e.app.runInTransaction((txApp) => {
    const open = txApp.findRecordsByFilter("items", "space = {:space} && checked = false", "created", 0, 0, { space: space })
    const existing = open.find((r) => key(r.get("name")) === name)
    if (existing) {
      const quantity = addQuantities(existing.getString("quantity"), e.record.getString("quantity"))
      if (quantity.length <= MAX_QUANTITY) {
        existing.set("quantity", quantity)
        txApp.save(existing)
        merged = existing
        return
      }
    }
    // No match (or the combined amount is too long): create as usual, inside this transaction.
    e.app = txApp
    e.next()
  })

  if (merged) return e.json(200, merged)
}, "items")
