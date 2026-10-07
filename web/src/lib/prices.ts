import { ingredientStatus } from './match'
import type { PantryItem, RecipePrice } from './pb'

/** Lines the household has at home (pantry or tap water); they are left out of what the recipe costs now. */
export function homeLines(price: RecipePrice, pantry: PantryItem[]) {
  return (price.lines ?? []).filter((l) => ingredientStatus(l.name, [], pantry) === 'home')
}

/** What an entry costs now: its total minus the lines at home. */
export function costNow(price: RecipePrice, pantry: PantryItem[]) {
  return price.total - homeLines(price, pantry).reduce((sum, l) => sum + l.price, 0)
}

/** What a recipe costs now, from its newest price entry; null when it has none. `prices` is newest first. */
export function recipeCost(recipeId: string, prices: RecipePrice[], pantry: PantryItem[]) {
  const latest = prices.find((p) => p.recipe === recipeId)
  return latest ? costNow(latest, pantry) : null
}
