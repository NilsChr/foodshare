// Summarizes the category tree in data/products.jsonl: products per category path.
//   bun run summary
type Row = { category: string[] }

const file = Bun.file(new URL('../data/products.jsonl', import.meta.url).pathname)
if (!(await file.exists())) throw new Error('No data yet; run `bun run scrape` first.')
const rows = (await file.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row)

const counts = new Map<string, number>()
for (const { category } of rows) {
  // Count every level, so "Ost" includes "Ost / Gulost".
  for (let depth = 1; depth <= Math.max(category.length, 1); depth++) {
    const key = category.slice(0, depth).join(' / ') || '(no category)'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
}
for (const [path, n] of [...counts].sort(([a], [b]) => a.localeCompare(b, 'nb'))) {
  const depth = path.split(' / ').length - 1
  console.log(`${'  '.repeat(depth)}${path.split(' / ').at(-1)}  ${n}`)
}
console.log(`\n${rows.length} products, ${counts.size} categories`)
