import { BookOpen, Download } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { t } from '../lib/i18n'
import { importRecipe, normalizeUrl, setPendingImport, SOURCES, type SourceId } from '../lib/importRecipe'
import { errorMessage } from '../lib/pb'
import { useSpace } from '../lib/space'
import { Button, ErrorText, Input, Sheet } from './ui'

/** Pick a source, paste a link, and open the filled-in new-recipe form. Links already imported are skipped. */
export default function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { recipes } = useSpace()
  const [sourceId, setSourceId] = useState<SourceId>(SOURCES[0].id)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const source = SOURCES.find((s) => s.id === sourceId)!
  const existing = url.trim() ? recipes.find((r) => r.source_url && r.source_url === normalizeUrl(url)) : undefined

  function close() {
    setUrl('')
    setError('')
    onClose()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (existing) return
    if (!source.pattern.test(url.trim())) {
      setError(t('That link is not a recipe on {site}.', { site: source.site }))
      return
    }
    setBusy(true)
    setError('')
    try {
      setPendingImport(await importRecipe(source.id, url.trim()))
      close()
      navigate('/recipes/new')
    } catch (err) {
      setError(t(errorMessage(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title={t('Import recipe')}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-muted">{t('Source')}</span>
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map((s) => (
              <button type="button" key={s.id} onClick={() => setSourceId(s.id)} aria-pressed={s.id === sourceId}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${s.id === sourceId ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
                {s.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t('More sources later.')}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm text-muted">{t('Paste a link to a recipe on {site}.', { site: source.site })}</p>
          <Input type="url" inputMode="url" required value={url} onChange={(e) => { setUrl(e.target.value); setError('') }}
            placeholder={source.example} aria-label={t('Recipe link')} />
        </div>
        {existing ? (
          <div className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn-text">
            <BookOpen className="size-5 shrink-0" />
            <span className="flex-1">{t('Already imported: {title}', { title: existing.title })}</span>
            <Link to={`/recipes/${existing.id}`} onClick={close} className="shrink-0 font-bold underline">{t('Open recipe')}</Link>
          </div>
        ) : (
          <Button type="submit" icon={Download} className="w-full" busy={busy} disabled={!url.trim()}>{t('Import')}</Button>
        )}
        <ErrorText error={error} />
      </form>
    </Sheet>
  )
}
