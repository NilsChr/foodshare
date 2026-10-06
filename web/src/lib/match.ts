// Fuzzy name matching shared by category keywords, recipe-vs-list status and synergy suggestions.
// Handles plurals ("tomato"/"tomatoes", "tomat"/"tomater") and Norwegian compounds ("kyllingfilet" ~ "kylling").
import { locale } from './i18n'
import type { Category, Item, Offer, PantryItem, Recipe } from './pb'

// Mirrored in pocketbase/pb_hooks/product_types.js (cache keys for product types); keep in step.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'of', 'the', 'fresh', 'chopped', 'diced', 'sliced', 'large', 'small', 'medium', 'to', 'taste',
  'og', 'med', 'frisk', 'friske', 'hakket', 'stor', 'store', 'liten', 'små', 'pk', 'pakke', 'pakker', 'boks',
  'g', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'ts', 'ss', 'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'lbs', 'stk', 'pcs', 'x',
])

export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
}

/** Display form of a typed name: first letter upper case ("milk" -> "Milk"). */
export function proper(name: string) {
  return name ? name[0].toLocaleUpperCase() + name.slice(1) : name
}

/** Scale the first number in a quantity: ("400 g", 2) -> "800 g", ("1/2 ts", 2) -> "1 ts". Text without a number is kept. */
export function scaleQuantity(quantity: string, factor: number) {
  if (factor === 1 || !quantity) return quantity
  return quantity.replace(/(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?/, (_, whole: string, denominator?: string) => {
    let n = parseFloat(whole.replace(',', '.'))
    if (denominator) n /= Number(denominator)
    return (Math.round(n * factor * 100) / 100).toLocaleString(locale)
  })
}

/** Merge tags, ignoring case and blanks; the first spelling wins. */
export function mergeTags(...lists: (string[] | null | undefined)[]) {
  const out: string[] = []
  for (const tag of lists.flatMap((l) => l ?? [])) {
    const clean = tag.trim()
    if (clean && !out.some((x) => x.toLowerCase() === clean.toLowerCase())) out.push(clean)
  }
  return out
}

/** All tags used in a space, most used first. */
export function spaceTags(recipes: { tags: string[] | null }[]) {
  const counts = new Map<string, { tag: string; n: number }>()
  for (const tag of recipes.flatMap((r) => r.tags ?? [])) {
    const key = tag.toLowerCase()
    counts.set(key, { tag: counts.get(key)?.tag ?? tag, n: (counts.get(key)?.n ?? 0) + 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)).map((c) => c.tag)
}

export function normalize(name: string) {
  return tokens(name).join(' ')
}

function wordMatch(a: string, b: string) {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length === 3) return long === short + 's'
  if (short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3) return true
  // Compound words: "kyllingfilet" contains "kylling".
  return short.length >= 5 && long.includes(short)
}

/** True when every word of the shorter name matches a word of the longer one. */
export function namesMatch(a: string, b: string) {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return false
  const [few, many] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  return few.every((w) => many.some((m) => wordMatch(w, m)))
}

/** Best category for an item name by keyword. Longer (more specific) keywords win. */
export function categorize(name: string, categories: Category[]): string {
  const itemTokens = tokens(name)
  if (!itemTokens.length) return ''
  let best = ''
  let bestScore = 0
  for (const c of categories) {
    for (const kw of c.keywords ?? []) {
      const kt = tokens(kw)
      if (!kt.length) continue
      if (kt.every((k) => itemTokens.some((t) => wordMatch(k, t)))) {
        const score = kt.join(' ').length
        if (score > bestScore) {
          best = c.id
          bestScore = score
        }
      }
    }
  }
  return best
}

export type IngredientStatus = 'have' | 'home' | 'to-buy' | 'unknown'

/** Status of an ingredient: still on the list, crossed off, in the pantry, or none of these. */
export function ingredientStatus(name: string, items: Item[], pantry: PantryItem[]): IngredientStatus {
  const matches = items.filter((i) => namesMatch(name, i.name))
  if (matches.some((i) => !i.checked)) return 'to-buy'
  if (matches.length) return 'have'
  if (pantry.some((p) => namesMatch(name, p.name))) return 'home'
  return 'unknown'
}

export function recipeReadiness(recipe: Recipe, items: Item[], pantry: PantryItem[]) {
  const counts = { have: 0, home: 0, 'to-buy': 0, unknown: 0 }
  for (const ing of recipe.ingredients ?? []) counts[ingredientStatus(ing.name, items, pantry)]++
  return counts
}

export interface PantryMatch {
  recipe: Recipe
  matched: string[]
  missing: string[]
}

/**
 * Recipes ranked by how few ingredients are missing from what is at home
 * (the pantry plus crossed-off list items). Only recipes that use something at home.
 */
export function pantryMatches(recipes: Recipe[], items: Item[], pantry: PantryItem[]): PantryMatch[] {
  const home = [...pantry.map((p) => p.name), ...items.filter((i) => i.checked).map((i) => i.name)]
  if (!home.length) return []
  return recipes
    .filter((r) => r.ingredients?.length)
    .map((recipe) => {
      const matched: string[] = []
      const missing: string[] = []
      for (const ing of recipe.ingredients ?? []) {
        ;(home.some((h) => namesMatch(ing.name, h)) ? matched : missing).push(ing.name)
      }
      return { recipe, matched, missing }
    })
    .filter((m) => m.matched.length)
    .sort((a, b) => a.missing.length - b.missing.length || b.matched.length - a.matched.length || a.recipe.title.localeCompare(b.recipe.title))
}

export function recipeOnList(recipeId: string, items: Item[]) {
  return items.some((i) => i.recipe === recipeId && !i.checked)
}

export interface Synergy {
  recipe: Recipe
  matched: string[]
  missing: string[]
}

/**
 * Recipes that reuse what is already on the list, so one shop covers several dinners.
 * Skips recipes already added to the list.
 */
export function synergies(recipes: Recipe[], items: Item[], limit = 3): Synergy[] {
  const open = items.filter((i) => !i.checked)
  if (!open.length) return []
  return recipes
    .filter((r) => (r.ingredients?.length ?? 0) >= 2 && !recipeOnList(r.id, items))
    .map((recipe) => {
      const matched: string[] = []
      const missing: string[] = []
      for (const ing of recipe.ingredients ?? []) {
        ;(open.some((i) => namesMatch(ing.name, i.name)) ? matched : missing).push(ing.name)
      }
      return { recipe, matched, missing }
    })
    .filter((s) => s.matched.length >= 2 || (s.matched.length === 1 && s.missing.length <= 1))
    .sort((a, b) => b.matched.length - a.matched.length || a.missing.length - b.missing.length)
    .slice(0, limit)
}

/**
 * Offer word `o` is item word `w`, a plural of it, or a compound ending in it ("lettmelk" ~ "melk",
 * "grillpølser" ~ "pølse"). Stricter than wordMatch: "kylling" does not match "kyllingkrydder".
 */
function offerWordMatch(w: string, o: string) {
  if (w === o) return true
  if (w.length < 3) return false
  for (let cut = 0; cut <= 3; cut++) {
    const base = cut ? o.slice(0, -cut) : o
    if (base.length < w.length) break
    if (base === w || (w.length >= 4 && base.endsWith(w))) return true
  }
  // Item in plural, offer in singular: "tomater" ~ "tomat".
  return o.length >= 4 && w.startsWith(o) && w.length - o.length <= 3
}

export type OfferIndex = { offer: Offer; words: string[] }[]

/** Tokenize offer headings once, for repeated offersFor lookups. */
export function indexOffers(offers: Offer[]): OfferIndex {
  return offers.map((offer) => ({ offer, words: tokens(offer.heading) }))
}

/**
 * Offers for a list item. `offers`: headings containing every word of the name (closest first,
 * then cheapest), then offers of the same product type that the server confirmed the name
 * means (`confirmed`, see pb_hooks/offer_matches.js; "kaffe" ~ "ALI FILTERMALT"), cheapest
 * first. `similar`: the type's other offers, cheapest first ("parmesan" ~ "SYNNØVE GULOST"),
 * also all of them while the server has not checked yet (`confirmed` null).
 */
export function offersFor(name: string, index: OfferIndex, productType = '', confirmed: string[] | null = null) {
  const words = tokens(name)
  const byWords = words.length
    ? index
      .filter((e) => words.every((w) => e.words.some((o) => offerWordMatch(w, o))))
      .sort((a, b) => a.words.length - b.words.length || a.offer.price - b.offer.price)
      .map((e) => e.offer)
    : []
  if (!productType || productType === 'none') return { offers: byWords, similar: [] }
  const seen = new Set(byWords.map((o) => o.id))
  const ok = new Set(confirmed ?? [])
  const byType = index
    .filter((e) => e.offer.product_type === productType && !seen.has(e.offer.id))
    .map((e) => e.offer)
    .sort((a, b) => a.price - b.price)
  return { offers: [...byWords, ...byType.filter((o) => ok.has(o.id))], similar: byType.filter((o) => !ok.has(o.id)) }
}

const UNIT = '(?:x|stk|pcs|pk|g|kg|l|dl|ml|cl)'

/** "2 milk", "milk 2l", "500 g mince" -> name + quantity. */
export function parseEntry(text: string) {
  const t = text.trim().replace(/\s+/g, ' ')
  const lead = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?\\s*${UNIT}?)\\s+(.+)$`, 'i'))
  if (lead) return { name: lead[2], quantity: lead[1] }
  const trail = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?\\s*${UNIT}?)$`, 'i'))
  if (trail) return { name: trail[1], quantity: trail[2] }
  return { name: t, quantity: '' }
}
