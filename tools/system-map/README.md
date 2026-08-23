# Chunk Surfer System Map

The system map is a read-only, repository-local view of Chunk Surfer's runtime,
content pipeline, persistence, desktop shell, and local Lens service. It uses a
curated semantic topology rather than treating the JavaScript import graph as a
substitute for real control and data flow.

## Run

```sh
npm run system-map
```

The command serves the map on `http://127.0.0.1:4318/` and opens it in the
default browser. The terminal owns the server; stop it with `Ctrl-C`.

For CI or an already-open browser:

```sh
npm run system-map -- --no-open
npm run system-map -- --no-open --port 4931
npm run system-map:build
```

## Evidence contract

`topology.mjs` names every subsystem, payload route, trace, and source anchor.
`snapshot.mjs` resolves those anchors against the current checkout every time
the local API is requested. A missing or ambiguous anchor is a contract error,
so displayed `path:line` citations cannot silently drift to unrelated code.

The server exposes only `GET /api/system-map`. It does not expose arbitrary
source paths and it has no write endpoint. The production build embeds the same
validated snapshot and does not need a file service.

Run the focused contract with:

```sh
node test/system-map.spec.mjs
```
