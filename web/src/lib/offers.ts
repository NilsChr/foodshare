import { useEffect, useState } from 'react'
import { locale, t } from './i18n'
import { col, pb, type Chain, type Offer } from './pb'

const OFFER_FIELDS = 'id,chain,heading,description,price,pre_price,discount_pct,size_from,size_to,unit,pieces,image,run_till,category,product_type'

/**
 * Every chain, plus this week's offers from the chosen ones. Offers are replaced nightly
 * on the server, so they are loaded once per chain selection instead of kept live.
 */
export function useOffers(chainIds: string[]) {
  const [chains, setChains] = useState<Chain[]>([])
  const [offers, setOffers] = useState<Offer[]>([])

  useEffect(() => {
    col.chains().getFullList({ sort: 'name' }).then(setChains).catch(() => setChains([]))
  }, [])

  const key = [...chainIds].sort().join(',')
  useEffect(() => {
    if (!key) return
    let alive = true
    const chainFilter = key.split(',').map((id) => pb.filter('chain = {:id}', { id })).join(' || ')
    col.offers()
      .getFullList({ filter: `run_from <= @now && run_till >= @now && (${chainFilter})`, fields: OFFER_FIELDS, batch: 1000 })
      .then((r) => alive && setOffers(r))
      .catch(() => alive && setOffers([]))
    return () => {
      alive = false
    }
  }, [key])

  // No stores chosen: nothing to show, whatever an earlier selection loaded.
  return { chains, offers: key ? offers : [] }
}

/** "29,90 kr"; `whole` rounds to "45 kr" for estimates. */
export const formatPrice = (n: number, whole = false) =>
  n.toLocaleString(locale, { style: 'currency', currency: 'NOK', ...(whole && { minimumFractionDigits: 0, maximumFractionDigits: 0 }) })

/** What the offer (or a bought one) saves against the flyer's before-price; 0 when the flyer gives none. */
export const saving = (o: Pick<Offer, 'price' | 'pre_price'>) => (o.pre_price > o.price ? o.pre_price - o.price : 0)

// Flyer units to the base unit prices are compared in, and the factor to get there.
const BASE_UNIT: Record<string, [unit: 'kg' | 'l' | 'pcs', factor: number]> = {
  g: ['kg', 0.001], kg: ['kg', 1], ml: ['l', 0.001], cl: ['l', 0.01], dl: ['l', 0.1], l: ['l', 1], pcs: ['pcs', 1],
}
export const UNIT_ORDER = ['kg', 'l', 'pcs'] as const

/**
 * Price per kg, litre or piece. A size range ("525–600 g") gives a range; `from` is the
 * cheapest end. Null when the flyer gives no usable size.
 */
export function unitPrice(o: Offer) {
  const base = BASE_UNIT[o.unit]
  if (!base || !(o.size_from > 0) || !(o.price > 0)) return null
  const [unit, factor] = base
  const pieces = o.pieces > 0 ? o.pieces : 1
  // Some flyers fill size_to with junk smaller than size_from; treat as a single size.
  const largest = o.size_to > o.size_from ? o.size_to : o.size_from
  const from = o.price / (largest * factor * pieces)
  const to = o.price / (o.size_from * factor * pieces)
  return { unit, from, range: to - from >= 0.01 }
}

/** The flyer's size: "700 g", "525–600 g", "4 × 125 g", "6 stk". Empty when it gives none. */
export function offerSize(o: Offer) {
  if (!(o.size_from > 0) || !o.unit) return ''
  const n = (x: number) => x.toLocaleString(locale)
  const size = `${n(o.size_from)}${o.size_to > o.size_from ? `–${n(o.size_to)}` : ''} ${t(o.unit)}`
  return o.pieces > 1 && o.unit !== 'pcs' ? `${o.pieces} × ${size}` : size
}

// List amount units ("750g", "1,5 l", "4 stk") to the same base units. A bare number or
// "pk" says nothing about weight, so it is not compared.
const AMOUNT_UNIT: Record<string, [unit: 'kg' | 'l' | 'pcs', factor: number]> = {
  ...BASE_UNIT, gr: ['kg', 0.001], gram: ['kg', 0.001], liter: ['l', 1], stk: ['pcs', 1],
}

/**
 * When a picked offer holds clearly less than the amount on the list (750 g wanted, 200 g pack):
 * the amount wanted and how many packs cover it. Null when it is enough or they can't be compared.
 */
export function shortfall(quantity: string, o: Offer) {
  const m = quantity.trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zæøå]+)$/i)
  const want = m && AMOUNT_UNIT[m[2].toLowerCase()]
  const base = BASE_UNIT[o.unit]
  if (!want || !base || want[0] !== base[0] || !(o.size_from > 0)) return null
  const needed = parseFloat(m[1].replace(',', '.')) * want[1]
  // A size range counts at its largest; packs within 10% of the amount are close enough.
  const pack = Math.max(o.size_from, o.size_to) * base[1] * (o.pieces > 0 ? o.pieces : 1)
  if (pack >= needed * 0.9) return null
  return { wanted: quantity.trim(), packs: Math.ceil(needed / pack) }
}

/** By price per kg/l/piece (cheapest first, or dearest with `desc`), grouped by unit; offers without a size last. */
export function byUnitPrice(offers: Offer[], desc = false) {
  const dir = desc ? -1 : 1
  const rank = (o: Offer) => {
    const u = unitPrice(o)
    return u ? [UNIT_ORDER.indexOf(u.unit), u.from] : [UNIT_ORDER.length, 0]
  }
  return offers.map((o) => [o, rank(o)] as const).sort(([, a], [, b]) => a[0] - b[0] || dir * (a[1] - b[1])).map(([o]) => o)
}
