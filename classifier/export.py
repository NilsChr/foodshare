"""Saves every offer label Jev has given as training data.

PocketBase keeps Jev's labels in `offer_labels` after the offers expire (see
pocketbase/pb_hooks/offers_classify.js), so one run gets the whole history: it writes
data/labels.jsonl (heading, description, category, product_type), replacing the last export.
Labels on the offers themselves are not exported: with the local classifier on, they are its
own guesses.

    python export.py            # local PocketBase from docker-compose
    POCKETBASE_URL=... POCKETBASE_USER=... POCKETBASE_PASS=... python export.py
"""

import json
import os
import pathlib
import urllib.parse
import urllib.request

URL = os.environ.get("POCKETBASE_URL", "http://localhost:8090")
USER = os.environ.get("POCKETBASE_USER", "admin@foodshare.localhost")
PASS = os.environ.get("POCKETBASE_PASS", "localadmin123")
FIELDS = "heading,description,category,product_type"


def api(path, body=None, token=None):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def main():
    token = api("/api/collections/_superusers/auth-with-password", {"identity": USER, "password": PASS})["token"]
    query = urllib.parse.urlencode({"perPage": 500, "fields": FIELDS, "sort": "created"})
    labels, page = [], 1
    while True:
        res = api(f"/api/collections/offer_labels/records?{query}&page={page}", token=token)
        labels += res["items"]
        if page >= res["totalPages"]:
            break
        page += 1

    out = pathlib.Path(__file__).parent / "data" / "labels.jsonl"
    out.parent.mkdir(exist_ok=True)
    with out.open("w") as f:
        for o in labels:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"{len(labels)} labels -> {out}")


if __name__ == "__main__":
    main()
