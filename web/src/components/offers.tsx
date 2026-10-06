import { Tag } from 'lucide-react'
import type { ReactNode } from 'react'
import { shortDate } from '../lib/dates'
import { t } from '../lib/i18n'
import { formatPrice } from '../lib/offers'
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
        {action}
      </div>
    </li>
  )
}

export function OffersNote() {
  return <p className="px-1 pt-2 text-xs text-muted">{t('From this week’s flyers. Prices and stock can vary between stores.')}</p>
}

/** This week's offers matching a list item, closest match first. */
export function OffersSheet({ name, offers, chains, onClose }: {
  name: string; offers: Offer[]; chains: Chain[]; onClose: () => void
}) {
  const byId = new Map(chains.map((c) => [c.id, c]))
  return (
    <Sheet open={!!name} onClose={onClose} title={t('Offers: {name}', { name })}>
      <ul className="divide-y divide-line">
        {offers.map((o) => <OfferRow key={o.id} offer={o} chain={byId.get(o.chain)} />)}
      </ul>
      <OffersNote />
    </Sheet>
  )
}
