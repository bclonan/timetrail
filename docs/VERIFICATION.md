# Verification

Current creation and Player release: Netlify deploy `6a9893aa04eb40b9b7006f0f`,
2026-09-02. The latest local gate passed lint, typecheck, 73 unit tests, build,
20 browser tests and diff checks. Frozen install passed before the changes.
One native-only case was skipped in ordinary Chromium. Native WebMCP was checked
separately, including a complete creation workflow on the deployed application.

The final app bundle is `index-DW4OuBaw.js`; Player CSS is `index-DFnt8F7L.css`.
HTTP checks verified matching SHA-256 for the app, CSS, bridge, runtimes, export
client, bug log and offline worker. Native playback advanced to 10.8 seconds,
Research transcript lines wrapped correctly, and the error log was empty. All nine creation and timeline browser tests passed on this final deploy. The complete Europa upload, creation, export and import test took 23.1 seconds using the already-generated source files.

See `BUG_LOG.md` for individual fixes, deployed creation results and limits.
The following earlier release evidence is retained as history.

## Earlier release

Verified locally on September 2, 2026, against the production build of TimeTrail
1.0.0. The repository began with only a README. The working tree was deployed
manually to Netlify. These changes have not been committed to Git.

| Check                            | Result                                    |
| -------------------------------- | ----------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed with pnpm 11.8.0                   |
| `pnpm lint`                      | Passed, no warnings                       |
| `pnpm typecheck`                 | Passed                                    |
| `pnpm test`                      | 60 passed                                 |
| `pnpm build`                     | Passed; production output in `dist`       |
| `pnpm playwright test`           | 16 passed, 1 skipped in ordinary Chromium |
| `git diff --check`               | Passed                                    |
| FrameTrail vendor status         | No modified files                         |

The skipped browser case requires a real `document.modelContext`. The ordinary
Chromium suite still tests the fallback tools and an injected registration
contract. Native WebMCP was tested separately in the Codex in-app browser.

## Netlify deployment

Production: [TimeTrail Studio](https://timetrail-studio-bclonan.netlify.app/demo).

- Site ID: `2260fa29-3ee9-47f9-a0df-8dc0324f5ba7`.
- Final deploy ID: `6a9880c6dea5cde6cd5abf34`.
- [Deploy log](https://app.netlify.com/projects/timetrail-studio-bclonan/deploys/6a9880c6dea5cde6cd5abf34).
- Local tested bundle: `index-LMgMb-mJ.js`.
- Manual deployment to the existing `possibly1` team. No Git deployment hook.

HTTP checks verified Studio, Discover and Lab routes return the SPA; runtime,
FrameTrail loader, bridge, service worker and application scripts return their
expected types and match the local build. Responses include
`Permissions-Policy: tools=(self)` and `Origin-Agent-Cluster: ?1`.

The previous form-editing release registered 19 Studio tools. Its live
calls opened a card form, filled it, then changed just its heading. The visible
heading changed and the ink background stayed selected. Native form inspection
returned the same values. `editor.propose` staged the form; native preview showed
the proposed fifth clip while approved collection inspection still returned four
clips at revision 0. Restoring and rejecting the temporary test proposal left
90 seconds, 21 cues, four clips, five resources and no pending proposals.
Playback advanced on the live site. The final browser error log was empty.

The timeline release registers 20 tools in Studio and 22 across all routes.
Native calls to `editor.inspect` and `timeline.propose` succeeded on the final
production build. The latter requested the current clip position and returned
`unchanged` at revision 0, leaving the user's saved demo intact.

All five timeline browser tests passed against the production URL in isolated
browser profiles. This covered real mouse and touch gestures, resize bounds,
cancellation, Undo/Redo, saved-state reload, keyboard reordering and proposal
review. The deployed HTML, JavaScript, CSS and service worker matched the tested
local files byte for byte. The native browser showed the new handles and no
browser errors.

## Timeline drag coverage

The timeline regression cases exercise mouse dragging, clip insertion and free
movement, cue movement, both resize handles, Escape, pointer cancellation,
Undo/Redo, and reload persistence. A touch case moves a cue on a horizontally
scrolled track. Keyboard reordering and the matching WebMCP proposal use the
same edit calculation.

The short local-video test also checks that the clip body remains clickable.
Resize handles occupy at most one quarter of a short item, leaving its center
available for selection and movement. Domain tests verify cue offsets, source
in/out points, gap preservation, boundary clamps and snapping.

## Browser coverage

- Create and edit a generated project, add a note, persist it, and reload.
- Fill visible screen, card, clip and quiz forms through structured tools, stage
  proposals, accept with the visible control, and verify persistence.
- Fill project metadata, save through the visible button, reject a stale tool
  edit, and confirm that cancelling an undo request preserves the saved revision.
- Answer and pin context through tools, change captions, and select a new screen.
- Stage and preview a storyboard without changing approved state, then accept it.
- Cancel a tool review dialog, verify no commit, and accept through the visible control.
- Run quizzes, follow a branch, return, reset the demo, and import timed VTT captions.
- Install the production offline cache, disable the network, reload, and play the demo.
- Stage multiple URL sources while rejecting an unsafe URL and preserving the approved revision.
- Import a browser-recorded local WebM, play it through FrameTrail, switch to a second clip,
  reload, and confirm the asset bytes are present in a downloaded ZIP.
- Answer a FrameTrail quiz overlay and verify matching context feedback. Activate its
  branch hotspot and verify sequence navigation.
- Render generated SVG at its expected dimensions. Export and reimport project ZIP.
- Serve exported standalone HTML and static packs on a separate HTTP server. Verify
  generated visuals, playback, seek, and quiz context without the Studio application.
- Verify mobile overflow, dialog closure with Escape, and focus restoration.
- Register native-shaped tool definitions and abort registrations on route changes.

`docs/demo.png` is captured from the production demo during the browser suite.

## Native browser evidence

The in-app browser discovered 10 tools on the project route. Native inspection
returned the seeded project's ID, sequence, 90-second duration, four clips, and
21 cues at revision 0. `timetrail.cues.propose` returned a pending proposal ID.
A second inspection still reported revision 0 and 21 approved cues.

The visible Preview proposal control displayed the unsaved preview label.
The visible Accept proposal control advanced the approved project to revision 1.
After reload, native inspection reported 22 cues and no pending proposals.
Native playback control sought to six seconds. The context panel displayed the
accepted note. The test demo was then reset for the user's walkthrough.

The native test used non-sensitive seeded content. It did not send messages,
upload user files, publish a site, or use a provider API key.

## Limits of verification

Third-party YouTube and Vimeo embed
availability, all codecs, installed narration voices, and native directory
pickers across operating systems are not guaranteed by these tests. Test media
is a locally recorded WebM. IndexedDB fallback is covered in unit tests; the
browser test exercises local asset persistence on the available storage backend.

Vite reports two upstream Zod annotation warnings while bundling. They do not
fail the build. Ordinary Chromium reports that the experimental `tools`
Permissions-Policy feature is unavailable. The app correctly shows its labeled
fallback in that browser.

## Creation and Player release, 2026-09-02

This release adds 41 smoke prompts, five authored example films, multi-sequence
production proposals, media search/download/chunked uploads, custom viewing
layouts and a dedicated Player. See `BUG_LOG.md` for observed failures, fixes
and unsupported requests, and `ASSET_CREDITS.md` for media provenance.

The final local gate passed frozen install, lint, typecheck, 73 unit tests,
build, 20 Chromium browser tests and diff checks. One native-only test was
skipped in ordinary Chromium. Separate native in-app browser checks passed
real NASA and Commons search, HTTPS source resolution, four file downloads,
a complete Europa production proposal, unsaved preview, visible acceptance
and saved project validation. The Europa automated creation/upload/export
round trip took 20.5 seconds with already-generated source files.

The Player checks cover all five examples, preserved playhead when changing
views, branch requirements, conditional panels, replay, portrait phone layout,
share links and saved view choice. ZIP contains all four uploaded/downloaded
local assets. The standalone HTML with those same assets plays and branches
on a separate HTTP origin. Timeline drag, touch, keyboard, trim, cancellation,
undo/redo and persistence cases also passed.

## Source discovery default, 2026-09-02

B11 adds an explicit source-video fallback to creation and inspection tools and
all 41 full prompts. No supplied video plus no video generation means the agent
must search, resolve, import and use footage. Images and title cards do not
count. Existing and pending video candidates prevent unnecessary duplicate
sourcing, while their playback still needs verification.

The new deterministic browser test uses a labeled provider fixture. It checks
an empty project, a supplied still image, an empty search, a second successful
search, source attribution, staging, inclusion in a clip, visible acceptance,
and the actual HTML video element reaching playback readiness and advancing.
Live provider verification is recorded separately below.

Source-discovery release `6a9895d48ddb36839f832feb` is live on Netlify, bundle
`index-BN88N5VC.js`. Frozen install, lint, typecheck, 73 unit tests, build,
21 browser tests and diff checks passed. One native-only case was skipped in
ordinary Chromium. The new sourcing browser case also passed against Netlify.
The updated app bundle, full prompts and bug log returned HTTP 200 with their
expected types and the WebMCP header.

Native WebMCP on the production site created an empty 15-second ocean project.
Its response returned `find_source_video` and a Commons video-search input.
The real search returned `File:Ocean in Sommaroy.webm`, credited to User: Netha
Hussain under CC0. Resolution staged its actual upload.wikimedia.org WebM URL.
A build proposal placed that media ID in one clip with a source cue. Preview
remained unsaved, visible acceptance saved the test film, and Player playback
advanced to 12.533 seconds with the ocean footage visible and no browser errors.
The source-duration estimate warning remained visible; metadata was not falsely
reported as verified. No supplied video URL, generated footage or search fixture
was used in this native provider check.

## Hotspot styling, proposal review and quality checks, 2026-09-02

The new tests cover dependent item acceptance, cancellation, restoring rejected
dependencies, sequential acceptance of independent drafts, conflicting bulk
acceptance, and stale drafts after partial rejection. Style checks verify actual
FrameTrail colors and shape. Group inspection and a quality-fix proposal preserve
content, keep preview unsaved, and remove overlap and contrast findings after
visible acceptance.

A source test imports 13 URLs and asserts that all IDs return. It adds a generated
card with a linked image, reviews 12 assets, then resumes the same report for the
remaining two. Twelve working image URLs use the bundled SVG with distinct query
strings. Two intercepted external URLs deliberately return 404. The completed
report contains precisely those two failed-source findings. Mock failures are
test fixtures, not claims about a live provider outage.

An earlier test incorrectly mocked same-origin images through page routes while
the service worker controlled their requests. Those requests bypassed the mock.
The test now uses actual bundled bytes for successful images and external request
fixtures for deliberate failures. The expanded test also caught and fixed the
URL-import response truncation recorded as B16 in BUG_LOG.md.

Native WebMCP on the local production build created a test film and two styled
hotspots with deliberately overlapping positions and unreadable labels. Quality
review returned three repairable findings. It prepared two cue changes, previewed
them without saving, and visible acceptance saved revision three. The next scan
removed all three findings. Player showed readable, separated controls. A missing
caption suggestion remained visible. Automated checks do not certify full visual
or audio quality.

Release `6a989e88e531cce779d89b1d` is deployed to the existing Netlify site with
bundle `index-DLDlTKMe.js`. Frozen install, lint, typecheck, 83 unit tests, build,
24 Chromium browser tests and diff checks passed. Ordinary Chromium skipped its
one native-only test. All eight focused quality, acceptance and timeline tests
also passed against Netlify. App, runtime bridge, standalone viewer, full prompts
and bug log matched local SHA-256 hashes and returned the expected content types
and `tools=(self)` header.

Native WebMCP on Netlify separately reviewed the existing ocean test film and
loaded its real Wikimedia video source. It created a styled Coastal notes group
with two deliberately obstructive controls, detected two contrast findings and
one overlap finding, and prepared two cue edits. Preview retained revision two.
Visible acceptance saved revision three. A new media-inclusive scan checked the
source again and removed all three repairable findings. The optional caption
suggestion remained. This test used a local QA project, not a user-authored film.

## Final playback correction

The visual review after the first deployment found a paused-video seek failure
that geometry checks alone could not detect. B17 fixes source synchronization
after FrameTrail readiness and frame loading. B18 adds correct byte-range
responses to the offline cache. The added regression checks the actual video
time, visible styled hotspot, click activation, return from the end, 206 prefix
and suffix responses, and an invalid 416 response.

Final release `6a98a3b7da6ff81a8b924412` includes both corrections. The fresh gate
passed lint, typecheck, 83 unit tests, build, 25 browser tests and diff checks.
The frozen install had passed earlier. One native-only test remains skipped in
ordinary Chromium. All nine focused quality and timeline tests passed against
the final Netlify release. The deployed bridge, standalone runtime, service
worker and bug log match the local build by SHA-256.

Native WebMCP then loaded the final production Player and sought the real ocean
video to four seconds while paused. Visual inspection confirmed both readable,
separated Coastal notes hotspots over the footage. Browser error logs were empty.

## Proposal recovery release

Netlify deployment `6a98a8260041c73a4011f088` fixes B19. The app bundle is
`index-4JTYYTG8.js`. Older proposals now compare their changes against saved
revision data during preview and acceptance. Newer saved fields remain intact.
Conflicts name the item and field; accepting an unrelated item does not revive
the conflict. Cue forms retain creation metadata, and comparison handles older
drafts whose forms rewrote it.

Frozen install, lint, typecheck, 93 unit tests, production build and diff checks
passed. The final Chromium suite passed 27 tests, with its one native-only test
skipped. The first run caught creation-timestamp conflicts in actual cue forms;
the final complete run includes that correction. All six quality and proposal
browser tests also passed against the deployed site.

Coverage includes several intervening saves, reopening storage, revision-zero
legacy recovery, undo/redo, same-cue field merges, screen collection additions,
custom view edits, deletion conflicts, item acceptance and rejected-item restore.
Unknown legacy baselines remain blocked. Preview is read-only and acceptance
retains the expected-revision transaction check.

Native WebMCP on the deployed site created an isolated QA project and a pending
note at revision zero. A visible project form saved a title edit at revision one.
After reload, the native preview tool returned `previewing_proposal` with
`saved: false`, preserving revision one. The native review tool opened the human
confirmation dialog. Browser-control transport timed out while waiting for that
confirmation, so its return value was not captured. The dialog remained open;
clicking its visible Accept changes button saved revision two, kept the human
title and added the note. The page's error log was empty. No user-authored project
was changed during this smoke test.

## Player loading recovery and hackathon page

Netlify deployment `6a98aeaab3f3fda062dbe1c4` publishes B20 and B21 plus the
new `/hackathon` page. The app bundle is `index-SOPeEqdo.js`. The page retains
TimeTrail's design, answers all four submission questions, links public Players,
illustrates interface and tool workflows, and supplies a complete 160-second
narrated production prompt. Illustrations are labeled, and the page distinguishes
interactive exports from the required public YouTube recording.

Frozen install, lint, typecheck, 96 unit tests, production build and diff checks
passed. The complete Chromium suite passed 30 tests and skipped its one
native-only test. All nine focused hackathon, quality and proposal tests then
passed against Netlify. Desktop and 390-pixel phone layouts were checked, as were
copyable submission and prompt text, the example Player link and image loading.

The source regression returns a real HTTP 404, verifies that playback stays
paused, skips to the next clip, retries with actual MP4 bytes and confirms decoded
frames and playback progress. It also waits beyond discarded FrameTrail players'
25-second callbacks and records no page errors. Unit coverage verifies decoded
frames versus metadata, immediate source failures, timeout and disposal. An
unrelated browser message is ignored; a malformed TimeTrail command still fails,
and Retry preview restores playback. The pinned vendor checkout is unchanged.

The deployed index, runtime, bridge, standalone runtime, submission, video prompt
and bug log match local SHA-256 hashes. All returned 200 with expected content
types and the `tools=(self)` header.

Native WebMCP was checked separately in ChatGPT's in-app browser on Netlify.
The new page registered tools and returned a real scenario search. Its Europa
link opened Research view. Native playback sought the actual video to 30 seconds,
retried the source, played to 36.851 seconds and skipped to the next clip at 50.
Project inspection confirmed revision zero and no proposals. These actions did
not modify a user-authored project.

The exact earthquake film and remote source from the screenshot were not
available in this browser workspace; its Player or share URL is still needed to
verify that specific file. The request was to supply a demo production prompt.
No public YouTube recording was created or claimed in this release.

## Frame editing development branch

`codex/frame-inpainting` adds image and video-frame capture, rectangular masks,
character reference packages, six native WebMCP tools and returned-media
proposals. This branch has not been deployed to Netlify. Its separate local
preview runs at `http://127.0.0.1:4175`.

Frozen install, lint, typecheck, 103 unit tests, the production build and diff
checks passed. The final complete Chromium suite passed 33 tests and skipped
its one native-only test. Native tool checks are recorded separately below.

The browser regressions use known image pixels and a real MP4. They check drawn
and numeric masks, source/mask/reference ZIP contents, bounded file reads,
outside-mask pixel preservation, before/after viewing, visible acceptance,
reload, phone layout, timed still holds and actual-video replacement proposals.
They also reject unsupported embedded players and a valid PNG whose server
allows a different origin. The first complete run exposed a missing save wait
in that error-case test. Its fixture now explicitly supplies the mismatched
cross-origin header instead of relying on the browser test router's defaults.

Native WebMCP was checked separately in ChatGPT's in-app browser against the
development preview. An isolated QA project imported and visibly accepted a
sample image. Native tools captured its actual 1280-by-720 pixels, saved a mask,
prepared the editing package and inspected the saved request. A bounded read
returned 262,144 PNG bytes and a continuation offset from a 1,812,199-byte file.
Submitting the original image as an edited result failed with a useful error.
The project stayed at revision one with no result proposal. The mask and editing
controls were visually checked, and browser error logs were empty.

The tests do not invoke an image-generation service or prove a generated edit's
visual quality. A calling agent must create the actual edit through its own
image or video provider. Continuous character replacement requires a returned
video; still holds do not reconstruct motion or retain video audio during the
hold. The pinned FrameTrail checkout remains unchanged.

## MP4 and interactive downloads on the development branch

The same `codex/frame-inpainting` branch now has Video only MP4 and Interactive
hypermedia ZIP downloads in Studio, Player and WebMCP. This work has not been
deployed to Netlify. The local production preview runs at
`http://127.0.0.1:4175`.

Frozen install, lint, typecheck, all 106 unit tests and the production build
passed. The complete Chromium suite passed 36 tests and skipped its one
native-only test. Diff checks passed and the FrameTrail vendor checkout stayed
unchanged.

The MP4 browser test creates a real source with red and blue frames and a tone.
It trims, repeats and extends clips, then independently decodes the downloaded
MP4. It checks picture colors, dimensions, duration, AAC sound and silent gaps.
The interactive test bundles a remote image, extracts the ZIP, serves index.html
on a separate host and checks Research view, custom panels, a quiz and switching
to Cinema. It covers a film with no saved Research layout and verifies that the
project's saved default view does not change. Other checks cover embedded-source
errors, cancellation, Player export choices and unchanged approved revisions.

Native WebMCP was checked separately in ChatGPT's in-app browser on the local
preview. It prepared the 90-second DNA demo as a 6,944,511-byte MP4 and a
1,256,482-byte interactive ZIP. Both status calls reported ready, the visible
download dialogs showed the correct filenames and notes, and the project stayed
at revision zero. Browser error logs were empty. This demo has no recorded audio;
the MP4 dialog correctly described it as silent. Actual encoded audio was checked
by the separate browser regression described above.

The interactive archive needs an HTTP or HTTPS static host. Embedded players and
source links still need internet. MP4 includes recorded clip audio but does not
record browser read-aloud speech. These limits appear in the download dialogs
and in `docs/DOWNLOADS.md`.

## QA playback pause diagnosis

The user's overview film in the live Chrome Player was paused at 112 seconds
after a quiz had been answered. The local activity page showed repeated Player
inspection calls and successful HTML/ZIP preparation. Clicking Continue film
advanced playback past 131 seconds and to the 160-second ending. This recovered
playback without editing the film. The creation chat's step-six status was not
accessible, so the playback pause is confirmed but the chat's progress state is
not diagnosed as a TimeTrail exception.

The development branch now includes readiness, paused/ended state, duration,
narration state and active quizzes in Player inspection. Feedback remains paused
after an answer. Results explicitly tell an agent to play again, and an ended
screen points to the remaining QA or export work. The checks tool's export list
also includes the development MP4 and Research ZIP formats.

Native WebMCP on the local preview reported the DNA quiz paused at 84 seconds,
then answered and still paused with the resume instruction. A play call advanced
to 90 seconds and inspection reported ended. The approved revision stayed zero
and browser error logs were empty. This verifies state and playback progression,
not audible narration or the content of the user's creation chat.

After this change, frozen install, lint, typecheck, all 106 unit tests, the build
and diff checks passed. The complete browser suite passed 37 tests and skipped
the native-only case. Its added regression checks unanswered and answered quiz
pauses, the resume instruction, actual time progression and end detection.

## Netlify release of downloads, frame editing and QA status

Published the tested `codex/frame-inpainting` build to the existing production
site on 2026-09-03 at 01:41 UTC. Netlify deploy
`6a98d054dea5cd0e5b5abe86` reported `ready`, context `production`, with no deployment
error. This release supersedes the earlier undeployed status notes above.

Production URL: https://timetrail-studio-bclonan.netlify.app

The deployed index, runtime, bridge, standalone viewer/runtime, service worker,
bug log, Mediabunny license and both JavaScript bundles matched the local SHA-256
hashes. Each returned HTTP 200 with the expected content type and `tools=(self)`.
Hackathon, Player and example routes returned the current app shell.

Native WebMCP was checked in ChatGPT's in-app browser after refreshing production.
Player inspection returned the new readiness and paused/ended fields with the
resume instruction. Frame-edit inspection returned an empty request list for the
demo. Export prepared a 7,212,088-byte MP4 and a 1,258,991-byte interactive ZIP,
both reporting ready. The visible MP4 download dialog included the recorded-audio
limitation and correctly described the demo as silent. The approved project stayed
at revision zero and browser error logs were empty.

Before release, frozen install, lint, typecheck, 106 unit tests and 37 browser
tests passed, with the native-only Chromium case skipped. The final documentation
update was rebuilt and passed diff checks. No application code changed after that
complete test run. The pinned FrameTrail checkout remains unchanged.

## Quiz popup dismissal release

The runtime now renders one quiz over either generated scenes or real footage.
Answers use cue IDs, including when two questions have identical text. The popup
shows feedback and Continue film after an answer. Close question and continue,
Skip question and Escape also dismiss it and resume playback. Dismissed questions
stay hidden until Start again or a new viewing session. Side-panel and WebMCP
answers share this state without changing the approved project.

Frozen install, lint, typecheck, all 106 unit tests, build and diff checks passed.
The complete browser suite passed 38 tests and skipped the native-only Chromium
case. Focused coverage includes a single popup over real MP4 footage, repeated
question text with punctuation, Cinema without context panels, wrong and correct
answers, keyboard dismissal, replay, mobile controls, WebMCP answer synchronization
and both standalone HTML and static ZIP viewers on a separate host.

Native WebMCP in the in-app browser answered the local DNA quiz at 84 seconds.
The popup showed feedback and Continue film; clicking Continue hid it and advanced
playback to 89 seconds. Production repeated this check after deployment and cache
refresh. Playback advanced to 88.425 seconds, activeQuizCount became zero, the
popup was hidden and revision remained zero. Production browser error logs were
empty. This checks quiz interaction and playback progression, not audible narration.

Netlify deploy `6a98e44177cc3ece80db3fcd` was published on 2026-09-03 at 03:06 UTC
and reported ready in production. The deployed index, runtime HTML, bridge,
standalone runtime and viewer, service worker, bug log and main JavaScript bundle
matched the tested local SHA-256 hashes. Each returned HTTP 200 with the expected
content type and `tools=(self)`. The FrameTrail vendor checkout is unchanged.

Already downloaded HTML and ZIP files keep their embedded player. Export a new
copy to include this fix. A refresh loads the update on the hosted app after its
offline cache finishes updating. Only documentation changed after deployment.

## Compact annotations and position editing

Plain notes, facts, sources, definitions, warnings and hotspots now render compact
info indicators over generated scenes and real footage. A click opens the full
text in a closable card. Explicit filled and outline styles keep their saved
geometry. The inspector offers Use small indicator for an existing oversized cue.
Position fields show percentages beside the video, above the content fields.
The draft guide supports pointer movement, corner resizing, arrow keys and Escape
to cancel a drag. Opening the guide pauses playback. Save cue or visible proposal
acceptance remains the only path to saving these edits.

The focused browser run passed all 10 annotation, export and quality tests.
Its new regression verifies one small note over MP4 footage, numeric and keyboard
placement, pointer movement and cancellation, resizing, draft isolation, saving,
detail dismissal and mobile marker bounds. The export regression opens a compact
annotation and closes its detail card in both HTML and static ZIP viewers.
Existing custom-style and quiz tests remain in the release suite.

Native WebMCP on the local preview returned effective placement with percent
units and a top-left origin. Filling x=18, y=20, width=4, height=7 displayed the
guide. A visible input changed x to 20. Closing the form left revision zero,
canUndo false and the approved project unchanged. Browser error logs were empty.

The final release passed frozen install, lint, typecheck, all 107 unit tests,
build and diff checks. The complete browser suite passed 39 tests and skipped
the native-only Chromium case. Netlify deploy `6a98e99e8c92f1385a9eb615` reported
ready in production on 2026-09-03 at 03:29 UTC. The deployed index, runtime,
bridge, standalone runtime/viewer, service worker, public bug log, main script
and stylesheet matched the tested build's SHA-256 hashes. All returned HTTP 200
with `tools=(self)`. The FrameTrail vendor checkout remains unchanged.

The live in-app Player showed the two DNA info indicators at two seconds.
Opening DNA displayed its full definition; Close annotation hid the card.
Native Player inspection still reported revision zero and no active quizzes.
Production browser error logs were empty. Only this verification record changed
after deployment. Previously downloaded interactive files need a new export.

## FrameTrail sidebars and layout areas

Screens now retain left, right, top and bottom ContentViews. The visible Edit
screen form and WebMCP share the same bounded layoutAreas schema. Native tabs
open, close and respond to Enter or Space. Timed transcript and chapter buttons
seek the sequence clock. Source footage, compact indicators, captions and the
position guide follow the picture bounds when areas change size. Side areas
move below the picture on phones. Interactive ZIP keeps them in its Research
viewer; Cinema still allows the areas. The separate TimeTrail context panels
continue to work.

The new browser regression uses actual MP4 footage and checks all four areas,
multiple right-side tabs, scrolling, native timeline rows, desktop and phone
bounds, Player navigation and a downloaded Research ZIP on another HTTP origin.
Unit tests cover escaped text, bounded inputs, portable data and production
proposal isolation. The first complete run passed 110 unit tests and 40 browser
tests, with one native-only Chromium test skipped. A later focused run also
passed after correcting native timeline grouping and video fitting.

The in-app browser separately used native WebMCP to open the screen form, fill
three areas, submit and preview the proposal. Closing and reopening the right
area worked. The initially closed chapter area opened. Clicking the transcript
sought to 22.5 seconds. Player inspection reported ready, paused and revision
zero. Restoring the approved version left it unchanged. Error logs were empty.

The repeated full gate passed lint, typecheck, 110 unit tests and 40 browser
tests, with the native-only Chromium test skipped. Final visual review found a
zero-height native timeline scroll container. A scoped CSS correction restored
its height; the rebuilt focused test confirmed that the row intersects the
visible area. That final test passed locally in 19.9 seconds and on production
in 17.7 seconds, including the downloaded Research viewer on a separate host.

Netlify production deployment `6a98f2e672f6122470495d57` is live at
https://timetrail-studio-bclonan.netlify.app. All ten checked files matched the
local build by SHA-256 and returned HTTP 200 with `tools=(self)`: the index,
app JS/CSS, both runtime documents, bridge, standalone client, service worker,
project schema and public bug log. The vendor checkout and diff whitespace check
were clean. Only this documentation changed after deployment. Existing tabs may
need a reload; previously downloaded HTML/ZIP files need a new export.
