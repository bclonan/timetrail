# WebMCP

TimeTrail uses the browser's experimental `document.modelContext` API.
Each route registers its relevant tools with `registerTool(definition, {signal})`.
A route change aborts the previous registrations. Tools return compact JSON
strings and validate input with Zod before calling domain services.

The implementation follows Chrome's
[imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api),
[best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices), and
[security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools).
Feature detection is required. The application does not use a navigator API or
assume native support based on the browser name.

## Implemented tools

| Name                         | Input                                                                                              | Result and effect                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `timetrail.project.inspect`  | Optional `include` array of timeline, media, proposals, selection, warnings                        | Project and sequence IDs, revision, counts, current selection, compact media and chapter summaries |
| `timetrail.project.create`   | `title`, `topic`, optional `audience`, `targetSeconds`, `mode`                                     | Creates an empty local project and opens Studio                                                    |
| `timetrail.media.import`     | `items`, 1 to 20 objects with `url`, optional `label`, `typeHint`                                  | Stages resources, returns usable media IDs, proposal ID, warnings                                  |
| `timetrail.build.propose`    | `title`, `topic`, `targetSeconds`, ordered `segments`; optional `audience`, `style`, `baseMediaId` | Compiles a complete storyboard proposal with summary counts                                        |
| `timetrail.cues.propose`     | Optional `sequenceId`, 1 to 60 `cues`, optional `rationale`                                        | Creates a timed cue proposal                                                                       |
| `timetrail.playback.control` | `action`: play, pause, seek, jump-to-chapter; optional `timeSeconds`, `chapterId`                  | Controls the mounted, ready preview                                                                |
| `timetrail.proposals.list`   | Optional `status`: pending, accepted, rejected, all                                                | Compact proposal IDs, counts, status, warnings                                                     |
| `timetrail.proposals.review` | `proposalIds`, `decision`: accept or reject, optional `operationIndexes` for one proposal          | Opens a human confirmation dialog, then applies the confirmed transaction                          |
| `timetrail.export.prepare`   | `format`: project-json, project-zip, standalone-html, static-pack                                  | Prepares an artifact and shows a human download button                                             |
| `timetrail.share.prepare`    | `mode`: code or link                                                                               | Waits for confirmation before creating share data                                                  |
| `timetrail.gallery.search`   | Optional `query`, `tags`, `source`: local, published, all                                          | Searches metadata and returns compact creation summaries                                           |
| `timetrail.gallery.open`     | `projectId`, optional `mode`: watch or remix                                                       | Opens a film or creates a local remix                                                              |

Project inspection, creation and the prompt library are available on every route.
Discover also has gallery tools. Studio has editing and production tools. Player
and Watch routes expose viewing, checks, export and sharing tools, with no editor
mutations. Lab lists all definitions and runs the handlers registered for its
current project context. Playback requires a mounted Studio or Player preview.

Each segment can have `title`, `summary`, `narration`, `durationWeight`, `mediaId`
or `mediaUrl`, context `cards`, one `quiz`, and one `branch`. Cards have a kind,
title, body, and optional HTTP URL. A quiz has question, options, answerIndex,
and optional explanation. A branch has label, targetTitle, and targetSummary.
The full live schemas are visible in Lab and its Copy tool manifest action.

## Editor controls

The editor tools use the same Pinia drafts as the visible forms. Opening or
filling a form never updates the saved project. `editor.propose` creates a
proposal. The human can also save the visible form directly after inspecting it.
All form writes require the revision returned by inspection. A changed revision
invalidates the form until it is reopened.

| Tool                          | Controls                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timetrail.editor.inspect`    | Current form, complete form fields, view settings, history availability, paginated sequences, media, clips and cues. Use `itemId` for the full item. |
| `timetrail.editor.navigate`   | Studio, Watch and Lab for the current project. Refetch tools after navigation.                                                                       |
| `timetrail.editor.open`       | Project details, screen, generated card, cue, clip, URL import. Omit `itemId` to create a screen, card, cue or clip.                                 |
| `timetrail.editor.fill`       | Partial fields in the visible form. Nested objects replace their previous value. Cue optional fields can be cleared explicitly.                      |
| `timetrail.editor.propose`    | Propose saving, duplicating or deleting the open item. Reference and timing validation still apply.                                                  |
| `timetrail.editor.control`    | Select sequence, close form, show/hide media library, captions, narration, resource preview, context pinning, quiz answer, branch and return.        |
| `timetrail.timeline.propose`  | `itemId`, `kind`, `action`, `time`, `expectedRevision`, optional `sequenceId`. Proposes the same move, clip reorder or trim as the timeline gesture. |
| `timetrail.media.place`       | Propose a media clip with explicit timing or append it to a sequence. Extends sequence duration as needed.                                           |
| `timetrail.proposals.preview` | Preview a pending proposal or restore the approved version.                                                                                          |
| `timetrail.history.request`   | Request undo/redo and wait for visible human confirmation.                                                                                           |

A screen is a sequence with its own clips and cues. Create a screen, review it,
select it, then add cards or media. For a complete multi-scene draft in one
proposal, use `build.propose` with ordered segments and branch destinations.
Timeline moves carry fully contained cues with their clips. Spanning cues keep
their original timing. Trimming changes only the selected item and respects
neighboring clips and known source bounds. A proposed edit still requires human
review.

Card editing updates linked chapter titles and narration cues. Clip timing has
its own form. Removing media or screens still referenced elsewhere fails
validation; remove those references first.

The six forms cover project title/topic/description/audience/tags; screen
name/duration/mode; generated card layout/text/image/background/illustration/
source credit/narration; every cue kind including quiz and branch fields;
clip media/timeline start/duration/source bounds; and URL import text.
`project.create` accepts every new-project form value.

Local file/folder pickers, clipboard, downloads and browser fullscreen gestures
remain visible browser controls. Tools can also ingest supplied file bytes or
download a CORS-enabled URL through the shared File importer. They cannot read
arbitrary local filesystem paths or press human approval buttons. Narration
playback depends on browser voice support and may need a human gesture.

### Fill a card form

After `editor.inspect`, use its revision in these three calls:

```json
{ "form": "card", "expectedRevision": 0 }
```

Send that to `timetrail.editor.open`. Then call `timetrail.editor.fill`:

```json
{
  "expectedRevision": 0,
  "input": {
    "form": "card",
    "fields": {
      "heading": "A working copy",
      "body": "The cell copies a gene into messenger RNA.",
      "layout": "concept",
      "background": "ink",
      "illustration": "rna",
      "narration": "Messenger RNA carries a copy of the instructions.",
      "duration": 15
    }
  }
}
```

The filled fields are now visible. Call `timetrail.editor.propose` with
`{"action":"save","expectedRevision":0}` to put the edit into review.
No approved project data changes until the human saves or accepts it.

## Example build

After creating a project, call `timetrail.build.propose` with:

```json
{
  "title": "A cell reads its instructions",
  "topic": "DNA to protein",
  "targetSeconds": 90,
  "segments": [
    {
      "title": "The instructions",
      "summary": "DNA stores information in its sequence of bases.",
      "narration": "DNA stores the information that cells use to build proteins.",
      "cards": [
        {
          "kind": "definition",
          "title": "DNA",
          "body": "Deoxyribonucleic acid."
        }
      ]
    },
    {
      "title": "A working copy",
      "summary": "Transcription copies a gene into RNA.",
      "cards": [
        {
          "kind": "source",
          "body": "NHGRI glossary on transcription.",
          "url": "https://www.genome.gov/genetics-glossary/Transcription"
        }
      ]
    },
    {
      "title": "Read and assemble",
      "summary": "A ribosome reads RNA codons and joins amino acids."
    },
    {
      "title": "Check your understanding",
      "summary": "A protein folds into a working shape.",
      "quiz": {
        "question": "What carries the message?",
        "options": ["Messenger RNA", "A finished protein"],
        "answerIndex": 0
      },
      "branch": {
        "label": "Explore mutations",
        "targetTitle": "DNA changes",
        "targetSummary": "Some changes affect a protein; many have no detectable effect."
      }
    }
  ]
}
```

The response identifies a pending proposal. Previewing it does not save it.
The user may accept the visible proposal or confirm `timetrail.proposals.review`.
An agent must not click the human confirmation as part of its normal tool workflow.

## Guardrails and diagnostics

`readOnlyHint` is true for inspection, proposal listing, and gallery search.
`untrustedContentHint` marks source and proposal content. These annotations are
descriptive; actual validation and approval controls enforce behavior.

Results normally stay within 1,500 characters. Full editor item/form inspection
allows up to 24,000 characters so an agent can read the actual draft. Collection
inspection has explicit pagination. Other large lists report truncation
instead of returning a whole project. The event log records correlation IDs,
timings, sanitized argument summaries, revisions, and outcomes. It never records
full media bytes. The user can clear the log through a confirmation dialog.

Bad input returns a compact error. Unknown media durations produce warnings.
Stale revisions fail acceptance. Cancelled confirmations return `user_cancelled`.
No tool accepts raw code, direct DOM selectors, an approval bypass, or arbitrary
runtime operations. External content must never be treated as tool instructions.

If native registration is unavailable, Lab shows Development fallback.
`window.__TIMETRAIL_TOOLS__` contains the same route-specific definitions for
manual development and tests. Native tests must use an actual supporting browser,
fetch its current tools after navigation, and call the named tool.

## Complete creation and media workflows

The prompt library is at `/examples`, with a downloadable copy in
`docs/SMOKE_PROMPTS.md`. Its 41 scenarios have explicit acceptance checks. Five
authored example specifications are available through `examples.get` and
`/examples/{europa,phishing,atlas,mars,pizza}-spec.json`.

| Tool                           | Purpose                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `timetrail.examples.list`      | Search and paginate scenarios.                                                                    |
| `timetrail.examples.get`       | Read a full prompt, checks and optional example specification.                                    |
| `timetrail.media.search`       | Search real NASA or Wikimedia Commons media with credits.                                         |
| `timetrail.media.resolve`      | Resolve a source ID to a playable/downloadable file; optionally stage it.                         |
| `timetrail.media.fetch`        | Download a CORS-enabled source through the shared File importer, up to 100 MB.                    |
| `timetrail.media.upload`       | Begin, send ordered base64 chunks, finish or abort an agent-created file upload.                  |
| `timetrail.production.propose` | Compile named sequences, storyboards, branches and presentation in one revision-checked proposal. |
| `timetrail.views.inspect`      | Read saved layouts and supporting panel content.                                                  |
| `timetrail.views.propose`      | Propose layouts and typed panels without changing timeline data.                                  |
| `timetrail.player.control`     | Open Player, change views, answer, choose, check or restart.                                      |
| `timetrail.checks.run`         | Validate project references, counts, missing assets and sharing constraints.                      |

Use `project.create`, then search/resolve/import or upload assets. Use the
returned media IDs in `production.propose`. The first named sequence replaces
the main timeline; later sequences create separate destinations. Extra cues
can use a sequence key in `branch.targetSequenceId`. Panel destinations can
also use these keys. The compiler resolves keys to persistent IDs and validates
the complete transaction. Partial unknown keys fail instead of producing orphan
links. A repeated specification at the same revision produces the same operations.

Video sourcing is the default when no usable supplied or existing video is
available and the agent is not generating an actual video. `project.create`,
`project.inspect` and `checks.run` report `videoSourcing` with candidate counts
and a suggested video search when there are none. Images and generated title
cards do not count as footage. Pending imports do count so agents can build
with them before acceptance. Existing video metadata still requires playback
verification. An explicit image-only request takes precedence.

Use Commons for general topics and NASA for space/science. Resolve a chosen
result, import or download it, place its media ID in a clip and play it. Empty
searches return another search as the next step, with query/provider/browser
recovery instructions. Do not ask the user for an MP4 just because none was
supplied. Do not stop at a link list or silently substitute a slideshow when
search fails. Record failed attempts and missing footage. Scenario 22 tests
this flow from an empty project; every full prompt includes the same policy.

Call `proposals.preview` with `action: preview` and the proposal ID. Review the
visible draft, then wait for the human acceptance. Open `/player/:projectId` or
use `player.control` with `action: open`. The Player contains no editor command
bar, timeline, library or inspector. It supports keyboard play/pause and seeking.
`/watch/:projectId` remains a compatible viewing route.

Saved views specify a name, layout, theme, accent, aspect, context visibility,
chapter visibility and panel IDs. Panels support text, facts, charts, schematic
maps, checklists, transcript, score and playhead-based timers. Entry destinations
seek or switch sequences. Checklists set transient viewer flags; branch cues can
require or set a flag and panels can require one. Replay resets this viewer state.
Quiz `retryTime` adds a visible Review explanation control for incorrect answers.
No panel accepts raw HTML, CSS or executable JavaScript.

Image generation is the calling agent's capability. TimeTrail does not secretly
call an AI provider. Upload generated file bytes with `media.upload`: begin with
filename, MIME and exact size; send at most 3 MB decoded bytes per base64 chunk
with the current byte offset; finish after all bytes arrive. Two sessions may be
open, each expires after ten idle minutes, and an upload belongs to its starting
project. A wrong offset returns the expected value. Do not blindly resend an
accepted chunk. The final result stages a media ID; it does not accept a proposal.
The File importer sanitizes SVG. Logs omit payload bytes and source text.

`media.fetch` streams up to 100 MB, checks HTTP errors and uses a 45-second
timeout. Source search uses a 12-second timeout. Metadata probes run four at a
time. Source providers and network conditions can still cause failures. Inspect
the result and choose another source, quality variant or local upload.

Full prompt/spec responses allow 50,000 characters, views 32,000, source search
and URL import 12,000, and source resolution 4,000. URL imports return IDs for
all 20 supported resources. These bounded exceptions let agents read
complete data without making a tool call for each sentence. Normal mutations
still return compact IDs, counts and status.

Project JSON and ZIP retain view data. Standalone HTML and static packs use the
same panel renderer as Player and include uploaded files. They run on an HTTP
static host. These are interactive exports, not flattened MP4 renders. Fragment
sharing cannot carry uploaded binaries; use an HTML or ZIP/static pack instead.

## Hotspot organization and quality review

`timetrail.hotspots.propose` creates hotspots or edits explicit `cueIds` in one
screen. It accepts `group`, a bounded `style`, `layout`, `shiftSeconds` and
`expectedRevision`. Layouts are `keep`, `stack-right`, `bottom-row` and `grid`.
Filled, outline and marker presets support rounded, rectangle and circle shapes,
hex colors, border width and radius. Inspect cues to obtain their IDs and groups.
Other annotations remain unchanged. The visible cue form exposes the same
style and group fields. Review film quality also has a group arrangement control.

`timetrail.quality.review` scans all approved sequences, clips and cues. It checks
timeline gaps, known source overruns, exact duplicates, unset branch requirements,
short interactions, empty hotspots, label contrast, overlapping controls, large
overlays and controls entering the caption area. It suggests captions where absent.
These checks identify likely problems; they cannot recognize the subjects in video.

Each scan probes up to 12 referenced media, including generated cards with linked
images, four at a time with a six-second
timeout per source. Reuse the returned `reportId` until `remainingMediaCount`
is zero. Missing local bytes and failed loads are errors. Timeouts remain
unverified warnings. Embedded players and documents require manual review.
Successful metadata loading does not prove full playback or audio quality.

`action: inspect`, `offset` and `limit` paginate findings and playback checkpoints.
Follow both next-offset values. Reports are bound to a project revision and held
in memory, with at most eight reports. Responses are bounded to 20,000 characters.
Use browser playback and screenshots at checkpoints, exercise branches and inspect
sound. The read-only review tool is also available in Player. Authoring tools are
available in Studio.

`timetrail.quality.propose` accepts a current `reportId`, selected `findingIds` and
`expectedRevision`. Available fixes arrange hotspots, improve filled-label contrast,
extend short controls and remove exact duplicate annotations. The service merges
selected fixes without discarding content or unrelated styles. It creates a pending
proposal. Replace failed sources or author content and branch changes through the
existing tools. Preview, obtain visible acceptance, then scan the new revision.

Individual acceptance computes the related operations required for a valid project
and asks the human to accept that group. Cancel leaves the project unchanged.
Rejected dependencies can be restored in the review card. Preview and acceptance
compare older proposals with their saved baseline. Unrelated human saves, earlier
proposal acceptance, reload and undo/redo do not block compatible drafts. Updates
merge changed fields, including cue positions, styles and custom views, and retain
newer saved fields. ID-based collections preserve independent additions and edits.

Competing changes to the same field report the item number and field. Review the
other items separately, then reject or replace the conflicting item after reading
the latest project. Missing original revision data cannot be guessed. Rejecting or
restoring an item never bypasses conflict checks. Preview stays unsaved, and tool
acceptance still waits for visible confirmation of the current revision. Conflicting
bulk acceptance fails atomically.

## Playback recovery and submission guide

`timetrail.playback.control` accepts `retry-media` and `skip-media` as well as
`play`, `pause` and `seek`. Retry recreates the current source player. Skip seeks
to the end of the current clip. Neither changes the project revision or removes
media. When a source fails or stops loading, playback pauses and the same recovery
actions appear in the Player. Choose a replacement through an editing proposal
if the source remains unusable.

The public `/hackathon` page explains the project, links working examples and
contains illustrated tool calls, all required submission answers and a complete
2:40 demo production prompt. `/webmcp` remains the live tool Lab. The prompt
requires actual screen recordings and audio for YouTube delivery; HTML and ZIP
exports are interactive artifacts, not an MP4 encoder.
