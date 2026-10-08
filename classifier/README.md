# Offer classifier (experiment)

Can a small local model replace most Jev calls when classifying flyer offers? Jev labels
each offer with a store section (`category`) and a `product_type`
(`pocketbase/pb_hooks/offers_classify.js`). This folder trains a classic text classifier on
those labels and measures how often it agrees with Jev. Admins can switch the app to it
(`app_settings.classifier = local`, see the root README); it has no model for offer matches.
A third model predicts the product `group` (Jev's first step towards the type, see
`classifyProduct` in `product_types.js`).

The model: character n-grams of the heading (plus the description's first line for the
section) into a logistic regression, with scikit-learn. Character n-grams handle inflection
and Norwegian compounds without a tokenizer. The type names and flyer words in
`product_types.json` are extra training examples for product type (and, through each type's
group, for group). So are Kassal catalog titles labelled by Jev with a group (~31,500) and a
type (~25,900), both where Jev's p ≥ 0.9. No TensorFlow: a few
thousand short headings is not enough data for a neural model to beat this.

## Use

```sh
cd classifier
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python export.py    # this week's classified offers -> data/offers-<date>.jsonl
.venv/bin/python prepare_kassal.py  # ../kassal/data/enriched.json -> data/kassal-jev.jsonl (optional)
.venv/bin/python train.py     # agreement with Jev on a held-out 20%, saves model/
.venv/bin/python serve.py     # HTTP API on :8091
```

`export.py` reads the local PocketBase from docker-compose by default; set `POCKETBASE_URL`,
`POCKETBASE_USER` and `POCKETBASE_PASS` for another one. PocketBase keeps no offer history,
so export every week: `train.py` uses every file in `data/` (one row per distinct offer,
newest label wins). `data/` is git-ignored; `model/` is committed.

`kassal/data/enriched.json` (see `kassal/README.md`) is a list of Kassal products (`title`,
`name`, `category`, `ean`, ...), each with Jev's product group (`jev_response.answers.new_choice`,
"annet" for `other`) and, once per title, its product type (`jev_type_response.answers.product`,
asked within the likeliest groups like the app does).
`prepare_kassal.py` writes one row per distinct title with both labels and their probabilities;
`model.kassal_examples()` uses those with p ≥ 0.9. Without the file the group and type models
train on offers and the type list only.

```sh
curl -s localhost:8091/classify -H 'Content-Type: application/json' \
  -d '{"offers": [{"heading": "ALI FILTERMALT/KOKMALT", "description": "250 g"}]}'
# {"results": [{"category": {"choice": "pantry", "p": 0.689}, "product_type": {"choice": "coffee", "p": 0.684}, "group": {"choice": "pantry", "p": 0.61}}]}
```

In Docker (after training locally; the image reads `model/` from the mounted folder):
`docker compose --profile classifier up classifier`.

## Results

One week of offers (1217 distinct, 7 Oct 2026), held-out 20%:

| Label | Agrees with Jev | Sure (p ≥ 0.6) | Agrees when sure |
|---|---|---|---|
| category (11) | 72% | 47% of offers | 92% |
| product_type (118 seen), with Kassal | 83% | 82% of offers | 89% |
| group (12), with Kassal | 93% | 90% of offers | 96% |

Without the Kassal titles, type was 75% (sure about 47%) and group 85% (sure about 49%). Group
is measured on the 880 offers with a type (176 held out, so ±3 points). Catalog titles are
cleaner than flyer headings, but they teach the brands and product words a week of flyers has
too few of. Adding Kassal's short names ("Vaniljeis") as type examples did not help on offers
(81% vs 83%). Sections have no Kassal labels.

With Kassal the type model trains in ~5 minutes; it classifies 500 offers in ~60 ms over
HTTP. The models are saved with float32 weights, compressed, and without n-grams seen in only
one text (min_df=2): 29 MB in all instead of 129 MB, same accuracy. They are committed to git,
since the Docker image (Coolify) is built from them; commit them again after retraining.

So with one week of data the model could take about half of the offers and leave the rest to
Jev. Most misses are rare types and brand names it has seen once or never ("oreo golden",
"gilde sognemorr"); more weeks of data should help most. Jev's labels are the ground truth
here, mistakes included.

Is it worth it? Jev costs about $0.12 a week for all offers, so half of that is a few kroner
a month. Worth it for independence from TypeSafe, more chains or users, or to learn; not for
the cost alone. Offer matching ("is REKESALAT what 'salat' means?") stays with Jev: that is
language understanding, with little training data.
