import { CalendarPlus, Clock, ExternalLink, Tag, ChevronLeft, ListMinus, ListPlus, Pencil, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AddToListSheet, DoubleToggle, FavoriteButton, planRecipe, recipeItems, STATUS } from '../components/recipe'
import { Button, Empty, ErrorText, IconButton, Sheet, Spinner } from '../components/ui'
import { addDays, dayName, fromKey, shortDate, startOfWeek, toKey, todayKey } from '../lib/dates'
import { sourceName } from '../lib/importRecipe'
import { ingredientStatus, proper } from '../lib/match'
import { col, errorMessage, recipeImage, type Recipe } from '../lib/pb'
import { useSpace } from '../lib/space'
import { t } from '../lib/i18n'

export default function RecipePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { recipes, items, pantry, loading, removeItem } = useSpace()
  const recipe = recipes.find((r) => r.id === id)
  const [adding, setAdding] = useState(false)
  const [planning, setPlanning] = useState(false)

  if (loading) return <Spinner />
  if (!recipe) return <Empty icon={ChevronLeft} title={t('Recipe not found')}><Link to="/recipes" className="font-bold text-brand-text">{t('Back to recipes')}</Link></Empty>

  const onList = recipeItems(recipe, items)

  async function removeFromList() {
    onList.forEach((i) => removeItem(i.id))
    await Promise.all(onList.map((i) => col.items().delete(i.id).catch(() => {})))
  }

  const back = () => (history.length > 1 ? navigate(-1) : navigate('/recipes'))

  return (
    <>
      <div className="pt-safe relative mx-auto max-w-2xl">
        {recipe.image ? (
          <img src={recipeImage(recipe, '800x600')} alt="" className="aspect-[4/3] w-full object-cover sm:rounded-b-3xl" />
        ) : (
          <div className="h-20" />
        )}
        <div className="absolute inset-x-0 top-[env(safe-area-inset-top)] flex justify-between p-3">
          <IconButton icon={ChevronLeft} label={t('Back')} onClick={back} className="bg-card/85 text-ink backdrop-blur" />
          <div className="flex gap-2">
            <FavoriteButton recipe={recipe} className="bg-card/85 backdrop-blur" />
            <Link to={`/recipes/${recipe.id}/edit`} aria-label={t('Edit recipe')}
              className="flex size-10 items-center justify-center rounded-full bg-card/85 text-muted backdrop-blur">
              <Pencil className="size-5" />
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-5">
        <div>
          <h1 className="text-3xl font-black leading-tight tracking-tight">{recipe.title}</h1>
          {recipe.description && <p className="mt-2 text-muted">{recipe.description}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-muted">
            {recipe.servings > 0 && (
              <span className="inline-flex items-center gap-1.5"><Users className="size-4" /> {t('Serves {n}', { n: recipe.servings })}</span>
            )}
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand-text">
                <ExternalLink className="size-4" /> {sourceName(recipe.source)}
              </a>
            )}
            {recipe.minutes > 0 && (
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4" /> {t('{n} min', { n: recipe.minutes })}</span>
            )}
          </div>
          {!!recipe.tags?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <Link key={tag} to={`/recipes?tag=${encodeURIComponent(tag)}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-text">
                  <Tag className="size-3.5" /> {tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {onList.length ? (
            <Button variant="soft" icon={ListMinus} onClick={removeFromList}>{t('Remove from list')}</Button>
          ) : (
            <Button icon={ListPlus} onClick={() => setAdding(true)} disabled={!recipe.ingredients?.length}>{t('Add to list')}</Button>
          )}
          <Button variant="soft" icon={CalendarPlus} onClick={() => setPlanning(true)}>{t('Plan dinner')}</Button>
        </div>


        {!!recipe.ingredients?.length && (
          <section>
            <h2 className="mb-2 text-lg font-extrabold">{t('Ingredients')}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
              {recipe.ingredients.map((ing, i) => {
                const s = STATUS[ingredientStatus(ing.name, items, pantry)]
                return (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <s.icon className={`size-5 shrink-0 ${s.className}`} aria-label={s.label} />
                    <span className="min-w-0 flex-1 font-semibold">{proper(ing.name)}</span>
                    {ing.quantity && <span className="text-sm text-muted">{ing.quantity}</span>}
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted">
              {Object.values(STATUS).map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1"><s.icon className={`size-3.5 ${s.className}`} /> {s.label}</span>
              ))}
            </div>
          </section>
        )}

        {recipe.instructions && (
          <section className="pb-6">
            <h2 className="mb-2 text-lg font-extrabold">{t('How to make it')}</h2>
            <div className="whitespace-pre-line rounded-3xl bg-card p-4 leading-relaxed ring-1 ring-line">{recipe.instructions}</div>
          </section>
        )}
      </main>

      <AddToListSheet recipe={recipe} open={adding} onClose={() => setAdding(false)} />
      <PlanSheet recipe={recipe} open={planning} onClose={() => setPlanning(false)} />
    </>
  )
}

/** Put a recipe on a day in this or next week, optionally doubled with leftovers the day after. */
function PlanSheet({ recipe, open, onClose }: { recipe: Recipe; open: boolean; onClose: () => void }) {
  const recipeId = recipe.id
  const [double, setDouble] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDouble(false)
  }
  const { space, meals, recipes, patchMeal, removeMeal } = useSpace()
  const days = useMemo(() => {
    const monday = startOfWeek(new Date())
    return Array.from({ length: 14 }, (_, i) => toKey(addDays(monday, i))).filter((k) => k >= todayKey())
  }, [])
  const titles = new Map(recipes.map((r) => [r.id, r.title]))

  const [error, setError] = useState('')

  async function pick(date: string) {
    try {
      const { saved, removed } = await planRecipe(space.id, date, recipe, double, meals)
      saved.forEach(patchMeal)
      removed.forEach(removeMeal)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Plan for dinner on…')}>
      <div className="mb-2">
        <DoubleToggle on={double} onChange={setDouble} hint={t('Leftovers the day after.')} />
      </div>
      <ul className="-mx-2">
        {days.map((key) => {
          const meal = meals.find((m) => m.date === key)
          const current = meal ? titles.get(meal.recipe) || meal.note : ''
          const d = fromKey(key)
          return (
            <li key={key}>
              <button onClick={() => pick(key)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-soft">
                <span className="w-24 font-extrabold">{key === todayKey() ? t('Today') : dayName(d)}</span>
                <span className="text-sm text-muted">{shortDate(d)}</span>
                <span className={`ml-auto truncate text-sm ${meal?.recipe === recipeId ? 'font-bold text-brand-text' : 'text-muted'}`}>{current}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <ErrorText error={error} />
    </Sheet>
  )
}
