# PocketBase with Foodshare's server hooks baked in.
# In Coolify: Build Pack "Dockerfile", Base Directory "/pocketbase", port 8080,
# and a persistent volume mounted at /pb/pb_data (database and uploaded files).

FROM alpine:3.22

ARG PB_VERSION=0.40.4
# Set automatically by BuildKit (amd64 or arm64).
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip \
 && case "$TARGETARCH" in \
      amd64) sha=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa ;; \
      arm64) sha=86095bf8ed9345954f0d2bf0a5fb9b57584ae60b77ebf3b6cd23a8003a3fd418 ;; \
      *) echo "unsupported arch: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && wget -qO /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && echo "$sha  /tmp/pb.zip" | sha256sum -c - \
 && unzip /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip \
 && apk del unzip

COPY pb_hooks /pb/pb_hooks
# Schema migrations; PocketBase applies pending ones on start.
COPY pb_migrations /pb/pb_migrations

VOLUME /pb/pb_data
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data", "--hooksDir=/pb/pb_hooks", "--migrationsDir=/pb/pb_migrations"]
