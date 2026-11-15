# The thread embedder (scripts/embed-threads.mts) as a Cloud Run job. deploy.sh stages the build
# context: the script bundled to one file, this folder's package files and the model file. The
# layout mirrors the repository, because the script looks for tools/thread-embed beside where it runs.
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY tools/thread-embed/package.json tools/thread-embed/package-lock.json tools/thread-embed/
# The runtime ships its Windows and macOS binaries too (220 MB); a Linux job never loads them.
RUN cd tools/thread-embed && npm ci --ignore-scripts --omit=dev && npm cache clean --force \
  && rm -rf node_modules/onnxruntime-node/bin/napi-v6/win32 node_modules/onnxruntime-node/bin/napi-v6/darwin
COPY tools/thread-embed/model-cache tools/thread-embed/model-cache
COPY embed-threads.mjs ./
USER node
CMD ["node", "embed-threads.mjs", "--write"]
