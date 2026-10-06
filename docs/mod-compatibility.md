# Mod compatibility

These fixes follow the Claude Code mod documentation, checked on 2026-10-06.
Native validation and tests use Claude Code 2.1.292. Mock terminal and desktop
tests verify API behavior; they do not prove image support in every terminal or
constitute a Windows/Desktop installation test.

## Official contracts

| Area | Contract and implementation | Official source |
| --- | --- | --- |
| Availability | CLI 2.1.287+, Desktop's Claude Code 2.1.286+. UI requires an interactive supported surface. | [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview) |
| Tool events | Arguments such as `file_path`, `command`, and `description` are directly on `tool.call`; observation preserves `next(e)`. | [React to events](https://code.claude.com/docs/en/plugins/mods/events) |
| Commands | Register `/clawd-pet`; register `/pet` only if free. Yield `/pet` when another plugin takes ownership. Registration failures do not stop pet initialization. | [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api) |
| Shared state | Observe only successful `isSet` results and reread the accepted value after middleware. Publish hosting after reading initial state and restore it after session state resets. | [Interface state](https://code.claude.com/docs/en/plugins/mods/interface#keep-state) |
| Band composition | Include `await next(e)`, account for its declared row geometry, fit the image into the remaining rows, and yield if none remain. `Raster` provides the block fallback. | [Draw in the interface](https://code.claude.com/docs/en/plugins/mods/interface) |
| Persistence | Store writes to different keys preserve each other's data; `get` followed by `set` is not atomic. Each runtime owns a UUID journal, and mutations/writes within that runtime are serialized. | [Save from more than one session](https://code.claude.com/docs/en/plugins/mods/interface#save-from-more-than-one-session) |
| Storage limits | The plugin store has a 4 MiB limit; file writes replace content in place. Archive completed journal chunks to unique files rather than overwrite a shared save. Deduplicate a remaining store copy by the archive UUID. | [Reference](https://code.claude.com/docs/en/plugins/mods/reference), [API and generated types](https://code.claude.com/docs/en/plugins/mods/api) |
| Verification | Validate the manifests/hooks and run `claude-code/testing` through `claude plugin test`. | [Test a mod](https://code.claude.com/docs/en/plugins/mods/test) |

## Optional integrations

`token-weather.line` is an optional `{ full, compact }` array-of-text-segments
contract. When present, Clawd advertises `clawd-pet.hosts = ['token-weather']`.
For older custom versions querying `claude-pet.hosts`, a read bridge supplies
this value only when no legacy owner has supplied a value. Hiding Clawd or
yielding its entire band releases hosting. Stock versions without this contract
continue to draw their own forecast. `hud-pane.rows`, `blast-radius.held`,
`replay-theater.state`, and `achievements.latest` remain optional; absent mods
are not dependencies.

Other mods can still replace a render site without preserving the hook chain.
Their private, undeclared state contracts can also change independently. The
regression suite covers command collisions, rewritten/rejected state updates,
existing forecasts at startup, multiple sessions, image fallback, and a band
with no remaining rows.

## Save migration

Existing `clawd-pet.json` and older plugin-store `pet`/`tokens` values seed the
journal baseline. The legacy JSON is read, never overwritten. Settings record
only changed fields, care records actual gains, and token increments add across
journals. Hiding stays local to the session. The configured Claude directory
also supplies `stats-cache.json`; days already included in its totals do not
count twice toward the pet's level.

Active records use the plugin store. Chunks reaching about 64 KiB, or saves the
store rejects, go to `clawd-pet-history/<UUID>.json` before the old store record
is removed. Each file is a completed immutable chunk. A reader that encounters
an incomplete new file retries on the next refresh; it never rewrites that file.
Archives remain local until removed by the user. Filesystem failures are logged
and pending changes remain in memory for the next save attempt.
