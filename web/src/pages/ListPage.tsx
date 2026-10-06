import {
  ArrowUpDown, BookOpen, Check, ChevronDown, ChevronRight, Layers, List, Pencil, Plus, ShoppingBasket, Sparkles, Store, Tag, Trash2,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChainLogo, OfferBadge, OffersSheet } from '../components/offers'
import { formatPrice, saving } from '../lib/offers'
import SectionOrder from '../components/SectionOrder'
import { Button, Empty, ErrorText, Field, IconButton, Input, PageHeader, Sheet, Spinner } from '../components/ui'
import { useMe } from '../lib/auth'
import { categorize, indexOffers, normalize, offersFor, parseEntry, proper, synergies } from '../lib/match'
import { categoryIcon, categoryName, learnKeyword, sectionLeader, sectionTitle } from '../lib/categories'
import { col, errorMessage, recipeImage, type Category, type Chain, type Item, type Offer } from '../lib/pb'
import { useSpace } from '../lib/space'
import { t, tn } from '../lib/i18n'

const GROUP_KEY = 'foodshare.group'
const COLLAPSED_KEY = 'foodshare.collapsed'

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
function readGrouped() {
  try {
    return localStorage.getItem(GROUP_KEY) !== 'off'
  } catch {
    return true
  }
}

export default function ListPage() {
  const me = useMe()
  const navigate = useNavigate()
  const { space, items, recipes, categories, chains, offers, loading, patchItem, removeItem } = useSpace()
  const [text, setText] = useState('')
  const [grouped, setGrouped] = useState(readGrouped)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [ordering, setOrdering] = useState(false)
  const [showChecked, setShowChecked] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [offersOf, setOffersOf] = useState<Item | null>(null)
  const [error, setError] = useState('')

  const open = useMemo(() => items.filter((i) => !i.checked).sort((a, b) => a.created.localeCompare(b.created)), [items])
  const checked = useMemo(
    () => items.filter((i) => i.checked).sort((a, b) => (b.checked_at || b.updated).localeCompare(a.checked_at || a.updated)),
    [items],
  )
  const suggestions = useMemo(() => synergies(recipes, items), [recipes, items])
  // This week's offers per open item, from the chains the group chose.
  const itemOffers = useMemo(() => {
    const index = indexOffers(offers)
    const map = new Map<string, Offer[]>()
    if (!index.length) return map
    for (const i of open) {
      const found = offersFor(i.name, index)
      if (found.length) map.set(i.id, found)
    }
    return map
  }, [offers, open])
  // The chosen store with offers on the most open items (needs 2+ stores and 2+ items to be worth saying).
  const storeTip = useMemo(() => {
    if ((space.chains?.length ?? 0) < 2) return null
    const byChain = new Map<string, { items: Item[]; discount: number; saved: number; savedItems: number }>()
    for (const i of open) {
      // Per store, the offer the item would most likely be bought as: the closest match (offersFor's order).
      const first = new Map<string, Offer>()
      for (const o of itemOffers.get(i.id) ?? []) if (!first.has(o.chain)) first.set(o.chain, o)
      for (const [chain, o] of first) {
        const e = byChain.get(chain) ?? { items: [], discount: 0, saved: 0, savedItems: 0 }
        byChain.set(chain, {
          items: [...e.items, i], discount: e.discount + o.discount_pct,
          saved: e.saved + saving(o), savedItems: e.savedItems + (saving(o) ? 1 : 0),
        })
      }
    }
    // Most items first; equal counts go to the bigger total discount.
    const ranked = [...byChain].map(([chain, e]) => ({ chain: chains.find((c) => c.id === chain), ...e }))
      .filter((r) => r.chain)
      .sort((a, b) => b.items.length - a.items.length || b.discount - a.discount)
    return ranked[0]?.items.length >= 2 ? ranked : null
  }, [space.chains, open, itemOffers, chains])
  const recipeTitles = useMemo(() => new Map(recipes.map((r) => [r.id, r.title])), [recipes])

  // Names to autocomplete: things bought before and recipe ingredients.
  const known = useMemo(() => {
    const names = new Map<string, string>()
    for (const i of items) names.set(normalize(i.name), i.name)
    for (const r of recipes) for (const ing of r.ingredients ?? []) names.set(normalize(ing.name), ing.name)
    return [...names.values()].sort()
  }, [items, recipes])

  // Crossed-off counts per section, for the x/y shown on collapsed sections.
  const checkedBySection = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of checked) {
      const key = sectionLeader(i.category, categories)?.id ?? ''
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [checked, categories])

  function toggleSection(key: string) {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
    } catch {
      // Only remembered for this session.
    }
  }

  const groups = useMemo(() => {
    if (!grouped) return [{ category: undefined as Category | undefined, items: open }]
    // Sections shown together share one group, ordered by their own position, then by when added.
    const sortOf = new Map(categories.map((c) => [c.id, c.sort]))
    const byId = new Map<string, Item[]>()
    for (const i of [...open].sort((a, b) => (sortOf.get(a.category) ?? 999) - (sortOf.get(b.category) ?? 999))) {
      const key = sectionLeader(i.category, categories)?.id ?? ''
      byId.set(key, [...(byId.get(key) ?? []), i])
    }
    return [
      ...categories.filter((c) => byId.has(c.id)).map((c) => ({ category: c, items: byId.get(c.id)! })),
      ...(byId.has('') ? [{ category: undefined, items: byId.get('')! }] : []),
    ]
  }, [grouped, open, categories])

  async function add(e: FormEvent) {
    e.preventDefault()
    const { name, quantity } = parseEntry(text)
    if (!name) return
    setText('')
    setError('')
    try {
      // Re-adding something already crossed off brings it back instead of duplicating it.
      const existing = items.find((i) => normalize(i.name) === normalize(name))
      if (existing?.checked) {
        patchItem(await col.items().update(existing.id, { checked: false, quantity: quantity || existing.quantity }))
        return
      }
      if (existing && !quantity) return
      // The server adds the amount to an open item with the same name ("Milk 1 l" + "2 l" -> "3 l").
      patchItem(await col.items().create({
        space: space.id, name: existing?.name ?? name, quantity, category: categorize(name, categories), added_by: me.id,
      }))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function toggle(item: Item) {
    const next = { ...item, checked: !item.checked, checked_at: item.checked ? '' : new Date().toISOString(), checked_by: item.checked ? '' : me.id }
    patchItem(next)
    try {
      await col.items().update(item.id, { checked: next.checked, checked_at: next.checked_at, checked_by: next.checked_by })
    } catch (err) {
      patchItem(item)
      setError(errorMessage(err))
    }
  }

  async function remove(list: Item[], question: string) {
    if (!confirm(question)) return
    list.forEach((i) => removeItem(i.id))
    await Promise.all(list.map((i) => col.items().delete(i.id).catch(() => {})))
  }

  function setGroupedPersist(on: boolean) {
    setGrouped(on)
    try {
      localStorage.setItem(GROUP_KEY, on ? 'on' : 'off')
    } catch {
      // Preference only lasts this session.
    }
  }

  return (
    <>
      <PageHeader title={t('Shopping list')}>
        <IconButton icon={Tag} label={t('Offers')} onClick={() => navigate('/offers')} />
        {items.length > 0 && (
          <IconButton icon={Trash2} label={t('Clear list')}
            onClick={() => remove(items, tn(items.length, 'Remove {n} item from the list?', 'Remove all {n} items from the list?'))} />
        )}
        {grouped && <IconButton icon={ArrowUpDown} label={t('Order sections')} onClick={() => setOrdering(true)} />}
        <IconButton
          icon={grouped ? Layers : List}
          label={grouped ? t('Grouped by store section') : t('In order added')}
          active={grouped}
          onClick={() => setGroupedPersist(!grouped)}
        />
      </PageHeader>

      <main className="mx-auto max-w-2xl space-y-3 px-4">
        <form onSubmit={add} className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 bg-bg/85 px-4 pb-2 backdrop-blur-md">
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Add item, e.g. 2 l milk')}
              list="known-items" enterKeyHint="done" autoComplete="off" aria-label={t('Add item')} />
            <Button type="submit" icon={Plus} aria-label={t('Add')} disabled={!text.trim()} />
          </div>
          <datalist id="known-items">{known.map((n) => <option key={n} value={n} />)}</datalist>
        </form>
        <ErrorText error={error} />

        {loading ? <Spinner /> : (
          <>
            {storeTip && <StoreTip ranked={storeTip} total={open.length} />}
            {suggestions.length > 0 && <Synergies suggestions={suggestions} />}

            {!open.length && !checked.length && (
              <Empty icon={ShoppingBasket} title={t('The list is empty')}>
                {t('Add what you need, or add a recipe from the Recipes tab.')}
              </Empty>
            )}
            {!open.length && !!checked.length && (
              <Empty icon={Check} title={t('All done!')}>{t('Everything on the list is in the basket.')}</Empty>
            )}

            {groups.map((g) => {
              const Icon = categoryIcon(g.category?.icon)
              const key = g.category?.id ?? ''
              const isCollapsed = grouped && collapsed.has(key)
              const done = checkedBySection.get(key) ?? 0
              return (
                <section key={key || 'other'} className="space-y-1">
                  {grouped && (
                    <h2>
                      <button onClick={() => toggleSection(key)} aria-expanded={!isCollapsed}
                        className="flex w-full items-center gap-1.5 px-1 py-0.5 text-xs font-extrabold uppercase tracking-wider text-muted">
                        <ChevronDown className={`size-3.5 transition ${isCollapsed ? '-rotate-90' : ''}`} />
                        <Icon className="size-3.5" />
                        <span className="flex-1 truncate text-left">{g.category ? sectionTitle(g.category, categories) : t('Other')}</span>
                        {isCollapsed && (
                          <span className="rounded-full bg-soft px-2 py-0.5 tabular-nums normal-case tracking-normal">
                            {done}/{done + g.items.length}
                          </span>
                        )}
                      </button>
                    </h2>
                  )}
                  {!isCollapsed && (
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
                      {g.items.map((i) => (
                        <ItemRow key={i.id} item={i} recipeTitle={recipeTitles.get(i.recipe)} onToggle={toggle} onEdit={setEditing}
                          offerCount={itemOffers.get(i.id)?.length} onOffers={setOffersOf} />
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}

            {checked.length > 0 && (
              <section className="space-y-1.5 pb-4">
                <div className="flex items-center justify-between px-1">
                  <button onClick={() => setShowChecked(!showChecked)} className="flex items-center gap-1.5 px-1 text-xs font-extrabold uppercase tracking-wider text-muted">
                    <ChevronDown className={`size-3.5 transition ${showChecked ? '' : '-rotate-90'}`} />
                    {t('In the basket ({n})', { n: checked.length })}
                  </button>
                  <button onClick={() => remove(checked, tn(checked.length, 'Remove {n} crossed-off item?', 'Remove {n} crossed-off items?'))} className="flex items-center gap-1 text-sm font-bold text-muted hover:text-danger">
                    <Trash2 className="size-4" /> {t('Clear')}
                  </button>
                </div>
                {showChecked && (
                  <>
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
                      {checked.map((i) => (
                        <ItemRow key={i.id} item={i} recipeTitle={recipeTitles.get(i.recipe)} onToggle={toggle} onEdit={setEditing} />
                      ))}
                    </ul>
                    <p className="px-1 text-xs text-muted">{t('Crossed-off items count as “at home” for your recipes until you clear them.')}</p>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <ItemSheet item={editing} onClose={() => setEditing(null)} />
      <OffersSheet name={offersOf ? proper(offersOf.name) : ''} offers={offersOf ? itemOffers.get(offersOf.id) ?? [] : []}
        chains={chains} onClose={() => setOffersOf(null)} />
      <Sheet open={ordering} onClose={() => setOrdering(false)} title={t('Order sections')}>
        <p className="mb-3 text-sm text-muted">{t('Drag sections into the order you walk the store. Other is always last.')}</p>
        <SectionOrder categories={categories} />
      </Sheet>
    </>
  )
}

function ItemRow({ item, recipeTitle, onToggle, onEdit, offerCount, onOffers }: {
  item: Item; recipeTitle?: string; onToggle: (i: Item) => void; onEdit: (i: Item) => void
  offerCount?: number; onOffers?: (i: Item) => void
}) {
  return (
    <li className="flex items-center">
      <button onClick={() => onToggle(item)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-soft"
        aria-pressed={item.checked}>
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition ${item.checked ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>
          {item.checked && <Check className="size-4" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold ${item.checked ? 'text-muted line-through' : ''}`}>
            {proper(item.name)}
            {item.quantity && <span className="ml-2 font-normal text-muted">{item.quantity}</span>}
          </span>
          {recipeTitle && (
            <span className="flex items-center gap-1 truncate text-xs text-muted">
              <BookOpen className="size-3" /> {recipeTitle}
            </span>
          )}
        </span>
      </button>
      {!!offerCount && onOffers && <OfferBadge count={offerCount} onClick={() => onOffers(item)} />}
      <IconButton icon={Pencil} label={t('Edit {name}', { name: item.name })} onClick={() => onEdit(item)} className="mr-1" />
    </li>
  )
}

/** Recommends the store with offers on the most items on the list, with how the others compare. */
function StoreTip({ ranked, total }: { ranked: { chain?: Chain; items: Item[]; saved: number; savedItems: number }[]; total: number }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  const [best, ...rest] = ranked
  return (
    <section className="rounded-3xl bg-brand-soft p-4">
      <div className="mb-2 flex items-center gap-2">
        <Store className="size-5 text-brand-text" />
        <h2 className="flex-1 font-extrabold">{t('Best store this week')}</h2>
        <button className="text-sm font-bold text-brand-text" onClick={() => setHidden(true)}>{t('Hide')}</button>
      </div>
      <Link to="/offers" className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
        <ChainLogo chain={best.chain} className="h-9 w-20" />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">{t('Offers on {n} of {total} items', { n: best.items.length, total })}</span>
          <span className="block truncate text-xs text-muted">{best.items.map((i) => proper(i.name)).join(', ')}</span>
          {best.saved > 0 && (
            <span className="block text-xs">
              <b className="text-brand-text">{t('Save about {amount}', { amount: formatPrice(best.saved, true) })}</b>{' '}
              <span className="text-muted">{tn(best.savedItems, '(before-price known for {n} item)', '(before-price known for {n} items)')}</span>
            </span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted" />
      </Link>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-xs font-bold text-muted">
          {rest.map((r) => (
            <span key={r.chain!.id} className="flex items-center gap-1.5">
              <ChainLogo chain={r.chain} className="h-5 w-12" /> {r.items.length}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function Synergies({ suggestions }: { suggestions: ReturnType<typeof synergies> }) {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null
  return (
    <section className="rounded-3xl bg-brand-soft p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-5 text-brand-text" />
        <h2 className="flex-1 font-extrabold">{t('Make more of this shop')}</h2>
        <button className="text-sm font-bold text-brand-text" onClick={() => setHidden(true)}>{t('Hide')}</button>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {suggestions.map(({ recipe, matched, missing }) => (
          <Link key={recipe.id} to={`/recipes/${recipe.id}`}
            className="flex w-64 shrink-0 snap-start gap-3 rounded-2xl bg-card p-2 pr-3 shadow-sm">
            {recipe.image ? (
              <img src={recipeImage(recipe, '120x120')} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-soft text-muted"><BookOpen className="size-6" /></span>
            )}
            <span className="min-w-0 py-0.5">
              <span className="block truncate font-extrabold">{recipe.title}</span>
              <span className="block text-sm text-brand-text">{tn(matched.length, 'Uses {n} item on your list', 'Uses {n} items on your list')}</span>
              <span className="block truncate text-xs text-muted">
                {missing.length ? `+ ${missing.map(proper).join(', ')}` : t('Nothing extra needed')}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ItemSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { categories, patchItem, removeItem } = useSpace()
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastId, setLastId] = useState('')

  if (item && item.id !== lastId) {
    setLastId(item.id)
    setName(item.name)
    setQuantity(item.quantity)
    setCategory(categories.some((c) => c.id === item.category) ? item.category : '')
    setError('')
  }

  function close() {
    setLastId('')
    onClose()
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!item) return
    setBusy(true)
    try {
      const updated = await col.items().update(item.id, { name: name.trim(), quantity: quantity.trim(), category })
      patchItem(updated)
      if (category && category !== item.category) await learnKeyword(updated.name, category, categories)
      close()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!item) return
    removeItem(item.id)
    close()
    await col.items().delete(item.id).catch(() => {})
  }

  return (
    <Sheet open={!!item} onClose={close} title={t('Edit item')}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label={t('Item')}><Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('Amount')}><Input maxLength={40} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="2 pk" /></Field>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-muted">{t('Store section')}</span>
          <div className="flex flex-wrap gap-1.5">
            {[...categories, undefined].map((c) => {
              const Icon = categoryIcon(c?.icon)
              const id = c?.id ?? ''
              return (
                <button type="button" key={id || 'other'} onClick={() => setCategory(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${category === id ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
                  <Icon className="size-4" /> {c ? categoryName(c) : t('Other')}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="danger" icon={Trash2} onClick={remove} aria-label={t('Delete item')} />
          <Button type="submit" icon={Check} className="flex-1" busy={busy}>{t('Save')}</Button>
        </div>
        <ErrorText error={error} />
      </form>
    </Sheet>
  )
}
