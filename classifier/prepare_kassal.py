"""Turns Jev's labels for Kassal's product catalog into training data.

    python prepare_kassal.py    # ../kassal/data/enriched.json -> data/kassal-jev.jsonl

The source is a list of Kassal products (title, name, brand, category, ean ...) with Jev's
answers: the product group in jev_response, the product type in jev_type_response (asked
once per title). See kassal/README.md. Writes one row per distinct
title with each label and its probability; model.kassal_examples() picks the sure ones.
Group keys are those of product_types.json ("annet" is "other" there).
"""

import collections
import json

from model import DATA

RAW = DATA.parent.parent / "kassal" / "data" / "enriched.json"
OUT = DATA / "kassal-jev.jsonl"


def answer(response, question):
    """Jev's pick for a question and its probability, or (None, 0)."""
    a = ((response or {}).get("answers") or {}).get(question) or {}
    choice = a.get("choice")
    return (choice, (a.get("probabilities") or {}).get(choice, 0)) if choice else (None, 0)


def main():
    rows = {}
    for product in json.loads(RAW.read_text()):
        title = (product.get("title") or "").strip()
        if not title:
            continue
        # Several chains sell the same title; only one of them was asked the type.
        row = rows.setdefault(title.lower(), {"heading": title, "name": product.get("name") or "",
                                              "kassal_category": product.get("category"), "ean": product.get("ean")})
        group, group_p = answer(product.get("jev_response"), "new_choice")
        if group:
            row["group"], row["group_p"] = "other" if group == "annet" else group, group_p
        product_type, type_p = answer(product.get("jev_type_response"), "product")
        if product_type:
            row["product_type"], row["type_p"] = product_type, type_p
    with OUT.open("w") as f:
        for row in rows.values():
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"{len(rows)} products -> {OUT}")
    for label in ("group", "product_type"):
        print(f"  {label}: {sum(label in r for r in rows.values())} labelled")


if __name__ == "__main__":
    main()
