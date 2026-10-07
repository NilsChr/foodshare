import { ChevronDown, ChevronLeft, PiggyBank } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ChainLogo } from '../components/offers'
import { Empty, IconButton, PageHeader, RollingNumber, Spinner } from '../components/ui'
import { locale, t, tn } from '../lib/i18n'
import { proper } from '../lib/match'
import { formatPrice, saving } from '../lib/offers'
import { col, pb, type Chain, type Purchase } from '../lib/pb'
import { useSpace } from '../lib/space'

// Months shown in the chart: at least this many (so a new group's first month isn't one fat bar), at most a year.
const MIN_MONTHS = 6
const MAX_MONTHS = 12

const parseDate = (s: string) => new Date(s.replace(' ', 'T'))
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const dayKey = (d: Date) => `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`

/** Everything the group saved on picked offers: total, per month, and what was bought. */
export default function SavingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { space, chains } = useSpace()
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [picked, setPicked] = useState('')

  useEffect(() => {
    let alive = true
    col.purchases().getFullList({ filter: pb.filter('space = {:id}', { id: space.id }), sort: '-created' })
      .then((list) => alive && setPurchases(list))
      .catch(() => alive && setPurchases([]))
    return () => {
      alive = false
    }
  }, [space.id])

  const stats = useMemo(() => {
    if (!purchases?.length) return null
    const first = parseDate(purchases[purchases.length - 1].created)
    const now = new Date()
    // Every month from the first purchase (or MIN_MONTHS back) to now, the last MAX_MONTHS of them.
    const span = Math.max(MIN_MONTHS, (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1)
    const months = Array.from({ length: Math.min(span, MAX_MONTHS) }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - Math.min(span, MAX_MONTHS) + 1 + i, 1)
      return { key: monthKey(d), date: d, saved: 0 }
    })
    const byMonth = new Map(months.map((m) => [m.key, m]))
    for (const p of purchases) {
      const m = byMonth.get(monthKey(parseDate(p.created)))
      if (m) m.saved += saving(p)
    }
    return {
      first,
      months,
      total: purchases.reduce((sum, p) => sum + saving(p), 0),
      // A shopping trip is a day the basket was cleared.
      trips: new Set(purchases.map((p) => dayKey(parseDate(p.created)))).size,
    }
  }, [purchases])

  const back = <IconButton icon={ChevronLeft} label={t('Back')} onClick={() => (location.key === 'default' ? navigate('/space') : navigate(-1))} className="-ml-2 text-ink" />

  if (!purchases || !stats) {
    return (
      <>
        <PageHeader title={t('Savings')} back={back} />
        <main className="mx-auto max-w-2xl px-4">
          {purchases ? (
            <Empty icon={PiggyBank} title={t('Nothing saved yet')}>
              {t('Pick offers on the shopping list. What they save shows up here when you clear the basket.')}
            </Empty>
          ) : <Spinner />}
        </main>
      </>
    )
  }

  // The month shown: the one tapped, else the latest.
  const month = stats.months.find((m) => m.key === picked) ?? stats.months[stats.months.length - 1]
  const days = new Map<string, Purchase[]>()
  for (const p of purchases) {
    const d = parseDate(p.created)
    if (monthKey(d) === month.key) days.set(dayKey(d), [...(days.get(dayKey(d)) ?? []), p])
  }
  const byId = new Map(chains.map((c) => [c.id, c]))

  return (
    <>
      <PageHeader title={t('Savings')} back={back} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pb-6">
        <section className="rounded-3xl bg-brand-soft p-5 text-center">
          <PiggyBank className="mx-auto size-10 text-brand-text" />
          <p className="mt-1 text-4xl font-black text-brand-text"><RollingNumber text={formatPrice(stats.total, true)} /></p>
          <p className="text-sm">
            {t('saved on offers since {date}', { date: stats.first.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat value={stats.trips} label={tn(stats.trips, 'shopping trip', 'shopping trips')} />
            <Stat value={purchases.length} label={tn(purchases.length, 'item on offer', 'items on offer')} />
          </div>
        </section>

        <MonthChart months={stats.months} selected={month.key} onSelect={setPicked} />

        {days.size ? (
          <section className="space-y-1.5">
            <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-muted">{t('Shopping trips')}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
              {[...days].map(([key, list]) => <Trip key={key} purchases={list} chains={byId} />)}
            </ul>
          </section>
        ) : (
          <p className="px-1 text-center text-sm text-muted">{t('Nothing bought on offer this month.')}</p>
        )}
      </main>
    </>
  )
}

/** One day's shopping: date, items, paid and saved; tap to show what was bought. */
function Trip({ purchases, chains }: { purchases: Purchase[]; chains: Map<string, Chain> }) {
  const [open, setOpen] = useState(false)
  const paid = purchases.reduce((sum, p) => sum + p.price, 0)
  const saved = purchases.reduce((sum, p) => sum + saving(p), 0)
  return (
    <li>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-soft">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold first-letter:uppercase">
            {parseDate(purchases[0].created).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <span className="block truncate text-sm text-muted tabular-nums">
            {tn(purchases.length, '{n} item', '{n} items')} · {t('paid {amount}', { amount: formatPrice(paid, true) })}
          </span>
        </span>
        {saved > 0 && (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-sm font-extrabold text-brand-text tabular-nums">
            −{formatPrice(saved, true)}
          </span>
        )}
        <ChevronDown className={`size-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="divide-y divide-line bg-soft/50 px-4">
          {purchases.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{proper(p.name)}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <ChainLogo chain={chains.get(p.chain)} className="h-4 w-10" />
                  <span className="truncate">{p.heading}</span>
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <span className="block font-bold">{formatPrice(p.price)}</span>
                {saving(p) > 0 ? (
                  <span className="block text-xs font-bold text-brand-text">−{formatPrice(saving(p))}</span>
                ) : <span className="block text-xs text-muted">{t('no before-price')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-card/60 px-3 py-2">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

/**
 * Saved per month as bars. Tapping (or hovering, or focusing) a bar picks that month: it is drawn
 * full strength with its amount above the chart, and the purchases below are that month's.
 */
function MonthChart({ months, selected, onSelect }: {
  months: { key: string; date: Date; saved: number }[]; selected: string; onSelect: (key: string) => void
}) {
  // Bars grow from the baseline when the page opens.
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const max = Math.max(...months.map((m) => m.saved))
  const current = months.find((m) => m.key === selected)!
  const label = (m: { date: Date }, style: 'short' | 'long') => m.date.toLocaleDateString(locale, { month: style, ...(style === 'long' && { year: 'numeric' }) })

  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-line">
      <p className="text-sm font-bold text-muted first-letter:uppercase">{label(current, 'long')}</p>
      <p className="text-2xl font-black tabular-nums" aria-live="polite">{formatPrice(current.saved, true)}</p>
      <div className="mt-4 flex h-36 items-end gap-0.5 border-b border-line" role="group" aria-label={t('Saved per month')}>
        {months.map((m, i) => {
          const on = m.key === selected
          return (
            <button key={m.key} onClick={() => onSelect(m.key)} onMouseEnter={() => onSelect(m.key)} onFocus={() => onSelect(m.key)}
              aria-pressed={on} aria-label={`${label(m, 'long')}: ${formatPrice(m.saved, true)}`}
              className="flex h-full flex-1 items-end justify-center rounded-t-md hover:bg-soft/50">
              <span className={`w-full max-w-8 rounded-t-[4px] bg-chart ${on ? '' : 'opacity-40'}`}
                style={{
                  height: (grown || reduced) && max > 0 ? `${(m.saved / max) * 100}%` : 0,
                  // Bars grow one after another; picking a month changes strength at once.
                  transition: reduced ? 'none' : `height 700ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 40}ms, opacity 150ms`,
                }} />
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-0.5" aria-hidden>
        {months.map((m) => (
          <span key={m.key} className={`flex-1 text-center text-[11px] ${m.key === selected ? 'font-extrabold text-ink' : 'text-muted'}`}>
            {label(m, 'short').replace('.', '')}
          </span>
        ))}
      </div>
    </section>
  )
}
