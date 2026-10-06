import {
  Apple, Baby, Beef, Candy, Carrot, Coffee, Cookie, CupSoda, Croissant, Dog, Egg, Fish, Leaf, Milk, Package, Pill,
  Sandwich, Snowflake, Soup, SprayCan, Tag, Wheat, type LucideIcon,
} from 'lucide-react'
import { col, type Category } from './pb'
import { normalize } from './match'
import { locale, t, variants } from './i18n'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  carrot: Carrot, apple: Apple, milk: Milk, egg: Egg, beef: Beef, fish: Fish, croissant: Croissant, wheat: Wheat,
  package: Package, soup: Soup, snowflake: Snowflake, 'cup-soda': CupSoda, coffee: Coffee, cookie: Cookie,
  candy: Candy, sandwich: Sandwich, leaf: Leaf, 'spray-can': SprayCan, pill: Pill, baby: Baby, dog: Dog, tag: Tag,
}

export function categoryIcon(key?: string): LucideIcon {
  return (key && CATEGORY_ICONS[key]) || Tag
}

// Store-walk order. Keywords are English and Norwegian; members can edit them per space,
// and recategorizing an item teaches its category the item name.
export const DEFAULT_CATEGORIES: { name: string; icon: string; sort: number; keywords: string[] }[] = [
  {
    name: 'Vegetables', icon: 'carrot', sort: 0, keywords: [
      'carrot', 'potato', 'onion', 'red onion', 'garlic', 'tomato', 'cucumber', 'lettuce', 'salad', 'spinach',
      'broccoli', 'cauliflower', 'pepper', 'bell pepper', 'paprika', 'chili', 'zucchini', 'eggplant', 'aubergine',
      'mushroom', 'leek', 'celery', 'cabbage', 'kale', 'corn', 'peas', 'beans', 'sweet potato', 'avocado', 'ginger',
      'spring onion', 'asparagus', 'beetroot', 'radish', 'herbs', 'basil', 'parsley', 'cilantro', 'coriander', 'dill',
      'gulrot', 'potet', 'løk', 'rødløk', 'hvitløk', 'tomat', 'agurk', 'salat', 'spinat', 'brokkoli', 'blomkål',
      'squash', 'sopp', 'purre', 'selleri', 'kål', 'grønnkål', 'mais', 'erter', 'bønner', 'søtpotet', 'ingefær',
      'vårløk', 'asparges', 'rødbete', 'reddik', 'persille', 'basilikum', 'koriander', 'gressløk',
    ],
  },
  {
    name: 'Fruit', icon: 'apple', sort: 1, keywords: [
      'apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'pear', 'strawberry', 'strawberries', 'blueberry',
      'blueberries', 'raspberry', 'raspberries', 'melon', 'watermelon', 'pineapple', 'mango', 'kiwi', 'peach', 'plum',
      'eple', 'banan', 'appelsin', 'sitron', 'druer', 'pære', 'jordbær', 'blåbær', 'bringebær', 'vannmelon',
      'ananas', 'fersken', 'plomme', 'klementin', 'mandarin',
    ],
  },
  {
    name: 'Bakery', icon: 'croissant', sort: 2, keywords: [
      'bread', 'baguette', 'rolls', 'buns', 'tortilla', 'wraps', 'pita', 'croissant', 'bagel', 'crispbread',
      'brød', 'loff', 'rundstykker', 'boller', 'lomper', 'knekkebrød', 'pitabrød', 'polarbrød',
    ],
  },
  {
    name: 'Meat & fish', icon: 'beef', sort: 3, keywords: [
      'chicken', 'beef', 'pork', 'mince', 'minced meat', 'ground beef', 'bacon', 'ham', 'sausage', 'sausages',
      'salami', 'lamb', 'turkey', 'steak', 'fish', 'salmon', 'cod', 'tuna', 'shrimp', 'prawns',
      'kylling', 'kjøttdeig', 'kjøtt', 'svin', 'storfe', 'skinke', 'pølse', 'pølser', 'lam', 'kalkun', 'biff', 'fisk',
      'laks', 'torsk', 'sei', 'reker', 'fiskekaker', 'karbonadedeig',
    ],
  },
  {
    name: 'Dairy & eggs', icon: 'milk', sort: 4, keywords: [
      'milk', 'cheese', 'butter', 'yogurt', 'yoghurt', 'cream', 'sour cream', 'cream cheese', 'eggs', 'egg',
      'mozzarella', 'parmesan', 'feta', 'cottage cheese',
      'melk', 'ost', 'smør', 'yoghurt', 'fløte', 'rømme', 'kremfløte', 'matfløte', 'egg', 'kesam', 'brunost',
      'cottage', 'kulturmelk', 'kefir',
    ],
  },
  {
    name: 'Pantry', icon: 'wheat', sort: 5, keywords: [
      'pasta', 'spaghetti', 'rice', 'noodles', 'flour', 'sugar', 'salt', 'oil', 'olive oil', 'vinegar', 'stock',
      'broth', 'canned tomatoes', 'tomato paste', 'lentils', 'chickpeas', 'oats', 'cereal', 'honey', 'jam',
      'peanut butter', 'soy sauce', 'ketchup', 'mustard', 'mayonnaise', 'spice', 'taco', 'curry', 'coconut milk',
      'nuts', 'baking powder', 'yeast',
      'ris', 'nudler', 'mel', 'hvetemel', 'sukker', 'olje', 'olivenolje', 'eddik', 'buljong', 'kraft',
      'hermetiske tomater', 'tomatpuré', 'linser', 'kikerter', 'havregryn', 'frokostblanding', 'syltetøy',
      'soyasaus', 'sennep', 'majones', 'krydder', 'kokosmelk', 'nøtter', 'bakepulver', 'gjær',
    ],
  },
  {
    name: 'Frozen', icon: 'snowflake', sort: 6, keywords: [
      'frozen', 'ice cream', 'pizza', 'frozen peas', 'fries',
      'frossen', 'frosne', 'is', 'iskrem', 'frysepizza', 'pommes frites',
    ],
  },
  {
    name: 'Snacks', icon: 'cookie', sort: 7, keywords: [
      'chips', 'chocolate', 'candy', 'cookies', 'biscuits', 'popcorn', 'crackers',
      'sjokolade', 'godteri', 'kjeks', 'smågodt', 'snacks',
    ],
  },
  {
    name: 'Drinks', icon: 'cup-soda', sort: 8, keywords: [
      'juice', 'soda', 'water', 'sparkling water', 'coffee', 'tea', 'beer', 'wine', 'cola', 'lemonade',
      'brus', 'vann', 'kaffe', 'te', 'øl', 'vin', 'saft', 'farris', 'eplejuice', 'appelsinjuice',
    ],
  },
  {
    name: 'Household', icon: 'spray-can', sort: 9, keywords: [
      'toilet paper', 'paper towels', 'detergent', 'dish soap', 'soap', 'shampoo', 'toothpaste', 'trash bags',
      'diapers', 'foil', 'cling film', 'batteries',
      'dopapir', 'tørkepapir', 'vaskemiddel', 'oppvaskmiddel', 'såpe', 'sjampo', 'tannkrem', 'søppelposer',
      'bleier', 'folie', 'plastfolie', 'batterier', 'oppvasktabletter',
    ],
  },
]

export async function createDefaultCategories(spaceId: string) {
  await Promise.all(DEFAULT_CATEGORIES.map((c) => col.categories().create({ ...c, space: spaceId })))
}

/** Teach a category an item name: add it to that category's keywords and drop it from the others. */
export async function learnKeyword(name: string, categoryId: string, categories: Category[]) {
  const kw = normalize(name)
  if (!kw) return
  await Promise.all(
    categories.map((c) => {
      const list = c.keywords ?? []
      const has = list.some((k) => normalize(k) === kw)
      if (c.id === categoryId && !has) return col.categories().update(c.id, { keywords: [...list, kw] })
      if (c.id !== categoryId && has) {
        return col.categories().update(c.id, { keywords: list.filter((k) => normalize(k) !== kw) })
      }
    }),
  )
}

const DEFAULT_NAMES = DEFAULT_CATEGORIES.map((c) => c.name)

/** Default section names show in the viewer's language until someone renames the section. */
export function categoryName(c: Pick<Category, 'name'>) {
  const source = DEFAULT_NAMES.find((n) => variants(n).includes(c.name))
  return source ? t(source) : c.name
}

/** The section an item's category is shown under: its group leader, or itself. */
export function sectionLeader(categoryId: string, categories: Category[]) {
  const c = categories.find((x) => x.id === categoryId)
  if (!c) return undefined
  return (c.group_with && categories.find((x) => x.id === c.group_with)) || c
}

export function groupMembers(leader: Category, categories: Category[]) {
  return categories.filter((c) => c.group_with === leader.id)
}

/** "Frukt og grønnsaker" for a leader shown together with others; just its name otherwise. */
export function sectionTitle(leader: Category, categories: Category[]) {
  const names = [leader, ...groupMembers(leader, categories)].map(categoryName)
  if (names.length === 1) return names[0]
  const rest = names.slice(1).map((n) => n.toLocaleLowerCase(locale))
  return t('{a} & {b}', { a: [names[0], ...rest.slice(0, -1)].join(', '), b: rest[rest.length - 1] })
}

// Offer categories (set on the server by pocketbase/pb_hooks/offers_classify.js) are the
// default sections by key, plus "other".
const OFFER_SECTIONS: Record<string, string> = {
  vegetables: 'Vegetables', fruit: 'Fruit', bakery: 'Bakery', meat_fish: 'Meat & fish', dairy_eggs: 'Dairy & eggs',
  pantry: 'Pantry', frozen: 'Frozen', snacks: 'Snacks', drinks: 'Drinks', household: 'Household',
}
export const OFFER_CATEGORIES = [...Object.keys(OFFER_SECTIONS), 'other']

export function offerCategoryName(key: string) {
  return OFFER_SECTIONS[key] ? t(OFFER_SECTIONS[key]) : t('Other')
}

export function offerCategoryIcon(key: string) {
  return categoryIcon(DEFAULT_CATEGORIES.find((c) => c.name === OFFER_SECTIONS[key])?.icon)
}

/** The group's section for an offer category: its default section, if the group still has it under that name. */
export function sectionForOffer(key: string, categories: Category[]) {
  const name = OFFER_SECTIONS[key]
  return (name && categories.find((c) => variants(name).includes(c.name))?.id) || ''
}
