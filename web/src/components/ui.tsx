import { LoaderCircle, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { avatarUrl, displayName, type User } from '../lib/pb'
import { t } from '../lib/i18n'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-105 shadow-sm',
  soft: 'bg-soft text-ink hover:bg-line',
  ghost: 'text-ink hover:bg-soft',
  danger: 'bg-soft text-danger hover:bg-line',
}

export function Button({
  variant = 'primary',
  icon: Icon,
  busy,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 font-bold transition active:scale-[0.98] disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy ? <LoaderCircle className="size-5 animate-spin" /> : Icon && <Icon className="size-5" strokeWidth={2.25} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  active,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full transition hover:bg-soft active:scale-95 disabled:opacity-40 ${active ? 'text-brand-text' : 'text-muted'} ${className}`}
    >
      <Icon className="size-5" strokeWidth={2.25} />
    </button>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-2xl border border-line bg-card px-4 outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15 ${className}`}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold text-muted">{label}</span>
      {children}
    </label>
  )
}

/** Bottom sheet on phones, centered dialog on wider screens. Built on <dialog> for focus and Escape handling. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Close on a backdrop tap only if the press started there, so the tap that opened the sheet can't close it.
      onPointerDown={(e) => (pressedBackdrop.current = e.target === ref.current)}
      onClick={(e) => e.target === ref.current && pressedBackdrop.current && onClose()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
    >
      {open && (
        <div className="pb-safe">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-5 pb-2 pt-4">
            <h2 className="text-lg font-extrabold">{title}</h2>
            <IconButton icon={X} label={t('Close')} onClick={onClose} />
          </div>
          <div className="px-5 pb-6 pt-1">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function Avatar({ user, size = 'size-9' }: { user?: User; size?: string }) {
  const url = user ? avatarUrl(user) : ''
  const name = displayName(user)
  return url ? (
    <img src={url} alt={name} className={`${size} rounded-full object-cover`} />
  ) : (
    <span
      aria-label={name}
      className={`${size} inline-flex items-center justify-center rounded-full bg-brand-soft text-sm font-extrabold uppercase text-brand-text`}
    >
      {name.slice(0, 1)}
    </span>
  )
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-text">
        <Icon className="size-8" strokeWidth={2} />
      </div>
      <h3 className="text-lg font-extrabold">{title}</h3>
      {children && <div className="mt-1 max-w-xs text-muted">{children}</div>}
    </div>
  )
}

export function PageHeader({ title, children, back }: { title: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-20 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-4">
        {back}
        <h1 className="min-w-0 flex-1 truncate text-2xl font-black tracking-tight">{title}</h1>
        {children}
      </div>
    </header>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16 text-muted">
      <LoaderCircle className="size-7 animate-spin" />
    </div>
  )
}

export function ErrorText({ error }: { error: string }) {
  return error ? <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null
}
