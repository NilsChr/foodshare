import { ArrowRight, LogOut, Smile } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Input } from '../components/ui'
import { useMe } from '../lib/auth'
import { col, errorMessage, pb } from '../lib/pb'
import { t } from '../lib/i18n'

/** Accounts made through an email code have no name yet. Ask for one before anything else. */
export default function NameStep() {
  const me = useMe()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      // Updating the signed-in record also updates pb.authStore, which moves the app on.
      await col.users().update(me.id, { name: name.trim() })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-text">
          <Smile className="size-8" />
        </div>
        <h1 className="text-2xl font-black">{t('What should we call you?')}</h1>
        <p className="mt-1 text-muted">{t('Others in your group see this name on the list and in the week plan.')}</p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
        <Input required maxLength={80} autoComplete="given-name" autoFocus value={name}
          onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} />
        <Button type="submit" icon={ArrowRight} className="w-full" busy={busy} disabled={!name.trim()}>
          {t('Continue')}
        </Button>
        <ErrorText error={error} />
      </form>

      <button className="mx-auto flex items-center gap-2 text-sm font-bold text-muted" onClick={() => pb.authStore.clear()}>
        <LogOut className="size-4" /> {t('Sign out ({email})', { email: me.email })}
      </button>
    </main>
  )
}
