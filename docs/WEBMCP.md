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

Project inspection and creation are available on every route. Discover also has
gallery tools. Studio and local Watch have project tools. Read-only shared Watch
exposes inspection, creation, playback, export, and sharing. Lab shows all 22
definitions and runs the handlers registered for the current project context.
Playback requires a mounted Studio or Watch preview.

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
remain visible browser controls. Tools can open the import form and prepare
exports or sharing. They cannot choose local filesystem paths or press human
approval buttons. Narration playback depends on browser voice support and may
need a human gesture.

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
