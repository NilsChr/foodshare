import { House, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useMe } from '../lib/auth'
import { shortDate } from '../lib/dates'
import { t } from '../lib/i18n'
import { ingredientStatus, proper } from '../lib/match'
import { formatPrice } from '../lib/offers'
import { costNow, homeLines } from '../lib/prices'
import { col, errorMessage, type Recipe, type RecipePrice } from '../lib/pb'
import { useSpace } from '../lib/space'
import { ChainLogo } from './offers'
import { Button, ErrorText, Field, IconButton, Sheet } from './ui'

// PocketBase dates are "2026-10-07 19:08:38.123Z"; Safari needs the "T".
const entryDate = (p: RecipePrice) => new Date(p.created.replace(' ', 'T'))

const parsePrice = (text: string) => {
  const n = parseFloat(text.replace(',', '.'))
  return n > 0 ? n : 0
}

/** Latest price per store with what is at home left out, plus every entry as history. */
export function PriceSection({ recipe }: { recipe: Recipe }) {
  const { chains, pantry, recipePrices, patchRecipePrice, removeRecipePrice } = useSpace()
  const prices = recipePrices.filter((p) => p.recipe === recipe.id)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const chain = (id: string) => chains.find((c) => c.id === id)
  const latest = prices.filter((p, i) => prices.findIndex((q) => q.chain === p.chain) === i)

  async function del(p: RecipePrice) {
    removeRecipePrice(p.id)
    try {
      await col.recipePrices().delete(p.id)
    } catch (e) {
      patchRecipePrice(p)
      setError(errorMessage(e))
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-extrabold">{t('Price')}</h2>
        <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)} disabled={!recipe.ingredients?.length}>{t('Add price')}</Button>
      </div>
      {latest.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
          {latest.map((p) => {
            const home = homeLines(p, pantry)
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <ChainLogo chain={chain(p.chain)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold tabular-nums">{formatPrice(costNow(p, pantry), true)}</span>
                  {!!home.length && (
                    <span className="block text-xs text-muted">
                      {t('{total} in all; {names} at home', { total: formatPrice(p.total, true), names: home.map((l) => l.name).join(', ') })}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted">{shortDate(entryDate(p))}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-1 text-sm text-muted">{t('Add what the ingredients cost at a store to see what the recipe costs.')}</p>
      )}
      {!!prices.length && (
        <details className="mt-2 px-1">
          <summary className="cursor-pointer text-sm font-bold text-muted">{t('History ({n})', { n: prices.length })}</summary>
          <ul className="mt-1">
            {prices.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-1 text-sm">
                <span className="w-20 text-muted">{shortDate(entryDate(p))}</span>
                <span className="min-w-0 flex-1 truncate">{chain(p.chain)?.name}</span>
                <span className="font-bold tabular-nums">{formatPrice(p.total, true)}</span>
                <IconButton icon={Trash2} label={t('Delete price')} onClick={() => del(p)} className="size-8" />
              </li>
            ))}
          </ul>
        </details>
      )}
      <ErrorText error={error} />
      <PriceSheet recipe={recipe} prices={prices} open={adding} onClose={() => setAdding(false)} onSaved={patchRecipePrice} />
    </section>
  )
}

/** Pick a store and enter what each ingredient line cost there. Blank lines are left out. */
function PriceSheet({ recipe, prices, open, onClose, onSaved }: {
  recipe: Recipe; prices: RecipePrice[]; open: boolean; onClose: () => void; onSaved: (p: RecipePrice) => void
}) {
  const me = useMe()
  const { space, chains, pantry } = useSpace()
  const ingredients = recipe.ingredients ?? []
  const [chainId, setChainId] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [wasOpen, setWasOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The group's stores first, then the rest.
  const ours = chains.filter((c) => space.chains?.includes(c.id))
  const others = chains.filter((c) => !space.chains?.includes(c.id))

  // Start from the last price entered at the store, line by line.
  function prefill(id: string) {
    const last = prices.find((p) => p.chain === id)
    setValues(ingredients.map((ing) => {
      const line = last?.lines?.find((l) => l.name === ing.name)
      return line ? String(line.price).replace('.', ',') : ''
    }))
  }

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const id = prices[0]?.chain || ours[0]?.id || chains[0]?.id || ''
      setChainId(id)
      setError('')
      prefill(id)
    }
  }

  const lines = ingredients.flatMap((ing, i) => (parsePrice(values[i] ?? '') ? [{ name: ing.name, price: parsePrice(values[i]) }] : []))
  const total = Math.round(lines.reduce((sum, l) => sum + l.price, 0) * 100) / 100

  async function save() {
    setBusy(true)
    try {
      onSaved(await col.recipePrices().create({ space: space.id, recipe: recipe.id, chain: chainId, lines, total, created_by: me.id }))
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Price of {title}', { title: recipe.title })}>
      <Field label={t('Store')}>
        <select value={chainId} onChange={(e) => { setChainId(e.target.value); prefill(e.target.value) }}
          className="h-11 w-full rounded-2xl border border-line bg-card px-3 outline-none focus:border-brand">
          {!!ours.length && (
            <optgroup label={t('Your stores')}>
              {ours.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          )}
          <optgroup label={ours.length ? t('Other stores') : t('Stores')}>
            {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        </select>
      </Field>
      <p className="mt-3 text-sm text-muted">{t('What each line cost. Leave blank what you did not buy.')}</p>
      <ul className="-mx-2 my-2">
        {ingredients.map((ing, i) => {
          const home = ingredientStatus(ing.name, [], pantry) === 'home'
          return (
            <li key={i} className="flex items-center gap-3 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {proper(ing.name)} {ing.quantity && <span className="font-normal text-muted">{ing.quantity}</span>}
                </span>
                {home && <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-text"><House className="size-3" /> {t('At home')}</span>}
              </span>
              <span className="relative w-28 shrink-0">
                <input inputMode="decimal" value={values[i] ?? ''} aria-label={t('Price of {name}', { name: ing.name })}
                  onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                  className="h-10 w-full rounded-xl border border-line bg-card pl-3 pr-9 text-right tabular-nums outline-none focus:border-brand" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">kr</span>
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mb-3 flex justify-between px-1 font-extrabold">
        <span>{t('Total')}</span>
        <span className="tabular-nums">{formatPrice(total)}</span>
      </div>
      <Button className="w-full" busy={busy} disabled={!chainId || !lines.length} onClick={save}>{t('Save price')}</Button>
      <ErrorText error={error} />
    </Sheet>
  )
}
