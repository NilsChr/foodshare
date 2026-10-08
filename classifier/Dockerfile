# Offer and item classifier (see README.md). Build context: the repository root, so the
# image can read pocketbase/pb_hooks/product_types.json.
# In Coolify: Build Pack "Dockerfile", Base Directory "/", Dockerfile "classifier/Dockerfile",
# port 8091, no public domain (PocketBase reaches it on the internal network).
FROM python:3.13-slim
WORKDIR /app/classifier
COPY classifier/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pocketbase/pb_hooks/product_types.json /app/pocketbase/pb_hooks/product_types.json
COPY classifier/*.py ./
# Trained models, committed to git; retrain with train.py and commit them.
COPY classifier/model ./model
EXPOSE 8091
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health')" || exit 1
CMD ["python", "serve.py"]
