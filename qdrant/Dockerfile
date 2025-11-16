FROM qdrant/qdrant:latest

EXPOSE 6333
EXPOSE 6334

ENV QDRANT__HTTP_API_KEY=""
ENV QDRANT__STORAGE__SNAPSHOTS_PATH=/qdrant/snapshots
ENV QDRANT__STORAGE__STORAGE_PATH=/qdrant/storage

VOLUME /qdrant/storage
VOLUME /qdrant/snapshots

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:6333/health || exit 1
