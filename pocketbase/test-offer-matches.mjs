// Measures the Jev prompt in pb_hooks/offer_matches.js on fixed list item / flyer offer pairs.
// Run after changing the prompt or MIN_P:
//   node --env-file=.env pocketbase/test-offer-matches.mjs
// Prints each wrong answer, the accuracy and the input tokens; exits 1 below 85%. About 25
// requests (50 with --noul, which also measures the same judgment as a Noul question).
//
// Cases come from real flyers (October 2026). `same`: should the item show the offer?
// Offers sharing words with the item are matched by the app without Jev, so the cases are
// mostly pairs that share none, plus word matches of another type. Known misses at the time
// of writing (90%): feta ~ Apetina, filterkaffe ~ ALI FILTERMALT (borderline); fløtemysost,
// baconsvor, tørkerull and spylervæske taken as gulost, bacon, toalettpapir and
// oppvaskmiddel. Answers vary a little between runs.
import fs from 'node:fs'
import { createRequire } from 'node:module'

const { matchQuestion, matchState, typeLabel, MIN_P } = createRequire(import.meta.url)('./pb_hooks/offer_matches.js')
const TYPES = JSON.parse(fs.readFileSync(new URL('./pb_hooks/product_types.json', import.meta.url))).types

// [item, offer heading, description, offer's product type name, same]. The item's own type
// is the type of its first case (a name in product_types.json), as the server would have
// resolved it.
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
  ['kylling', 'HEL LANDKYLLING', '', 'Kylling', true],
  ['pølser', 'GILDE JUBELWIENER', '', 'Pølse', true],
  ['pølser', 'Wienerbakst', '', 'Pølse', false],
  ['grillpølser', 'GILDE JUBELWIENER', '', 'Pølse', false],
  ['grillpølser', 'KJØTTPØLSE', '', 'Pølse', false],
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
  ['smør', 'MELANGE MARGARIN', '', 'Smør og margarin', false],
  ['rømme', 'Q-LETTRØMME', '', 'Rømme', true],
  ['egg', 'Mini-omelett', '', 'Egg', false],
  ['appelsinjuice', 'EPLEJUICE', '', 'Juice', false],
  ['feta', 'APETINA SNACK', 'Salatost i terninger', 'Hvit ost', true],
  ['tortilla', 'COOP MEGAS WRAPS', '8 stk', 'Tortilla', true],
  // Word matches of another type: the app asks about them too.
  ['salat', 'ISBERGSALAT', '', 'Salat', true],
  ['salat', 'REKESALAT', '', 'Ferdigsalat', false],
  ['salat', 'ITALIENSK SALAT', '', 'Ferdigsalat', false],
  ['tomater', 'KLASETOMAT', '', 'Tomat', true],
  ['tomater', 'Coop Hakkede tomater', '', 'Hermetiske tomater / tomatsaus', false],
  ['tomater', 'MAKRELL I TOMAT', '', 'Makrell', false],
  ['brød', 'LEKSANDS KNEKKEBRØD', '', 'Knekkebrød', false],
  ['poteter', 'FÅRIKÅL M/POTETER', '', 'Fårikålkjøtt', false],
  ['bananer', 'BANAN & JORDBÆR SMOOTHIE 10PK', '', 'Smoothie', false],
]

const key = process.env.TYPESAFE_API_KEY
if (!key) throw new Error('TYPESAFE_API_KEY is not set (node --env-file=.env ...)')

// A: the hook's question (same / related / unrelated, P(same)). B: the same judgment as a
// Noul (probability of yes). Run with `--noul` to compare.
const nouls = process.argv.includes('--noul')
function noulQuestion(name, itemType, heading, description, typeName) {
  const q = matchQuestion(name, itemType, heading, description, typeName)
  return {
    type: 'noul',
    instructions: q.instructions.replace(/How does it relate to the list item "([^"]*)" \(a ([^)]*)\)\?$/, 'Is it what a shopper means by the list item "$1" (a $2)?'),
    criteria: { true: q.criteria.same, false: `${q.criteria.related}; or ${q.criteria.unrelated}` },
  }
}
const VARIANTS = { choice: [matchQuestion, (a) => a?.probabilities?.same ?? 0] }
if (nouls) VARIANTS.noul = [noulQuestion, (a) => a?.noul ?? 0]

// One request per item, as the hook sends them.
const byItem = Map.groupBy(CASES, (c) => c[0])
let failed = false
for (const [variant, [question, prob]] of Object.entries(VARIANTS)) {
  let right = 0
  let tokens = 0
  for (const [item, cases] of byItem) {
    const type = TYPES.find((t) => t.name === cases[0][3])
    if (!type) throw new Error(`no product type named ${cases[0][3]}`)
    const itemType = typeLabel(type)
    const questions = Object.fromEntries(cases.map((c, i) => ['o' + i, question(item, itemType, c[1], c[2], c[3])]))
    const res = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ state: matchState(item, itemType), model: 'jev-latest', questions }),
    })
    if (!res.ok) throw new Error(`Jev HTTP ${res.status}: ${await res.text()}`)
    const { answers, usage } = await res.json()
    tokens += usage?.input_tokens ?? 0
    cases.forEach((c, i) => {
      const p = prob(answers['o' + i])
      if (p >= MIN_P === c[4]) right++
      else console.log(`${variant}: wrong  ${item} ~ ${c[1]}: p=${p.toFixed(2)}, expected ${c[4] ? 'match' : 'no match'}`)
    })
  }
  const accuracy = right / CASES.length
  console.log(`${variant}: ${right}/${CASES.length} right (${Math.round(accuracy * 100)}%), MIN_P ${MIN_P}, ${tokens} input tokens\n`)
  if (variant === 'choice' && accuracy < 0.85) failed = true
}
process.exit(failed ? 1 : 0)
