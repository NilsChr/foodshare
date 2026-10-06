// Measures the Jev prompt in pb_hooks/offer_matches.js on fixed list item / flyer offer pairs.
// Run after changing the prompt or MIN_P:
//   node --env-file=.env pocketbase/test-offer-matches.mjs
// Prints each wrong answer and the accuracy; exits 1 below 85%. About 25 requests.
//
// Cases come from real flyers (October 2026). `same`: should the item show the offer?
// Offers sharing words with the item are matched by the app without Jev, so the cases are
// mostly pairs that share none. Known misses at the time of writing (87%): feta ~ Apetina,
// filterkaffe ~ ALI FILTERMALT (borderline), fløtemysost, baconsvor and tørkerull taken as
// gulost, bacon and toalettpapir. Answers vary a little between runs.
import { createRequire } from 'node:module'

const { matchQuestion, MIN_P } = createRequire(import.meta.url)('./pb_hooks/offer_matches.js')

// [item, offer heading, description, product type name, same]
const CASES = [
  ['parmesan', 'PARMESAN REVET', '60 g pr. pk', 'Gulost', true],
  ['parmesan', 'Coop parmigiano stick', '125 g. Pr stk', 'Gulost', true],
  ['parmesan', 'SYNNØVE GULOST', 'Skivet. 285 g. Pr pk.', 'Gulost', false],
  ['parmesan', 'Ekte revet ost', '370 g', 'Gulost', false],
  ['parmesan', 'Synnøve revet', '370g, økonomipakke', 'Gulost', false],
  ['parmesan', 'Sveitserost reserve', '36 mnd, fra ostedisken', 'Gulost', false],
  ['parmesan', 'NORVEGIA VELLAGRET', 'Ca 1 kg. Pr kg', 'Gulost', false],
  ['gulost', 'NORVEGIA VELLAGRET', 'Ca 1 kg. Pr kg', 'Gulost', true],
  ['gulost', 'Tine Jarlsberg', 'Original/lett. Ca 1 kg. Pr kg', 'Gulost', true],
  ['gulost', 'SYNNØVE OST', 'Synnøve, 1 kg, 109,90 pr. kg', 'Gulost', true],
  ['gulost', 'Gouda ca. 1 kg', 'Blokk, Visser Kaas', 'Gulost', true],
  ['gulost', 'MOZZARELLA', '125 g', 'Hvit ost', false],
  ['gulost', 'FLØTEMYSOST, SKIVET', '130 g, Tine', 'Gulost', false],
  ['norvegia', 'SYNNØVE GULOST', 'Skivet. 285 g. Pr pk.', 'Gulost', false],
  ['norvegia', 'Tine Jarlsberg', 'Original/lett. Ca 1 kg. Pr kg', 'Gulost', false],
  ['kaffe', 'ALI FILTERMALT/KOKMALT', '250 g, pr. kg 139,60', 'Kaffe', true],
  ['kaffe', 'EVERGOOD KAFFE', '250G/10KAPSLER, STORT UTVALG', 'Kaffe', true],
  ['kaffe', "L'OR ESPRESSO", 'Hele bønner. 2 varianter. 500 g.', 'Kaffe', true],
  ['filterkaffe', 'ALI FILTERMALT/KOKMALT', '250 g, pr. kg 139,60', 'Kaffe', true],
  ['filterkaffe', 'Nescafé Gull 200 g', '1 stk 149,00', 'Kaffe', false],
  ['filterkaffe', 'FRIELE LUNGO 6 NCC 2', '20 stk pr. pk', 'Kaffe', false],
  ['kaffekapsler', 'FRIELE LUNGO 6 NCC 2', '20 stk pr. pk', 'Kaffe', true],
  ['kaffekapsler', 'ALI FILTERMALT/KOKMALT', '250 g, pr. kg 139,60', 'Kaffe', false],
  ['melk', 'TAFFEL', '', 'Melk', true],
  ['melk', 'SJOKOMELK', '', 'Melk', false],
  ['melk', 'Kondensert melk 397 g', '', 'Melk', false],
  ['kylling', 'HEL LANDKYLLING', '', 'Hel kylling', true],
  ['pølser', 'GILDE JUBELWIENER', '', 'Pølser', true],
  ['pølser', 'Wienerbakst', '', 'Pølser', false],
  ['grillpølser', 'GILDE JUBELWIENER', '', 'Pølser', false],
  ['grillpølser', 'KJØTTPØLSE', '', 'Pølser', false],
  ['spaghetti', 'TAGLIATELLE', '', 'Pasta', false],
  ['spaghetti', 'Nudler 90 g', '', 'Pasta', false],
  ['pasta', 'TAGLIATELLE', '', 'Pasta', true],
  ['pasta', 'GIGLI/TORTIGLIONI/AMORINI/PAPPARDELLE', '', 'Pasta', true],
  ['gresk yoghurt', 'SKYR', '', 'Yoghurt', false],
  ['yoghurt', 'TINE GRESK YOGHURT NATURELL', '', 'Yoghurt', true],
  ['pepsi max', 'COCA-COLA ZERO', '', 'Brus', false],
  ['cola', 'COCA-COLA 4 PK BOKSER', '', 'Brus', true],
  ['brød', 'Fransk Landbrød', '', 'Brød', true],
  ['brød', 'Polarbrød 12-pk.', '', 'Brød', true],
  ['chips', 'MAARUD POTETGULL', '', 'Potetchips', true],
  ['sjokolade', 'KVIKK LUNSJ', '', 'Sjokolade', true],
  ['sjokolade', 'Regia sjokoladedrikk', '', 'Sjokolade', false],
  ['ris', 'Jasminris', '', 'Ris', true],
  ['poteter', 'SØTPOTETER', '', 'Potet', false],
  ['løk', 'RØDLØK 3PK', '', 'Løk', true],
  ['bananer', 'Kokebanan', '', 'Banan', false],
  ['toalettpapir', 'LAMBI TOALETTPAPIR 16 PK', '', 'Toalettpapir', true],
  ['toalettpapir', 'LAMBI TØRKERULL 6 PK', '', 'Toalettpapir', false],
  ['oppvaskmiddel', 'SUN OPPVASK', '', 'Rengjøring', true],
  ['oppvaskmiddel', 'Spylervæske 3 l', '', 'Rengjøring', false],
  ['oppvaskmiddel', 'OMO KAPSLER 5I1', '', 'Rengjøring', false],
  ['laks', 'LAKS LOIN', '', 'Laks', true],
  ['bacon', 'BACONSVOR', '', 'Bacon', false],
  ['smør', 'MELANGE MARGARIN', '', 'Smør', false],
  ['rømme', 'Q-LETTRØMME', '', 'Rømme', true],
  ['egg', 'Mini-omelett', '', 'Egg', false],
  ['appelsinjuice', 'EPLEJUICE', '', 'Juice', false],
  ['feta', 'APETINA SNACK', 'Salatost i terninger', 'Hvit ost', true],
  ['tortilla', 'COOP MEGAS WRAPS', '8 stk', 'Tortilla', true],
]

const key = process.env.TYPESAFE_API_KEY
if (!key) throw new Error('TYPESAFE_API_KEY is not set (node --env-file=.env ...)')

// One request per item, as the hook sends them.
const byItem = Map.groupBy(CASES, (c) => c[0])
let right = 0
for (const [item, cases] of byItem) {
  const questions = Object.fromEntries(cases.map((c, i) => ['o' + i, matchQuestion(item, c[1], c[2], c[3])]))
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ state: `Norwegian shopping list item: "${item}"`, model: 'jev-latest', questions }),
  })
  if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${await res.text()}`)
  const { answers } = await res.json()
  cases.forEach((c, i) => {
    const p = answers['o' + i]?.probabilities?.same ?? 0
    if (p >= MIN_P === c[4]) right++
    else console.log(`wrong  ${item} ~ ${c[1]}: p=${p.toFixed(2)}, expected ${c[4] ? 'match' : 'no match'}`)
  })
}
const accuracy = right / CASES.length
console.log(`\n${right}/${CASES.length} right (${Math.round(accuracy * 100)}%), MIN_P ${MIN_P}`)
process.exit(accuracy >= 0.85 ? 0 : 1)
