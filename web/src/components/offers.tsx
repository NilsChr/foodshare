import { ArrowDown, ArrowUp, ChevronDown, Tag } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/** Small "3 offers" button for a list row. `similar`: only similar offers, shown muted without a count. */
export function OfferBadge({ count, similar = false, onClick }: { count: number; similar?: boolean; onClick: () => void }) {
  const label = t(similar ? 'Similar offers ({n})' : '{n} offers', { n: count })
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-extrabold active:scale-95 ${similar ? 'bg-soft text-muted' : 'bg-brand-soft text-brand-text'}`}>
      <Tag className="size-3.5" strokeWidth={2.5} /> {!similar && count}
    </button>
  )
}

/**
 * One offer: photo, heading, flyer text, chain, price. `action` goes at the far right (e.g. an add button).
 * Tapping the row shows the photo full screen.
 */
export function OfferRow({ offer: o, chain, action }: { offer: Offer; chain?: Chain; action?: ReactNode }) {
  // The thumbnail being shown full screen; null when closed.
  const [zoom, setZoom] = useState<HTMLImageElement | null>(null)
  const thumb = useRef<HTMLImageElement>(null)
  return (
    <li className={`flex gap-3 py-3 ${o.image ? 'cursor-zoom-in' : ''}`} onClick={() => setZoom(thumb.current)}>
      {o.image ? (
        // The row takes taps; the button gives keyboard and screen reader users the same.
        <button aria-label={t('Show image')} className="shrink-0">
          <img ref={thumb} src={o.image} alt="" loading="lazy"
            className={`size-16 rounded-xl bg-white object-contain ring-1 ring-line ${zoom ? 'invisible' : ''}`} />
        </button>
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
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {zoom && <ImageZoom thumb={zoom} alt={o.heading} onClose={() => setZoom(null)} />}
    </li>
  )
}

/** Where an image of `width` x `height` shows when fitted (object-contain) into `box`, less `pad` on each side. */
function fit(width: number, height: number, box: { left: number; top: number; width: number; height: number }, pad = 0) {
  const scale = Math.min((box.width - 2 * pad) / width, (box.height - 2 * pad) / height)
  const w = width * scale
  const h = height * scale
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h }
}

/**
 * The thumbnail's photo full screen, growing out of the thumbnail and shrinking back into it.
 * Any tap or Escape closes it. Its own modal <dialog>, so it stacks above an open Sheet.
 */
function ImageZoom({ thumb, alt, onClose }: { thumb: HTMLImageElement; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const shade = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  // Not loaded yet (lazy): assume square.
  const natural = [thumb.naturalWidth || 1, thumb.naturalHeight || 1] as const
  const [target] = useState(() => fit(...natural, { left: 0, top: 0, width: innerWidth, height: innerHeight }, 16))

  // The image's box and corners when it sits exactly over the thumbnail. Animating the box rather
  // than a scale transform keeps the corners round all the way (a scale would shrink the radius).
  const atThumb = (offset: number) => {
    const r = thumb.getBoundingClientRect()
    const borderRadius = getComputedStyle(thumb).borderRadius
    return { offset, left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius }
  }
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280
  const easing = 'cubic-bezier(0.2, 0, 0, 1)'

  // Once, on open.
  useEffect(() => {
    dialog.current?.showModal()
    img.current?.animate([atThumb(0)], { duration, easing })
    shade.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    if (closing.current) return
    closing.current = true
    shade.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: 'forwards' })
    const anim = img.current?.animate([atThumb(1)], { duration, easing, fill: 'forwards' })
    if (anim) anim.onfinish = onClose
    else onClose()
  }

  return (
    <dialog ref={dialog} aria-label={alt} onClick={close} onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-transparent">
      <div ref={shade} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <img ref={img} src={thumb.currentSrc || thumb.src} alt={alt} className="fixed rounded-2xl bg-white object-contain"
        style={{ left: target.left, top: target.top, width: target.width, height: target.height }} />
    </dialog>
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

type SortKey = keyof typeof SORTS

/**
 * Offer sort state. The first sort keeps the order the offers come in; tapping the active price
 * sort flips its direction, picking another sort starts low to high.
 */
export function useOfferSort() {
  const [sort, setSort] = useState<SortKey>('match')
  const [desc, setDesc] = useState(false)
  const pick = (k: SortKey) => {
    if (k === sort) setDesc(SORTS[k].directed && !desc)
    else {
      setSort(k)
      setDesc(false)
    }
  }
  return { sort, desc, pick, apply: (offers: Offer[]) => SORTS[sort].sort(offers, desc) }
}

/** Sort chips for useOfferSort. `matchLabel` names the incoming order (default "Best match"). */
export function OfferSorts({ sort, desc, pick, matchLabel = 'Best match', className = '' }: ReturnType<typeof useOfferSort> & {
  matchLabel?: string; className?: string
}) {
  const Arrow = desc ? ArrowDown : ArrowUp
  return (
    <div className={`flex gap-1.5 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {(Object.keys(SORTS) as SortKey[]).map((k) => {
        const label = t(k === 'match' ? matchLabel : SORTS[k].label)
        return (
          <button key={k} onClick={() => pick(k)} aria-pressed={sort === k}
            aria-label={sort === k && SORTS[k].directed ? `${label}, ${t(desc ? 'high to low' : 'low to high')}` : undefined}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold transition ${sort === k ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
            {label}
            {sort === k && SORTS[k].directed && <Arrow className="size-4" strokeWidth={2.5} />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * This week's offers matching a list item, closest match first unless sorted by price.
 * `similar` (same product type, not confirmed as the item) sits collapsed below them.
 */
export function OffersSheet({ name, offers, similar = [], chains, onClose }: {
  name: string; offers: Offer[]; similar?: Offer[]; chains: Chain[]; onClose: () => void
}) {
  const sorting = useOfferSort()
  const [showSimilar, setShowSimilar] = useState(false)
  // With nothing confirmed, the similar offers are all there is: show them open.
  const similarOpen = showSimilar || !offers.length
  const byId = new Map(chains.map((c) => [c.id, c]))
  return (
    <Sheet open={!!name} onClose={onClose} title={t('Offers: {name}', { name })}>
      {offers.length > 1 && <OfferSorts {...sorting} />}
      <ul className="divide-y divide-line">
        {sorting.apply(offers).map((o) => <OfferRow key={o.id} offer={o} chain={byId.get(o.chain)} />)}
      </ul>
      {similar.length > 0 && (
        <>
          <button onClick={() => setShowSimilar(!similarOpen)} aria-expanded={similarOpen}
            className="flex items-center gap-1.5 px-1 pt-3 text-xs font-extrabold uppercase tracking-wider text-muted">
            <ChevronDown className={`size-3.5 transition ${similarOpen ? '' : '-rotate-90'}`} />
            {t('Similar offers ({n})', { n: similar.length })}
          </button>
          {similarOpen && (
            <ul className="divide-y divide-line">
              {sorting.apply(similar).map((o) => <OfferRow key={o.id} offer={o} chain={byId.get(o.chain)} />)}
            </ul>
          )}
        </>
      )}
      <OffersNote />
    </Sheet>
  )
}
