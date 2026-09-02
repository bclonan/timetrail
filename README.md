# TimeTrail

TimeTrail is a browser-local studio for interactive films. Combine generated
cards and media clips with chapters, timed context, sources, quizzes, and
branches. WebMCP agents can fill editor forms, create screens and cards, edit
clips and cues, and draft complete storyboards. You preview
and accept its changes before they reach the approved timeline.

The application runs without an account, API key, PHP server, or backend.
Projects stay in this browser until you download or share them.

Live site: [TimeTrail Studio](https://timetrail-studio-bclonan.netlify.app/demo).

## Start

Install Node 22 or newer, Git, and pnpm 11.8.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local address Vite prints. Choose Demo for the 90-second DNA lesson.
The first start fetches the pinned FrameTrail commit. Later builds use that
checkout. On a network with a managed certificate, enable Node's system CA
support for that invocation. Do not disable certificate verification.

## What works

- Create, rename, reopen, and remix local projects. Undo and redo preserve history.
- Import multiple URLs or local video, audio, images, PDFs, VTT, and SRT files.
  Import TimeTrail JSON, ZIP, and self-contained HTML. A constrained FrameTrail
  JSON importer accepts direct video sources, chapters, and text annotations.
- Create and edit screens with separate timelines.
- Create and edit seven generated card layouts. Comparison bodies use `|` between sides;
  recap bodies use one point per line. Cards can carry narration and captions.
- Drag clips to reorder or move into gaps. Contained cues follow their clips.
  Drag cues independently and resize clips or cues using their edge handles.
  Mouse, touch, keyboard, snapping, cancellation and Undo are supported.
- Edit clip timing and cue content. Timed context can be pinned. Quizzes have
  answer feedback. Branches retain a return point.
- Review agent proposals by batch or item. The ghost track and proposed preview
  are separate from the approved project. Acceptance is atomic.
- Export JSON, a portable project ZIP, self-contained HTML, or a static hosting ZIP.
  ZIP packs include local assets, caption files, provenance, a manifest, and a
  thumbnail when a generated card is available.
- Share a compact code or fragment link for projects without local files.
  Shared films open read-only and can be remixed into a new local project.
- Discover local projects and static gallery manifests. The bundled DNA example
  is available offline after the application cache finishes installing.
- Inspect registered tools and the durable activity log in WebMCP Lab.

## Test and build

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm build
pnpm playwright test
pnpm preview --port 4173
git diff --check
```

Playwright uses the production build. It checks editing, proposal approval,
persistence, sharing, remixing, offline reload, media playback, runtime
interactions, portable ZIP imports, and exported viewers on a separate static
server. A native WebMCP case skips when `document.modelContext` is unavailable;
the fallback and an injected registration contract still run. Native browser
verification is a separate check. See `docs/VERIFICATION.md` for this build's results.

## Architecture

Vue, Pinia, and Vue Router provide the studio. Zod validates the portable project
format. Domain services implement the same actions for UI and WebMCP. IndexedDB
holds projects, revisions, proposals, settings, and activity. OPFS holds local
asset bytes when available, with an IndexedDB fallback.

FrameTrail runs in a same-origin iframe. It owns playback timing and renders
generated images, quizzes, and hotspots. The adapter converts TimeTrail data
into FrameTrail resources and W3C annotations. The parent exchanges validated
messages with the iframe. No vendor files are patched.

See [architecture](docs/ARCHITECTURE.md), [WebMCP](docs/WEBMCP.md),
[FrameTrail integration](docs/FRAME_TRAIL_INTEGRATION.md),
[decisions](docs/DECISIONS.md), [file tree](docs/FILE_TREE.md), and the
[judge demo](docs/DEMO_SCRIPT.md).

## Deploy on Netlify

Import this Git repository into Netlify. The included `netlify.toml` selects
Node 22, runs `pnpm build`, and publishes `dist`. The build must have Git and
network access for its first FrameTrail checkout. There are no required secrets.
The redirects support client-side routes. Headers allow same-origin WebMCP
tools and set `Origin-Agent-Cluster: ?1`.

For a CLI deploy from an authenticated Netlify installation:

```sh
pnpm build
netlify deploy --dir=dist
netlify deploy --dir=dist --prod
```

The production site is `timetrail-studio-bclonan` in the `possibly1` team.
This is a manual deployment of the tested local build. Git-based continuous
deployment has not been configured. Review a draft URL before future production
updates. To publish one film instead, export its static hosting pack,
extract it, and upload the extracted directory to a static host.

Add comma-separated gallery manifest URLs with `VITE_GALLERY_MANIFEST_URLS`
at build time. External manifests need CORS permission. Copy the shape in
`public/gallery/catalog.json` and validate against `public/schemas/gallery.schema.json`.

## Practical limits

Browser storage belongs to this origin and browser profile. Clearing site data
removes local projects. Download ZIP backups for anything you need to keep.
Media files are limited to 100 MB each, imported packs to 150 MB, and expanded
ZIP contents to 200 MB. JSON alone does not include local asset bytes.

Share codes are unencrypted project data and are limited to 12,000 characters.
They cannot carry local files. Use a ZIP or static pack for those projects.
The application does not upload or publish anything automatically.

Remote media still depends on the provider, internet access, embed permission,
and browser codec support. Unknown durations remain estimates. YouTube and
Vimeo identification and adapter paths are implemented; availability of arbitrary
third-party videos is not guaranteed. Generated cards and imported local media
work offline after the application has loaded once.

Standalone HTML is self-contained for generated and embedded local media, but
must be served over HTTP or HTTPS because its isolated runtime uses origin
checks. Double-clicking a `file:` URL is not supported. Remote images in generated
SVG cards may be blocked by browser image rules; import an image clip for reliable
local playback. Narration uses installed browser voices and requires a user gesture.

There is no video transcoder, remote rendering service, arbitrary HTML execution,
or flat MP4/WebM export. Imported FrameTrail executable snippets, custom CSS, and
unsupported overlays are omitted. The source project is preserved.

## License

TimeTrail is MIT licensed. FrameTrail is used under its MIT option, with its
upstream notices and bundled library licenses preserved. Original demo SVGs
and the seeded project are included under the TimeTrail license.
