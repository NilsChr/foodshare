import { Check, ChevronLeft, Plus, Search, SlidersHorizontal, Store, Tag } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ChainLogo, OfferRow, OfferSorts, OffersNote, useOfferSort } from '../components/offers'
import { Button, Empty, ErrorText, IconButton, Input, PageHeader } from '../components/ui'
import { useMe } from '../lib/auth'
import { OFFER_CATEGORIES, offerCategoryIcon, offerCategoryName, sectionForOffer } from '../lib/categories'
import { categorize, indexOffers, normalize, proper, searchOffers } from '../lib/match'
import { col, errorMessage, type Offer } from '../lib/pb'
import { useSpace } from '../lib/space'
import { t } from '../lib/i18n'

const PAGE = 50

/** List name for an offer: flyer headings are often all caps ("GILDE GRILLPØLSER" -> "Gilde grillpølser"). */
function itemName(offer: Offer) {
  const heading = offer.heading.trim()
  return proper(heading === heading.toUpperCase() ? heading.toLowerCase() : heading)
}

/**
 * One filter row that drops in from above when `open`, or folds back up. `index` of `count`
 * staggers the rows: they open top first and close bottom first. A closed row is inert.
 */
function Drop({ open, index, count, children }: { open: boolean; index: number; count: number; children: ReactNode }) {
  const transitionDelay = `${(open ? index : count - 1 - index) * 70}ms`
  return (
    <div inert={!open} style={{ gridTemplateRows: open ? '1fr' : '0fr', transitionDelay }}
      className="-mx-4 grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none">
      <div className="min-h-0 overflow-hidden">
        <div style={{ transitionDelay }}
          className={`pt-2 transition duration-300 ease-out motion-reduce:transition-none ${open ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** This week's offers from the group's stores: search, filter by store, add to the list. */
export default function OffersPage() {
  const me = useMe()
  const { space, chains, offers, items, categories, patchItem } = useSpace()
  const navigate = useNavigate()
  const location = useLocation()
  // Opened straight from a link or reload there is no page to go back to; go to the list.
  const back = <IconButton icon={ChevronLeft} label={t('Back')} onClick={() => (location.key === 'default' ? navigate('/list') : navigate(-1))} className="-ml-2 text-ink" />
  const [query, setQuery] = useState('')
  // Chosen stores; none means all of them.
  const [picked, setPicked] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const sorting = useOfferSort()
  // Filter rows stay folded away until asked for; the filters apply either way.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(chains.map((c) => [c.id, c])), [chains])
  const stores = chains.filter((c) => space.chains?.includes(c.id))
  const index = useMemo(() => indexOffers(offers), [offers])
  const open = useMemo(() => new Set(items.filter((i) => !i.checked).map((i) => normalize(i.name))), [items])

  const list = useMemo(() => {
    // Search: closest headings first. Browsing: biggest discounts first.
    const found = query.trim()
      ? searchOffers(query, index)
      : [...offers].sort((a, b) => b.discount_pct - a.discount_pct || a.heading.localeCompare(b.heading))
    return picked.length ? found.filter((o) => picked.includes(o.chain)) : found
  }, [query, index, offers, picked])
  // Categories present in what the search and store filter left, in store-walk order.
  const present = useMemo(() => OFFER_CATEGORIES.filter((c) => list.some((o) => o.category === c)), [list])
  // A category the other filters left empty is ignored rather than showing nothing.
  const active = present.includes(category) ? category : ''
  const rows = present.length > 1 ? 3 : 2
  const filters = (picked.length ? 1 : 0) + (sorting.sort !== 'match' ? 1 : 0) + (active ? 1 : 0)
  const shownList = sorting.apply(active ? list.filter((o) => o.category === active) : list)

  /** Tap a store to add it to or take it out of the filter. Every store picked is the same as all. */
  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]
    setPicked(next.length === stores.length ? [] : next)
    setShown(PAGE)
  }

  async function add(offer: Offer) {
    const name = itemName(offer)
    setError('')
    try {
      // Same as typing it on the list: a crossed-off item comes back instead of being duplicated.
      const existing = items.find((i) => normalize(i.name) === normalize(name))
      if (existing?.checked) patchItem(await col.items().update(existing.id, { checked: false }))
      else if (!existing) {
        patchItem(await col.items().create({ space: space.id, name, quantity: '', category: categorize(name, categories) || sectionForOffer(offer.category, categories), added_by: me.id }))
      }
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (!stores.length) {
    return (
      <>
        <PageHeader title={t('Offers')} back={back} />
        <main className="mx-auto max-w-2xl px-4">
          <Empty icon={Store} title={t('No stores yet')}>
            {t('Add the stores you shop at to see this week’s offers from them on the list.')}
          </Empty>
          <Link to="/space" className="mx-auto mt-2 flex h-11 w-fit items-center gap-2 rounded-2xl bg-brand px-4 font-bold text-brand-ink shadow-sm">
            <Plus className="size-5" strokeWidth={2.25} /> {t('Add stores')}
          </Link>
        </main>
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('Offers')} back={back} />
      <main className="mx-auto max-w-2xl space-y-3 px-4">
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 bg-bg/85 px-4 pb-2 backdrop-blur-md">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-3 size-5 text-muted" />
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE) }} placeholder={t('Search offers, e.g. kylling')}
                className="pl-11" type="search" enterKeyHint="search" aria-label={t('Search offers')} />
            </div>
            <button onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}
              aria-label={filters ? t('Filters ({n} on)', { n: filters }) : t('Filters')} title={t('Filters')}
              className={`relative flex size-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 ${filtersOpen ? 'bg-brand text-brand-ink' : 'bg-card ring-1 ring-line'}`}>
              <SlidersHorizontal className="size-5" strokeWidth={2.25} />
              {filters > 0 && !filtersOpen && (
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand text-xs font-extrabold text-brand-ink">{filters}</span>
              )}
            </button>
          </div>
          <Drop open={filtersOpen} index={0} count={rows}>
            <div className="flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
              <button onClick={() => { setPicked([]); setShown(PAGE) }} aria-pressed={!picked.length}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold transition ${!picked.length ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
                {t('All stores')}
              </button>
              {stores.map((c) => (
                <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={picked.includes(c.id)} aria-label={c.name}
                  className={`shrink-0 rounded-full p-1 transition ${picked.includes(c.id) ? 'bg-brand' : 'bg-soft'}`}>
                  <ChainLogo chain={c} className="h-6 w-16" />
                </button>
              ))}
            </div>
          </Drop>
          <Drop open={filtersOpen} index={1} count={rows}>
            <OfferSorts {...sorting} pick={(k) => { sorting.pick(k); setShown(PAGE) }} matchLabel={query.trim() ? 'Best match' : 'Biggest discount'} className="px-4" />
          </Drop>
          {present.length > 1 && (
            <Drop open={filtersOpen} index={2} count={rows}>
              <div className="flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                {['', ...present].map((c) => {
                  const Icon = c ? offerCategoryIcon(c) : Tag
                  return (
                    <button key={c || 'all'} onClick={() => { setCategory(c); setShown(PAGE) }} aria-pressed={active === c}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${active === c ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
                      <Icon className="size-4" /> {c ? offerCategoryName(c) : t('All')}
                    </button>
                  )
                })}
              </div>
            </Drop>
          )}
        </div>
        <ErrorText error={error} />

        {shownList.length ? (
          <>
            <ul className="divide-y divide-line rounded-2xl bg-card px-4 ring-1 ring-line">
              {shownList.slice(0, shown).map((o) => {
                const onList = open.has(normalize(itemName(o)))
                return (
                  <OfferRow key={o.id} offer={o} chain={byId.get(o.chain)} action={
                    <IconButton icon={onList ? Check : Plus} active={onList} disabled={onList}
                      label={onList ? t('On the list') : t('Add {name} to the list', { name: itemName(o) })}
                      onClick={() => add(o)} className="-mr-2 bg-soft" />
                  } />
                )
              })}
            </ul>
            {shownList.length > shown && (
              <Button variant="soft" className="w-full" onClick={() => setShown(shown + PAGE)}>
                {t('Show more ({n})', { n: shownList.length - shown })}
              </Button>
            )}
            <OffersNote />
          </>
        ) : (
          <Empty icon={Tag} title={t('No offers found')}>
            {query.trim() ? t('Try another word.') : t('The flyers are updated every night.')}
          </Empty>
        )}
      </main>
    </>
  )
}
