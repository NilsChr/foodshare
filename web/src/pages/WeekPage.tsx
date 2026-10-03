import {
  CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Heart, ListPlus, Pencil, Plus, Search, ShoppingBasket, Trash2, UtensilsCrossed,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AddToListSheet, DoubleToggle, planRecipe, RecipeThumb } from '../components/recipe'
import { Button, ErrorText, IconButton, Input, PageHeader, Sheet, Spinner } from '../components/ui'
import { useMe } from '../lib/auth'
import { addDays, dayName, shortDate, startOfWeek, toKey, todayKey, weekDays, weekNumber } from '../lib/dates'
import { categorize, ingredientStatus, normalize, recipeReadiness, scaleQuantity } from '../lib/match'
import { col, errorMessage, upsertMeal, type Meal, type Recipe } from '../lib/pb'
import { useSpace } from '../lib/space'
import { t, tn } from '../lib/i18n'

export default function WeekPage() {
  const { meals, recipes, loading } = useSpace()
  const [monday, setMonday] = useState(() => startOfWeek(new Date()))
  const [picking, setPicking] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ recipe: Recipe; factor: number } | null>(null)
  const days = weekDays(monday)
  const today = todayKey()
  const isThisWeek = toKey(monday) === toKey(startOfWeek(new Date()))
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes])

  return (
    <>
      <PageHeader title={
        <span className="flex items-baseline gap-2">
          {t('Week {n}', { n: weekNumber(monday) })}
          <span className="text-base font-bold text-muted">{shortDate(days[0])} – {shortDate(days[6])}</span>
        </span>
      }>
        <IconButton icon={ChevronLeft} label={t('Previous week')} onClick={() => setMonday(addDays(monday, -7))} />
        <IconButton icon={ChevronRight} label={t('Next week')} onClick={() => setMonday(addDays(monday, 7))} />
      </PageHeader>

      <main className="mx-auto max-w-2xl space-y-2.5 px-4 pb-4">
        {!isThisWeek && (
          <button onClick={() => setMonday(startOfWeek(new Date()))} className="mb-1 text-sm font-bold text-brand-text">
            {t('Back to this week')}
          </button>
        )}
        {loading ? <Spinner /> : days.map((d) => {
          const key = toKey(d)
          const meal = meals.find((m) => m.date === key)
          const recipe = meal?.recipe ? byId.get(meal.recipe) : undefined
          const past = key < today
          return (
            <article key={key} className={`flex items-center gap-3 rounded-3xl bg-card p-2.5 ring-1 transition ${key === today ? 'ring-2 ring-brand' : 'ring-line'} ${past ? 'opacity-60' : ''}`}>
              <div className="w-12 shrink-0 text-center">
                <p className={`text-xs font-extrabold uppercase ${key === today ? 'text-brand-text' : 'text-muted'}`}>{dayName(d, 'short')}</p>
                <p className="text-xl font-black">{d.getDate()}</p>
              </div>

              {meal ? (
                <>
                  {recipe ? (
                    <Link to={`/recipes/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <RecipeThumb recipe={recipe} className="size-14 rounded-2xl" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-extrabold">{recipe.title}</span>
                          {meal.factor > 1 && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 text-xs font-black text-brand-text">×{meal.factor}</span>}
                        </span>
                        <Readiness recipe={recipe} onAdd={() => setAdding({ recipe, factor: meal.factor || 1 })} />
                      </span>
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-soft text-muted"><UtensilsCrossed className="size-6" /></span>
                      <span className="truncate font-extrabold">{meal.note || t('Removed recipe')}</span>
                    </div>
                  )}
                  <IconButton icon={Pencil} label={t('Change {day}', { day: dayName(d) })} onClick={() => setPicking(key)} />
                </>
              ) : (
                <button onClick={() => setPicking(key)}
                  className="flex h-14 flex-1 items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 font-bold text-muted transition hover:border-brand hover:text-brand-text">
                  <Plus className="size-5" /> {t('Plan dinner')}
                </button>
              )}
            </article>
          )
        })}
        <ShopForWeek days={days.map(toKey)} />
      </main>

      <PickSheet date={picking} onClose={() => setPicking(null)} />
      {adding && <AddToListSheet recipe={adding.recipe} factor={adding.factor} open onClose={() => setAdding(null)} />}
    </>
  )
}

/** Ingredient status for a planned dinner, from the list and what is at home. */
function Readiness({ recipe, onAdd }: { recipe: Recipe; onAdd: () => void }) {
  const { items, pantry } = useSpace()
  if (!recipe.ingredients?.length) return null
  const r = recipeReadiness(recipe, items, pantry)
  if (!r.unknown && !r['to-buy']) {
    return <span className="flex items-center gap-1 text-sm font-bold text-brand-text"><CircleCheck className="size-4" /> {t('Got everything')}</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
      {r['to-buy'] > 0 && <span className="flex items-center gap-1 text-warn-text"><ShoppingBasket className="size-4" /> {t('{n} to buy', { n: r['to-buy'] })}</span>}
      {r.unknown > 0 && (
        <button className="flex items-center gap-1 text-muted hover:text-brand-text"
          onClick={(e) => { e.preventDefault(); onAdd() }}>
          <ListPlus className="size-4" /> {t('{n} not on list', { n: r.unknown })}
        </button>
      )}
    </span>
  )
}

/** Add every not-yet-listed ingredient for the rest of the visible week in one go. */
function ShopForWeek({ days }: { days: string[] }) {
  const me = useMe()
  const { space, meals, recipes, items, pantry, categories, patchItem } = useSpace()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const today = todayKey()

  const needed = useMemo(() => {
    const out = new Map<string, { name: string; quantity: string; recipe: string }>()
    for (const m of meals) {
      if (!days.includes(m.date) || m.date < today || !m.recipe) continue
      const recipe = recipes.find((r) => r.id === m.recipe)
      for (const ing of recipe?.ingredients ?? []) {
        const key = normalize(ing.name)
        if (!key || out.has(key)) continue
        if (ingredientStatus(ing.name, items, pantry) !== 'unknown') continue
        out.set(key, { name: ing.name, quantity: scaleQuantity(ing.quantity, m.factor || 1), recipe: m.recipe })
      }
    }
    return [...out.values()]
  }, [meals, recipes, items, pantry, days, today])

  if (!needed.length) {
    return done ? <p className="px-1 pt-2 text-center text-sm font-bold text-brand-text">{t('Added {n} items to the list.', { n: done })}</p> : null
  }

  async function add() {
    setBusy(true)
    const created = await Promise.all(needed.map((n) => col.items().create({
      space: space.id, name: n.name, quantity: n.quantity, recipe: n.recipe, added_by: me.id,
      category: categorize(n.name, categories),
    }).catch(() => null)))
    created.forEach((c) => c && patchItem(c))
    setDone(created.filter(Boolean).length)
    setBusy(false)
  }

  return (
    <div className="pt-2">
      <Button variant="soft" icon={ListPlus} className="w-full" busy={busy} onClick={add}>
        {tn(needed.length, 'Add {n} missing ingredient to the list', 'Add {n} missing ingredients to the list')}
      </Button>
    </div>
  )
}

/** Choose what's for dinner: a recipe (favourites first) or a free-text note. */
function PickSheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const me = useMe()
  const { space, meals, recipes, patchMeal, removeMeal } = useSpace()
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const meal = meals.find((m) => m.date === date)
  const [double, setDouble] = useState(false)
  const [lastDate, setLastDate] = useState<string | null>(null)
  if (date !== lastDate) {
    setLastDate(date)
    setDouble((meal?.factor ?? 1) > 1)
  }

  const list = useMemo(() => {
    const q = normalize(query)
    return recipes
      .filter((r) => !q || normalize(r.title).includes(q))
      .sort((a, b) => Number(b.favorited_by?.includes(me.id)) - Number(a.favorited_by?.includes(me.id)) || a.title.localeCompare(b.title))
  }, [recipes, query, me.id])

  function close() {
    setQuery('')
    setNote('')
    setError('')
    onClose()
  }

  async function save(data: Pick<Meal, 'recipe' | 'note' | 'factor'>) {
    if (!date) return
    try {
      patchMeal(await upsertMeal(space.id, date, data, meal))
      close()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function pickRecipe(recipe: Recipe, doubled = double, keepOpen = false) {
    if (!date) return
    try {
      const { saved, removed } = await planRecipe(space.id, date, recipe, doubled, meals)
      saved.forEach(patchMeal)
      removed.forEach(removeMeal)
      if (!keepOpen) close()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  function toggleDouble(on: boolean) {
    setDouble(on)
    // A planned recipe is updated right away; otherwise the choice applies to the next pick.
    const planned = meal?.recipe && recipes.find((r) => r.id === meal.recipe)
    if (planned) pickRecipe(planned, on, true)
  }

  async function clear() {
    if (!meal) return
    removeMeal(meal.id)
    close()
    await col.meals().delete(meal.id).catch(() => {})
  }

  function submitNote(e: FormEvent) {
    e.preventDefault()
    if (note.trim()) save({ recipe: '', note: note.trim(), factor: 1 })
  }

  const d = date ? new Date(date + 'T12:00') : null
  return (
    <Sheet open={!!date} onClose={close} title={d ? t('Dinner {day} {date}', { day: dayName(d), date: shortDate(d) }) : ''}>
      <div className="space-y-4">
        <DoubleToggle on={double} onChange={toggleDouble} hint={t('Leftovers the day after.')} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 size-5 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Find a recipe')} className="pl-11" />
        </div>
        <ul className="-mx-2 max-h-[45dvh] overflow-y-auto">
          {list.map((r) => (
            <li key={r.id}>
              <button onClick={() => pickRecipe(r)}
                className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-soft ${meal?.recipe === r.id ? 'bg-brand-soft' : ''}`}>
                <RecipeThumb recipe={r} className="size-11 rounded-xl" />
                <span className="flex-1 truncate font-bold">{r.title}</span>
                {r.favorited_by?.includes(me.id) && <Heart className="size-4 fill-rose-500 text-rose-500" />}
              </button>
            </li>
          ))}
          {!list.length && (
            <li className="flex items-center gap-2 px-2 py-3 text-muted"><CalendarDays className="size-5" /> {t('No recipes found.')}</li>
          )}
        </ul>
        <form onSubmit={submitNote} className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Or write something: leftovers, eating out…')} maxLength={120} />
          <Button type="submit" variant="soft" icon={Plus} aria-label={t('Save note')} disabled={!note.trim()} />
        </form>
        <ErrorText error={error} />
        {meal && <Button variant="danger" icon={Trash2} className="w-full" onClick={clear}>{t('Clear this day')}</Button>}
      </div>
    </Sheet>
  )
}
