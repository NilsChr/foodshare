import { BookOpen, Clock, Download, Heart, Tag, Plus, Search, ShoppingBasket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import ImportSheet from '../components/ImportSheet'
import { FavoriteButton, RecipeThumb } from '../components/recipe'
import { Empty, Input, PageHeader, Spinner } from '../components/ui'
import { useMe } from '../lib/auth'
import { normalize, recipeOnList, spaceTags } from '../lib/match'
import { formatPrice } from '../lib/offers'
import { recipeCost } from '../lib/prices'
import { useSpace } from '../lib/space'
import { t, tn } from '../lib/i18n'

export default function RecipesPage() {
  const me = useMe()
  const { recipes, items, pantry, recipePrices, loading } = useSpace()
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState(false)
  const [maxMinutes, setMaxMinutes] = useState(0)
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag') ?? ''
  const allTags = useMemo(() => spaceTags(recipes), [recipes])
  const setTag = (next: string) => setParams(next ? { tag: next } : {}, { replace: true })
  const [importing, setImporting] = useState(false)

  const shown = useMemo(() => {
    const q = normalize(query)
    return recipes.filter((r) => {
      if (favorites && !r.favorited_by?.includes(me.id)) return false
      if (maxMinutes && !(r.minutes > 0 && r.minutes <= maxMinutes)) return false
      if (tag && !r.tags?.some((x) => x.toLowerCase() === tag.toLowerCase())) return false
      if (!q) return true
      return normalize([r.title, r.description, ...(r.tags ?? []), ...(r.ingredients ?? []).map((i) => i.name)].join(' ')).includes(q)
    })
  }, [recipes, query, favorites, maxMinutes, tag, me.id])

  return (
    <>
      <PageHeader title={t('Recipes')}>
        <button onClick={() => setImporting(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-4 font-bold ring-1 ring-line">
          <Download className="size-5" /> {t('Import')}
        </button>
        <Link to="/recipes/new" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 font-bold text-brand-ink shadow-sm">
          <Plus className="size-5" strokeWidth={2.5} /> {t('New')}
        </Link>
      </PageHeader>
      <main className="mx-auto max-w-2xl space-y-4 px-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3 size-5 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search recipes or ingredients')} className="pl-11" />
          </div>
          <button onClick={() => setFavorites(!favorites)} aria-pressed={favorites} aria-label={t('Only favorites')}
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl transition ${favorites ? 'bg-rose-500 text-white' : 'bg-card text-muted ring-1 ring-line'}`}>
            <Heart className={`size-5 ${favorites ? 'fill-white' : ''}`} />
          </button>
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label={t('Cooking time')}>
          {[0, 15, 30, 45, 60].map((m) => (
            <button key={m} onClick={() => setMaxMinutes(m)} aria-pressed={maxMinutes === m}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${maxMinutes === m ? 'bg-brand text-brand-ink' : 'bg-card text-muted ring-1 ring-line'}`}>
              {m === 0 ? <><Clock className="size-4" /> {t('Any time')}</> : `≤ ${t('{n} min', { n: m })}`}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label={t('Tags')}>
            {allTags.map((x) => {
              const on = x.toLowerCase() === tag.toLowerCase()
              return (
                <button key={x} onClick={() => setTag(on ? '' : x)} aria-pressed={on}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold transition ${on ? 'bg-brand text-brand-ink' : 'bg-card text-muted ring-1 ring-line'}`}>
                  <Tag className="size-3.5" /> {x}
                </button>
              )
            })}
          </div>
        )}

        {loading ? <Spinner /> : !recipes.length ? (
          <Empty icon={BookOpen} title={t('No recipes yet')}>
            {t('Add your favourite recipes. Then put them on the list or plan them for the week.')}
          </Empty>
        ) : !shown.length ? (
          <Empty icon={Search} title={t('Nothing found')}>{tag || maxMinutes ? t('No recipes match the filters.') : favorites ? t('No favourites match.') : t('Try another word.')}</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3">
            {shown.map((r) => {
              const cost = recipeCost(r.id, recipePrices, pantry)
              return (
              <Link key={r.id} to={`/recipes/${r.id}`} className="group overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-line">
                <div className="relative">
                  <RecipeThumb recipe={r} thumb="400x300" className="aspect-[4/3] w-full" />
                  <FavoriteButton recipe={r} className="absolute right-1.5 top-1.5 bg-card/80 backdrop-blur" />
                  {recipeOnList(r.id, items) && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">
                      <ShoppingBasket className="size-3.5" /> {t('On list')}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 font-extrabold leading-tight">{r.title}</h3>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    {r.minutes > 0 && <span className="inline-flex items-center gap-1 font-bold"><Clock className="size-3.5" /> {t('{n} min', { n: r.minutes })}</span>}
                    <span>{tn(r.ingredients?.length ?? 0, '{n} ingredient', '{n} ingredients')}</span>
                    {cost !== null && <span className="ml-auto font-bold tabular-nums">{formatPrice(cost, true)}</span>}
                  </p>
                </div>
              </Link>
              )
            })}
          </div>
        )}
      </main>
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </>
  )
}
