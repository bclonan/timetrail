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
    ASSET_CREDITS.md
    BUG_LOG.md
    DECISIONS.md
    DEMO_SCRIPT.md
    DOWNLOADS.md
    FILE_TREE.md
    FRAME_EDITING.md
    FRAME_TRAIL_INTEGRATION.md
    HACKATHON_SUBMISSION.md
    SMOKE_PROMPTS.md
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
    example-assets/            Generated images, credited footage, cutaway
    examples/                  Full prompts, authored production specs, bug log
    gallery/
      catalog.json
      dna.json
      europa.json
      phishing.json
      atlas.json
      mars.json
      pizza.json
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
    player.css
    components/
      common/Modal.vue
      context/ContextStack.vue
      context/CueInspector.vue
      editor/EditorForms.vue
      editor/FrameEditStudio.vue
      editor/ProductionControls.vue
      editor/QualityReview.vue
      media/MediaLibrary.vue
      media/MediaSearch.vue
      player/Player.vue
      player/PlayerPanels.vue
      proposals/ProposalReview.vue
      timeline/Timeline.vue
      timeline/TimelineItem.vue
      timeline/useTimelineDrag.ts
    demo/
      demoProject.ts
      exampleRecipes.ts
      hackathon.ts
      smokePrompts.ts
    domain/
      model.ts
      presentation.ts
      hotspots.ts
      retouch.ts
    pages/
      DiscoverPage.vue
      ExamplesPage.vue
      HackathonPage.vue
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
      MediaLoadMonitor.ts
      frameTrailMapper.ts
      generatedCard.ts
      playerPanels.ts
      standaloneClient.ts
    services/
      AssetTransferService.ts
      ExportService.ts
      FrameCapture.ts
      GalleryService.ts
      HotspotService.ts
      MediaImportService.ts
      MediaSearchService.ts
      Mp4ExportService.ts
      ProductionService.ts
      ProjectService.ts
      ProposalService.ts
      ProposalReviewPlan.ts
      QualityService.ts
      RetouchService.ts
      ShareService.ts
      TimelineCompiler.ts
      TimelineEditing.ts
      VideoSourcing.ts
    storage/
      BrowserWorkspaceStore.ts
    stores/
      editor.ts
      retouch.ts
      workspace.ts
    webmcp/
      editorTools.ts
      exampleTools.ts
      productionTools.ts
      qualityTools.ts
      retouchTools.ts
      registry.ts
      ToolRegistry.ts
  tests/
    setup.ts
    e2e/
      downloads.spec.ts
      hackathon.spec.ts
      editor.spec.ts
      exports.spec.ts
      media.spec.ts
      production.spec.ts
      quality.spec.ts
      retouch.spec.ts
      studio.spec.ts
      timeline.spec.ts
    unit/
      mp4-export.test.ts
      media-load.test.ts
      editor.test.ts
      production.test.ts
      quality.test.ts
      retouch.test.ts
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
