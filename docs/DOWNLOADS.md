# Download formats

Studio and Player offer two downloads through the Export menu: a video-only MP4
and an interactive hypermedia ZIP that starts in Research view.

## Video only

Choose **Video only (.mp4)** and Export. The browser renders the approved main
screen into an H.264 MP4 at 24 fps, using 1280 by 720 pixels for landscape,
720 by 1280 for portrait, or 720 by 720 for square. Clip trims and timeline gaps
are preserved. A clip longer than its source holds the last frame. Recorded
clip audio becomes AAC audio; it stops at the source trim rather than looping.
Captions are burned into the picture. Video without a recorded audio track is
silent, and the download dialog says so.

Browser read-aloud narration is not an audio recording. It cannot be captured by
this encoder. Put spoken narration in the source recordings when it is required.
The MP4 does not contain clickable hotspots, quizzes, Research panels or optional
branch screens. Use the interactive download for those.

Progress and Cancel export appear while rendering. Canceling or changing routes
discards the unfinished export. The finished download requires the visible
Download or Save to folder control. No export modifies the approved film.

The browser must support H.264 encoding and, for films with audio, AAC encoding.
Direct images, generated cards, video and audio clips are supported. A remote
file must allow downloads from this origin. Embedded YouTube/Vimeo players,
protected video and unsupported codecs produce an error naming the source.
The exporter does not substitute unrelated footage or silently omit source audio.
Limits are ten minutes on the main screen, 100 MB per downloaded source and
200 MB of loaded source files. Rendering is local; no media is sent to a server.

## Interactive hypermedia

Choose **Interactive hypermedia (.zip, Research view)** and Export. Unzip the
download and serve `index.html` on a static HTTP or HTTPS host. The folder has
the independent Player runtime, portable `project.json`, media files, captions,
credits and a manifest. Double-clicking a file URL is not supported by the
isolated Player runtime.

The index starts in the saved Research layout. If the film has no Research view,
the exported viewer adds one using the project's panels. It preserves the
project's saved default layout and other views. Choices, quizzes, branches,
sources and panel interactions still work.

Local files are included. The exporter also attempts to download direct remote
images, videos and audio, up to 150 MB total. A blocked download remains an online
source and gets a warning in the download dialog and README. Embedded players,
source links and linked images inside generated cards still need internet.
The archive is not described as fully offline when those dependencies remain.

## WebMCP

Call `timetrail.export.prepare` with `format: "video-mp4"` or
`format: "interactive-zip"`. It returns a background task immediately.
Read `timetrail.export.status` until its status is `ready`, `failed` or `canceled`.
Ready results give the filename, byte size and notes. `timetrail.export.cancel`
requests cancellation. The same tools work in the dedicated Player. No tool
clicks Download or uploads a file to a hosting provider.

## Implementation

`Mp4ExportService` reads real media through
[Mediabunny](https://mediabunny.dev/guide/writing-media-files), renders timeline
frames to a canvas, schedules decoded clip audio in an offline audio context,
and encodes the result with WebCodecs. The dependency is pinned to 1.55.5 and
uses MPL-2.0. FrameTrail remains the independent interactive Player and its
vendor checkout is unchanged.
