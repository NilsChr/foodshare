// Product page URLs from kassal.app's sitemaps (plain HTTP, no browser needed).

const INDEX = 'https://kassal.app/sitemap-index.xml'

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)

async function get(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

export const USER_AGENT = 'Foodshare research scraper (+https://github.com/NilsChr/foodshare)'

/** Every product URL (/vare/...), sitemap by sitemap. */
export async function* productUrls() {
  for (const sitemap of locs(await get(INDEX)).filter((u) => u.includes('sitemap-products-'))) {
    yield* locs(await get(sitemap))
  }
}
