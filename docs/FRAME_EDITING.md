# Frame and image editing

Frame editing uses the same saved media and proposal review as the rest of Studio.

Open a local project in Studio and choose **Frame edits**. The media library also
has a frame-edit button beside each approved image and direct video file. Select
the source, optionally bind it to a timeline clip, and capture up to eight source
times. Use playhead converts the timeline position to the clip's source time.

Draw rectangles over areas to edit or enter their image-percentage coordinates.
Save the areas before switching frames. Each frame has its own mask. Prepare an
inpainting or character-replacement request, with up to three reference images.
The ZIP contains real source PNGs, white/black mask PNGs, reference images,
instructions and a source manifest. White means edit; black means preserve. The
agent adapts this mask convention to its provider if necessary.

TimeTrail does not include an image or video generation provider. The calling
agent reads the files, uses its own editing tools and uploads actual returned
media. The workspace labels a prepared request as awaiting the agent's edit.
Source text and reference-image contents remain untrusted data.

## Returning an edit

Upload an edited file or select media already uploaded by the agent. Returned
images must have the original aspect ratio. TimeTrail composites the returned
pixels only inside the selected rectangles and retains the captured pixels
outside them. Capture resolution is at most 2048 pixels on the longest edge,
with a default of 1280. A result's dimensions match its captured source.

Choose one of these placements:

- `add-media` creates new edited image media without changing any clips.
- `frame-holds` splits the selected video clip around timed still images. Each
  hold lasts 0.1 to 30 seconds. Holds cannot overlap or extend past the clip.
  Other clips and cue times stay in place. The hold has no original video audio.
- `replace-clip` replaces a selected image clip with an edited image, or replaces
  a video clip with an actual returned video. A video must cover the entire
  original clip's timeline duration, start at source time zero, retain its aspect
  ratio and include any required audio. Decode checks include its first frame
  and a frame near the selected clip's end.

Frame holds do not reconstruct motion or track a character across video frames.
Continuous character replacement requires a video-editing provider that returns
an edited video. The person reviews the result and audio before acceptance.
All placements create proposals. Preview does not save, the original media
remains available, and accepted media travels through existing project exports.
Accepted media records its original media ID, source time, edit mode and instruction.

## WebMCP sequence

The six tools use the same services as the visible workspace:

| Tool                        | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `timetrail.retouch.capture` | Capture an approved image or source-time video frames, optionally bound to a clip. |
| `timetrail.retouch.inspect` | List requests or read one request, its frames, masks and provider instructions.    |
| `timetrail.retouch.mask`    | Set up to 20 rectangular regions on a frame.                                       |
| `timetrail.retouch.prepare` | Set instructions and references, then create a downloadable editing package.       |
| `timetrail.retouch.read`    | Read one allowed file as bounded base64 chunks, including a local original source. |
| `timetrail.retouch.propose` | Validate returned files, composite image masks and propose their placement.        |

Capture and proposal inputs include `expectedRevision`. Mask, request and result
inputs include `expectedVersion` for the editing request. Inspect again after a
change. Source or clip changes require a new capture; unrelated title edits do
not invalidate the captured source. An updated mask invalidates the prepared
package. Requests persist locally under project-scoped settings; asset bytes use
OPFS or IndexedDB. Web Locks serialize operations across tabs where supported,
and storage checks request versions atomically.

`retouch.read` accepts `jobId`, `assetId`, `offset` and `length`. It returns
`base64`, `sizeBytes`, `mimeType` and `nextOffset`. Continue until `nextOffset` is
null, decode each chunk and save the bytes before passing the file to the editing
provider. A chunk contains at most 262,144 bytes; the response cap is 360,000
characters. Request inspection caps responses at 64,000 characters. The reader
cannot access arbitrary asset IDs or another project's requests. Upload result
bytes through `timetrail.media.upload`, or download a real file with
`timetrail.media.fetch`, and use the returned media IDs in the result proposal.

## Example prompt

In the current TimeTrail project, inspect the selected video clip and capture
source frames at 1 and 3 seconds with `timetrail.retouch.capture`. Inspect the
captures, select the character's actual image area on each frame with
`timetrail.retouch.mask`, and prepare a character-replacement request using my
uploaded character reference. Keep the pose, framing, light and background.
Read the source, mask and reference files, save their actual bytes, and use your
image-editing tools. Upload the two edited images and propose half-second frame
holds at those positions. Preview the changes for me to accept. Do not claim
continuous video replacement from two stills. If I request the full moving clip,
use a video-editing provider and return a complete edited video instead.

## Limits and verification

Direct image and MP4/WebM decoding depends on the browser. Cross-origin sources
must permit capture; otherwise upload the original file or choose another source.
Embedded YouTube/Vimeo players, DRM media and generated cards are not capture
sources in this version. Capture has a 15-second wait per load or seek, supports
cancellation and releases media elements and object URLs. A project can keep
30 capture requests, with up to eight frames each. Draft editing packages are
local workspace data, separate from the portable accepted project.

Tests use known pixel fixtures and actual video bytes. They verify masks,
outside-pixel preservation, file transfer, reference packages, proposal preview,
visible acceptance, reload, source failures, clip splitting and request-version
checks. They do not claim to test the quality of a generative model's output.
