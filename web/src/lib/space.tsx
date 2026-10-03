import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMe } from './auth'
import { createDefaultCategories } from './categories'
import { col, type Category, type Invite, type Item, type Meal, type Membership, type Recipe, type Space } from './pb'
import { useLiveRecords } from './realtime'

const CURRENT_KEY = 'foodshare.space'

function readCurrent() {
  try {
    return localStorage.getItem(CURRENT_KEY) ?? ''
  } catch {
    return ''
  }
}

interface SpacesState {
  spaces: Space[]
  invites: Invite[]
  loading: boolean
  current: Space | undefined
  select: (id: string) => void
  reload: () => Promise<void>
  createSpace: (name: string) => Promise<Space>
  acceptInvite: (invite: Invite) => Promise<void>
  declineInvite: (invite: Invite) => Promise<void>
}

const SpacesContext = createContext<SpacesState | null>(null)

/** The spaces the user belongs to, pending invites, and which space is selected. */
export function SpacesProvider({ children }: { children: ReactNode }) {
  const me = useMe()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [currentId, setCurrentId] = useState(readCurrent)

  const reload = useCallback(async () => {
    const [memberships, pending] = await Promise.all([
      col.memberships().getFullList({ filter: `user = "${me.id}"`, expand: 'space', sort: 'created' }),
      col.invites().getFullList({ filter: `email = "${me.email.toLowerCase()}"`, sort: '-created' }),
    ])
    setSpaces(memberships.map((m) => m.expand?.space).filter((s): s is Space => !!s))
    setInvites(pending)
    setLoading(false)
  }, [me.id, me.email])

  useEffect(() => {
    reload()
  }, [reload])

  const select = useCallback((id: string) => {
    setCurrentId(id)
    try {
      localStorage.setItem(CURRENT_KEY, id)
    } catch {
      // Selection still works for this session.
    }
  }, [])

  const createSpace = useCallback(
    async (name: string) => {
      const space = await col.spaces().create({ name, owner: me.id })
      await col.memberships().create({ space: space.id, user: me.id })
      await createDefaultCategories(space.id)
      await reload()
      select(space.id)
      return space
    },
    [me.id, reload, select],
  )

  const acceptInvite = useCallback(
    async (invite: Invite) => {
      await col.memberships().create({ space: invite.space, user: me.id })
      await col.invites().delete(invite.id)
      await reload()
      select(invite.space)
    },
    [me.id, reload, select],
  )

  const declineInvite = useCallback(
    async (invite: Invite) => {
      await col.invites().delete(invite.id)
      await reload()
    },
    [reload],
  )

  const current = spaces.find((s) => s.id === currentId) ?? spaces[0]
  const value = { spaces, invites, loading, current, select, reload, createSpace, acceptInvite, declineInvite }
  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
}

export function useSpaces() {
  const ctx = useContext(SpacesContext)
  if (!ctx) throw new Error('useSpaces outside SpacesProvider')
  return ctx
}

interface SpaceData {
  space: Space
  items: Item[]
  recipes: Recipe[]
  categories: Category[]
  meals: Meal[]
  members: Membership[]
  loading: boolean
  patchItem: (item: Item) => void
  removeItem: (id: string) => void
  patchRecipe: (recipe: Recipe) => void
  patchMeal: (meal: Meal) => void
  removeMeal: (id: string) => void
  reloadMembers: () => void
}

const SpaceDataContext = createContext<SpaceData | null>(null)

/** Live data for the selected space, shared by every page. */
export function SpaceDataProvider({ space, children }: { space: Space; children: ReactNode }) {
  const items = useLiveRecords(col.items, space.id)
  const recipes = useLiveRecords(col.recipes, space.id, 'title')
  const categories = useLiveRecords(col.categories, space.id, 'sort')
  const meals = useLiveRecords(col.meals, space.id, 'date')
  const [members, setMembers] = useState<Membership[]>([])

  const reloadMembers = useCallback(() => {
    col.memberships()
      .getFullList({ filter: `space = "${space.id}"`, expand: 'user', sort: 'created' })
      .then(setMembers)
  }, [space.id])
  useEffect(reloadMembers, [reloadMembers])

  const value = useMemo<SpaceData>(
    () => ({
      space,
      items: items.records,
      recipes: [...recipes.records].sort((a, b) => a.title.localeCompare(b.title)),
      categories: [...categories.records].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
      meals: meals.records,
      members,
      loading: items.loading || recipes.loading || categories.loading,
      patchItem: items.patch,
      removeItem: items.remove,
      patchRecipe: recipes.patch,
      patchMeal: meals.patch,
      removeMeal: meals.remove,
      reloadMembers,
    }),
    // patch/remove helpers only close over setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [space, items.records, recipes.records, categories.records, meals.records, members, items.loading, recipes.loading, categories.loading, reloadMembers],
  )
  return <SpaceDataContext.Provider value={value}>{children}</SpaceDataContext.Provider>
}

export function useSpace() {
  const ctx = useContext(SpaceDataContext)
  if (!ctx) throw new Error('useSpace outside SpaceDataProvider')
  return ctx
}
