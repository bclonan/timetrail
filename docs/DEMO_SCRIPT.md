# Judge demo

## Prepare once

Run `pnpm build` and `pnpm preview --port 4173`. Open `/demo`, wait for the Play
button to enable, and allow the offline cache to finish. Use a browser with native
WebMCP for the agent portion. Ordinary browsers can use the labeled sample fallback.
Reset demo replaces only the bundled DNA project and its proposals.

## Two-minute walkthrough

1. Open `/demo`. Show the 90-second film, local-save status, media library,
   timeline, and FrameTrail player. Press Play.
2. Select the transcription chapter at 22.5 seconds. Show Messenger RNA and
   the NHGRI source card. Pin a card and seek ahead to show that it remains visible.
3. Seek to 55 seconds for the misconception card. Seek to 84 seconds for the quiz.
   Answer Messenger RNA in the player. The context panel shows the same result.
4. Seek to 72 seconds and choose Explore mutations. Show the branch, then Return.
5. Press Start empty live demo. The approved project has no clips. Copy the judge
   prompt from the demo page and give it to the connected browser agent.
6. The agent inspects, finds credible sources with its own search tools, imports
   URLs, and submits one `timetrail.build.propose` call. Media and storyboard
   remain proposals. Show summary counts and the ghost track.
7. Preview the proposed version. Show the UNSAVED label and unchanged approved
   revision. Return to the approved version, then accept the selected proposals
   using the visible human control. The revision increments and FrameTrail refreshes.
8. Play the accepted film. Export Project ZIP and click Download. For a generated
   project without local files, create a share code, open Watch, and press Remix.
9. Open Discover, search Biology, and open the bundled static entry. Open WebMCP
   Lab to show registration state and the proposal, review, and preview activity.

## Exact live prompt

> Find three credible videos about how CRISPR works. Import them, then build a 90-second beginner-friendly interactive explainer with four chapters, one definition card, two source notes, one misconception warning, a final quiz, and an optional branch about ethics. Propose the complete build for my review and do not commit it without confirmation.

## Deterministic fallback

When an external agent or network is unavailable, stay on the DNA demo and press
Load sample proposal. This uses the seeded DNA storyboard. It is visibly labeled
Demo fallback and does not pretend to have searched for CRISPR videos. Preview,
reject, accept, undo, and export remain real operations. Repeat after Reset demo.

To demonstrate offline support, load the production app once, switch the browser
offline, reload `/demo`, and play the generated film. Imported local assets remain
available. Remote videos and source pages require internet access.

## Recovery during a live demo

If a video refuses embedding, keep its source URL for context and use generated
cards or a locally supplied clip. If timing is estimated, show its warning and
edit the clip. Older proposals preserve compatible manual edits during preview
and acceptance. If review names a conflicting item, inspect the latest version
and request a replacement for that item. If a share code is too large or has local
files, download ZIP instead. None of these steps requires a backend or API key.
