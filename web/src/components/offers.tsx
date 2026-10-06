import { ArrowDown, ArrowUp, Tag } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { shortDate } from '../lib/dates'
import { t } from '../lib/i18n'
import { byUnitPrice, formatPrice, unitPrice } from '../lib/offers'
import type { Chain, Offer } from '../lib/pb'
import { Sheet } from './ui'

/** The chain's logo on a white plate (logos are made for white), or its initial in brand color. */
export function ChainLogo({ chain, className = 'h-6 w-16' }: { chain?: Chain; className?: string }) {
  if (chain?.logo) {
    return (
      <img src={chain.logo} alt={chain.name} title={chain.name} loading="lazy"
        className={`${className} shrink-0 rounded-md bg-white object-contain px-1 py-0.5 ring-1 ring-line`} />
    )
  }
  return (
    <span title={chain?.name} style={{ backgroundColor: chain?.color ? `#${chain.color}` : undefined }}
      className={`${className} inline-flex shrink-0 items-center justify-center rounded-md bg-soft px-1 text-xs font-extrabold text-white`}>
      {chain?.name ?? '?'}
    </span>
  )
}

/** Small "3 offers" button for a list row. */
export function OfferBadge({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={t('{n} offers', { n: count })} title={t('{n} offers', { n: count })}
      className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-xs font-extrabold text-brand-text active:scale-95">
      <Tag className="size-3.5" strokeWidth={2.5} /> {count}
    </button>
  )
}

/** One offer: photo, heading, flyer text, chain, price. `action` goes at the far right (e.g. an add button). */
export function OfferRow({ offer: o, chain, action }: { offer: Offer; chain?: Chain; action?: ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      {o.image ? (
        <img src={o.image} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl bg-white object-contain ring-1 ring-line" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-soft text-muted"><Tag className="size-6" /></span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-extrabold leading-tight">{o.heading}</p>
        {o.description && <p className="line-clamp-2 whitespace-pre-line text-xs text-muted">{o.description}</p>}
        <div className="flex items-center gap-2 text-xs text-muted">
          <ChainLogo chain={chain} className="h-5 w-14" />
          {o.run_till && <span>{t('until {date}', { date: shortDate(new Date(o.run_till.replace(' ', 'T'))) })}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <p className="font-extrabold tabular-nums">{formatPrice(o.price)}</p>
        {o.pre_price > o.price && <p className="text-xs text-muted line-through tabular-nums">{formatPrice(o.pre_price)}</p>}
        {o.discount_pct > 0 && <p className="text-xs font-bold text-brand-text">−{o.discount_pct}%</p>}
        <UnitPrice offer={o} />
        {action}
      </div>
    </li>
  )
}

/** "fra 99,83 kr/kg" under the price, when the flyer gives a size. */
function UnitPrice({ offer }: { offer: Offer }) {
  const u = unitPrice(offer)
  // A loose 1 kg / single piece offer is already priced per unit.
  if (!u || Math.abs(u.from - offer.price) < 0.01) return null
  const text = `${formatPrice(u.from)}/${t(u.unit)}`
  return <p className="text-xs text-muted tabular-nums">{u.range ? t('from {price}', { price: text }) : text}</p>
}

export function OffersNote() {
  return <p className="px-1 pt-2 text-xs text-muted">{t('From this week’s flyers. Prices and stock can vary between stores.')}</p>
}

// `desc` sorts dearest first; best match has no direction.
const SORTS = {
  match: { label: 'Best match', sort: (offers: Offer[]) => offers, directed: false },
  price: { label: 'Price', sort: (offers: Offer[], desc: boolean) => [...offers].sort((a, b) => (desc ? b.price - a.price : a.price - b.price)), directed: true },
  unit: { label: 'Price per kg/l', sort: byUnitPrice, directed: true },
}

/** This week's offers matching a list item, closest match first unless sorted by price. */
export function OffersSheet({ name, offers, chains, onClose }: {
  name: string; offers: Offer[]; chains: Chain[]; onClose: () => void
}) {
  const [sort, setSort] = useState<keyof typeof SORTS>('match')
  const [desc, setDesc] = useState(false)
  // Tapping the active price sort flips its direction; picking another sort starts low to high.
  const pick = (k: keyof typeof SORTS) => {
    if (k === sort) setDesc(SORTS[k].directed && !desc)
    else {
      setSort(k)
      setDesc(false)
    }
  }
  const Arrow = desc ? ArrowDown : ArrowUp
  const byId = new Map(chains.map((c) => [c.id, c]))
  return (
    <Sheet open={!!name} onClose={onClose} title={t('Offers: {name}', { name })}>
      {offers.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
            <button key={k} onClick={() => pick(k)} aria-pressed={sort === k}
              aria-label={sort === k && SORTS[k].directed ? `${t(SORTS[k].label)}, ${t(desc ? 'high to low' : 'low to high')}` : undefined}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold transition ${sort === k ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
              {t(SORTS[k].label)}
              {sort === k && SORTS[k].directed && <Arrow className="size-4" strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
      <ul className="divide-y divide-line">
        {SORTS[sort].sort(offers, desc).map((o) => <OfferRow key={o.id} offer={o} chain={byId.get(o.chain)} />)}
      </ul>
      <OffersNote />
    </Sheet>
  )
}
