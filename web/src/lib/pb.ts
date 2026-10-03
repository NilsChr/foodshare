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
