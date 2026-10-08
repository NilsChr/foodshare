"""Trains the classifier on exported offers and measures it against Jev's labels.

    python train.py

For each label: accuracy on a held-out 20%, and how many offers the model is sure about at
several thresholds (and how often it is right then). Those offers could skip Jev. Then
trains on everything and saves model/<label>.joblib for serve.py.
"""

from sklearn.model_selection import train_test_split

from model import GROUP, LABELS, MODELS, kassal_examples, load, pipeline, save, text, type_examples

THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9]


def extra_examples(label):
    """Training examples besides the offers; accuracy is measured on offers only."""
    if label == "product_type":
        return type_examples() + kassal_examples(label)
    if label == "group":
        return [(x, GROUP[k]) for x, k in type_examples()] + kassal_examples(label)
    return []


def main():
    offers = load()
    if not offers:
        raise SystemExit("No data; run export.py first.")
    print(f"{len(offers)} distinct offers\n")
    MODELS.mkdir(exist_ok=True)

    for label in LABELS:
        labelled = [o for o in offers if o[label]]
        texts = [text(o, label) for o in labelled]
        y = [o[label] for o in labelled]
        x_train, x_test, y_train, y_test = train_test_split(texts, y, test_size=0.2, random_state=1)
        extra = extra_examples(label)
        model = pipeline().fit(x_train + [x for x, _ in extra], y_train + [k for _, k in extra])
        probs = model.predict_proba(x_test)
        picks = [model.classes_[p.argmax()] for p in probs]
        right = sum(p == t for p, t in zip(picks, y_test))
        print(f"{label}: {len(set(y))} classes, {len(extra)} extra examples, {right}/{len(y_test)} agree with Jev ({right / len(y_test):.0%})")
        for threshold in THRESHOLDS:
            sure = [(p, t) for p, t, pr in zip(picks, y_test, probs) if pr.max() >= threshold]
            ok = sum(p == t for p, t in sure)
            share = len(sure) / len(y_test)
            print(f"  p >= {threshold}: sure about {share:.0%} of offers, {ok / max(len(sure), 1):.0%} of those agree")
        wrong = [(x, p, t) for x, p, t in zip(x_test, picks, y_test) if p != t][:8]
        for x, p, t in wrong:
            print(f"    {x[:50]:50}  model {p:16} Jev {t}")
        print()

        save(pipeline().fit(texts + [x for x, _ in extra], y + [k for _, k in extra]), label)
    print(f"Saved models to {MODELS}/")


if __name__ == "__main__":
    main()
