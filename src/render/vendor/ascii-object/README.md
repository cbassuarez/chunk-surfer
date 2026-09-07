Canvas UI AsciiObject, Copyright (c) 2026 David Haz.
Source: https://canvasui.dev/ ; pinned upstream commit 2dd45d70394b890a8130740061cdcc957e89dc35.
Imported from the project's existing VPP vendor copy and transpiled from TypeScript with esbuild.
See LICENSE.md. This code is included as part of the game, not distributed as a component library.

Local changes: manual render scheduling, explicit orbit/reset methods for the game's input router,
a fixed elevated three-quarter camera, and a centred model. The ASCII shaders remain upstream.
Inventory thumbnails are baked with this same renderer. Only the inspected object renders live.
