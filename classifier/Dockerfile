# Experimental offer classifier (see README.md). Build context: the repository root, so the
# image can read pocketbase/pb_hooks/product_types.json when training.
FROM python:3.13-slim
WORKDIR /app/classifier
COPY classifier/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pocketbase/pb_hooks/product_types.json /app/pocketbase/pb_hooks/product_types.json
COPY classifier/*.py ./
EXPOSE 8091
CMD ["python", "serve.py"]
