# Foodshare

Shared food planner PWA for families, friends and flatmates: shared live shopping list, recipes, weekly dinner plan.

- `web/` — Vite + React + TypeScript + Tailwind PWA. Talks directly to PocketBase.
- `pocketbase/setup.mjs` — idempotent schema and API rules. Re-run after editing.
- `pocketbase/test-rules.mjs` — checks the access rules against the live server with test users.
- `pocketbase/pb_hooks/` — server hooks (recipe import). Must be deployed to the server separately, see below.
- `pocketbase/deploy-hooks.sh` — copies the hooks into the container over SSH. Not used today: the server is managed through Coolify without SSH.

## Setup

```sh
# root .env: POCKETBASE_URL, POCKETBASE_USER, POCKETBASE_PASS (superuser), TEST_USER_PASSWORD
node --env-file=.env pocketbase/setup.mjs
node --env-file=.env pocketbase/test-rules.mjs

cd web
cp .env.example .env.local   # VITE_POCKETBASE_URL
npm install
npm run dev                  # http://localhost:5173 (or the dev-server skill: bun run dev --host)
npm run build                # static files in web/dist
```

`web/dist` is static. Serve it from any static host, or copy it to PocketBase's `pb_public/` directory so the app and API share one origin. The host must fall back to `index.html` for unknown paths (SPA routing). PocketBase `pb_public` does this already.

## Data model

All space data is reachable only by members of the space (`space.memberships_via_space.user ?= @request.auth.id`).

| Collection | Purpose |
|---|---|
| `spaces` | A group (shown as "Group" in the UI). `owner` can delete it and remove members. |
| `memberships` | `space` + `user`. You can only create your own membership: as the owner, or with a pending invite to your email. |
| `invites` | Invite by email. The invitee sees it after sign-in and accepts (creates membership, deletes invite). |
| `categories` | Store sections per space with `keywords`, in walking order (`sort`, drag to reorder). `group_with` shows a section under another's header in the list. Default names are stored in English and shown translated until renamed. |
| `items` | Shopping list. `checked` = in the basket. `recipe` links items added from a recipe. |
| `recipes` | `ingredients` is JSON `[{name, quantity}]`; `image` has thumbs; `favorited_by` is per-user favorites; `minutes` = cooking time; `tags` is a JSON string list; `source`/`source_url` record where an import came from (unique per space). |
| `meals` | One dinner per space and day (`date` = `YYYY-MM-DD`): a recipe or a free-text `note`. `factor` 2 = doubled for leftovers. |

## How the smart parts work (`web/src/lib/match.ts`)

- **Auto sections:** a new item goes into the category with the longest matching keyword. Matching handles plurals and Norwegian compound words. Moving an item to another section adds its name to that section's keywords. A section can be shown together with another (Group → section → Show together with): one header in the list, separate keywords and data.
- **Have the ingredients?** An ingredient counts as *in the basket* when a matching item is crossed off, *on the list* when a matching item is still open, otherwise *not on the list*. Crossed-off items count until someone clears them.
- **Synergy:** the list page suggests recipes that reuse at least two open items, ranked by most reused and fewest extra items.

## Recipe import (server hook)

`pocketbase/pb_hooks/import_recipe.pb.js` adds two authenticated routes that fetch a recipe page and read its schema.org Recipe data (JSON-LD), plus its photo. Browsers can't do this themselves because of CORS. Only oda.com pages and images.oda.com images are allowed. Extend the host regexes in the hook to support more sites.

The client side is `web/src/lib/importRecipe.ts`: the `SOURCES` list (ODA only for now), ingredient parsing ("600 g Kyllingfilet, stor" → 600 g / Kyllingfilet), ISO durations, and tags from `keywords` + `recipeCategory`. Re-importing a link already in the space is blocked (normalized URL, plus a unique index).

**Deploying the hook (Coolify):** the PocketBase service uses the Coolify template, which mounts the `pocketbase-hooks` volume at `/app/pb_hooks`. Without SSH, open the service in Coolify → **Terminal** → pocketbase container, and write the file with a heredoc:

```sh
cat > /app/pb_hooks/import_recipe.pb.js <<'FOODSHARE_EOF'
…file contents…
FOODSHARE_EOF
```

Then restart the service. Check: `POST /api/foodshare/import-recipe` without login must answer 401 (404 = hook not loaded). Re-deploy whenever the hook file changes. Tested locally on PocketBase 0.40.4.

Longer term: build a Docker image from this repo (PocketBase + `pb_hooks` + the built app in `pb_public`) and let Coolify deploy it on push. That needs a Git remote and a one-time data move (PocketBase backup/restore).

## Language

English and Norwegian (bokmål). The browser language picks the default; users can switch under Group → You. Strings live in `web/src/lib/i18n.ts`: English text is the key, `NO` holds the Norwegian. In dev, a missing Norwegian string logs `[i18n] missing Norwegian for: …` to the console. New spaces get section names in the creator's language.

## Testing

- Rules: `node --env-file=.env pocketbase/test-rules.mjs` (creates/uses alice, bob, eve @foodshare.test; password `TEST_USER_PASSWORD` in `.env`).
- UI: create a throwaway space for alice through the API, test in the browser at `http://127.0.0.1:<port>` (separate storage from a real session on `localhost`), then delete the space as superuser. Never test on real users' spaces.
- Hooks: download PocketBase, run `./pocketbase serve --dir ./data --hooksDir pocketbase/pb_hooks`, point `setup.mjs` at it (`POCKETBASE_URL=…`) and run a second Vite with `VITE_POCKETBASE_URL` set to it.
- Type-check with `./node_modules/.bin/tsc -b` in `web/`. A command-rewriting hook (RTK) can turn `npx tsc` into an old global compiler.
- A stale service worker in the browser can serve an old app build; clear it under DevTools → Application if the UI doesn't match the code.

## Open items

- Deploy the recipe-import hook to the server (see above), then test import there.
- Decide where the web app is hosted (PocketBase `pb_public` via a Docker build is the simplest single-origin option).
- Turn on Google sign-in and email OTP (SMTP) in PocketBase.
- Idea, not built: public recipes ("share publicly" + an Explore tab where others copy recipes into their own space).
- The old destructive "merge sections" is gone; sections merged with it before can't be split again.

## Sign-in

The login screen shows whatever the `users` collection enables: password, email code (OTP), and Google (OAuth2). To turn on Google and OTP, open the PocketBase dashboard → `users` collection → Options. OTP also needs SMTP under Settings → Mail.
