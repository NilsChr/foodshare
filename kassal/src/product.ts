// Reads a product page's schema.org Product data (the JSON-LD block kassal.app renders
// server-side, so a plain HTTP request is enough): name, EAN, brand and the category path
// ("Barneprodukter / Barnedessert").
import * as cheerio from 'cheerio'

export interface Product {
  url: string
  ean: string
  name: string
  brand: string
  /** Category path, top level first: ["Barneprodukter", "Barnedessert"]. Empty when uncategorized. */
  category: string[]
  description: string
  scrapedAt: string
}

export function readProduct(html: string, url: string): Product | null {
  const $ = cheerio.load(html)
  for (const el of $('script[type="application/ld+json"]')) {
    const block = $(el).text()
    let data: any
    try {
      data = JSON.parse(block)
    } catch {
      continue
    }
    if (data?.['@type'] !== 'Product') continue
    return {
      url,
      ean: String(data.gtin ?? ''),
      name: String(data.name ?? ''),
      brand: String(data.brand?.name ?? ''),
      category: String(data.category ?? '').split('/').map((s) => s.trim()).filter(Boolean),
      description: String(data.description ?? ''),
      scrapedAt: new Date().toISOString(),
    }
  }
  return null
}
