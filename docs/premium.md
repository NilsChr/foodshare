# Premium (plan, not built)

Idea: keep the core app free and make the AI-assisted offer features a paid "premium" upgrade. This document records the reasoning and a proposed design so it can be built as its own round of work.

## Why premium, and why not because of cost

The AI features use TypeSafe AI's Jev classifier. Its cost is low and mostly fixed:

| What | When | Measured cost |
|---|---|---|
| Classify offers (store section + product type) | Once per new offer, all chains | ~2300 input tokens each (two requests: group, then type); about $0.12 per week for ~1200 offers |
| Classify a list item name and check its offers | Once per new name, shared by all users (caches `product_names`, `offer_matches`) | ~2000–3000 input tokens, about $0.0001 per new name; 10 000 names ≈ $1 in total |

Repeated adds of a known name, names found in the type list, searching offers and showing matches cost nothing. So premium is about the value to the user, not about covering AI cost. Cost only becomes a concern with abuse (see "Limits").

## What is free and what is premium

| Free | Premium |
|---|---|
| Choose stores for the group (Group → Stores) | Smart matching by product type ("kaffe" finds "ALI FILTERMALT/KOKMALT") |
| Offer tags on list items, by word matching | Category filter on the Offers page |
| Offers page: search, store filter, add to list | "Best store this week" recommendation on the list |
| | "Save about X" estimate |

Word matching stays free so the offers feature is useful without paying. The paid tier adds the parts that feel smart.

Open question: whether the category filter should be free. It costs nothing per user (offers are classified once for everyone), so keeping it free is reasonable.

## Premium per group, not per user

Stores, offers and recommendations belong to the household, and everyone in a group shares one list. Premium is therefore a property of the group (`spaces`): one member pays, the whole group gets it.

## Data model

- `spaces.premium_until` (date). Premium is active while it is in the future. A date instead of a bool handles subscription periods, trials and grace periods with one field, and expires on its own if a payment webhook is missed.
- API rules: members must not be able to set it. Add to the `spaces` update rule in `pocketbase/setup.mjs`: `@request.body.premium_until:isset = false`. Only superusers and server hooks write it.

## Enforcement: on the server, where the cost is

The client hides premium features, but that is only UI. The server must gate anything that costs money or that a modified client could otherwise use:

- `pocketbase/pb_hooks/product_types.js` → `comparesOffers()`: also require `premium_until > now`. This one change stops list item classification (create, rename, and the cron backfill) for non-premium groups.
- `items.product_type` is then empty for free groups, so smart matching in `offersFor` falls back to words without any client change.
- Offer classification (category and product type on `offers`) stays global. It is a fixed cost shared by everyone and is needed as soon as any group is premium.
- Recommendation and savings are computed in the browser from data free users can already read. Hiding them in the UI is enough; there is no cost or secret to protect.

In the app: expose `premium` from the space (`premium_until > now`) in `SpaceDataProvider`, and show a short "Premium" upsell where the hidden features would appear (store recommendation card, category chips).

## Payment, in phases

1. **Manual (first).** A superuser sets `premium_until` in the PocketBase dashboard for family, friends and test users. This makes it possible to try the split before handling money.
2. **Stripe.** Foodshare is a PWA, so Stripe Checkout works without App Store or Play Store fees.
   - "Upgrade" in Group calls a hook route (`POST /api/foodshare/checkout`) that creates a Checkout Session with `client_reference_id` = space id and returns its URL.
   - Stripe calls a webhook route (`POST /api/foodshare/stripe-webhook`) on `checkout.session.completed` and `invoice.paid`. The route verifies the Stripe signature and extends `premium_until` to the end of the paid period plus a few days' grace.
   - Cancellation and card changes go through Stripe's Customer Portal, so the app needs no billing UI of its own.
   - Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) go in Coolify env vars, like `TYPESAFE_API_KEY`.
3. **Before charging anyone:** a Stripe account, Norwegian VAT (25 %, Stripe Tax can handle it), terms of sale, a privacy policy that mentions Stripe and TypeSafe, and a price. Monthly and yearly options are the usual setup.

## Limits

Independent of premium, a cap protects against abuse of the item classification: for example at most 50 new Jev lookups per user per day. Above the cap, items get word matching only. The count can live on the `product_names` rows (creator and date) or in a small counter collection. Add this before the app is open to people outside the family.

## Open questions

- Price, and whether to offer a free trial (a `premium_until` set 30 days ahead on group creation would do it).
- Which features are premium. The table above is a proposal.
- What happens to a group's settings when premium ends: keep the chosen stores and simply stop the premium features (recommended).
- Whether premium should later include other AI features (for example recipe suggestions from this week's offers).
