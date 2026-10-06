import { Check, Plus, Search, Store, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChainLogo, OfferRow, OffersNote } from '../components/offers'
import { Button, Empty, ErrorText, IconButton, Input, PageHeader } from '../components/ui'
import { useMe } from '../lib/auth'
import { OFFER_CATEGORIES, offerCategoryIcon, offerCategoryName, sectionForOffer } from '../lib/categories'
import { categorize, indexOffers, normalize, offersFor, proper } from '../lib/match'
import { col, errorMessage, type Offer } from '../lib/pb'
import { useSpace } from '../lib/space'
import { t } from '../lib/i18n'

const PAGE = 50

/** List name for an offer: flyer headings are often all caps ("GILDE GRILLPØLSER" -> "Gilde grillpølser"). */
function itemName(offer: Offer) {
  const heading = offer.heading.trim()
  return proper(heading === heading.toUpperCase() ? heading.toLowerCase() : heading)
}

/** This week's offers from the group's stores: search, filter by store, add to the list. */
export default function OffersPage() {
  const me = useMe()
  const { space, chains, offers, items, categories, patchItem } = useSpace()
  const [query, setQuery] = useState('')
  const [chain, setChain] = useState('')
  const [category, setCategory] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [error, setError] = useState('')

  const byId = useMemo(() => new Map(chains.map((c) => [c.id, c])), [chains])
  const stores = chains.filter((c) => space.chains?.includes(c.id))
  const index = useMemo(() => indexOffers(offers), [offers])
  const open = useMemo(() => new Set(items.filter((i) => !i.checked).map((i) => normalize(i.name))), [items])

  const list = useMemo(() => {
    // Search: closest headings first. Browsing: biggest discounts first.
    const found = query.trim()
      ? offersFor(query, index)
      : [...offers].sort((a, b) => b.discount_pct - a.discount_pct || a.heading.localeCompare(b.heading))
    return chain ? found.filter((o) => o.chain === chain) : found
  }, [query, index, offers, chain])
  // Categories present in what the search and store filter left, in store-walk order.
  const present = useMemo(() => OFFER_CATEGORIES.filter((c) => list.some((o) => o.category === c)), [list])
  // A category the other filters left empty is ignored rather than showing nothing.
  const active = present.includes(category) ? category : ''
  const shownList = active ? list.filter((o) => o.category === active) : list

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
        <PageHeader title={t('Offers')} />
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
      <PageHeader title={t('Offers')} />
      <main className="mx-auto max-w-2xl space-y-3 px-4">
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 -mx-4 space-y-2 bg-bg/85 px-4 pb-2 backdrop-blur-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3 size-5 text-muted" />
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE) }} placeholder={t('Search offers, e.g. kylling')}
              className="pl-11" type="search" enterKeyHint="search" aria-label={t('Search offers')} />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
            <button onClick={() => { setChain(''); setShown(PAGE) }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold transition ${!chain ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
              {t('All stores')}
            </button>
            {stores.map((c) => (
              <button key={c.id} onClick={() => { setChain(c.id); setShown(PAGE) }} aria-pressed={chain === c.id} aria-label={c.name}
                className={`shrink-0 rounded-full p-1 transition ${chain === c.id ? 'bg-brand' : 'bg-soft'}`}>
                <ChainLogo chain={c} className="h-6 w-16" />
              </button>
            ))}
          </div>
          {present.length > 1 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
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
