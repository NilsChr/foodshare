"""HTTP API for the trained classifier (stdlib only).

    python serve.py             # http://localhost:8091

POST /classify  {"offers": [{"heading": "...", "description": "..."}]}
  -> {"results": [{"category": {"choice": "...", "p": 0.97}, "product_type": {...}}]}
GET  /health
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import joblib

from model import LABELS, MODELS, text

PORT = int(os.environ.get("PORT", "8091"))
MAX_OFFERS = 500
models = {label: joblib.load(MODELS / f"{label}.joblib") for label in LABELS}


def classify(offers):
    results = [{} for _ in offers]
    for label, model in models.items():
        for result, probs in zip(results, model.predict_proba([text(o, label) for o in offers])):
            best = probs.argmax()
            result[label] = {"choice": model.classes_[best], "p": round(float(probs[best]), 3)}
    return results


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/classify":
            return self.reply(404, {"error": "not found"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            offers = body["offers"]
            if not isinstance(offers, list) or len(offers) > MAX_OFFERS:
                raise ValueError(f"offers must be a list of at most {MAX_OFFERS}")
            for o in offers:
                if not isinstance(o, dict) or not isinstance(o.get("heading"), str):
                    raise ValueError("each offer needs a heading string")
        except (ValueError, KeyError, TypeError) as err:
            return self.reply(400, {"error": str(err)})
        self.reply(200, {"results": classify(offers)})


if __name__ == "__main__":
    print(f"classifier on :{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
