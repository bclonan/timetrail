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
