# XBlast server image: the built client, the original data and the game server
# in one container. docker build -t xblast . && docker run -p 3001:3001 xblast

# Build: client with Vite, server bundled with the simulation into one file.
FROM oven/bun:1.4.3-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY scripts scripts
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY packages/sim/package.json packages/sim/
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY packages packages
COPY assets assets
RUN cd packages/client && bun run build
# Same depth as src/: the server finds client/dist and assets the same way.
RUN bun build packages/server/src/index.ts --target bun --outdir packages/server/dist

# Run: no dependencies, no sources, an unprivileged user.
FROM oven/bun:1.4.3-alpine
WORKDIR /app
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist
COPY assets/levels assets/levels
USER bun
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "packages/server/dist/index.js"]
