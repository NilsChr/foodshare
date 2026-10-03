// Client side of recipe import: the server hook (pocketbase/pb_hooks/import_recipe.pb.js)
// fetches the page; here we turn its schema.org data into our recipe fields.
import { pb, type Ingredient } from './pb'

interface ImportedData {
  title: string
  description: string
  servings: string
  totalTime: string
  ingredients: string[]
  steps: string[]
  tags?: string[]
  image: string
}

/** Sites we can import from. The server hook has a matching host allowlist. */
export const SOURCES = [
  { id: 'oda', name: 'ODA', site: 'oda.com', pattern: /^https:\/\/(www\.)?oda\.com\/.+\/recipes\/./i, example: 'https://oda.com/no/recipes/…' },
] as const

export type SourceId = (typeof SOURCES)[number]['id']

export function sourceName(id: string) {
  return SOURCES.find((s) => s.id === id)?.name ?? id
}

/** Same page, same key: drop query, hash and trailing slash; lower-case the host. */
export function normalizeUrl(raw: string) {
  try {
    const u = new URL(raw.trim())
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return raw.trim()
  }
}

export interface ImportedRecipe {
  source: SourceId
  sourceUrl: string
  title: string
  description: string
  servings: number
  minutes: number
  ingredients: Ingredient[]
  instructions: string
  tags: string[]
  image: Blob | null
}

/** ISO 8601 duration ("PT1H30M", "P0DT00H35M00S") to minutes. */
export function durationMinutes(iso: string) {
  const m = iso.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/)
  if (!m) return 0
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

const AMOUNT = /^((?:\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+|[½¼¾⅓⅔])(?:\s*-\s*\d+)?\s*(?:stk|ts|ss|g|kg|dl|l|ml|cl|pk|pakke|boks|bx|fedd|bunt|never|klype|tsp|tbsp|cups?|oz|lbs?|x)?\.?)\s+(.+)$/i

/** "600 g Kyllingfilet, stor" -> { quantity: "600 g", name: "Kyllingfilet" }. Text after a comma is a variant or prep note. */
export function parseIngredient(line: string): Ingredient {
  const text = line.replace(/\s+/g, ' ').trim()
  const m = text.match(AMOUNT)
  const quantity = m ? m[1] : ''
  const rest = m ? m[2] : text
  const name = rest.split(',')[0].trim() || rest
  return { name, quantity }
}

export async function importRecipe(source: SourceId, url: string): Promise<ImportedRecipe> {
  const data = await pb.send<ImportedData>('/api/foodshare/import-recipe', { method: 'POST', body: { url } })
  let image: Blob | null = null
  if (data.image) {
    try {
      const res = await fetch(pb.buildURL('/api/foodshare/import-image') + '?url=' + encodeURIComponent(data.image), {
        headers: { Authorization: pb.authStore.token },
      })
      if (res.ok) image = await res.blob()
    } catch {
      // The recipe is still useful without its photo.
    }
  }
  return {
    source,
    sourceUrl: normalizeUrl(url),
    title: data.title,
    description: data.description,
    servings: parseInt(data.servings) || 0,
    minutes: durationMinutes(data.totalTime),
    ingredients: data.ingredients.map(parseIngredient),
    instructions: data.steps.length > 1 ? data.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : (data.steps[0] ?? ''),
    tags: data.tags ?? [],
    image,
  }
}

// Hands an imported recipe from the import sheet to the new-recipe form (Blob can't go in the URL).
let pending: ImportedRecipe | null = null
export function setPendingImport(r: ImportedRecipe) {
  pending = r
}
export function takePendingImport() {
  const r = pending
  pending = null
  return r
}
