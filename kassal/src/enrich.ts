// Splits the listed products' titles into fields: "Inspira Melkesjoko 0,9l Hennig-Olsen"
// -> name "Inspira Melkesjoko", brand "Hennig-Olsen", size 900 ml; EAN and Kassalapp id from
// the href. Reads every data/<id>_<name>_products.json, writes data/enriched.json.
//   bun run enrich
// Brands are learned from the data: the words after the last quantity ("... 0,9l Hennig-Olsen")
// count as a brand when at least MIN_BRAND titles end that way. Known brands are then looked
// for in the same place (or at the end, in titles without a quantity), else at the title's
// start ("Tine YT Restitusjonsdrikk 330ml").
import { readdir } from 'node:fs/promises'
import type { ListedProduct } from './products.ts'

export interface Size {
  amount: number
  unit: 'g' | 'ml'
}

export interface EnrichedProduct extends ListedProduct {
  kassalId: number
  /** GTIN from the end of the href (check digit verified); null when there is none. */
  ean: string | null
  categoryId: number
  category: string
  /** Title without chain, brand and quantities. */
  name: string
  brand: string | null
  /** Store group of a private label ("First Price" -> NorgesGruppen); null for other brands. */
  chain: string | null
  /** As written: per unit in "6x25g" (count 6), else usually the whole package. */
  size: Size | null
  /** Pieces or packs: "6stk", "2pk", "6x25g". */
  count: number | null
}

const MIN_BRAND = 3
const MAX_BRAND_WORDS = 4

// Private labels by store group. Labels sold only as a title prefix ("Coop Donut") are matched
// there; the rest come out as the brand.
const CHAINS: Record<string, string> = {
  coop: 'Coop', änglamark: 'Coop', ängalmark: 'Coop', xtra: 'Coop',
  'first price': 'NorgesGruppen', eldorado: 'NorgesGruppen', jacobs: 'NorgesGruppen',
  'jacobs utvalgte': 'NorgesGruppen', fiskemannen: 'NorgesGruppen', folkets: 'NorgesGruppen',
  smak: 'NorgesGruppen', unil: 'NorgesGruppen', gestus: 'NorgesGruppen', meny: 'NorgesGruppen',
  'rema 1000': 'Rema 1000',
}
// A title starting with these is the chain's own product even if the rest names the brand.
const CHAIN_PREFIXES = ['coop', 'rema 1000']

// Packaging and descriptions that also follow the quantity ("0,5l flaske Schweppes", "1kg Spann",
// "500g Fryst"); never part of a brand.
const NOT_BRAND = new Set([
  'fl', 'flaske', 'boks', 'sleek', 'brett', 'pos', 'pose', 'tube', 'beger', 'spann', 'glass', 'kartong',
  'pall', 'bunt', 'løs', 'stykk', 'refill', 'spray', 'plast', 'strømpe', 'metervare', 'datovare',
  'fryst', 'frossen', 'kjølt', 'kald', 'vegan', 'vegansk', 'økologisk', 'glutenfri', 'halvstekt',
  'håndlagd', 'assortert', 'jul', 'import', 'spesialitet', 'norsk', 'hvit', 'under', 'kaffe',
  'eplemost', 'cottage', 'party',
])

const NUM = String.raw`\d+(?:[.,]\d+)?`
const UNIT = String.raw`kg|gr|gram|g|liter|ltr|l|dl|cl|ml`
const COUNT = String.raw`stk|stykk|pk|pakk|pack|pcs|poser|pos|biter|bg`
// "6x25g", "6 x 0,5l", "0,33lx6"; "ca 650g", "0,9l"; "6stk", "6-pk". Global: a title can hold several.
const MULTI = new RegExp(String.raw`\b(\d+)\s*[x×]\s*(${NUM})\s*(${UNIT})\b`, 'gi')
const MULTI_AFTER = new RegExp(String.raw`(?<![\d,.])(${NUM})\s*(${UNIT})\s*[x×]\s*(\d+)\s*(?:bx|boks|fl)?\b`, 'gi')
const SIZE = new RegExp(String.raw`(?:\bca\.?\s*)?(?<![\d,.])(${NUM})\s*(${UNIT})\b`, 'gi')
const PIECES = new RegExp(String.raw`(?<![\d,.])(\d+)\s*-?\s*(?:${COUNT})\b\.?`, 'gi')
const PER_UNIT = /\bpr\.?\s*(?:stk|stykk|kg)\b/gi

const TO_BASE: Record<string, [number, Size['unit']]> = {
  kg: [1000, 'g'], gr: [1, 'g'], gram: [1, 'g'], g: [1, 'g'],
  liter: [1000, 'ml'], ltr: [1000, 'ml'], l: [1000, 'ml'], dl: [100, 'ml'], cl: [10, 'ml'], ml: [1, 'ml'],
}

function toSize(amount: string, unit: string): Size {
  const [factor, base] = TO_BASE[unit.toLowerCase()]!
  return { amount: Math.round(parseFloat(amount.replace(',', '.')) * factor * 100) / 100, unit: base }
}

/** Size, count and the title with them cut out ("|" marks each cut, for finding the tail). */
export function quantities(title: string) {
  let size: Size | null = null
  let count: number | null = null
  let rest = title.replace(MULTI, (_, n: string, amount: string, unit: string) => {
    size ??= toSize(amount, unit)
    count ??= Number(n)
    return ' | '
  })
  rest = rest.replace(MULTI_AFTER, (_, amount: string, unit: string, n: string) => {
    size ??= toSize(amount, unit)
    count ??= Number(n)
    return ' | '
  })
  rest = rest.replace(SIZE, (_, amount: string, unit: string) => {
    size ??= toSize(amount, unit)
    return ' | '
  })
  rest = rest.replace(PIECES, (_, n: string) => {
    count ??= Number(n)
    return ' | '
  })
  rest = rest.replace(PER_UNIT, ' | ')
  return { size, count, rest }
}

const words = (s: string) => s.split(/\s+/).filter(Boolean)
const tidy = (s: string) => s.replace(/\|/g, ' ').replace(/\s+/g, ' ').replace(/ ,/g, ',').replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, '')

/** EAN-8/UPC-A/EAN-13/GTIN-14 with a valid check digit. */
export function validGtin(code: string) {
  if (![8, 12, 13, 14].includes(code.length)) return false
  const digits = [...code].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Kassalapp id and EAN from ".../vare/320-inspira-melkesjoko-09l-hennig-olsen-7041013290005". */
export function fromHref(href: string) {
  const slug = href.split('/vare/')[1] ?? ''
  const kassalId = Number(slug.match(/^\d+/)?.[0] ?? NaN)
  const tail = slug.match(/-(\d{8,14})$/)?.[1]
  return { kassalId, ean: tail && validGtin(tail) ? tail : null }
}

/** The words after the last quantity, without packaging words; null for a title without one. */
function tail(rest: string) {
  const cut = rest.lastIndexOf('|')
  if (cut < 0) return null
  const ws = words(tidy(rest.slice(cut + 1)))
  while (ws.length && NOT_BRAND.has(ws[0]!.toLowerCase())) ws.shift()
  while (ws.length && NOT_BRAND.has(ws.at(-1)!.toLowerCase())) ws.pop()
  return ws
}

/** Brands: title tails after the last quantity that at least MIN_BRAND titles share. */
export function learnBrands(titles: string[]) {
  const counts = new Map<string, Map<string, number>>()
  for (const title of titles) {
    const ws = tail(quantities(title).rest)
    if (!ws?.length || ws.length > MAX_BRAND_WORDS || !/^\p{Lu}/u.test(ws[0]!) || ws.some((w) => w.endsWith(','))) continue
    const label = ws.join(' ')
    const key = label.toLowerCase()
    const spellings = counts.get(key) ?? new Map<string, number>()
    spellings.set(label, (spellings.get(label) ?? 0) + 1)
    counts.set(key, spellings)
  }
  const brands = new Map<string, string>()
  for (const [key, spellings] of counts) {
    const total = [...spellings.values()].reduce((a, b) => a + b, 0)
    // The most common spelling names the brand ("Tine", not "TINE").
    if (total >= MIN_BRAND) brands.set(key, [...spellings].sort((a, b) => b[1] - a[1])[0]![0])
  }
  return brands
}

/** The longest known brand that the words start (or end) with. */
function findBrand(ws: string[], brands: Map<string, string>, atEnd: boolean, max = ws.length - 1) {
  for (let n = Math.min(MAX_BRAND_WORDS, max); n >= 1; n--) {
    const brand = brands.get((atEnd ? ws.slice(-n) : ws.slice(0, n)).join(' ').toLowerCase())
    if (brand) return brand
  }
  return null
}

/** The words without the last run of `remove` (compared case-insensitively). */
function withoutLast(ws: string[], remove: string) {
  const r = words(remove.toLowerCase())
  const lower = ws.map((w) => w.toLowerCase())
  for (let i = ws.length - r.length; i >= 0; i--) {
    if (r.every((w, j) => lower[i + j] === w)) return [...ws.slice(0, i), ...ws.slice(i + r.length)]
  }
  return ws
}

export function enrich(p: ListedProduct, category: { id: number; name: string }, brands: Map<string, string>): EnrichedProduct {
  const { size, count, rest } = quantities(p.title)
  let ws = words(tidy(rest))
  let chain: string | null = null
  let brand: string | null = null

  const lower = ws.join(' ').toLowerCase()
  const prefix = CHAIN_PREFIXES.find((c) => lower === c || lower.startsWith(c + ' '))
  if (prefix) {
    const n = words(prefix).length
    brand = ws.slice(0, n).join(' ')
    chain = CHAINS[prefix]!
    ws = ws.slice(n)
    // "Coop Änglamark Buksebleier": the chain's label names the brand.
    if (ws.length > 1 && CHAINS[ws[0]!.toLowerCase()] === chain) brand = ws.shift()!
  }
  // Where learnBrands found brands: after the last quantity ("0,5l flaske Schweppes"), or at
  // the end of a title without one; else at the start ("Tine YT Restitusjonsdrikk").
  const after = tail(rest)
  const found =
    (after ? findBrand(after, brands, true, after.length) : findBrand(ws, brands, true)) ?? findBrand(ws, brands, false)
  if (found && !prefix) {
    brand = found
    ws = withoutLast(ws, found)
  }
  chain ??= brand ? (CHAINS[brand.toLowerCase()] ?? null) : null

  return {
    ...p,
    ...fromHref(p.href),
    categoryId: category.id,
    category: category.name,
    name: tidy(ws.join(' ')),
    brand,
    chain,
    size,
    count,
  }
}

if (import.meta.main) {
  const DATA = new URL('../data/', import.meta.url).pathname
  const files = (await readdir(DATA)).filter((f) => /^\d+_.+_products\.json$/.test(f))
  if (!files.length) throw new Error('No data/<id>_<name>_products.json; run `bun run products` first.')
  const categories = (await Bun.file(DATA + 'categories.json').json()) as { id: number; name: string }[]

  const listed: { product: ListedProduct; category: { id: number; name: string } }[] = []
  for (const file of files) {
    const id = Number(file.split('_')[0])
    const category = categories.find((c) => c.id === id) ?? { id, name: file.split('_')[1]! }
    for (const product of (await Bun.file(DATA + file).json()) as ListedProduct[]) listed.push({ product, category })
  }

  const brands = learnBrands(listed.map((l) => l.product.title))
  const out = listed.map((l) => enrich(l.product, l.category, brands))
  await Bun.write(DATA + 'enriched.json', JSON.stringify(out, null, 2) + '\n')

  const share = (f: (p: EnrichedProduct) => unknown) => `${Math.round((out.filter(f).length / out.length) * 100)} %`
  console.log(`${out.length} products from ${files.length} files, ${brands.size} brands learned -> ${DATA}enriched.json`)
  console.log(`  ean ${share((p) => p.ean)}, brand ${share((p) => p.brand)}, chain ${share((p) => p.chain)}, size ${share((p) => p.size)}, count ${share((p) => p.count)}`)
}
