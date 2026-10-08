# Foodshare

Shared food planner PWA for families, friends and flatmates: shared live shopping list, recipes, weekly dinner plan.

- `web/` — Vite + React + TypeScript + Tailwind PWA. Talks directly to PocketBase.
- `pocketbase/pb_migrations/` — schema and API rules as PocketBase migrations, applied automatically when PocketBase starts. See "Schema changes".
- `pocketbase/test-rules.mjs` — checks the access rules against the live server with test users.
- `pocketbase/pb_hooks/` — server hooks (recipe import; merging list items with the same name, `merge_items.pb.js`; grocery offers sync, `offers_sync.pb.js`).
- `docker-compose.yml` — local PocketBase with schema and demo data. See "Local development".
- `classifier/` — our own offer and item classifier (scikit-learn, HTTP API), trained on Jev's labels; admins can switch the app from Jev to it. See `classifier/README.md`.
- `kassal/` — Kassal.app's product catalog: scraper and the scripts that had Jev label it; the training data for `classifier/`. See `kassal/README.md`.
- `pocketbase/Dockerfile` — PocketBase v0.40.4 with the hooks baked in. See "Deploying PocketBase".

## Setup

```sh
# root .env: POCKETBASE_URL, POCKETBASE_USER, POCKETBASE_PASS (superuser), TEST_USER_PASSWORD
node --env-file=.env pocketbase/test-rules.mjs

cd web
npm install
npm run dev                  # http://localhost:5173 against local PocketBase (or the dev-server skill: bun run dev --host)
npm run dev:prod             # same, against production PocketBase
npm run build                # static files in web/dist, against production
```

`web/dist` is static. Serve it from any static host, or copy it to PocketBase's `pb_public/` directory so the app and API share one origin. The host must fall back to `index.html` for unknown paths (SPA routing). PocketBase `pb_public` does this already.

## Local development

Run PocketBase locally (needs Docker) and test changes before deploying:

```sh
docker compose up            # PocketBase on http://localhost:8090, dashboard at /_/
cd web && bun run dev        # app on http://localhost:5173, talks to the local PocketBase
```

- `pocketbase` builds the same image as production, but uses the hooks from the working tree (PocketBase restarts when they change).
- PocketBase applies `pb_migrations/` on start. `setup` runs `seed-local.mjs`: a demo user and a first offers sync. The demo and superuser logins are in `docker-compose.yml`; they only exist locally.
- Data stays in `pocketbase/pb_data/` (git-ignored). Delete it to start over.
- Which PocketBase the app uses: `web/.env.development` (local, `bun run dev`) and `web/.env.production` (production, `bun run build` and `bun run dev:prod`). Override in `web/.env.development.local`, e.g. with `PB_PORT=8091 docker compose up`. Mode files win over `web/.env.local`, so an old `.env.local` is ignored for `VITE_POCKETBASE_URL` and can be deleted.

## Schema changes

The schema lives in `pocketbase/pb_migrations/` and ships in the image, so deploying PocketBase also updates the database. PocketBase runs each migration once on start and records it in its `_migrations` table.

- `1759752000_foodshare_schema.js` is the baseline: every collection, field, index and API rule. It is idempotent (creates what is missing, matches fields by name, never deletes), so it also brought databases made with the old `setup.mjs` script up to date.
- For a change, add a new file named `<unix timestamp>_<what>.js` with `migrate((app) => { ... })`, e.g. find a collection, add a field, `app.save(collection)`. Keep it additive where possible. Locally, restart PocketBase (`docker compose restart pocketbase`) to apply it.
- Test a migration against a copy of production data before deploying: download a backup, restore it in the local dashboard, restart.
- There is no automatic rollback; restore a backup if a deploy goes wrong.

## Data model

All space data is reachable only by members of the space (`space.memberships_via_space.user ?= @request.auth.id`).

| Collection | Purpose |
|---|---|
| `spaces` | A group (shown as "Group" in the UI). `owner` can delete it and remove members. `chains` = the stores whose offers the group sees (none = no offers shown). |
| `memberships` | `space` + `user`. You can only create your own membership: as the owner, or with a pending invite to your email. |
| `invites` | Invite by email. The invitee sees it after sign-in and accepts (creates membership, deletes invite). |
| `app_settings` | One record, admins only (`users.admin`, set by superusers in the dashboard; users cannot set it). `classifier`: `jev` or `local`, what labels offers and list items. |
| `allowed_emails` | Invite-only sign-up list, superusers only. `email` (case-insensitive) may create an account; a row with `*` opens sign-up to everyone. |
| `categories` | Store sections per space with `keywords`, in walking order (`sort`, drag to reorder). `group_with` shows a section under another's header in the list. Default names are stored in English and shown translated until renamed. |
| `items` | Shopping list. `checked` = in the basket. `recipe` links items added from a recipe. `product_type` and `offer_matches` (confirmed offer ids, null = not checked yet) are set by the server for offer matching. `offer` = the flyer offer a member picked for the item (e.g. which size); PocketBase clears it when the offers sync deletes that offer. |
| `recipes` | `ingredients` is JSON `[{name, quantity}]`; `image` has thumbs; `favorited_by` is per-user favorites; `minutes` = cooking time; `tags` is a JSON string list; `source`/`source_url` record where an import came from (unique per space). |
| `recipe_prices` | What a recipe cost at a store, entered by hand on the recipe page: `chain`, `lines` JSON `[{name, price}]` per ingredient line, `total`. Not editable; delete and enter again. The recipe page shows the latest price per store, minus lines that match the pantry, and the full history. |
| `meals` | One dinner per space and day (`date` = `YYYY-MM-DD`): a recipe or a free-text `note`. `factor` 2 = doubled for leftovers. |
| `purchases` | Picked offers that were bought: one per crossed-off item with a picked offer, written when the basket is cleared (either button). Copies the offer's heading, chain, `price` and `pre_price`, since offers expire. Members create (as themselves) and read; nobody edits or deletes. The Group page sums them into "X kr saved on offers since <first purchase>" (before-price minus price, where known); tapping it opens `/savings`: the total, shopping trips (days a basket was cleared) and items, a bar per month (6–12 months; tap a bar to pick the month) and that month's shopping trips, one row per day with items, paid and saved (tap one for what was bought). |
| `chains` | Grocery chains with name, `logo` URL and brand `color`. Shared, read-only for users; written by the offers sync. |
| `offers` | This week's flyer offers, `chain` relation, `category` and `product_type` from the classifier. Shared, read-only for users; replaced by the offers sync. |
| `product_names` | Server-only cache: list item name -> product type. |
| `offer_matches` | Server-only cache: list item name + offer -> Jev's probability that the offer is what the name means. |
| `pantry` | What the household has at home ("At home" tab): one `name` per row, shared by the space. No quantities. |

## How the smart parts work (`web/src/lib/match.ts`)

- **Auto sections:** a new item goes into the category with the longest matching keyword. Matching handles plurals and Norwegian compound words. Moving an item to another section adds its name to that section's keywords. A section can be shown together with another (Group → section → Show together with): one header in the list, separate keywords and data.
- **Have the ingredients?** An ingredient counts as *in the basket* when a matching item is crossed off, *on the list* when a matching item is still open, *at home* when it matches the pantry, otherwise *not on the list*. Crossed-off items count until someone clears them.
- **At home:** ingredients matching a pantry row count as *at home* (after the list statuses above). The At home tab ranks recipes that use at least one thing at home by fewest missing ingredients, then most matched. Crossed-off list items count as at home there too.
- **Synergy:** the list page suggests recipes that reuse at least two open items, ranked by most reused and fewest extra items.

## Recipe import (server hook)

`pocketbase/pb_hooks/import_recipe.pb.js` adds two authenticated routes that fetch a recipe page and read its schema.org Recipe data (JSON-LD), plus its photo. Browsers can't do this themselves because of CORS. Only oda.com pages and images.oda.com images are allowed. Extend the host regexes in the hook to support more sites.

The client side is `web/src/lib/importRecipe.ts`: the `SOURCES` list (ODA only for now), ingredient parsing ("600 g Kyllingfilet, stor" → 600 g / Kyllingfilet), ISO durations, and tags from `keywords` + `recipeCategory`. Re-importing a link already in the space is blocked (normalized URL, plus a unique index).

The hook ships inside the PocketBase image, so deploying PocketBase deploys the hook. Check: `POST /api/foodshare/import-recipe` without login must answer 401 (404 = hook not loaded). Tested locally on PocketBase 0.40.4.

## Grocery offers (server hook)

`pocketbase/pb_hooks/offers_sync.pb.js` fills the shared `offers` collection with this week's flyer offers (kundeaviser) from 16 Norwegian chains. The data comes from Tjek's unofficial, unauthenticated read API (the backend of mattilbud.no), following [kundeavis-mcp](https://github.com/donadelicc/kundeavis-mcp). The logic is in `offers_sync.js`.

- Runs daily at 04:17 UTC (cron `offers_sync`), about 45 requests and a few seconds. Superusers can run it now with `POST /api/foodshare/offers-sync`, or from Settings → Crons in the dashboard.
- Each run replaces the collection with what the API returns. The API only serves offers that are valid right now and deletes old flyers, so there is no history. If the API returns nothing, existing data is kept.
- The sync also keeps the `chains` collection (name, logo, brand color from Tjek) up to date.
- Every signed-in user can read chains and offers; nobody can write them through the API. Offers are not tied to a space; each group picks its stores (Group → Stores, saved in `spaces.chains`).
- In the app (`web/src/lib/offers.ts`, `components/offers.tsx`): Group → Stores starts empty; "Add" picks one or more chains. Open list items with matching offers show a tag with the count; tapping it lists the offers. Each offer there can be picked for the item (tap the check again to undo); the row then shows that product instead of the item name, amount and recipe (photo, heading, size and price, store; tapping it opens the offers again), with a warning when the pack holds clearly less (under 90%) than a weight, volume or piece amount on the item ("Need 4 for 750g"), and the store tip counts only the picked offer for that item. With offers picked, the list shows their total price and what they save (before-price minus price, where the flyer gives one), for open and crossed-off items. With 2+ stores chosen, the list recommends the store with offers on the most open items (at least 2; ties go to the bigger total discount) and shows how the others compare. "Save about X" sums before-price minus price for the closest-matching offer per item, only where the flyer gives a before-price (about 30% of offers; Bunnpris never does), so it is a lower bound and is not used for ranking. The Offers page (`/offers`, tag button on the list, "See flyer offers" under Group → Stores) searches and filters the group's offers, biggest discount first, and adds an offer to the list. Matching (`offersFor` in `match.ts`) is stricter than other name matching: "melk" matches "lettmelk" and "pølser" matches "grillpølser", but "kylling" does not match "kyllingkrydder" and "pepper" does not match "pepperoni": only real plural and definite endings count (`ENDINGS`).
- Categories: the flyer API has none, so `offers_classify.js` asks TypeSafe AI's Jev model (a classifier that picks one of fixed choices) for each offer's store section: the ten default sections plus `other`. The daily `offers_sync` cron runs it right after the sync, for at most 20 minutes; offers keep their category across syncs, so only new ones are sent. Locally, compose sets `OFFERS_CRON=off`: no nightly sync or classify, so a local PocketBase sends nothing to Jev on its own (setup still syncs once on start, which uses no Jev; classify by hand with the route below). Needs `TYPESAFE_API_KEY` in the PocketBase environment (Coolify env var; locally compose reads it from the root `.env`). Without it offers stay uncategorized. Superusers can run a 60-second batch with `POST /api/foodshare/offers-classify` (admin users too, from the Admin section on the group page). The Offers page filters by category, and adding an offer to the list falls back to the matching default section when keywords find none.
- Local classifier: with `app_settings.classifier = local` (Admin section in the app), offers and new list item names are labelled by `classifier/serve.py` at `CLASSIFIER_URL` instead of Jev: free and fast (all offers in under a second, so every run relabels all of them). It has no model for offer matches, so items are not checked then (the app shows their type's offers as similar). Locally: `docker compose --profile classifier up` (needs trained models in `classifier/model`).
- Product types: to match list items that share no words with a heading ("kaffe" vs "ALI FILTERMALT/KOKMALT"), offers and items get a product type key such as `coffee` from `pb_hooks/product_types.json` (137 types with Norwegian names and flyer words, from kundeavis-mcp's `ingredients.yaml`, MIT). Jev picks the type in two requests (TypeSafe's hierarchical classification): first one of 12 product groups (`group` in the JSON; by kind of product, so frozen blueberries are `fruit`), then a type within the likeliest group, or the two likeliest when the first is below 0.8. Offers get the store section in the first request. Asking all 137 types at once cost ~5000 input tokens; the two steps cost ~2300 per offer with the section (measured), about $0.12 per week for ~1200 offers, and agreed with the old types on 130 of 150 offers (most differences were fixes). Items get it from `item_types.pb.js` on create and rename, only in groups with stores: first the shared `product_names` cache, then the type list's names and aliases, then Jev; each name is resolved once for everyone. Jev's input tokens are logged (`tokens` on the nightly `offers classify` line, `item matched` per new item name; the price is per input token). If Jev is unavailable the item is saved without a type and the next daily run fills it in. Types are exact: "kylling" (whole chicken) does not match `chicken_breast` offers by type.
- Offer matches: a type is too coarse on its own ("parmesan" and "SYNNØVE GULOST" are both `cheese_yellow`). `offer_matches.js` asks Jev, per item name, which offers in the group's stores it really means: those of its type, and word matches of another known type ("salat" ~ "REKESALAT": lettuce vs prepared_salad). Answers are `same`, `related` (same kind, not what was asked for) or `unrelated`; the question names the item's type with its first flyer words ("Salat (salat, isbergsalat, …)"), which is what tells the vegetable from shrimp salad, and the offer's type. Offers with P(same) ≥ 0.6 go in `items.offer_matches`; the probability per name and offer is cached in the server-only `offer_matches` collection, so each pair is asked once for everyone (one request per new name, ~0.5 s, in the item hook; the daily run checks new offers and catches up on failed checks). In the app, `offersFor` returns word matches first (of the item's type, of no type, or confirmed), then confirmed type matches; unconfirmed word matches of another type and the type's other offers are "Similar offers", collapsed in the offers sheet and not counted on the badge (an item with only similar offers gets a muted badge). Measure prompt changes with `node --env-file=.env pocketbase/test-offer-matches.mjs` (about 90% right on 70 hand-labelled pairs, ~22k input tokens per run; `--noul` also measures the same judgment as a Noul question, which scored the same with 9% fewer tokens, so the hook keeps the choice).
- `pre_price` and `discount_pct` are only set when the flyer gives a before-price. Percentage offers ("-40%") usually have it only in `description`.

## Deploying PocketBase

`pocketbase/Dockerfile` builds PocketBase v0.40.4 (amd64 or arm64, checksum-verified) with `pb_hooks/` and `pb_migrations/` copied in. Data lives in `/pb/pb_data`; it serves on port 8080 and has a health check on `/api/health`.

Coolify: new resource from the Git repo → Build Pack "Dockerfile", Base Directory `/pocketbase`, port 8080, persistent storage mounted at `/pb/pb_data`. Push to redeploy: hook changes and schema migrations are included. Take a backup first when a deploy includes a new migration.

Moving from the old Coolify template service:

1. Take a backup in the old PocketBase dashboard (Settings → Backups) and download it.
2. Deploy the new service and create a superuser (from the log's install link, or `/pb/pocketbase superuser upsert EMAIL PASS` in the Coolify terminal).
3. In the new dashboard: Settings → Backups → upload the backup and restore it. This replaces the data, including superusers.
4. Point the domain at the new service, check the 401 above, then stop the old one.

Version upgrades: change `PB_VERSION` and the two SHA-256 sums (from the release's `checksums.txt`) in the Dockerfile.

Local run: `docker compose up` (see "Local development").

## Language

English and Norwegian (bokmål). The browser language picks the default; users can switch under Group → You. Strings live in `web/src/lib/i18n.ts`: English text is the key, `NO` holds the Norwegian. In dev, a missing Norwegian string logs `[i18n] missing Norwegian for: …` to the console. New spaces get section names in the creator's language.

## Testing

- Rules: `node --env-file=.env pocketbase/test-rules.mjs` (creates/uses alice, bob, eve @foodshare.test; password `TEST_USER_PASSWORD` in `.env`).
- UI: create a throwaway space for alice through the API, test in the browser at `http://127.0.0.1:<port>` (separate storage from a real session on `localhost`), then delete the space as superuser. Never test on real users' spaces.
- Hooks: `docker compose up` (see "Local development").
- Type-check with `./node_modules/.bin/tsc -b` in `web/`. A command-rewriting hook (RTK) can turn `npx tsc` into an old global compiler.
- A stale service worker in the browser can serve an old app build; clear it under DevTools → Application if the UI doesn't match the code.

## Open items

- Move the live PocketBase to the Docker image (see "Deploying PocketBase"), then test recipe import there.
- Decide where the web app is hosted (PocketBase `pb_public` via a Docker build is the simplest single-origin option).
- Turn on Google sign-in and email OTP (SMTP) in PocketBase.
- Plan, not built: premium for groups (AI offer features as a paid upgrade). See `docs/premium.md`.
- Idea, not built: public recipes ("share publicly" + an Explore tab where others copy recipes into their own space).
- The old destructive "merge sections" is gone; sections merged with it before can't be split again.

## Sign-in

The login screen shows whatever the `users` collection enables: password, email code (OTP), and Google (OAuth2). To turn on Google and OTP, open the PocketBase dashboard → `users` collection → Options. OTP also needs SMTP under Settings → Mail.

Sign-up is invite only (`pb_hooks/invite_only.pb.js`): a new account, by any method, needs its email in `allowed_emails` or a pending space invite. Others get 403 and the login screen says the app is invite only. Existing accounts sign in as before. Add emails in the dashboard; add a row with email `*` to let anyone sign up.
