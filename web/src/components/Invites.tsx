import { Check, Mail, X } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../lib/pb'
import { useSpaces } from '../lib/space'
import { Button, ErrorText, IconButton } from './ui'
import { t } from '../lib/i18n'

/** Pending invitations for the signed-in user. */
export default function Invites() {
  const { invites, acceptInvite, declineInvite } = useSpaces()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  if (!invites.length) return null

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-extrabold uppercase tracking-wider text-muted">{t('Invitations')}</h2>
      {invites.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3 rounded-2xl bg-brand-soft p-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-card text-brand-text">
            <Mail className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold">{inv.space_name || t('A group')}</p>
            <p className="truncate text-sm text-muted">{t('from {name}', { name: inv.inviter_name || t('someone') })}</p>
          </div>
          <IconButton icon={X} label={t('Decline')} disabled={!!busy} onClick={() => act(inv.id, () => declineInvite(inv))} />
          <Button icon={Check} busy={busy === inv.id} onClick={() => act(inv.id, () => acceptInvite(inv))}>
            {t('Join')}
          </Button>
        </div>
      ))}
      <ErrorText error={error} />
    </section>
  )
}
