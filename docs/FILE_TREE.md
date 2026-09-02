# File tree

Application source, configuration, tests, and documentation:

```text
timetrail/
  .gitattributes
  .gitignore
  AGENTS.md
  LICENSE
  README.md
  eslint.config.js
  index.html
  netlify.toml
  package.json
  playwright.config.ts
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  vite.config.ts
  docs/
    ARCHITECTURE.md
    DECISIONS.md
    DEMO_SCRIPT.md
    FILE_TREE.md
    FRAME_TRAIL_INTEGRATION.md
    VERIFICATION.md
    WEBMCP.md
    demo.png
  public/
    fonts.css
    icon.svg
    manifest.webmanifest
    runtime.html
    demo-assets/
      dna.svg
    gallery/
      catalog.json
      dna.json
    schemas/
      gallery.schema.json
      project.schema.json
  scripts/
    build-offline.mjs
    generate-demo.ts
    prepare-frametrail.mjs
    runtime-package.mjs
  src/
    App.vue
    main.ts
    style.css
    components/
      common/Modal.vue
      context/ContextStack.vue
      context/CueInspector.vue
      editor/EditorForms.vue
      media/MediaLibrary.vue
      player/Player.vue
      proposals/ProposalReview.vue
      timeline/Timeline.vue
      timeline/TimelineItem.vue
      timeline/useTimelineDrag.ts
    demo/
      demoProject.ts
    domain/
      model.ts
    pages/
      DiscoverPage.vue
      HomePage.vue
      NewProjectPage.vue
      WatchPage.vue
      WebMcpLabPage.vue
      WorkspacePage.vue
    runtime/
      bridgeMessages.ts
      frame.ts
      FrameTrailAdapter.ts
      FrameTrailBridge.ts
      frameTrailMapper.ts
      generatedCard.ts
      standaloneClient.ts
    services/
      ExportService.ts
      GalleryService.ts
      MediaImportService.ts
      ProjectService.ts
      ProposalService.ts
      ShareService.ts
      TimelineCompiler.ts
      TimelineEditing.ts
    storage/
      BrowserWorkspaceStore.ts
    stores/
      editor.ts
      workspace.ts
    webmcp/
      editorTools.ts
      registry.ts
      ToolRegistry.ts
  tests/
    setup.ts
    e2e/
      editor.spec.ts
      exports.spec.ts
      media.spec.ts
      studio.spec.ts
      timeline.spec.ts
    unit/
      editor.test.ts
      timeline.test.ts
      domain.test.ts
```

Generated or installed directories excluded from Git:

```text
node_modules/
vendor/frametrail/           Pinned, unchanged upstream checkout
public/frametrail/           Copied dependencies, combined loaders, license, version
public/frame-bridge.js       Runtime bridge bundle
public/standalone-runtime.html
public/standalone-viewer.js
dist/                       Production site, including generated sw.js
test-results/               Browser traces and failure screenshots
playwright-report/
```

The demo, gallery, and JSON schemas regenerate during runtime preparation.
The project does not include a backend, PHP entry point, serverless function,
database server, or remote rendering service.
