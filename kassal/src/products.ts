// Lists every product in root categories from kassal.app's product list, page by page,
// into data/<id>_<name>_products.json (title, image, href), one file per category.
//   bun run products 22              Bakeri -> data/22_bakeri_products.json
//   bun run products 22 72 16        several categories, one after another
//   bun run products --all           every category in data/categories.json
//   bun run products --all --skip-existing   resume: leave out categories already saved
//   bun run products 22 --delay 2000
// Needs data/categories.json (bun run categories). Pages are fetched one at a time with a
// pause between them, until a page has no products. Each category is saved when it is done;
// on an error the run stops, and the categories saved so far stay.
import { parseArgs } from 'node:util'
import * as cheerio from 'cheerio'
import type { Category } from './categories.ts'
import { USER_AGENT } from './sitemap.ts'

export interface ListedProduct {
  title: string
  image: string
  href: string
}

// Stops a run that never sees an empty page (e.g. if the site starts repeating the last page).
const MAX_PAGES = 1000
const DATA = new URL('../data/', import.meta.url).pathname

const USAGE = 'Usage: bun run products <category id>... | --all [--skip-existing] [--delay ms]'
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: 'boolean', default: false },
    'skip-existing': { type: 'boolean', default: false },
    delay: { type: 'string', default: '1000' },
  },
})
const delay = Number(values.delay)

const categoriesFile = Bun.file(DATA + 'categories.json')
if (!(await categoriesFile.exists())) throw new Error('No data/categories.json; run `bun run categories` first.')
const known = (await categoriesFile.json()) as Category[]

let categories: Category[]
if (values.all) {
  if (positionals.length) throw new Error(`Give category ids or --all, not both. ${USAGE}`)
  categories = known
} else {
  if (!positionals.length) throw new Error(USAGE)
  categories = positionals.map((arg) => {
    const category = known.find((c) => c.id === Number(arg))
    if (!category) throw new Error(`No category with id ${arg} in data/categories.json.`)
    return category
  })
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '')
const outFile = (c: Category) => `${DATA}${c.id}_${slug(c.name)}_products.json`

/** The products on one page of a category's list; empty past the last page. */
async function listPage(id: number, page: number): Promise<ListedProduct[]> {
  const url = `https://kassal.app/varer?kategori=${id}&min=&max=&etikett=&page=${page}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}${res.status === 429 ? ' (rate limited; try a longer --delay)' : ''}`)
  const $ = cheerio.load(await res.text())
  const products: ListedProduct[] = []
  // Each product is an <li> holding the image, an <h3> title and a link to /vare/....
  for (const li of $('li:has(a[href*="/vare/"])')) {
    const item = $(li)
    products.push({
      title: item.find('h3').first().text().trim(),
      image: item.find('img').first().attr('src') ?? '',
      href: item.find('a[href*="/vare/"]').first().attr('href') ?? '',
    })
  }
  return products
}

/** Every product in a category, saved to its file. Returns how many. */
async function scrapeCategory(category: Category) {
  const byHref = new Map<string, ListedProduct>()
  let page = 1
  for (; page <= MAX_PAGES; page++) {
    const products = await listPage(category.id, page)
    if (!products.length) break
    // The list can shift while paging; keep one entry per product.
    for (const p of products) byHref.set(p.href, p)
    console.log(`  page ${page}: ${products.length} products (${byHref.size} so far)`)
    await Bun.sleep(delay)
  }
  if (page > MAX_PAGES) console.warn(`  Stopped after ${MAX_PAGES} pages without reaching an empty one.`)
  await Bun.write(outFile(category), JSON.stringify([...byHref.values()], null, 2) + '\n')
  return byHref.size
}

let total = 0
for (const [i, category] of categories.entries()) {
  const out = outFile(category)
  if (values['skip-existing'] && (await Bun.file(out).exists())) {
    console.log(`[${i + 1}/${categories.length}] ${category.name}: already saved, skipped`)
    continue
  }
  console.log(`[${i + 1}/${categories.length}] ${category.name} (${category.id})`)
  try {
    const n = await scrapeCategory(category)
    total += n
    console.log(`  ${n} products -> ${out}`)
  } catch (err) {
    console.error(`\n${category.name} failed: ${err instanceof Error ? err.message : err}`)
    console.error('Categories saved so far are kept; rerun with --skip-existing to continue.')
    process.exit(1)
  }
}
console.log(`\nDone: ${total} products in ${categories.length} categories.`)
