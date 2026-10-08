# kassal

Kassal.app's product catalog, labelled by Jev, as training data for `classifier/`. The steps:

1. Scrape the catalog: product titles per category (`categories`, `products`).
2. Split titles into name, brand, chain, size and EAN (`enrich`) -> `data/enriched.json`.
3. Ask Jev for each product's group (`label-group`) and type (`label-type`); the answers are
   added to `data/enriched.json` as `jev_response` and `jev_type_response`.
4. `classifier/prepare_kassal.py` reads `data/enriched.json` and writes the training rows.

`data/enriched.json` is the one complete file (~52,000 products, ~86 MB). Running `enrich`
again rewrites it without Jev's answers, so copy it first.

The labelling scripts need `TYPESAFE_API_KEY` in `kassal/.env` (Bun loads it). They save
every answer, skip products already labelled, and print the input tokens used: about 1200
per product for the group, 700 per distinct title for the type (Oct 2026). Set
`ITEMS_TO_RUN` in the script to try a few first.

How the scraping works: the sitemaps (`sitemap-products-*.xml`) list every product page, and
each page has a schema.org `Product` JSON-LD block with name, EAN, brand and `category`. The
block is in the server-rendered HTML, so a plain `fetch` gets it (no browser); `cheerio`
finds it. Pages are fetched one at a time with a pause between them. `robots.txt` allows all
paths (checked 7 Oct 2026).

```sh
cd kassal
bun install
bun run categories                      # root categories (id, name) -> data/categories.json
bun run products 22                     # every product in Bakeri (title, image, href)
                                        #   -> data/22_bakeri_products.json
bun run products 22 72 16               # several categories, one after another
bun run products --all                  # every category in data/categories.json
bun run products --all --skip-existing  # resume after an error: skip categories already saved
bun run enrich                          # split titles into name, brand, chain, size, count; EAN
                                        #   from the href -> data/enriched.json
bun run scrape                          # first 50 products -> data/products.jsonl
bun run scrape --limit 1000 --delay 1500
bun run scrape --limit 1000 --every 250  # every 250th product: a spread over all categories
bun run summary                         # products per category in data/products.jsonl, as a tree
bun run label-group                     # Jev's product group -> jev_response in data/enriched.json
bun run label-type                      # Jev's product type -> jev_type_response (after label-group)
bun run typecheck
```

`data/` and `.env` are git-ignored. Scraping resumes where it stopped (URLs already saved are skipped).

Notes:
- `enrich` learns brands from the data: the words after the last quantity ("0,9l Hennig-Olsen")
  count as a brand once 3 titles share them. Then it looks for a brand in the same place, or
  at the title's start ("Tine YT ..."). Private labels get a `chain` (First Price ->
  NorgesGruppen, a "Coop" prefix -> Coop). `size` is in g or ml, as written: per unit in
  "6x25g", otherwise usually the whole package. EANs starting with 2 are in-store codes.
- To read more from a page (prices per store, breadcrumbs), add selectors in
  `src/product.ts`; test them first in the browser console with `document.querySelectorAll`.
  Content that only appears after JavaScript runs would need a browser (Playwright) instead.
- On HTTP 429 (rate limited) the scraper stops; run it again later or with a longer `--delay`.
- Kassalapp also has an official API (`KASSALAPP_API_KEY`, 60 requests/min free) and an MCP
  server. The free API tier excludes commercial use; check Kassalapp's terms before using
  scraped data in the product.
- Keep the delay at 1 s or more. There are about 250 000 product pages (251 sitemaps of up
  to 1000 URLs, 7 Oct 2026): a full run at 1 s per page takes about 3 days, so sample instead.
