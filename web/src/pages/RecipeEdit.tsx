import { Check, ChevronLeft, ClipboardList, Download, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button, ErrorText, Field, IconButton, Input, PageHeader, Sheet, Spinner } from '../components/ui'
import { useMe } from '../lib/auth'
import { col, errorMessage, recipeImage, type Ingredient } from '../lib/pb'
import { sourceName, takePendingImport, type ImportedRecipe } from '../lib/importRecipe'
import { mergeTags, parseEntry, spaceTags } from '../lib/match'
import { useSpace } from '../lib/space'
import { t, tn } from '../lib/i18n'

/** Phone photos are huge; shrink to at most 1600px JPEG before upload. */
async function shrinkImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

const textareaClass =
  'w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15'

export default function RecipeEdit() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const { space, recipes, loading, patchRecipe } = useSpace()
  const recipe = id ? recipes.find((r) => r.id === id) : undefined

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [servings, setServings] = useState('')
  const [minutes, setMinutes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [instructions, setInstructions] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', quantity: '' }])
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadedId, setLoadedId] = useState('')

  if (recipe && loadedId !== recipe.id) {
    setLoadedId(recipe.id)
    setTitle(recipe.title)
    setDescription(recipe.description)
    setServings(recipe.servings ? String(recipe.servings) : '')
    setMinutes(recipe.minutes ? String(recipe.minutes) : '')
    setTags(recipe.tags ?? [])
    setInstructions(recipe.instructions)
    setIngredients([...(recipe.ingredients ?? []), { name: '', quantity: '' }])
  }

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])

  if (id && loading) return <Spinner />

  function setIngredient(i: number, patch: Partial<Ingredient>) {
    const next = ingredients.map((ing, j) => (j === i ? { ...ing, ...patch } : ing))
    // Keep one empty row at the end to type into.
    if (next[next.length - 1].name.trim()) next.push({ name: '', quantity: '' })
    setIngredients(next)
  }

  // A recipe handed over by the import sheet fills the form once.
  const [source, setSource] = useState<{ source: string; sourceUrl: string } | null>(null)
  useEffect(() => {
    if (id) return
    const r = takePendingImport()
    if (!r) return
    setSource({ source: r.source, sourceUrl: r.sourceUrl })
    ;(r.image ? shrinkImage(r.image) : Promise.resolve(null)).then((photo) => applyImport(r, photo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function applyImport(r: ImportedRecipe, photo: Blob | null) {
    setTitle(r.title)
    setDescription(r.description)
    setServings(r.servings ? String(r.servings) : '')
    setMinutes(r.minutes ? String(r.minutes) : '')
    setTags(r.tags)
    setInstructions(r.instructions)
    setIngredients([...r.ingredients, { name: '', quantity: '' }])
    if (photo) {
      setImage({ blob: photo, url: URL.createObjectURL(photo) })
      setRemoveImage(false)
    }
  }

  async function pickImage(file?: File) {
    if (!file) return
    const blob = await shrinkImage(file)
    setImage({ blob, url: URL.createObjectURL(blob) })
    setRemoveImage(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.set('title', title.trim())
      form.set('description', description.trim())
      form.set('servings', servings || '0')
      form.set('minutes', minutes || '0')
      form.set('tags', JSON.stringify(tags))
      form.set('instructions', instructions.trim())
      if (source) {
        form.set('source', source.source)
        form.set('source_url', source.sourceUrl)
      }
      form.set('ingredients', JSON.stringify(
        ingredients.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim() })),
      ))
      if (image) form.set('image', image.blob, 'recipe.jpg')
      else if (removeImage) form.set('image', '')
      let saved
      if (recipe) {
        saved = await col.recipes().update(recipe.id, form)
      } else {
        form.set('space', space.id)
        form.set('created_by', me.id)
        saved = await col.recipes().create(form)
      }
      patchRecipe(saved)
      navigate(`/recipes/${saved.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!recipe || !confirm(t('Delete “{title}”?', { title: recipe.title }))) return
    await col.recipes().delete(recipe.id)
    navigate('/recipes', { replace: true })
  }

  const preview = image?.url ?? (recipe && !removeImage ? recipeImage(recipe, '800x600') : '')

  return (
    <>
      <PageHeader title={recipe ? t('Edit recipe') : t('New recipe')}
        back={<IconButton icon={ChevronLeft} label={t('Back')} onClick={() => navigate(-1)} className="-ml-2 text-ink" />}>
        {recipe && <IconButton icon={Trash2} label={t('Delete recipe')} onClick={remove} className="hover:text-danger" />}
      </PageHeader>
      <form onSubmit={save} className="mx-auto max-w-2xl space-y-5 px-4 pb-8">
        {source && (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-text">
            <Download className="size-4" /> {t('Imported from {source}. Check the details and save.', { source: sourceName(source.source) })}
          </p>
        )}
        <div className="relative overflow-hidden rounded-3xl bg-soft ring-1 ring-line">
          {preview ? (
            <img src={preview} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-muted">
              <ImagePlus className="size-10" />
              <span className="font-bold">{t('Add a photo')}</span>
            </div>
          )}
          <input type="file" accept="image/*" aria-label={t('Choose photo')} className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => pickImage(e.target.files?.[0])} />
          {preview && (
            <IconButton icon={X} label={t('Remove photo')} className="absolute right-2 top-2 bg-card/85 text-ink backdrop-blur"
              onClick={() => { setImage(null); setRemoveImage(true) }} type="button" />
          )}
        </div>

        <Field label={t('Name')}><Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Taco Friday')} /></Field>
        <Field label={t('Short description')}>
          <Input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Everyone's favourite")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Servings')}>
            <Input type="number" min={0} max={99} inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
          </Field>
          <Field label={t('Time (minutes)')}>
            <Input type="number" min={0} max={1440} step={5} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />
          </Field>
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-muted">{t('Ingredients')}</span>
            <button type="button" onClick={() => setPasting(true)} className="flex items-center gap-1 text-sm font-bold text-brand-text">
              <ClipboardList className="size-4" /> {t('Paste a list')}
            </button>
          </div>
          {ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2">
              <Input value={ing.name} onChange={(e) => setIngredient(i, { name: e.target.value })} placeholder={t('Ingredient')} aria-label={t('Ingredient')} />
              <Input value={ing.quantity} onChange={(e) => setIngredient(i, { quantity: e.target.value })} placeholder={t('Amount')} aria-label={t('Amount')} className="!w-28 shrink-0" />
              <IconButton icon={X} label={t('Remove ingredient')} type="button" disabled={i === ingredients.length - 1}
                onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))} />
            </div>
          ))}
        </section>

        <TagEditor tags={tags} onChange={setTags} known={spaceTags(recipes)} />

        <Field label={t('How to make it')}>
          <textarea rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={textareaClass}
            placeholder={t('1. Brown the mince\n2. Add spices\n3. …')} />
        </Field>

        <Button type="submit" icon={Check} className="w-full" busy={busy}>{t('Save recipe')}</Button>
        <ErrorText error={error} />
      </form>

      <PasteSheet open={pasting} onClose={() => setPasting(false)} onAdd={(list) => {
        setIngredients([...ingredients.filter((i) => i.name.trim()), ...list, { name: '', quantity: '' }])
        setPasting(false)
      }} />
    </>
  )
}

function PasteSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (list: Ingredient[]) => void }) {
  const [text, setText] = useState('')
  const list = text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .map(parseEntry)
  return (
    <Sheet open={open} onClose={onClose} title={t('Paste ingredients')}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('One ingredient per line. Amounts like “400 g” or “2” are picked up automatically.')}</p>
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className={textareaClass}
          placeholder={t('400 g minced beef\n1 onion\ntaco spice\n8 tortillas')} />
        <Button icon={Plus} className="w-full" disabled={!list.length} onClick={() => { onAdd(list); setText('') }}>
          {tn(list.length, 'Add {n} ingredient', 'Add {n} ingredients')}
        </Button>
      </div>
    </Sheet>
  )
}


function TagEditor({ tags, onChange, known }: { tags: string[]; onChange: (tags: string[]) => void; known: string[] }) {
  const [text, setText] = useState('')
  const suggestions = known.filter((k) => !tags.some((t) => t.toLowerCase() === k.toLowerCase())).slice(0, 12)

  function add(value: string) {
    onChange(mergeTags(tags, value.split(',')))
    setText('')
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-bold text-muted">{t('Tags')}</span>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-sm font-bold text-brand-text">
              {tag}
              <button type="button" aria-label={t('Remove {name}', { name: tag })} onClick={() => onChange(tags.filter((x) => x !== tag))}
                className="rounded-full p-0.5 hover:bg-card/50"><X className="size-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('e.g. Dessert, Weekday')} aria-label={t('Add tag')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }} />
        <Button type="button" variant="soft" icon={Plus} aria-label={t('Add tag')} disabled={!text.trim()} onClick={() => add(text)} />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button type="button" key={s} onClick={() => add(s)} className="rounded-full bg-soft px-3 py-1 text-sm font-semibold text-muted hover:text-ink">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
