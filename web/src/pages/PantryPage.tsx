import { ChefHat, CircleCheck, ListPlus, Plus, Refrigerator, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AddToListSheet, RecipeThumb } from '../components/recipe'
import { Button, Empty, ErrorText, Input, PageHeader, Spinner } from '../components/ui'
import { useMe } from '../lib/auth'
import { normalize, pantryMatches, proper } from '../lib/match'
import { col, errorMessage, type Recipe } from '../lib/pb'
import { useSpace } from '../lib/space'
import { t, tn } from '../lib/i18n'

const SHOWN = 30

/** What the household has at home, and the recipes that need the fewest extra ingredients. */
export default function PantryPage() {
  const me = useMe()
  const { space, pantry, items, recipes, loading, patchPantry, removePantry } = useSpace()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState<Recipe | null>(null)

  const matches = useMemo(() => pantryMatches(recipes, items, pantry).slice(0, SHOWN), [recipes, items, pantry])
  const basket = items.filter((i) => i.checked).length

  // Names to autocomplete: recipe ingredients and things bought before.
  const known = useMemo(() => {
    const names = new Map<string, string>()
    for (const i of items) names.set(normalize(i.name), i.name)
    for (const r of recipes) for (const ing of r.ingredients ?? []) names.set(normalize(ing.name), ing.name)
    for (const p of pantry) names.delete(normalize(p.name))
    return [...names.values()].sort()
  }, [items, recipes, pantry])

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = text.trim()
    if (!name) return
    setText('')
    setError('')
    if (pantry.some((p) => normalize(p.name) === normalize(name))) return
    try {
      patchPantry(await col.pantry().create({ space: space.id, name, added_by: me.id }))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(id: string) {
    removePantry(id)
    await col.pantry().delete(id).catch(() => {})
  }

  return (
    <>
      <PageHeader title={t('At home')} />
      <main className="mx-auto max-w-2xl space-y-4 px-4">
        <form onSubmit={add} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('What do you have? e.g. rice')}
            list="known-ingredients" enterKeyHint="done" autoComplete="off" maxLength={120} aria-label={t('Add to what you have at home')} />
          <Button type="submit" icon={Plus} aria-label={t('Add')} disabled={!text.trim()} />
          <datalist id="known-ingredients">{known.map((n) => <option key={n} value={n} />)}</datalist>
        </form>
        <ErrorText error={error} />

        {loading ? <Spinner /> : (
          <>
            {pantry.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {pantry.map((p) => (
                  <li key={p.id} className="inline-flex items-center rounded-full bg-card pl-3 font-semibold ring-1 ring-line">
                    {proper(p.name)}
                    <button onClick={() => remove(p.id)} aria-label={t('Remove {name}', { name: p.name })}
                      className="ml-0.5 flex size-8 items-center justify-center rounded-full text-muted hover:text-danger">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {basket > 0 && (
              <p className="px-1 text-xs text-muted">{tn(basket, 'The {n} crossed-off item on the list counts too.', 'The {n} crossed-off items on the list count too.')}</p>
            )}

            {!pantry.length && !basket ? (
              <Empty icon={Refrigerator} title={t('What do you have at home?')}>
                {t('Add what is in the fridge and cupboards. We find the recipes that need the fewest extra ingredients.')}
              </Empty>
            ) : !matches.length ? (
              <Empty icon={ChefHat} title={t('No recipes use these')}>{t('Add more of what you have, or add more recipes.')}</Empty>
            ) : (
              <section className="space-y-2 pb-4">
                <h2 className="px-1 text-lg font-extrabold">{t('What you can make')}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-card ring-1 ring-line">
                  {matches.map(({ recipe, matched, missing }) => (
                    <li key={recipe.id} className="flex items-center gap-3 p-2 pr-1">
                      <Link to={`/recipes/${recipe.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <RecipeThumb recipe={recipe} />
                        <span className="min-w-0">
                          <span className="block truncate font-extrabold">{recipe.title}</span>
                          {missing.length ? (
                            <>
                              <span className="block text-sm font-bold text-warn-text">{tn(missing.length, '{n} missing', '{n} missing')}</span>
                              <span className="block truncate text-xs text-muted">{missing.map(proper).join(', ')}</span>
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-sm font-bold text-brand-text"><CircleCheck className="size-4" /> {t('You have everything')}</span>
                          )}
                          <span className="block text-xs text-muted">{t('{n} of {total} at home', { n: matched.length, total: matched.length + missing.length })}</span>
                        </span>
                      </Link>
                      {missing.length > 0 && (
                        <Button variant="ghost" icon={ListPlus} aria-label={t('Add missing to the list')} title={t('Add missing to the list')}
                          onClick={() => setAdding(recipe)} className="px-3 text-muted" />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
      {adding && <AddToListSheet recipe={adding} open onClose={() => setAdding(null)} />}
    </>
  )
}
