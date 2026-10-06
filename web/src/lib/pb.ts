import PocketBase, { type RecordModel } from 'pocketbase'
import { t } from './i18n'

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL)
pb.autoCancellation(false)

export interface User extends RecordModel {
  email: string
  name: string
  avatar: string
}

export interface Space extends RecordModel {
  name: string
  owner: string
  /** Grocery chains whose offers the group compares. */
  chains: string[]
}

export interface Membership extends RecordModel {
  space: string
  user: string
  expand?: { user?: User; space?: Space }
}

export interface Invite extends RecordModel {
  space: string
  email: string
  invited_by: string
  space_name: string
  inviter_name: string
}

export interface Category extends RecordModel {
  space: string
  name: string
  icon: string
  keywords: string[] | null
  sort: number
  group_with: string
}

export interface Ingredient {
  name: string
  quantity: string
}

export interface Recipe extends RecordModel {
  space: string
  title: string
  description: string
  image: string
  servings: number
  minutes: number
  ingredients: Ingredient[] | null
  instructions: string
  favorited_by: string[]
  tags: string[] | null
  source: string
  source_url: string
  created_by: string
}

export interface Item extends RecordModel {
  space: string
  name: string
  quantity: string
  category: string
  checked: boolean
  checked_at: string
  checked_by: string
  added_by: string
  recipe: string
  /** Product type key for matching offers ("coffee"), set by the server; "none" or "" when there is none. */
  product_type: string
}

export interface Meal extends RecordModel {
  space: string
  date: string
  recipe: string
  note: string
  factor: number
}

export interface PantryItem extends RecordModel {
  space: string
  name: string
  added_by: string
}

/** A grocery chain with flyer offers. Shared by everyone, written by the server. */
export interface Chain extends RecordModel {
  tjek_id: string
  name: string
  logo: string
  /** 6 hex digits, no "#". */
  color: string
}

/** This week's flyer offer from a chain. `pre_price`/`discount_pct` are 0 when the flyer gives no before-price. */
export interface Offer extends RecordModel {
  chain: string
  heading: string
  description: string
  price: number
  pre_price: number
  discount_pct: number
  size_from: number
  size_to: number
  unit: string
  pieces: number
  image: string
  run_till: string
  /** Store section key (see OFFER_CATEGORIES); empty until classified. */
  category: string
  /** Product type key, as on items; "none" or "" when there is none. */
  product_type: string
}

export const col = {
  spaces: () => pb.collection<Space>('spaces'),
  memberships: () => pb.collection<Membership>('memberships'),
  invites: () => pb.collection<Invite>('invites'),
  categories: () => pb.collection<Category>('categories'),
  recipes: () => pb.collection<Recipe>('recipes'),
  items: () => pb.collection<Item>('items'),
  meals: () => pb.collection<Meal>('meals'),
  pantry: () => pb.collection<PantryItem>('pantry'),
  users: () => pb.collection<User>('users'),
  chains: () => pb.collection<Chain>('chains'),
  offers: () => pb.collection<Offer>('offers'),
}

export function recipeImage(recipe: Recipe, thumb?: '400x300' | '800x600' | '120x120') {
  if (!recipe.image) return ''
  return pb.files.getURL(recipe, recipe.image, thumb ? { thumb } : undefined)
}

export function avatarUrl(user: User) {
  return user.avatar ? pb.files.getURL(user, user.avatar, { thumb: '100x100' }) : ''
}

export function displayName(user?: User | null) {
  if (!user) return ''
  return user.name || user.email?.split('@')[0] || 'Someone'
}

export function errorMessage(err: unknown) {
  const e = err as { response?: { message?: string; data?: Record<string, { message?: string }> }; message?: string }
  const field = e.response?.data && Object.values(e.response.data)[0]?.message
  return field || e.response?.message || e.message || t('Something went wrong')
}

/** Set what is for dinner on a day. Another member may have planned the day meanwhile, so fall back to updating theirs. */
export async function upsertMeal(space: string, date: string, data: Pick<Meal, 'recipe' | 'note'> & { factor?: number }, known?: Meal) {
  if (known) return col.meals().update(known.id, data)
  try {
    return await col.meals().create({ space, date, ...data })
  } catch (err) {
    const existing = await col.meals().getFirstListItem(pb.filter('space = {:space} && date = {:date}', { space, date })).catch(() => null)
    if (!existing) throw err
    return col.meals().update(existing.id, data)
  }
}
