import { BookOpen, CalendarDays, Refrigerator, ShoppingBasket, Users, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useUser } from '../lib/auth'
import { SpaceDataProvider, SpacesProvider, useSpace, useSpaces } from '../lib/space'
import Login from '../pages/Login'
import NameStep from '../pages/NameStep'
import Onboarding from '../pages/Onboarding'
import { Spinner } from './ui'
import { t } from '../lib/i18n'

export default function Layout() {
  const user = useUser()
  if (!user) return <Login />
  if (!user.name?.trim()) return <NameStep />
  return (
    <SpacesProvider key={user.id}>
      <SpaceShell />
    </SpacesProvider>
  )
}

function SpaceShell() {
  const { loading, current } = useSpaces()
  if (loading) return <Spinner />
  if (!current) return <Onboarding />
  return (
    <SpaceDataProvider key={current.id} space={current}>
      <div className="min-h-dvh pb-24">
        <Outlet />
      </div>
      <BottomNav />
    </SpaceDataProvider>
  )
}

function BottomNav() {
  const { invites } = useSpaces()
  const { items } = useSpace()
  const open = items.filter((i) => !i.checked).length
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-2xl grid-cols-5">
        <Tab to="/list" icon={ShoppingBasket} label={t('List')} badge={open} />
        <Tab to="/week" icon={CalendarDays} label={t('Week')} />
        <Tab to="/pantry" icon={Refrigerator} label={t('At home')} />
        <Tab to="/recipes" icon={BookOpen} label={t('Recipes')} />
        <Tab to="/space" icon={Users} label={t('Group')} badge={invites.length} dot />
      </div>
    </nav>
  )
}

function Tab({ to, icon: Icon, label, badge, dot }: { to: string; icon: LucideIcon; label: string; badge?: number; dot?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition ${isActive ? 'text-brand-text' : 'text-muted'}`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`relative flex h-8 w-14 items-center justify-center rounded-full transition ${isActive ? 'bg-brand-soft' : ''}`}>
            <Icon className="size-5" strokeWidth={2.25} />
            {!!badge &&
              (dot ? (
                <span className="absolute right-3 top-1 size-2.5 rounded-full bg-danger ring-2 ring-card" />
              ) : (
                <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-brand px-1.5 text-[11px] leading-5 text-brand-ink ring-2 ring-card">
                  {badge}
                </span>
              ))}
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
