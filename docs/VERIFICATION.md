# Verification

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
