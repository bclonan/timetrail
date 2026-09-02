# Decisions

## Portable JSON is the source of truth

FrameTrail is a renderer. TimeTrail does not persist its internal object graph.
The `1.0` project document can be validated, shared, remixed, and rendered without
editor state. Local assets use logical IDs so exports can replace their addresses.

## Proposals are separate records

An agent can draft metadata, media, clips, cues, and branches, but cannot commit
those edits silently. Preview works on a clone. Acceptance validates the complete
result in one IndexedDB transaction. Human UI edits use the same domain validation.

## Two FrameTrail players for mixed sequences

The upstream public player has one base video. A null-video player keeps sequence
time and a second player shows the active media clip. This preserves FrameTrail
as the playback engine without patching upstream internals. It costs extra
runtime weight and a short media initialization delay at clip boundaries.

## Generated cards use SVG

Original local SVG templates make the demo deterministic and independent of
remote assets, rendering services, or API keys. The seven layouts have distinct
arrangements. Long prose is clipped to readable line limits. The complete text
remains in the project and narration fields.

## Exports include the runtime

Self-contained HTML and static packs include the pinned FrameTrail runtime and
a small viewer client. Files are larger than a screenshot or JSON export, but
retain timed interactions. The runtime runs in an iframe and requires HTTP or
HTTPS. Flat video export is deferred because it would discard interaction and
introduce a transcoding pipeline.

## Native WebMCP and a labeled fallback

Tools use `document.modelContext.registerTool` with an AbortSignal. A browser
without that experimental API can run the same handlers in WebMCP Lab. The
fallback never changes approval requirements. Native registration status is
shown separately so a successful fallback call is not mistaken for native support.

## Local storage and explicit sharing

IndexedDB stores metadata and revision history. OPFS is preferred for binary
files, with an IndexedDB fallback. No remote sync runs in the background.
Sharing compresses only the approved project into a fragment link. Local files
require an explicit export. Sharing is not encryption or access control.

## Static hosting

Vite produces `dist`; Netlify serves those files and routes. There is no server
API. Static gallery manifests are read-only discovery sources. Publishing remains
a separate human action. The included configuration is ready for deployment,
but this build has not been published.
