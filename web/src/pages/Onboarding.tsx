import { LogOut, Plus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import Invites from '../components/Invites'
import { Button, ErrorText, Input } from '../components/ui'
import { useMe } from '../lib/auth'
import { displayName, errorMessage, pb } from '../lib/pb'
import { useSpaces } from '../lib/space'
import { t } from '../lib/i18n'

/** First run: no space yet. Join through an invite or create one. */
export default function Onboarding() {
  const me = useMe()
  const { createSpace } = useSpaces()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createSpace(name.trim())
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-text">
          <Users className="size-8" />
        </div>
        <h1 className="text-2xl font-black">{t('Hi {name}!', { name: displayName(me) })}</h1>
        <p className="mt-1 text-muted">{t('Create a group for your household or friends, or join one you were invited to.')}</p>
      </div>

      <Invites />

      <form onSubmit={submit} className="space-y-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
        <h2 className="font-extrabold">{t('New group')}</h2>
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. The Hansens, Flatmates')} />
        <Button type="submit" icon={Plus} className="w-full" busy={busy}>
          {t('Create group')}
        </Button>
        <ErrorText error={error} />
      </form>

      <button className="mx-auto flex items-center gap-2 text-sm font-bold text-muted" onClick={() => pb.authStore.clear()}>
        <LogOut className="size-4" /> {t('Sign out ({email})', { email: me.email })}
      </button>
    </main>
  )
}
