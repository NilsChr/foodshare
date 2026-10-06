"""Saves this week's classified offers from PocketBase as training data.

Offers are replaced every week and PocketBase keeps no history, so run this regularly to build
up data: each run writes data/offers-<date>.jsonl (heading, description and Jev's labels).

    python export.py            # local PocketBase from docker-compose
    POCKETBASE_URL=... POCKETBASE_USER=... POCKETBASE_PASS=... python export.py
"""

import datetime
import json
import os
import pathlib
import urllib.parse
import urllib.request

URL = os.environ.get("POCKETBASE_URL", "http://localhost:8090")
USER = os.environ.get("POCKETBASE_USER", "admin@foodshare.localhost")
PASS = os.environ.get("POCKETBASE_PASS", "localadmin123")
FIELDS = "key,chain,heading,description,category,product_type"


def api(path, body=None, token=None):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def main():
    token = api("/api/collections/_superusers/auth-with-password", {"identity": USER, "password": PASS})["token"]
    # Only classified offers are useful as labels.
    query = urllib.parse.urlencode({"perPage": 500, "fields": FIELDS, "filter": "category != '' && product_type != ''"})
    offers, page = [], 1
    while True:
        res = api(f"/api/collections/offers/records?{query}&page={page}", token=token)
        offers += res["items"]
        if page >= res["totalPages"]:
            break
        page += 1

    out = pathlib.Path(__file__).parent / "data" / f"offers-{datetime.date.today()}.jsonl"
    out.parent.mkdir(exist_ok=True)
    with out.open("w") as f:
        for o in offers:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"{len(offers)} offers -> {out}")


if __name__ == "__main__":
    main()
