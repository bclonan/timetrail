# FrameTrail integration

Upstream is [OpenHypervideo/FrameTrail](https://github.com/OpenHypervideo/FrameTrail).
The pinned commit is `310a68a8bf60d70a3d64502147e2163132d5cfc5`.
The preparation script verifies this revision before copying the runtime.

The integration follows the upstream
[advanced tutorials](https://frametrail.org/tutorials-advanced.html),
[architecture](https://github.com/OpenHypervideo/FrameTrail/blob/main/docs/ARCHITECTURE.md),
and [extension guide](https://github.com/OpenHypervideo/FrameTrail/blob/main/docs/EXTENDING.md).
The pinned source, including its public API implementation, is the implementation
reference when examples describe an internal API.

## Files and preparation

No files inside `vendor/frametrail` are modified. That checkout is ignored by Git
and recreated from the pinned commit by `scripts/prepare-frametrail.mjs`.
The script copies `_lib`, `_shared`, and `player` assets and the upstream license
into the generated `public/frametrail` directory. It reads upstream `src/index.html`
to preserve dependency order. The generated loaders combine JavaScript and CSS into two requests. The offline cache excludes redundant individual source files. PHP and the resource-manager application are excluded.

Changes around FrameTrail are limited to:

1. Dependency copying and generated `loader.js`, `loader.css`, and `version.json`.
2. `public/runtime.html`, a same-origin player document with TimeTrail presentation CSS.
3. `frameTrailMapper.ts`, which converts validated project data to FrameTrail JSON.
4. `FrameTrailAdapter.ts`, which resolves and releases local asset addresses.
5. `FrameTrailBridge.ts` and `bridgeMessages.ts`, the parent protocol and validation.
6. `frame.ts`, which creates players and forwards playback and interaction events.
7. `runtime-package.mjs`, which bundles an exportable runtime with notices intact.
8. `standaloneClient.ts`, the independent exported viewer controls and context.

## Public API and timing

TimeTrail calls `FrameTrail.init(options, 'PlayerLauncher')`. The returned object
has `play`, `pause`, `currentTime`, `duration`, and `destroy`. It does not expose
the internal module accessor. Events include `onReady`, `onTimeupdate`, `onPlay`,
`onPause`, `onEnded`, `onOverlayClick`, and `onQuizAnswered`.

FrameTrail reads the first base clip of a hypervideo. TimeTrail uses a null-video
player for sequence timing and another public player for the active video or
audio clip. Clip changes replace that media player. Generated clips are timed
SVG image overlays on the null-video player. The parent never advances the
playhead using an independent interval.

The runtime pauses before destroying a player because destroy alone does not
stop every playback timer. TimeTrail converts inline image data to blob URLs
because the pinned resource URL resolver does not recognize data URLs.

## Mapping

| TimeTrail                               | FrameTrail                                             |
| --------------------------------------- | ------------------------------------------------------ |
| Sequence                                | Hypervideo metadata and duration                       |
| Generated card or image clip            | Timed image Overlay in hypervideo contents             |
| Chapter                                 | Hypervideo chapters                                    |
| Note, source, definition, fact, warning | W3C Annotation plus parent context card                |
| Image cue                               | Positioned image Overlay                               |
| Quiz                                    | Quiz Overlay with escaped question and bounded answers |
| Branch or hotspot                       | Hotspot Overlay with typed parent navigation           |
| Caption                                 | Parent caption text and exported WebVTT                |
| Media item                              | FrameTrail resource entry with resolved source         |

The mapper emits `t=start,end` and percentage `xywh` selectors. It sets
`frametrail:type`, resource attributes, creator, and provenance. Global events,
resource events, and custom CSS remain empty. Branch destinations come from
validated sequence IDs, not JavaScript or imported action strings. Remote
hotspot links open through TimeTrail's safe click handler.

## Message protocol

Parent messages are `TIMETRAIL_INIT`, `TIMETRAIL_SYNC`, `TIMETRAIL_PLAYBACK`,
`TIMETRAIL_SELECT`, `TIMETRAIL_PING`, and `TIMETRAIL_DESTROY`. Runtime messages are
`TIMETRAIL_READY`, `TIMETRAIL_PLAYHEAD`, `TIMETRAIL_RUNTIME_ERROR`,
`TIMETRAIL_LINK_ACTIVATED`, `TIMETRAIL_SELECTION_CHANGED`, and
`TIMETRAIL_QUIZ_ANSWERED`.

Both sides compare `event.source` and `event.origin` and parse message schemas.
The iframe must be served on the same origin. `srcdoc` exports use their inherited
origin. A `file:` launch shows a static-server instruction instead of claiming
working playback.

## Import compatibility and license

The importer supports inline FrameTrail video sources, chapters, and text
annotations. It drops executable snippets and unsupported overlays, and reports
that omission in the imported project's description. A complete TimeTrail
snapshot embedded in a compatible wrapper preserves all TimeTrail fields.

FrameTrail is dual licensed. TimeTrail uses its MIT option. The copied runtime
retains the upstream license and included library notices. The standalone
runtime includes the upstream license as a comment. No claim is made that
TimeTrail authored FrameTrail or its libraries.
