import { BookOpen, Check, Circle, CircleCheck, Heart, ListPlus, ShoppingBasket } from 'lucide-react'
import { useState } from 'react'
import { useMe } from '../lib/auth'
import { categorize, ingredientStatus, proper, scaleQuantity, type IngredientStatus } from '../lib/match'
import { addDays, fromKey, toKey } from '../lib/dates'
import { col, errorMessage, recipeImage, upsertMeal, type Item, type Meal, type Recipe } from '../lib/pb'
import { useSpace } from '../lib/space'
import { Button, ErrorText, IconButton, Sheet } from './ui'
import { t, tn } from '../lib/i18n'

export function RecipeThumb({ recipe, className = 'size-14 rounded-xl', thumb = '120x120' as const }: {
  recipe?: Recipe; className?: string; thumb?: '120x120' | '400x300'
}) {
  return recipe?.image ? (
    <img src={recipeImage(recipe, thumb)} alt="" loading="lazy" className={`${className} shrink-0 object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center bg-soft text-muted`}>
      <BookOpen className="size-1/3" />
    </span>
  )
}

export function FavoriteButton({ recipe, className = '' }: { recipe: Recipe; className?: string }) {
  const me = useMe()
  const { patchRecipe } = useSpace()
  const fav = recipe.favorited_by?.includes(me.id)
  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const favorited_by = fav ? recipe.favorited_by.filter((u) => u !== me.id) : [...(recipe.favorited_by ?? []), me.id]
    patchRecipe({ ...recipe, favorited_by })
    try {
      patchRecipe(await col.recipes().update(recipe.id, fav ? { 'favorited_by-': me.id } : { 'favorited_by+': me.id }))
    } catch {
      patchRecipe(recipe)
    }
  }
  return (
    <IconButton icon={Heart} label={fav ? t('Remove from favorites') : t('Add to favorites')} onClick={toggle}
      className={`${fav ? '[&_svg]:fill-rose-500 [&_svg]:text-rose-500' : ''} ${className}`} />
  )
}

export const STATUS: Record<IngredientStatus, { icon: typeof Check; label: string; className: string }> = {
  have: { icon: CircleCheck, label: t('In the basket'), className: 'text-brand-text' },
  'to-buy': { icon: ShoppingBasket, label: t('On the list'), className: 'text-warn-text' },
  unknown: { icon: Circle, label: t('Not on the list'), className: 'text-muted' },
}

/** Pick which ingredients to put on the list. Already listed or crossed-off ingredients start unselected. */
/** ×2 switch used where a recipe is planned or put on the list. */
export function DoubleToggle({ on, onChange, hint }: { on: boolean; onChange: (on: boolean) => void; hint: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition ${on ? 'bg-brand-soft ring-brand' : 'bg-soft ring-transparent'}`}>
      <span className={`flex h-7 min-w-11 items-center justify-center rounded-full px-2 text-sm font-black ${on ? 'bg-brand text-brand-ink' : 'bg-card text-muted'}`}>×2</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{t('Double it')}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </button>
  )
}

/**
 * Put a recipe on a day. Doubling fills the next free day with "Leftovers: …";
 * undoubling removes that leftovers note again. Returns the changes to apply locally.
 */
export async function planRecipe(space: string, date: string, recipe: Recipe, double: boolean, meals: Meal[]) {
  const saved: Meal[] = []
  const removed: string[] = []
  saved.push(await upsertMeal(space, date, { recipe: recipe.id, note: '', factor: double ? 2 : 1 }, meals.find((m) => m.date === date)))
  const next = toKey(addDays(fromKey(date), 1))
  const nextMeal = meals.find((m) => m.date === next)
  const note = t('Leftovers: {title}', { title: recipe.title })
  if (double && !nextMeal) saved.push(await upsertMeal(space, next, { recipe: '', note, factor: 1 }))
  if (!double && nextMeal && !nextMeal.recipe && nextMeal.note === note) {
    await col.meals().delete(nextMeal.id)
    removed.push(nextMeal.id)
  }
  return { saved, removed }
}

export function AddToListSheet({ recipe, open, onClose, factor: initialFactor = 1 }: {
  recipe: Recipe; open: boolean; onClose: () => void; factor?: number
}) {
  const me = useMe()
  const { items, categories, patchItem } = useSpace()
  const ingredients = recipe.ingredients ?? []
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [wasOpen, setWasOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [factor, setFactor] = useState(initialFactor)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setError('')
      setFactor(initialFactor)
      setSelected(new Set(ingredients.flatMap((ing, i) => (ingredientStatus(ing.name, items) === 'unknown' ? [i] : []))))
    }
  }

  function flip(i: number) {
    const next = new Set(selected)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSelected(next)
  }

  async function add() {
    setBusy(true)
    try {
      const created = await Promise.all(
        [...selected].map((i) =>
          col.items().create({
            space: recipe.space,
            name: ingredients[i].name,
            quantity: scaleQuantity(ingredients[i].quantity, factor),
            category: categorize(ingredients[i].name, categories),
            recipe: recipe.id,
            added_by: me.id,
          }),
        ),
      )
      created.forEach(patchItem)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Add {title}', { title: recipe.title })}>
      <div className="mb-3">
        <DoubleToggle on={factor === 2} onChange={(on) => setFactor(on ? 2 : 1)} hint={t('Twice the amounts, for leftovers.')} />
      </div>
      <ul className="-mx-2 mb-4">
        {ingredients.map((ing, i) => {
          const status = ingredientStatus(ing.name, items)
          const on = selected.has(i)
          return (
            <li key={i}>
              <button onClick={() => flip(i)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-soft" aria-pressed={on}>
                <span className={`flex size-6 shrink-0 items-center justify-center rounded-lg border-2 ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>
                  {on && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {proper(ing.name)} {ing.quantity && <span className="font-normal text-muted">{scaleQuantity(ing.quantity, factor)}</span>}
                  </span>
                  {status !== 'unknown' && <span className={`text-xs font-bold ${STATUS[status].className}`}>{STATUS[status].label}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Button icon={ListPlus} className="w-full" busy={busy} disabled={!selected.size} onClick={add}>
        {tn(selected.size, 'Add {n} item', 'Add {n} items')}
      </Button>
      <ErrorText error={error} />
    </Sheet>
  )
}

/** Open items this recipe put on the list. */
export function recipeItems(recipe: Recipe, items: Item[]) {
  return items.filter((i) => i.recipe === recipe.id && !i.checked)
}
