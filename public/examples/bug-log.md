# Creation and Player release log

Date: 2026-09-02. Status: released to Netlify. Verification and remaining limits are recorded below.

## Downloads, frame editing and QA playback update

QA pause diagnosis: the saved overview Player was paused at 112 seconds on an
answered quiz while the activity log showed repeated Player inspections. Continue
film resumed it past 131 seconds. This confirms the playback pause; the chat's
step-six progress state is outside TimeTrail and was not inspected. The Player
tool now reports paused/ended state, readiness, narration state, active quizzes and
the action needed to continue. Answering a quiz preserves its feedback pause.
Repeated inspection does not advance the timeline. The checks tool also advertises
the new MP4 format instead of the obsolete unavailable message.

This update was built on `codex/frame-inpainting`. Video only exports encode the approved main timeline
as H.264 MP4 with AAC clip audio and captions. Interactive hypermedia ZIP includes
index.html starting in Research view, the Player runtime and media files.
Both formats have visible download controls; background tasks report progress and
support cancellation. Source files that cannot be rendered fail explicitly.
Browser read-aloud is not recorded audio. Embeds require a direct source file for
MP4, and online dependencies remain documented in interactive downloads.
See DOWNLOADS.md and VERIFICATION.md for the current development checks.

## Fixed during implementation

B20: A failed or stalled video source left FrameTrail's "Loading Interface"
panel over a running timeline. TimeTrail now watches actual frame readiness and
source errors, pauses while loading, and offers Retry clip, Skip clip and Open
source. A 20-second timeout prevents an indefinite wait. Retry and skip also work
through the playback tool. The wrapper handles recovery without changing vendor
files or saving project edits. An interface startup timeout exposes Retry preview.
Browser tests cover a 404, retry with real video, skipping and delayed callbacks
from discarded players. The exact earthquake source in the user's screenshot has
not been supplied, so that particular remote file has not been verified.

B21: Unrelated messages from browser integrations could trigger "Invalid preview
message" and disable playback. The runtime now ignores messages outside its
protocol. Same-origin and source checks still apply, and malformed TimeTrail
commands still produce an error. Browser tests cover both cases and preview retry.

The new `/hackathon` page includes judge access, all four submission answers,
illustrated interface-versus-tool workflows, real Player examples and a 160-second
narrated demo prompt. The comparisons are illustrations, not measured agent runs.
A public YouTube recording remains a separate submission deliverable.

B19: Human saves blocked pending proposals with "This proposal is stale", even
when they changed unrelated fields. The WebMCP preview tool had a second blanket
revision check. Preview and acceptance now share a comparison against the original
revision, merge compatible edits and preserve current content, positions and styles.
Stored baselines survive reload and undo/redo. Legacy revision-zero proposals can
recover from complete history. True conflicts name the item and field; other items
can be reviewed separately. Missing baselines remain blocked rather than guessed.
Neither preview nor restored items bypass human acceptance or conflict checks.
The browser regression also found cue forms rewriting creation metadata on every
save. Edits now retain it, and older proposals preserve the current attribution
when their content merges, so timestamp churn does not block review.

B18: The offline cache answered video byte-range requests with a full 200
response. Chromium could read duration metadata but could not seek through the
cached video while paused. Cached assets now return bounded 206 responses with
Content-Range and Accept-Ranges headers. Invalid ranges return 416. The video
regression also checks leading bytes, suffix bytes and out-of-range requests.

B17: Native visual review found hotspots missing after a paused seek on real
footage. FrameTrail resets source time after its ready event, which overwrote
TimeTrail's initial seek. The bridge now waits for that reset before seeking,
requests frame data when only metadata is loaded, and resynchronizes when frames
arrive. It checks the active player identity before applying the seek. This repairs seeking
back into a clip after reaching its end. The regression checks the actual video
time, visible styled overlay in the media player and activation of the control.
The pinned FrameTrail files remain unchanged.

B16: The 13-source review test exposed truncated URL-import results. The default
response limit returned only five imported IDs, so an agent could omit footage
when compiling a batch. URL imports now use a bounded 12,000-character response
that includes all 20 supported resource IDs. The regression checks 13 IDs, a
12-source review batch, continuation for the remaining sources, and 404 findings
for a video and a generated card's linked image.

B12: Accepting one proposal made independent pending proposals stale. The first
fix advanced compatible sibling proposals. B19 replaces that limited check with
comparison during every preview and review, including older saved drafts.

B13: Accept item failed when a screen or clip required an unaccepted media item.
Item review now shows the related items in a visible confirmation. Cancel saves
nothing. Rejected dependencies have a Restore item control. Review buttons disable
while an action is pending, and counts exclude already reviewed operations.

B14: Cue styles could be stored but the player rendered fixed colors and shapes.
Validated styles now reach the shared player mapper. Group fields, bulk creation,
layouts and timing shifts are available through the hotspot tool and editor form.
Collection inspection includes groups.

B15: Project validation did not detect layout and playback-source problems.
The shared quality review scans every screen, probes referenced media in bounded
batches, returns findings and playback checkpoints, and prepares selected fixes as
proposals. It distinguishes failed sources, unverified timeouts and manual checks.
It does not claim to watch the video or judge its audio. See VERIFICATION.md for
the release gate and deployed smoke results.

B11: Video discovery was available but optional in the creation instructions.
New projects and inspection now report video-source candidates and direct the
agent to search when none exist, unless it is generating video. Every full
prompt requires finding and using footage in that case. Still images do not
satisfy the check. Empty search results now lead to another search with recovery
instructions. Scenario 22 starts without supplied video or URLs. Regression
verification is recorded in `VERIFICATION.md`.

| ID  | Finding                                                                                                                   | Change                                                                                                                   | Verification                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| B01 | Non-biology storyboards defaulted to DNA art.                                                                             | Generic scenes use neutral title cards unless a visual is supplied.                                                      | Unit and browser regression passed.                 |
| B02 | Watch showed Studio navigation and lacked saved viewing layouts.                                                          | Dedicated Player routes hide editor navigation and expose saved layouts.                                                 | Five Players and phone layout passed.               |
| B03 | Agents could stage URLs but could not ingest generated file bytes.                                                        | Chunked upload and bounded download use the same File importer as human uploads.                                         | Chunked upload, ZIP and HTML smoke passed.          |
| B04 | NASA manifests can return HTTP media addresses on an HTTPS app.                                                           | NASA asset resolution normalizes to HTTPS.                                                                               | Live native resolution and HTTPS unit test passed.  |
| B05 | Standalone exports had no custom panels or view switcher.                                                                 | Shared panel renderer and presentation data are included in exports.                                                     | Separate-host HTML and static-pack playback passed. |
| B06 | A branch could not depend on a learner's earlier choice.                                                                  | Validated checklist flags, branch requirements and conditional panels.                                                   | Branch, checklist and replay smoke passed.          |
| B07 | Switching Player views reset the playhead because a route watcher treated a query change as a new film.                   | Watch route path and share fragment separately; do not reload the film or re-register tools for view-only query changes. | 55-second view-switch regression passed.            |
| T01 | Initial test omitted the required preview action.                                                                         | Corrected the test call to include `action: preview`.                                                                    | Schema correctly rejected the incomplete request.   |
| B08 | Exported Player left Play enabled and kept its old Ready message while a branch loaded. An immediate Play click was lost. | Disable Play and seeking during scene initialization and show loading until the runtime confirms readiness.              | Separate-origin branch loading and playback passed. |
| B09 | Large embedded image/video payloads could delay the standalone client until after the iframe's first Ready message.       | Add an idempotent startup ping on client setup and iframe load.                                                          | Binary-inclusive HTML startup and playback passed.  |

## Scope and honest limits

- The library contains 40 requested prompts and the complete Europa scenario. Five authored example films accompany it. These are not 41 completed creative productions.
- The calling agent supplies research and image generation. TimeTrail has no hidden paid AI provider or API key. The app accepts the files the agent creates.
- Exports are interactive HTML, project JSON/ZIP and static hosting packs. No flattened MP4 renderer is implemented.
- Fragment share links contain bounded project data and remote sources. Uploaded files travel in portable HTML or ZIP/static packs. A local project URL alone is not a public share.
- Native source search supports NASA and Wikimedia Commons. Providers may reject requests, omit credits, block downloads or return unsupported files. The UI reports failures; the agent must choose another source or upload a file.
- Generated titles, schematic maps and bars are available. Freehand video drawing, automatic frame extraction, audio-reactive visuals, continuous tickers, locked kiosk mode and draggable mobile bottom sheets are not implemented. Corresponding prompts explicitly test and report those limits.
- Portrait is a Player layout. Existing landscape footage remains landscape inside that view; it is not automatically reframed into a portrait MP4.
- Timers follow the film playhead. They are not background kitchen timers.
- Native WebMCP and ordinary Chromium fallback results must be reported separately.

## Local release evidence

- Frozen install, lint, typecheck, 73 unit tests, build and diff checks passed.
- Chromium passed 20 browser tests. Its one native-only test was skipped because ordinary Chromium does not expose native WebMCP.
- The complete Europa creation test took 20.5 seconds. It uploaded two real generated PNG files through chunked uploads, downloaded an MP4 and SVG, created three sequences with three views, previewed the proposal and accepted it with the visible control. It then verified four local files in ZIP, imported that ZIP, reloaded, and played the binary-inclusive HTML export on a separate HTTP origin.
- All five authored examples opened and played. View changes preserved the playhead at 55 seconds. Branch requirements, alternative endings, conditional panels, replay reset, phone layout, fragment sharing and selected-view persistence passed.
- Existing mouse, touch, keyboard, trim, cue movement, cancellation, undo/redo, reload and offline cases passed.
- The in-app browser separately exercised native WebMCP. NASA and Commons searches returned real credited sources. NASA resolution returned HTTPS media. Native file downloads stored two generated PNGs, NASA video and a cutaway SVG. A single production proposal created three sequences, eight clips and 36 cues. Preview left revision zero intact; visible acceptance advanced it to one. Project checks reported no missing local assets.

The table's fixes all passed the local gate above. No unresolved failure remains in the tested workflows. The limitations below are still limitations, not passing implementations of the prompts that request them.

## Final visual correction

B10: Long transcript lines inherited the global button no-wrap style and were
clipped in the Research sidebar. Player panel buttons now wrap long labels and
transcript text. The same CSS is embedded in standalone exports. The Europa
browser test checks transcript text width against its visible control width.
The fresh gate passed lint, typecheck, 73 unit tests, build, 20 browser tests and diff checks. The native browser visual check confirmed fully readable wrapped text. The native-only Chromium test remains skipped; native tools were checked separately.

## First deployment evidence

Deployment `6a9891681b2efc265a89de0d` passed all nine deployed creation and timeline
browser tests. The complete production upload/export test took about 22 seconds.
The main app, both runtimes, bridge, standalone client, three generated images
and real MP4 matched the local build by SHA-256. Routes and media returned the
expected content types and WebMCP/security headers.

Native WebMCP on Netlify created a fresh test project, searched NASA, downloaded
two PNGs and actual MP4 bytes, uploaded a newly authored SVG through begin/chunk/
finish, and compiled the complete film in one proposal. Preview retained
revision zero, visible acceptance advanced it to one, and project checks found
no missing assets. Cinema and Research changes preserved 55 seconds. Native
export prepared a 17,454,903-byte HTML with local assets included. Browser error
logs were empty. Ordinary Chromium and native WebMCP evidence are separate.
