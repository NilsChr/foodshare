"""The classifier: character n-grams of the flyer text into a logistic regression, one model
per label (store section and product type). Shared by train.py and serve.py."""

import json
import pathlib

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

DATA = pathlib.Path(__file__).parent / "data"
MODELS = pathlib.Path(__file__).parent / "model"
LABELS = ["category", "product_type"]


def text(offer, label):
    """What the model reads. Product type: the heading only; the description (sizes, prices,
    "førpris ...") cost 7 points. Store section: heading plus the description's first line,
    which helped by about as much ("fryst", "pr. kg")."""
    if label == "product_type":
        return offer["heading"].lower()
    first = (offer.get("description") or "").split("\n")[0]
    return f"{offer['heading']} | {first}".lower()


def type_examples():
    """Type names and flyer words from product_types.json as extra product_type examples
    ("filtermalt" -> coffee): +12 points with one week of offers."""
    types = json.loads((pathlib.Path(__file__).parent.parent / "pocketbase/pb_hooks/product_types.json").read_text())["types"]
    return [(a.lower(), t["key"]) for t in types for a in [t["name"], *t["aliases"]]]


def load():
    """All exported offers, one per distinct heading and description (the newest label wins)."""
    seen = {}
    for path in sorted(DATA.glob("offers-*.jsonl")):
        for line in path.open():
            offer = json.loads(line)
            seen[(offer["heading"].lower(), offer.get("description", ""))] = offer
    return list(seen.values())


def pipeline():
    # char_wb n-grams within words cope with inflection and Norwegian compounds
    # ("grillpølser" shares "pøls" with "pølse") without a tokenizer.
    return make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=1, sublinear_tf=True),
        LogisticRegression(max_iter=2000, C=10),
    )
