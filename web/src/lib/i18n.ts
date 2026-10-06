// Tiny i18n: English source strings are the keys, NO maps them to Norwegian (bokmål).
// The language is fixed for the page lifetime; switching stores the choice and reloads.

export type Lang = 'en' | 'no'
const KEY = 'foodshare.lang'

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'no') return saved
  } catch {
    // Fall back to the browser language.
  }
  return /^(nb|nn|no)\b/i.test(navigator.language) ? 'no' : 'en'
}

export const lang: Lang = detect()
export const locale = lang === 'no' ? 'nb-NO' : 'en-GB'
document.documentElement.lang = lang === 'no' ? 'nb' : 'en'

export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Choice only lasts until reload.
  }
  location.reload()
}

type Vars = Record<string, string | number>

export function t(source: string, vars?: Vars) {
  let text = source
  if (lang === 'no') {
    if (source in NO) text = NO[source]
    else if (import.meta.env.DEV) console.warn('[i18n] missing Norwegian for:', source)
  }
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v))
  return text
}

/** A source string and its translations, e.g. to recognise stored default names in any language. */
export function variants(source: string) {
  return NO[source] ? [source, NO[source]] : [source]
}

/** Pick singular/plural source string by n; {n} is available in both. */
export function tn(n: number, one: string, other: string, vars?: Vars) {
  return t(n === 1 ? one : other, { n, ...vars })
}

const NO: Record<string, string> = {
  // Navigation
  List: 'Liste',
  Week: 'Uke',
  Recipes: 'Oppskrifter',
  Group: 'Gruppe',
  Close: 'Lukk',
  Back: 'Tilbake',
  Save: 'Lagre',
  Add: 'Legg til',
  New: 'Ny',
  Name: 'Navn',
  Other: 'Annet',
  Today: 'I dag',
  'Something went wrong': 'Noe gikk galt',

  // Login
  'Plan dinners and shop together.': 'Planlegg middager og handle sammen.',
  'Continue with Google': 'Fortsett med Google',
  or: 'eller',
  Email: 'E-post',
  'you@example.com': 'deg@eksempel.no',
  'Code from your email': 'Kode fra e-posten din',
  'Sign in': 'Logg inn',
  'Email me a code': 'Send meg en kode',
  'Use a different email': 'Bruk en annen e-post',
  Password: 'Passord',
  'Create account': 'Opprett konto',
  'I already have an account': 'Jeg har allerede en konto',
  'Create an account': 'Opprett en konto',
  'Sign in with password instead': 'Logg inn med passord i stedet',
  'Sign in with an email code instead': 'Logg inn med kode på e-post i stedet',

  // Name step
  'What should we call you?': 'Hva skal vi kalle deg?',
  'Others in your group see this name on the list and in the week plan.': 'Andre i gruppen ser dette navnet på handlelisten og i ukeplanen.',
  Continue: 'Fortsett',

  // Onboarding and invites
  'Hi {name}!': 'Hei {name}!',
  'Create a group for your household or friends, or join one you were invited to.': 'Lag en gruppe for husstanden eller vennene dine, eller bli med i en du er invitert til.',
  'New group': 'Ny gruppe',
  'e.g. The Hansens, Flatmates': 'f.eks. Familien Hansen, Kollektivet',
  'Create group': 'Opprett gruppe',
  'Sign out': 'Logg ut',
  'Sign out ({email})': 'Logg ut ({email})',
  Invitations: 'Invitasjoner',
  'A group': 'En gruppe',
  'from {name}': 'fra {name}',
  someone: 'noen',
  Decline: 'Avslå',
  Join: 'Bli med',

  // Shopping list
  'Shopping list': 'Handleliste',
  'Grouped by store section': 'Gruppert etter butikkavdeling',
  'In order added': 'I rekkefølgen de ble lagt til',
  'Add item, e.g. 2 l milk': 'Legg til vare, f.eks. 2 l melk',
  'Add item': 'Legg til vare',
  'The list is empty': 'Listen er tom',
  'Add what you need, or add a recipe from the Recipes tab.':
    'Legg til det du trenger, eller legg til en oppskrift fra Oppskrifter.',
  'All done!': 'Alt er handlet!',
  'Everything on the list is in the basket.': 'Alt på listen ligger i kurven.',
  'In the basket ({n})': 'I kurven ({n})',
  Clear: 'Tøm',
  'Remove {n} crossed-off item?': 'Fjerne {n} avkrysset vare?',
  'Remove {n} crossed-off items?': 'Fjerne {n} avkryssede varer?',
  'Clear list': 'Tøm listen',
  'Remove {n} item from the list?': 'Fjerne {n} vare fra listen?',
  'Remove all {n} items from the list?': 'Fjerne alle {n} varene fra listen?',
  'Crossed-off items count as “at home” for your recipes until you clear them.':
    'Avkryssede varer regnes som «hjemme» for oppskriftene til du tømmer dem.',
  'Edit {name}': 'Rediger {name}',
  'Make more of this shop': 'Få mer ut av handleturen',
  Hide: 'Skjul',
  'Uses {n} item on your list': 'Bruker {n} vare på listen',
  'Uses {n} items on your list': 'Bruker {n} varer på listen',
  'Nothing extra needed': 'Trenger ikke noe mer',
  'Edit item': 'Rediger vare',
  Item: 'Vare',
  Amount: 'Mengde',
  'Store section': 'Butikkavdeling',
  'Delete item': 'Slett vare',

  // Recipes
  'Search recipes or ingredients': 'Søk i oppskrifter eller ingredienser',
  'Only favorites': 'Bare favoritter',
  'No recipes yet': 'Ingen oppskrifter ennå',
  'Add your favourite recipes. Then put them on the list or plan them for the week.': 'Legg inn favorittoppskriftene. Så kan du legge dem på listen eller planlegge uka.',
  'Nothing found': 'Fant ingenting',
  'No favourites match.': 'Ingen favoritter passer.',
  'Try another word.': 'Prøv et annet ord.',
  'On list': 'På listen',
  '{n} ingredient': '{n} ingrediens',
  '{n} ingredients': '{n} ingredienser',
  'Recipe not found': 'Fant ikke oppskriften',
  'Back to recipes': 'Tilbake til oppskrifter',
  'Edit recipe': 'Rediger oppskrift',
  'New recipe': 'Ny oppskrift',
  'Serves {n}': '{n} porsjoner',
  'Remove from list': 'Fjern fra listen',
  'Add to list': 'Legg på listen',
  'Plan dinner': 'Planlegg middag',
  Ingredients: 'Ingredienser',
  'How to make it': 'Slik gjør du',
  'Plan for dinner on…': 'Middag på…',
  'Remove from favorites': 'Fjern fra favoritter',
  'Add to favorites': 'Legg til i favoritter',
  'In the basket': 'I kurven',
  'On the list': 'På listen',
  'Not on the list': 'Ikke på listen',
  'At home': 'Hjemme',
  // At home (pantry)
  'What do you have? e.g. rice': 'Hva har du? f.eks. ris',
  'Add to what you have at home': 'Legg til det du har hjemme',
  'The {n} crossed-off item on the list counts too.': 'Den {n} avkryssede varen på listen teller også.',
  'The {n} crossed-off items on the list count too.': 'De {n} avkryssede varene på listen teller også.',
  'What do you have at home?': 'Hva har du hjemme?',
  'Add what is in the fridge and cupboards. We find the recipes that need the fewest extra ingredients.':
    'Legg inn det som er i kjøleskapet og skapene. Vi finner oppskriftene som trenger færrest ekstra ingredienser.',
  'No recipes use these': 'Ingen oppskrifter bruker disse',
  'Add more of what you have, or add more recipes.': 'Legg inn mer av det du har, eller legg til flere oppskrifter.',
  'What you can make': 'Dette kan du lage',
  '{n} missing': '{n} mangler',
  'You have everything': 'Du har alt',
  '{n} of {total} at home': '{n} av {total} hjemme',
  'Add missing to the list': 'Legg det som mangler på listen',
  'Add {title}': 'Legg til {title}',
  'Add {n} item': 'Legg til {n} vare',
  'Add {n} items': 'Legg til {n} varer',
  'Delete “{title}”?': 'Slette «{title}»?',
  'Delete recipe': 'Slett oppskrift',
  'Add a photo': 'Legg til bilde',
  'Choose photo': 'Velg bilde',
  'Remove photo': 'Fjern bilde',
  'Taco Friday': 'Tacofredag',
  'Short description': 'Kort beskrivelse',
  "Everyone's favourite": 'Alles favoritt',
  Servings: 'Porsjoner',
  'Paste a list': 'Lim inn en liste',
  Ingredient: 'Ingrediens',
  'Remove ingredient': 'Fjern ingrediens',
  '1. Brown the mince\n2. Add spices\n3. …': '1. Brun kjøttdeigen\n2. Tilsett krydder\n3. …',
  Tags: 'Merkelapper',
  'Add tag': 'Legg til merkelapp',
  'e.g. Dessert, Weekday': 'f.eks. Dessert, Hverdag',
  'No recipes match the filters.': 'Ingen oppskrifter passer filtrene.',
  'Import recipe': 'Importer oppskrift',
  'Source': 'Kilde',
  'More sources later.': 'Flere kilder kommer.',
  'Paste a link to a recipe on {site}.': 'Lim inn lenken til en oppskrift på {site}.',
  'That link is not a recipe on {site}.': 'Den lenken er ikke en oppskrift på {site}.',
  'Already imported: {title}': 'Allerede importert: {title}',
  'Open recipe': 'Åpne oppskriften',
  'Imported from {source}. Check the details and save.': 'Importert fra {source}. Sjekk detaljene og lagre.',
  'Recipe link': 'Lenke til oppskrift',
  Import: 'Importer',
  'Imported. Check the details and save.': 'Importert. Sjekk detaljene og lagre.',
  'Only recipes from oda.com can be imported.': 'Bare oppskrifter fra oda.com kan importeres.',
  'No recipe found on that page.': 'Fant ingen oppskrift på den siden.',
  'Save recipe': 'Lagre oppskrift',
  'Paste ingredients': 'Lim inn ingredienser',
  'One ingredient per line. Amounts like “400 g” or “2” are picked up automatically.':
    'Én ingrediens per linje. Mengder som «400 g» eller «2» blir plukket ut automatisk.',
  '400 g minced beef\n1 onion\ntaco spice\n8 tortillas': '400 g kjøttdeig\n1 løk\ntacokrydder\n8 tortillalefser',
  '{n} min': '{n} min',
  'Time (minutes)': 'Tid (minutter)',
  'Cooking time': 'Tid',
  'Any time': 'All tid',
  'No recipes this quick.': 'Ingen oppskrifter er så raske.',
  'Double it': 'Doble oppskriften',
  'Leftovers the day after.': 'Rester dagen etter.',
  'Twice the amounts, for leftovers.': 'Dobbel mengde, til rester.',
  'Leftovers: {title}': 'Rester: {title}',
  'Add {n} ingredient': 'Legg til {n} ingrediens',
  'Add {n} ingredients': 'Legg til {n} ingredienser',

  // Week
  'Week {n}': 'Uke {n}',
  'Previous week': 'Forrige uke',
  'Next week': 'Neste uke',
  'Back to this week': 'Tilbake til denne uka',
  'Removed recipe': 'Slettet oppskrift',
  'Change {day}': 'Endre {day}',
  'Got everything': 'Har alt',
  '{n} to buy': '{n} å kjøpe',
  '{n} not on list': '{n} ikke på listen',
  'Added {n} items to the list.': 'La til {n} varer på listen.',
  'Add {n} missing ingredient to the list': 'Legg {n} manglende ingrediens på listen',
  'Add {n} missing ingredients to the list': 'Legg {n} manglende ingredienser på listen',
  'Dinner {day} {date}': 'Middag {day} {date}',
  'Find a recipe': 'Finn en oppskrift',
  'No recipes found.': 'Fant ingen oppskrifter.',
  'Or write something: leftovers, eating out…': 'Eller skriv noe: rester, spise ute…',
  'Save note': 'Lagre notat',
  'Clear this day': 'Tøm denne dagen',

  // Group
  'Leave {name}?': 'Forlate {name}?',
  'Remove this member from the group?': 'Fjerne dette medlemmet fra gruppen?',
  'Rename group': 'Gi nytt navn',
  Members: 'Medlemmer',
  '(you)': '(deg)',
  Owner: 'Eier',
  'Leave group': 'Forlat gruppen',
  'Remove member': 'Fjern medlem',
  'Your groups': 'Dine grupper',
  'Invite by email': 'Inviter med e-post',
  'Send invite': 'Send invitasjon',
  'Invited {email}. They will see the invite when they sign in to Foodshare with that email.':
    'Invitert {email}. De ser invitasjonen når de logger inn i Foodshare med den e-posten.',
  'Pending:': 'Venter:',
  'Cancel invite': 'Avbryt invitasjon',
  'Store sections': 'Butikkavdelinger',
  'Items are sorted into sections by keyword. Drag to set the order you walk the store in. Move an item to another section and Foodshare remembers it.':
    'Varer sorteres i avdelinger etter nøkkelord. Dra for å bestemme rekkefølgen du går i butikken. Flytt en vare til en annen avdeling, så husker Foodshare det.',
  'Order sections': 'Sorter avdelinger',
  'Drag sections into the order you walk the store. Other is always last.': 'Dra avdelingene i den rekkefølgen du går i butikken. Annet kommer alltid sist.',
  'Drag to reorder': 'Dra for å flytte',
  'Shown together': 'Vises sammen',
  '{n} keyword': '{n} nøkkelord',
  '{n} keywords': '{n} nøkkelord',
  'Move up': 'Flytt opp',
  'Move down': 'Flytt ned',
  'Delete “{name}”? Its items move to Other.': 'Slette «{name}»? Varene flyttes til Annet.',
  'New section': 'Ny avdeling',
  'Edit section': 'Rediger avdeling',
  Icon: 'Ikon',
  Keywords: 'Nøkkelord',
  'e.g. tomato, gulrot': 'f.eks. tomat, carrot',
  'Add keyword': 'Legg til nøkkelord',
  'Remove {name}': 'Fjern {name}',
  'Delete section': 'Slett avdeling',
  '{a} & {b}': '{a} og {b}',
  'Show together with': 'Vis sammen med',
  'Nothing (own section)': 'Ingen (egen avdeling)',
  'Shown with {name}': 'Vises med {name}',
  'Shown together with: {names}': 'Vises sammen med: {names}',
  'Sections keep their own keywords; the list just shows them under one header.':
    'Avdelingene beholder egne nøkkelord; listen viser dem bare under én overskrift.',
  You: 'Deg',
  'Edit name': 'Endre navn',
  'Your name': 'Ditt navn',
  Language: 'Språk',
  'Delete group': 'Slett gruppen',
  'Delete {name}?': 'Slette {name}?',
  'This permanently deletes the shopping list, recipes and photos, week plan and store sections for everyone in the group. It cannot be undone.': 'Dette sletter handlelisten, oppskrifter og bilder, ukeplanen og butikkavdelingene for alle i gruppen. Det kan ikke angres.',
  'Type “{name}” to confirm': 'Skriv «{name}» for å bekrefte',

  Stores: 'Butikker',
  'Add the stores you shop at to see this week’s offers from them on the list.':
    'Legg til butikkene dere handler i, så vises ukens tilbud fra dem på listen.',
  'Add stores': 'Legg til butikker',
  'Add {n} store': 'Legg til {n} butikk',
  'Add {n} stores': 'Legg til {n} butikker',
  'All stores are added.': 'Alle butikkene er lagt til.',
  'See flyer offers': 'Se kundeavis',
  'Best store this week': 'Beste butikk denne uka',
  'Offers on {n} of {total} items': 'Tilbud på {n} av {total} varer',
  'Save about {amount}': 'Spar ca. {amount}',
  '(before-price known for {n} item)': '(førpris kjent for {n} vare)',
  '(before-price known for {n} items)': '(førpris kjent for {n} varer)',
  Offers: 'Tilbud',
  'No stores yet': 'Ingen butikker ennå',
  'Search offers, e.g. kylling': 'Søk i tilbud, f.eks. kylling',
  'Search offers': 'Søk i tilbud',
  'All stores': 'Alle butikker',
  All: 'Alle',
  'Add {name} to the list': 'Legg {name} på listen',
  'Show more ({n})': 'Vis flere ({n})',
  'No offers found': 'Fant ingen tilbud',
  'The flyers are updated every night.': 'Kundeavisene oppdateres hver natt.',
  '{n} offers': '{n} tilbud',
  'Offers: {name}': 'Tilbud: {name}',
  'Similar offers ({n})': 'Lignende tilbud ({n})',
  'until {date}': 'til {date}',
  'Best match': 'Beste treff',
  Price: 'Pris',
  'Price per kg/l': 'Pris pr. kg/l',
  'from {price}': 'fra {price}',
  'low to high': 'lav til høy',
  'high to low': 'høy til lav',
  kg: 'kg',
  l: 'l',
  pcs: 'stk',
  'From this week’s flyers. Prices and stock can vary between stores.': 'Fra ukens kundeaviser. Pris og utvalg kan variere mellom butikkene.',

  // Default store sections
  Vegetables: 'Grønnsaker',
  Fruit: 'Frukt',
  Bakery: 'Bakeri',
  'Meat & fish': 'Kjøtt og fisk',
  'Dairy & eggs': 'Meieri og egg',
  Pantry: 'Tørrvarer',
  Frozen: 'Frysevarer',
  Snacks: 'Snacks',
  Drinks: 'Drikke',
  Household: 'Husholdning',
}
