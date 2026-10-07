import {
  Check, ChevronRight, Newspaper, PiggyBank, Languages, Link2, Crown, LogOut, Pencil, Plus, Send, Trash2, UserMinus, X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import Invites from '../components/Invites'
import { ChainLogo } from '../components/offers'
import SectionOrder from '../components/SectionOrder'
import { Avatar, Button, RollingNumber, ErrorText, Field, IconButton, Input, PageHeader, Sheet } from '../components/ui'
import { useMe } from '../lib/auth'
import { CATEGORY_ICONS, categoryIcon, categoryName, groupMembers } from '../lib/categories'
import { col, displayName, errorMessage, pb, type Category, type Chain, type Invite } from '../lib/pb'
import { useSpace, useSpaces } from '../lib/space'
import { lang, locale, setLang, t, tn } from '../lib/i18n'
import { formatPrice, saving } from '../lib/offers'

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const card = 'rounded-3xl bg-card ring-1 ring-line divide-y divide-line overflow-hidden'

export default function SpacePage() {
  const me = useMe()
  const { spaces, select, createSpace, reload } = useSpaces()
  const { space, members, reloadMembers } = useSpace()
  const isOwner = space.owner === me.id
  const [renaming, setRenaming] = useState(false)
  const [newSpace, setNewSpace] = useState(false)
  const [error, setError] = useState('')

  async function removeMember(membershipId: string, self: boolean) {
    if (!confirm(self ? t('Leave {name}?', { name: space.name }) : t('Remove this member from the group?'))) return
    try {
      await col.memberships().delete(membershipId)
      if (self) await reload()
      else reloadMembers()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader title={space.name}>
        <IconButton icon={Pencil} label={t('Rename group')} onClick={() => setRenaming(true)} />
      </PageHeader>
      <main className="mx-auto max-w-2xl space-y-7 px-4 pb-6">
        <Invites />
        <ErrorText error={error} />
        <Savings />

        <Section title={t('Members')}>
          <div className={card}>
            {members.map((m) => {
              const self = m.user === me.id
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar user={m.expand?.user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {displayName(m.expand?.user)} {self && <span className="text-muted">{t('(you)')}</span>}
                    </p>
                    {m.expand?.user?.email && <p className="truncate text-sm text-muted">{m.expand.user.email}</p>}
                  </div>
                  {m.user === space.owner ? (
                    <Crown className="size-5 text-warn-text" aria-label={t('Owner')} />
                  ) : (
                    (isOwner || self) && (
                      <IconButton icon={self ? LogOut : UserMinus} label={self ? t('Leave group') : t('Remove member')}
                        onClick={() => removeMember(m.id, self)} />
                    )
                  )}
                </div>
              )
            })}
          </div>
          <InviteForm />
        </Section>

        <Stores />

        <Categories />

        <Section title={t('Your groups')} action={
          <button className="flex items-center gap-1 text-sm font-bold text-brand-text" onClick={() => setNewSpace(true)}>
            <Plus className="size-4" /> {t('New')}
          </button>
        }>
          <div className={card}>
            {spaces.map((s) => (
              <button key={s.id} onClick={() => select(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-soft">
                <span className="flex-1 truncate font-bold">{s.name}</span>
                {s.id === space.id && <Check className="size-5 text-brand-text" />}
              </button>
            ))}
          </div>
        </Section>

        <Account />

        {isOwner && <DeleteSpace />}

        <p className="text-center text-xs text-muted">Foodshare v{__APP_VERSION__}</p>
      </main>

      <NameSheet
        open={renaming}
        title={t('Rename group')}
        initial={space.name}
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          await col.spaces().update(space.id, { name })
          await reload()
        }}
      />
      <NameSheet
        open={newSpace}
        title={t('New group')}
        initial=""
        onClose={() => setNewSpace(false)}
        onSave={async (name) => {
          await createSpace(name)
        }}
      />
    </>
  )
}

function NameSheet({ open, title, initial, onClose, onSave }: {
  open: boolean; title: string; initial: string; onClose: () => void; onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setName(initial)
      setError('')
    }
  }, [open, initial])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSave(name.trim())
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Button type="submit" icon={Check} className="w-full" busy={busy}>{t('Save')}</Button>
        <ErrorText error={error} />
      </form>
    </Sheet>
  )
}

function InviteForm() {
  const me = useMe()
  const { space } = useSpace()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<Invite[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  const load = () => col.invites().getFullList({ filter: `space = "${space.id}"`, sort: 'created' }).then(setPending)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), [space.id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSent('')
    const address = email.trim().toLowerCase()
    try {
      await col.invites().create({
        space: space.id, email: address, invited_by: me.id, space_name: space.name, inviter_name: displayName(me),
      })
      setSent(address)
      setEmail('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <form onSubmit={submit} className="flex gap-2">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('Invite by email')} />
        <Button type="submit" icon={Send} busy={busy} aria-label={t('Send invite')} />
      </form>
      {sent && (
        <p className="px-1 text-sm text-muted">
          {t('Invited {email}. They will see the invite when they sign in to Foodshare with that email.', { email: sent })}
        </p>
      )}
      <ErrorText error={error} />
      {pending.map((inv) => (
        <div key={inv.id} className="flex items-center gap-2 rounded-2xl bg-soft py-1 pl-4 pr-1 text-sm">
          <span className="flex-1 truncate">
            <span className="text-muted">{t('Pending:')}</span> <b>{inv.email}</b>
          </span>
          <IconButton icon={X} label={t('Cancel invite')} onClick={() => col.invites().delete(inv.id).then(load)} />
        </div>
      ))}
    </div>
  )
}

/** The chains whose offers the group sees. Saved on the space, so it applies to every member. */
function Stores() {
  const { reload } = useSpaces()
  const { space, chains } = useSpace()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const selected = chains.filter((c) => space.chains?.includes(c.id))

  async function save(ids: string[]) {
    setError('')
    try {
      await col.spaces().update(space.id, { chains: ids })
      await reload()
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
  }

  return (
    <Section title={t('Stores')} action={
      <button className="flex items-center gap-1 text-sm font-bold text-brand-text" onClick={() => setAdding(true)}>
        <Plus className="size-4" /> {t('Add')}
      </button>
    }>
      {selected.length ? (
        <div className={card}>
          {selected.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2 pl-4 pr-1">
              <ChainLogo chain={c} className="h-7 w-16" />
              <span className="flex-1 truncate font-bold">{c.name}</span>
              <IconButton icon={X} label={t('Remove {name}', { name: c.name })}
                onClick={() => save(space.chains.filter((id) => id !== c.id)).catch(() => {})} />
            </div>
          ))}
          <Link to="/offers" className="flex items-center gap-3 px-4 py-3 font-bold text-brand-text hover:bg-soft">
            <Newspaper className="size-5" />
            <span className="flex-1">{t('See flyer offers')}</span>
            <ChevronRight className="size-5" />
          </Link>
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">
          {t('Add the stores you shop at to see this week’s offers from them on the list.')}
        </p>
      )}
      <ErrorText error={error} />
      <AddStoresSheet open={adding} onClose={() => setAdding(false)}
        options={chains.filter((c) => !space.chains?.includes(c.id))}
        onAdd={(ids) => save([...(space.chains ?? []), ...ids])} />
    </Section>
  )
}

function AddStoresSheet({ open, onClose, options, onAdd }: {
  open: boolean; onClose: () => void; options: Chain[]; onAdd: (ids: string[]) => Promise<void>
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setPicked([])
  }, [open])

  async function add() {
    setBusy(true)
    try {
      await onAdd(picked)
      onClose()
    } catch {
      // The error shows under the store list.
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Add stores')}>
      {options.length ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((c) => {
              const on = picked.includes(c.id)
              return (
                <button key={c.id} onClick={() => setPicked(on ? picked.filter((id) => id !== c.id) : [...picked, c.id])} aria-pressed={on}
                  className={`flex items-center gap-2 rounded-2xl p-2 pr-3 text-left text-sm font-bold ring-1 transition active:scale-[0.98] ${on ? 'bg-brand-soft ring-brand' : 'bg-card ring-line'}`}>
                  <ChainLogo chain={c} className="h-7 w-16" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {on && <Check className="size-4 shrink-0 text-brand-text" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
          <Button icon={Plus} className="w-full" busy={busy} disabled={!picked.length} onClick={add}>
            {picked.length ? tn(picked.length, 'Add {n} store', 'Add {n} stores') : t('Add stores')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t('All stores are added.')}</p>
      )}
    </Sheet>
  )
}

function Categories() {
  const { space, categories } = useSpace()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <Section title={t('Store sections')} action={
      <button className="flex items-center gap-1 text-sm font-bold text-brand-text" onClick={() => setEditing('new')}>
        <Plus className="size-4" /> {t('Add')}
      </button>
    }>
      <p className="px-1 text-sm text-muted">
        {t('Items are sorted into sections by keyword. Drag to set the order you walk the store in. Move an item to another section and Foodshare remembers it.')}
      </p>
      <SectionOrder categories={categories} onEdit={setEditing} />
      <CategorySheet
        category={editing}
        onClose={() => setEditing(null)}
        spaceId={space.id}
        nextSort={categories.length}
      />
    </Section>
  )
}

function CategorySheet({ category, onClose, spaceId, nextSort }: {
  category: Category | 'new' | null; onClose: () => void; spaceId: string; nextSort: number
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('tag')
  const [keywords, setKeywords] = useState<string[]>([])
  const [kw, setKw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { categories } = useSpace()
  const [groupWith, setGroupWith] = useState('')

  useEffect(() => {
    if (!category) return
    const c = category === 'new' ? null : category
    setGroupWith(c?.group_with ?? '')
    setName(c ? categoryName(c) : '')
    setIcon(c?.icon || 'tag')
    setKeywords(c?.keywords ?? [])
    setKw('')
    setError('')
  }, [category])

  function addKeyword() {
    const words = kw.split(',').map((w) => w.trim().toLowerCase()).filter((w) => w && !keywords.includes(w))
    if (words.length) setKeywords([...keywords, ...words])
    setKw('')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = { name: name.trim(), icon, keywords, group_with: groupWith }
      if (category === 'new') await col.categories().create({ ...data, space: spaceId, sort: nextSort })
      else if (category) await col.categories().update(category.id, data)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!category || category === 'new' || !confirm(t('Delete “{name}”? Its items move to Other.', { name: categoryName(category) }))) return
    await col.categories().delete(category.id)
    onClose()
  }

  return (
    <Sheet open={!!category} onClose={onClose} title={category === 'new' ? t('New section') : t('Edit section')}>
      <form onSubmit={save} className="space-y-4">
        <Field label={t('Name')}>
          <Input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-muted">{t('Icon')}</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button type="button" key={key} aria-label={key} onClick={() => setIcon(key)}
                className={`flex size-10 items-center justify-center rounded-xl transition ${icon === key ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
                <Icon className="size-5" />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-bold text-muted">{t('Keywords')}</span>
          <div className="flex gap-2">
            <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder={t('e.g. tomato, gulrot')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }} />
            <Button type="button" variant="soft" icon={Plus} onClick={addKeyword} aria-label={t('Add keyword')} />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {keywords.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-soft py-1 pl-3 pr-1 text-sm font-semibold">
                {k}
                <button type="button" aria-label={t('Remove {name}', { name: k })} onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                  className="rounded-full p-0.5 text-muted hover:bg-line"><X className="size-3.5" /></button>
              </span>
            ))}
          </div>
        </div>
        <GroupPicker category={category} categories={categories} value={groupWith} onChange={setGroupWith} />
        <div className="flex gap-2">
          {category !== 'new' && <Button type="button" variant="danger" icon={Trash2} onClick={remove} aria-label={t('Delete section')} />}
          <Button type="submit" icon={Check} className="flex-1" busy={busy}>{t('Save')}</Button>
        </div>
        <ErrorText error={error} />
      </form>
    </Sheet>
  )
}

/** "312 kr saved on offers since 7 October 2026", from the group's bought offers. Hidden until something was saved. */
function Savings() {
  const { space } = useSpace()
  const [summary, setSummary] = useState<{ saved: number; since: Date; space: string } | null>(null)

  useEffect(() => {
    let alive = true
    col.purchases().getFullList({ filter: pb.filter('space = {:id}', { id: space.id }), sort: 'created', fields: 'price,pre_price,created' })
      .then((list) => alive && list.length > 0 && setSummary({
        saved: list.reduce((sum, p) => sum + saving(p), 0), since: new Date(list[0].created.replace(' ', 'T')), space: space.id,
      }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [space.id])

  // Ignore a summary left from the group shown before.
  if (!summary || summary.space !== space.id || summary.saved <= 0) return null
  return (
    <Link to="/savings" className="flex items-center gap-3 rounded-3xl bg-brand-soft px-4 py-3 active:scale-[0.99]">
      <PiggyBank className="size-7 shrink-0 text-brand-text" />
      <p className="min-w-0 flex-1">
        <b className="block text-lg font-extrabold tabular-nums text-brand-text"><RollingNumber text={formatPrice(summary.saved, true)} /></b>
        <span className="block text-sm">
          {t('saved on offers since {date}', { date: summary.since.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
        </span>
      </p>
      <ChevronRight className="size-5 shrink-0 text-brand-text" />
    </Link>
  )
}

function Account() {
  const me = useMe()
  const [editing, setEditing] = useState(false)
  return (
    <Section title={t('You')}>
      <div className={card}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar user={me} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{displayName(me)}</p>
            <p className="truncate text-sm text-muted">{me.email}</p>
          </div>
          <IconButton icon={Pencil} label={t('Edit name')} onClick={() => setEditing(true)} />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <Languages className="size-5 text-muted" />
          <span className="flex-1 font-bold">{t('Language')}</span>
          <div className="flex rounded-full bg-soft p-1">
            {([['en', 'English'], ['no', 'Norsk']] as const).map(([code, label]) => (
              <button key={code} onClick={() => code !== lang && setLang(code)} aria-pressed={code === lang}
                className={`rounded-full px-3 py-1 text-sm font-bold transition ${code === lang ? 'bg-card shadow-sm' : 'text-muted'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="flex w-full items-center gap-3 px-4 py-3 font-bold text-danger hover:bg-soft" onClick={() => pb.authStore.clear()}>
          <LogOut className="size-5" /> {t('Sign out')}
        </button>
      </div>
      <NameSheet open={editing} title={t('Your name')} initial={me.name} onClose={() => setEditing(false)}
        onSave={async (name) => {
          await col.users().update(me.id, { name })
          await pb.collection('users').authRefresh()
        }} />
    </Section>
  )
}

function DeleteSpace() {
  const { reload } = useSpaces()
  const { space } = useSpace()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = typed.trim() === space.name.trim()

  function close() {
    setOpen(false)
    setTyped('')
    setError('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!matches) return
    setBusy(true)
    try {
      // Cascades to memberships, invites, sections, items, recipes (with photos) and meals.
      await col.spaces().delete(space.id)
      await reload()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="danger" icon={Trash2} className="w-full" onClick={() => setOpen(true)}>
        {t('Delete group')}
      </Button>
      <Sheet open={open} onClose={close} title={t('Delete {name}?', { name: space.name })}>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-muted">
            {t('This permanently deletes the shopping list, recipes and photos, week plan and store sections for everyone in the group. It cannot be undone.')}
          </p>
          <Field label={t('Type “{name}” to confirm', { name: space.name })}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </Field>
          <Button type="submit" variant="danger" icon={Trash2} className="w-full" disabled={!matches} busy={busy}>
            {t('Delete group')}
          </Button>
          <ErrorText error={error} />
        </form>
      </Sheet>
    </>
  )
}

/** Show a section under another's header in the list. Only one level: a section others are shown with can't join another. */
function GroupPicker({ category, categories, value, onChange }: {
  category: Category | 'new' | null; categories: Category[]; value: string; onChange: (id: string) => void
}) {
  const self = category && category !== 'new' ? category : null
  if (self && groupMembers(self, categories).length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Link2 className="size-4" />
        {t('Shown together with: {names}', { names: groupMembers(self, categories).map(categoryName).join(', ') })}
      </p>
    )
  }
  const leaders = categories.filter((c) => c.id !== self?.id && !(c.group_with && categories.some((x) => x.id === c.group_with)))
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-bold text-muted">{t('Show together with')}</span>
      <div className="flex flex-wrap gap-1.5">
        {[undefined, ...leaders].map((c) => {
          const id = c?.id ?? ''
          const Icon = c ? categoryIcon(c.icon) : X
          return (
            <button type="button" key={id || 'none'} onClick={() => onChange(id)} aria-pressed={value === id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${value === id ? 'bg-brand text-brand-ink' : 'bg-soft'}`}>
              <Icon className="size-4" /> {c ? categoryName(c) : t('Nothing (own section)')}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted">{t('Sections keep their own keywords; the list just shows them under one header.')}</p>
    </div>
  )
}

