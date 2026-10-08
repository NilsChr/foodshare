"""The classifier: character n-grams of the flyer text into a logistic regression, one model
per label (store section, product type and product group). Shared by train.py and serve.py."""

import json
import pathlib

import joblib
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline

DATA = pathlib.Path(__file__).parent / "data"
MODELS = pathlib.Path(__file__).parent / "model"
LABELS = ["category", "product_type", "group"]
TYPES = json.loads((pathlib.Path(__file__).parent.parent / "pocketbase/pb_hooks/product_types.json").read_text())["types"]
GROUP = {t["key"]: t["group"] for t in TYPES}


def text(offer, label):
    """What the model reads. Product type and group: the heading only; the description (sizes,
    prices, "førpris ...") cost 7 points. Store section: heading plus the description's first
    line, which helped by about as much ("fryst", "pr. kg")."""
    if label in ("product_type", "group"):
        return offer["heading"].lower()
    first = (offer.get("description") or "").split("\n")[0]
    return f"{offer['heading']} | {first}".lower()


def type_examples():
    """Type names and flyer words from product_types.json as extra product_type examples
    ("filtermalt" -> coffee): +12 points with one week of offers."""
    return [(a.lower(), t["key"]) for t in TYPES for a in [t["name"], *t["aliases"]]]


def load():
    """All exported offers, one per distinct heading and description (the newest label wins).
    Each gets its product group from its type; offers without a type ("none") have none."""
    seen = {}
    for path in sorted(DATA.glob("offers-*.jsonl")):
        for line in path.open():
            offer = json.loads(line)
            offer["group"] = GROUP.get(offer["product_type"])
            seen[(offer["heading"].lower(), offer.get("description", ""))] = offer
    return list(seen.values())


# Kassal labels at or above this probability are used. Measured on held-out offers, 0.5, 0.7
# and 0.9 give about the same accuracy; 0.9 is right most often when the model is sure.
KASSAL_MIN_P = 0.9


def kassal_examples(label):
    """Kassal catalog titles with Jev's product group or type (prepare_kassal.py) as extra
    examples. On held-out offers: group 85% -> 93%, type 75% -> 83%."""
    path = DATA / "kassal-jev.jsonl"
    if not path.exists():
        return []
    p = {"group": "group_p", "product_type": "type_p"}[label]
    return [(row["heading"].lower(), row[label]) for row in map(json.loads, path.open()) if row.get(p, 0) >= KASSAL_MIN_P]


def pipeline(min_df=2):
    # char_wb n-grams within words cope with inflection and Norwegian compounds
    # ("grillpølser" shares "pøls" with "pølse") without a tokenizer. n-grams seen in only one
    # text (min_df=2) are dropped: they are mostly noise and half the model's size.
    return make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=min_df, sublinear_tf=True, dtype=np.float32),
        LogisticRegression(max_iter=2000, C=10),
    )


def save(model, label):
    """Saves a trained model for serve.py, small enough for git (the image is built from it):
    float32 weights and compression."""
    lr = model.steps[-1][1]
    lr.coef_ = lr.coef_.astype(np.float32)
    lr.intercept_ = lr.intercept_.astype(np.float32)
    joblib.dump(model, MODELS / f"{label}.joblib", compress=3)
