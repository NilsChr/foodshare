import { locale } from './i18n'
/** Local-calendar date helpers. Days are stored as YYYY-MM-DD strings so time zones never shift them. */

export function toKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Monday of the week containing d. */
export function startOfWeek(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return addDays(r, -((r.getDay() + 6) % 7))
}

export function weekDays(monday: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function weekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export const todayKey = () => toKey(new Date())

export const dayName = (d: Date, style: 'long' | 'short' = 'long') => d.toLocaleDateString(locale, { weekday: style }).replace(/\.$/, '').replace(/^./, (c) => c.toLocaleUpperCase())
export const shortDate = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
