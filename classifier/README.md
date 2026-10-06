# Offer classifier (experiment)

Can a small local model replace most Jev calls when classifying flyer offers? Jev labels
each offer with a store section (`category`) and a `product_type`
(`pocketbase/pb_hooks/offers_classify.js`). This folder trains a classic text classifier on
those labels and measures how often it agrees with Jev. Nothing in PocketBase or the app
uses it yet.

The model: character n-grams of the heading (plus the description's first line for the
section) into a logistic regression, with scikit-learn. Character n-grams handle inflection
and Norwegian compounds without a tokenizer. The type names and flyer words in
`product_types.json` are extra training examples for product type. No TensorFlow: a few
thousand short headings is not enough data for a neural model to beat this.

## Use

```sh
cd classifier
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python export.py    # this week's classified offers -> data/offers-<date>.jsonl
.venv/bin/python train.py     # agreement with Jev on a held-out 20%, saves model/
.venv/bin/python serve.py     # HTTP API on :8091
```

`export.py` reads the local PocketBase from docker-compose by default; set `POCKETBASE_URL`,
`POCKETBASE_USER` and `POCKETBASE_PASS` for another one. PocketBase keeps no offer history,
so export every week: `train.py` uses every file in `data/` (one row per distinct offer,
newest label wins). `data/` and `model/` are git-ignored.

```sh
curl -s localhost:8091/classify -H 'Content-Type: application/json' \
  -d '{"offers": [{"heading": "ALI FILTERMALT/KOKMALT", "description": "250 g"}]}'
# {"results": [{"category": {"choice": "pantry", "p": 0.689}, "product_type": {"choice": "coffee", "p": 0.684}}]}
```

In Docker (after training locally; the image reads `model/` from the mounted folder):
`docker compose --profile classifier up classifier`.

## Results

One week of offers (1217 distinct, 7 Oct 2026), held-out 20%:

| Label | Agrees with Jev | Sure (p ≥ 0.6) | Agrees when sure |
|---|---|---|---|
| category (11) | 72% | 47% of offers | 92% |
| product_type (118 seen) | 75% | 47% of offers | 96% |

So with one week of data the model could take about half of the offers and leave the rest to
Jev. Most misses are rare types and brand names it has seen once or never ("oreo golden",
"gilde sognemorr"); more weeks of data should help most. Jev's labels are the ground truth
here, mistakes included.

Is it worth it? Jev costs about $0.12 a week for all offers, so half of that is a few kroner
a month. Worth it for independence from TypeSafe, more chains or users, or to learn; not for
the cost alone. Offer matching ("is REKESALAT what 'salat' means?") stays with Jev: that is
language understanding, with little training data.
