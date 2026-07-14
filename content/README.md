# Authoring content

This directory is the source of truth for Narrative Studio content.

- `narrative/`: one semantic story graph per file.
- `audio/`: audio assets, non-destructive cue recipes, triggers, and acoustics.
- `layout/`: merge-isolated graph positions and region presentation.
- `project.json`: project manifest.

Do not hand-copy changes back into `src/data`. Runtime adapters consume these
documents directly where cutover is complete. Run `npm run studio:validate`
before review; the normal game build also enforces the authoring gate.
