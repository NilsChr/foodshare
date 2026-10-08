// Scrapes product pages into data/products.jsonl, one product per line.
//   bun run scrape                     first 50 products
//   bun run scrape --limit 1000 --delay 1500
//   bun run scrape --limit 1000 --every 100   every 100th product: a spread over all categories
//                                             (the sitemaps list products roughly by category)
// Resumable: URLs already in the file are skipped. One plain HTTP request at a time with a
// pause between pages, to stay a light visitor; stops on HTTP 429.
import { appendFile, mkdir } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { readProduct } from './product.ts'
import { productUrls, USER_AGENT } from './sitemap.ts'

const OUT = new URL('../data/products.jsonl', import.meta.url).pathname

const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '50' },
    delay: { type: 'string', default: '1000' },
    every: { type: 'string', default: '1' },
  },
})
const limit = Number(values.limit)
const delay = Number(values.delay)
const every = Math.max(1, Number(values.every))

async function seenUrls() {
  const file = Bun.file(OUT)
  if (!(await file.exists())) return new Set<string>()
  const lines = (await file.text()).split('\n').filter(Boolean)
  return new Set(lines.map((l) => (JSON.parse(l) as { url: string }).url))
}

await mkdir(new URL('../data/', import.meta.url).pathname, { recursive: true })
const seen = await seenUrls()
let done = 0
let failed = 0
let index = 0
for await (const url of productUrls()) {
  if (done >= limit) break
  if (index++ % every !== 0 || seen.has(url)) continue
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
    if (res.status === 429) {
      console.warn('rate limited (HTTP 429); stopping. Run again later, or with a longer --delay.')
      break
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const product = readProduct(await res.text(), url)
    if (product) {
      await appendFile(OUT, JSON.stringify(product) + '\n')
      done++
      console.log(`${done}/${limit}  ${product.category.join(' / ') || '(no category)'}  ${product.name}`)
    } else {
      failed++
      console.warn(`no product data: ${url}`)
    }
  } catch (err) {
    failed++
    console.warn(`failed: ${url}: ${err}`)
  }
  await Bun.sleep(delay)
}
console.log(`\n${done} products saved to ${OUT}, ${failed} failed`)
