# Storage and Cloud Layout

Chunk Surfer keeps gameplay rendering web-native while routing persistence through a platform boundary.

## Browser mode

Browser mode uses localStorage via `BrowserStorage`:

- `chunk-surfer:settings:v1`
- `chunk-surfer:profile:v1`
- `chunk-surfer:save:autosave:v1`
- `chunk-surfer:migration:v1`

Legacy keys are read for compatibility and left in place:

- `chunk-surfer:save:v3`
- `chunk-surfer:save:v2`
- `chunk-surfer:save:v1`
- `chunk-surfer:meta:v2`
- `chunk-surfer:meta:v1`

## Desktop mode

Desktop mode uses Tauri base directories, not hardcoded OS paths.

AppConfig:

- `settings.json`

AppData:

- `profile.json`
- `saves/autosave.json`
- `saves/slot-1.json`
- `saves/slot-2.json`
- `saves/backup/*.previous.json`
- `migration/localstorage-import-v1.json`

AppLog:

- `chunksurfer.log` / Tauri log target

## JSON envelopes

Persisted JSON files use:

```json
{
  "schemaVersion": 1,
  "gameVersion": "LOCAL",
  "createdAt": "2026-07-12T00:00:00.000Z",
  "updatedAt": "2026-07-12T00:00:00.000Z",
  "data": {}
}
```

Unknown newer schema versions are loaded as safe defaults and are not overwritten in that session.

## Recovery

Desktop writes serialize pretty JSON to a temp path, parse it back, back up the current primary, then replace the primary. If a primary save is malformed, the loader tries the previous backup and restores it when possible. If primary and backup both fail, the app returns safe defaults and records a recoverable diagnostic.

## Steam Auto-Cloud

Sync candidates:

- `profile.json`
- `saves/*.json`

Exclude:

- `settings.json`
- input/window state
- `migration/`
- `logs/`
- `cache/`
- `*.tmp`
- `saves/backup/` unless backup cloud recovery is intentionally desired later

Settings are machine-specific because renderer fallback, window/fullscreen state, and audio/input preferences can differ between a desktop PC, laptop, and Steam Deck.

## Support operations

The platform service exposes diagnostics export plus reveal-save-folder and reveal-log-folder operations in Tauri. Browser mode returns clear unsupported results for reveal operations.
