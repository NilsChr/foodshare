// Fetches kassal.app's root product categories (name and id) into data/categories.json.
//   bun run categories
// They are the "Kategorier" filter on /varer, as Livewire buttons:
//   <button wire:click="$set('category', 8905)">Apotekvarer</button>
// "Ukategorisert" ($set('category', 'ingen')) is a filter for products without a category,
// not a category, so it is left out.
import { mkdir } from 'node:fs/promises'
import * as cheerio from 'cheerio'
import { USER_AGENT } from './sitemap.ts'

const PAGE = 'https://kassal.app/varer'
const OUT = new URL('../data/categories.json', import.meta.url).pathname

export interface Category {
  id: number
  name: string
}

const res = await fetch(PAGE, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
if (!res.ok) throw new Error(`${PAGE} -> HTTP ${res.status}`)
const $ = cheerio.load(await res.text())

const categories: Category[] = []
for (const el of $(`button[wire\\:click^="$set('category'"]`)) {
  const id = $(el).attr('wire:click')?.match(/\$set\('category',\s*(\d+)\)/)?.[1]
  if (id) categories.push({ id: Number(id), name: $(el).text().trim() })
}
if (!categories.length) throw new Error(`No categories found on ${PAGE}; the page layout may have changed.`)

await mkdir(new URL('../data/', import.meta.url).pathname, { recursive: true })
await Bun.write(OUT, JSON.stringify(categories, null, 2) + '\n')
console.log(`${categories.length} root categories -> ${OUT}`)
for (const c of categories) console.log(`  ${String(c.id).padStart(5)}  ${c.name}`)
