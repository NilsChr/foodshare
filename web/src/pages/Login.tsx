import { KeyRound, Mail, ShoppingBasket } from 'lucide-react'
import type { AuthMethodsList } from 'pocketbase'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, Input } from '../components/ui'
import { errorMessage, pb } from '../lib/pb'
import { t } from '../lib/i18n'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  )
}

export default function Login() {
  const [methods, setMethods] = useState<AuthMethodsList | null>(null)
  const [mode, setMode] = useState<'otp' | 'password'>('otp')
  const [signUp, setSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpId, setOtpId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    pb.collection('users')
      .listAuthMethods()
      .then((m) => {
        setMethods(m)
        if (!m.otp.enabled) setMode('password')
      })
      .catch((e) => setError(errorMessage(e)))
  }, [])

  const google = methods?.oauth2.enabled && methods.oauth2.providers.some((p) => p.name === 'google')

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const users = () => pb.collection('users')

  function submitPassword(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      if (signUp) await users().create({ name, email, password, passwordConfirm: password })
      await users().authWithPassword(email, password)
    })
  }

  function submitOtp(e: FormEvent) {
    e.preventDefault()
    run(async () => {
      if (!otpId) {
        // OTP only signs in existing accounts, so make sure one exists. A duplicate email simply fails here.
        const random = crypto.randomUUID()
        await users().create({ email, password: random, passwordConfirm: random }).catch(() => {})
        setOtpId((await users().requestOTP(email)).otpId)
      } else {
        await users().authWithOTP(otpId, code.trim())
      }
    })
  }

  return (
    <main className="pt-safe flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-[28px] bg-brand text-brand-ink shadow-lg shadow-brand/30">
            <ShoppingBasket className="size-10" strokeWidth={2.25} />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Foodshare</h1>
          <p className="mt-1 text-muted">{t('Plan dinners and shop together.')}</p>
        </div>

        <div className="space-y-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
          {google && (
            <>
              <Button
                variant="soft"
                className="w-full"
                busy={busy}
                onClick={() => run(() => users().authWithOAuth2({ provider: 'google' }))}
              >
                <GoogleIcon /> {t('Continue with Google')}
              </Button>
              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted">
                <span className="h-px flex-1 bg-line" /> {t('or')} <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {mode === 'otp' ? (
            <form onSubmit={submitOtp} className="space-y-3">
              <Field label={t('Email')}>
                <Input type="email" required autoComplete="email" value={email} disabled={!!otpId}
                  onChange={(e) => setEmail(e.target.value)} placeholder={t('you@example.com')} />
              </Field>
              {otpId && (
                <Field label={t('Code from your email')}>
                  <Input inputMode="numeric" autoComplete="one-time-code" required value={code}
                    onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus />
                </Field>
              )}
              <Button type="submit" icon={Mail} className="w-full" busy={busy}>
                {otpId ? t('Sign in') : t('Email me a code')}
              </Button>
              {otpId && (
                <button type="button" className="w-full text-sm font-bold text-muted" onClick={() => { setOtpId(''); setCode('') }}>
                  {t('Use a different email')}
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={submitPassword} className="space-y-3">
              {signUp && (
                <Field label={t('Name')}>
                  <Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              )}
              <Field label={t('Email')}>
                <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t('Password')}>
                <Input type="password" required minLength={8} autoComplete={signUp ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Button type="submit" icon={KeyRound} className="w-full" busy={busy}>
                {signUp ? t('Create account') : t('Sign in')}
              </Button>
              <button type="button" className="w-full text-sm font-bold text-muted" onClick={() => setSignUp(!signUp)}>
                {signUp ? t('I already have an account') : t('Create an account')}
              </button>
            </form>
          )}

          <ErrorText error={error} />

          {methods?.otp.enabled && methods.password.enabled && (
            <button type="button" className="w-full text-sm font-bold text-brand-text"
              onClick={() => { setMode(mode === 'otp' ? 'password' : 'otp'); setError('') }}>
              {mode === 'otp' ? t('Sign in with password instead') : t('Sign in with an email code instead')}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
