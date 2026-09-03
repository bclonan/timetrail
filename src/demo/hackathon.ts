export const submissionAnswers = [
  {
    question: "Why is this a strong fit for WebMCP?",
    answer:
      "A video editor has structured work hidden behind a dense interface: media IDs, source trims, timed cues, screen destinations and layout settings. TimeTrail exposes those concepts as tools. An agent can submit an ordered storyboard or arrange a group of hotspots without trying to infer timing from pixel positions. Browser research still helps find sources, and visual playback still matters. WebMCP gives the agent a direct way to author the film once it has the content.",
  },
  {
    question: "How does it improve the user experience?",
    answer:
      "Start with a brief, then review a concrete draft in the same editor you use by hand. Tools fill visible forms, import credited media, build screens, add quizzes and propose custom Player views. Batch requests reduce repeated form filling. Preview is unsaved; you accept all changes or individual items. Compatible edits preserve newer saved work. A quality review finds structural problems and proposes selected repairs.",
  },
  {
    question: "What can people and agents do together?",
    answer:
      "The agent can research footage, upload files it creates, organize a timeline and prepare interactive context. You choose the direction, inspect the footage, edit any detail and accept the changes. Viewers can follow branches, answer quizzes and explore context without opening the editor. This connects research, authoring, review and portable delivery in one browser session, a workflow that otherwise requires repeated copying between search, media libraries, forms and editing tools.",
  },
  {
    question: "How did you implement WebMCP?",
    answer:
      "TimeTrail uses Vue and TypeScript with a portable, validated project model. A route-scoped registry calls document.modelContext.registerTool with names, descriptions, JSON Schemas and read-only hints. Zod validates input. UI controls and tools share the same project, media, timeline and proposal services. Agent edits stay as proposals; visible acceptance applies a validated IndexedDB transaction against the current revision. Abort signals clean up tools and pending confirmations on navigation. FrameTrail handles playback through an isolated, same-origin bridge. IndexedDB and OPFS hold local work; HTML and ZIP exports support portable viewing. The Lab labels its local execution fallback separately from native WebMCP.",
  },
];
export const submissionText = `TimeTrail Studio: an interactive film editor people and agents use together

Live URL: https://timetrail-studio-bclonan.netlify.app/hackathon
Working editor: https://timetrail-studio-bclonan.netlify.app/demo
Public Player example: https://timetrail-studio-bclonan.netlify.app/player/example_europa
Authentication: none. Open in ChatGPT's in-app browser or Google Chrome with WebMCP enabled. Ordinary browsers can use the human editor; native tool availability depends on the browser configuration.

${submissionAnswers.map((a) => `${a.question}\n${a.answer}`).join("\n\n")}

Demo video requirement: a public YouTube video under three minutes, with audio and a real walkthrough of the product and WebMCP. The demo production prompt and 2:40 shot plan are on this page. Add the public YouTube URL after recording and publishing; an interactive HTML export alone does not satisfy that requirement.`;

export const demoVideoPrompt = `Create a 2-minute-40-second demo of TimeTrail Studio for a WebMCP hackathon. The final recording must be under 3 minutes, have audible English narration, and show the real product and how WebMCP works.

Open https://timetrail-studio-bclonan.netlify.app/hackathon and read the submission summary. Use TimeTrail's native WebMCP tools, not a sequence of guessed clicks. Fetch tools again after navigation. Work in a NEW local project called "TimeTrail: from brief to interactive film". Do not replace any existing project.

Create two deliverables: an interactive TimeTrail project and a YouTube-ready linear demonstration with actual recorded audio. TimeTrail can render the main timeline as MP4, and export an interactive Research-view ZIP. HTML and ZIP are not YouTube video files. Browser read-aloud narration is not recorded by MP4 export; use actual narrated source recordings.

FOOTAGE AND CONTENT
Use a real screen recording of TimeTrail's editor, tool calls, proposal preview, visible human acceptance, Player and export. Use supplied recordings first. If absent, create a real walkthrough recording with available recording tools and request any required screen/microphone permission. You may find an existing public TimeTrail walkthrough if its content and reuse permission fit. Do not use unrelated stock footage as proof of product behavior. If recording is unavailable, say so, build the interactive storyboard with clearly labeled illustrative cards, and provide the exact shots to record. Do not claim that screenshots or generated stills are video footage.

Capture or create a 16:9 cover image using the app's forest, cream and lime palette. Upload the actual image bytes through timetrail.media.upload begin/chunk/finish, or download a real accessible file with timetrail.media.fetch. Import actual source video URLs with timetrail.media.import or media.fetch and retain credits. Inspect every returned media ID. Never invent an upload ID, asset, download, recording or source URL.

PLAN, exactly 160 seconds on the main timeline
0:00-0:18, The brief. Show the live editor and a short request for an interactive ocean lesson. Narration: "TimeTrail turns a research brief into an interactive film. A person and an agent work in the same browser, with one timeline and a visible review step."
0:18-0:43, The difference. Show the hackathon page's illustrated comparison, then real registered tools in the Lab. Narration: "A screen-driven agent has to locate controls, read forms and infer timing. TimeTrail exposes media, screens, cues and proposals as structured WebMCP tools. The comparison is an illustration, not a speed benchmark."
0:43-1:18, Build. Show project inspection, a real source search or imported screen recording, a file upload, and one batch storyboard proposal. Narration: "The agent inspects the project, finds or imports usable sources, keeps their credits, and submits an ordered storyboard. It can fill visible forms, add context and create quizzes without rebuilding the editor's logic outside the app."
1:18-1:43, Human control. Show the proposal preview, a person's saved edit and visible acceptance. Narration: "A proposal is a draft. Preview does not save it. I can inspect individual changes and accept them here. Compatible drafts preserve newer saved edits; competing changes identify the item that needs review."
1:43-2:05, Interactive Player. Show one styled hotspot, a quiz and a Research view panel. Narration: "The finished film has its own Player. Viewers can open sources, answer questions and follow another path. Custom views put the video and supporting material where the story needs them."
2:05-2:25, Quality and delivery. Show a real quality report, a selected repair proposal and the export dialog. Narration: "Quality tools check every screen for broken references, timing gaps and obstructive annotations. They propose repairs for review. I still watch the picture and listen to the sound. The project can travel as HTML or ZIP, or open through a share link."
2:25-2:40, Implementation and close. Show the registration diagram and the live URL. Narration: "Vue and TypeScript connect the editor and WebMCP to shared services. Validated proposals save locally after acceptance. FrameTrail plays the result. Try TimeTrail at the live link."

AUTHORING
Inspect schemas and current revisions. Use timetrail.production.propose for the full multi-screen specification or timetrail.build.propose for the main storyboard. Use actual imported media IDs, source trims and duration weights that total 160 seconds. Add accurate narration and matching captions, seven chapter markers and source credits. Add two unobtrusive custom-styled hotspots with timetrail.hotspots.propose, one short quiz and one optional implementation-detail screen. Keep the optional branch out of the linear recording so the YouTube cut stays 160 seconds. Propose Cinema and Research views; Research should have a transcript and a short tool glossary. Keep text readable at phone width and leave the lower caption area clear.

REVIEW AND FINISH
Preview without saving. Open timetrail.proposals.review and wait for visible human acceptance. Never auto-accept your own changes. Run timetrail.quality.review on every approved screen and continue scans until no media remain unchecked. Read findings and visual checkpoints, propose selected repairs with timetrail.quality.propose, obtain acceptance, then rescan. Play the entire main sequence. Confirm the source pictures load, captions match audible narration, links and interactions work, and no loading panel or annotation blocks the product demonstration.

Prepare interactive-zip through timetrail.export.prepare for an index.html opening in Research view, and prepare a share link through the visible confirmation. When the timeline contains the real walkthrough recordings and recorded narration, prepare video-mp4 and poll timetrail.export.status. Download and verify the H.264 MP4 with AAC audio under 180 seconds. Its flat picture omits interactive panels and controls, so source recordings must show the actual product interactions. If the needed recordings or audio are unavailable, provide the 160-second shot list and narration script and mark recording as outstanding. Never substitute unrelated footage or claim browser read-aloud was recorded. Prepare downloads for the human.

Return the project/Player link, prepared export names, actual test results, source credits, a suggested YouTube title and description, and any remaining recording work. The human must publish the recording on YouTube as Public and supply that URL for the submission. Never claim YouTube publication without a verified public URL.`;

export const comparisonExamples = [
  {
    id: "story",
    label: "Build a film",
    brief: "Create a 90-second ocean lesson with sources and a quiz.",
    scrape: [
      "Read the media library and distinguish saved items from drafts.",
      "Find the import form and fill source URLs.",
      "Locate each screen and convert timeline positions into timings.",
      "Open separate forms for chapters, context and quiz answers.",
      "Find the review controls and verify what actually saved.",
    ],
    calls: [
      {
        name: "timetrail.project.inspect",
        input: { include: ["timeline", "media", "proposals"] },
        result: "Read project IDs, current state and source needs.",
      },
      {
        name: "timetrail.media.search",
        input: {
          query: "ocean waves",
          provider: "commons",
          type: "video",
          limit: 3,
        },
        result:
          "Find credited source candidates, then resolve and import a suitable one.",
      },
      {
        name: "timetrail.build.propose",
        input: {
          title: "The moving ocean",
          topic: "Ocean waves",
          targetSeconds: 90,
          baseMediaId: "imported-media-id",
          segments: [
            {
              title: "What makes a wave?",
              narration: "Wind transfers energy to the water.",
            },
            {
              title: "Check your understanding",
              quiz: {
                question: "What supplies energy to these waves?",
                options: ["Wind", "The camera"],
                answerIndex: 0,
              },
            },
          ],
        },
        result: "One ordered storyboard proposal. Nothing accepted yet.",
      },
      {
        name: "timetrail.proposals.review",
        input: { proposalIds: ["returned-proposal-id"], decision: "accept" },
        result: "A visible confirmation waits for the human.",
      },
    ],
  },
  {
    id: "hotspots",
    label: "Style a group",
    brief: "Put these hotspots on the right and make their labels readable.",
    scrape: [
      "Find each hotspot among the timeline's cue controls.",
      "Open its position and appearance fields.",
      "Repeat the edit for each item and compare the result on screen.",
      "Check that labels do not cover captions or overlap.",
    ],
    calls: [
      {
        name: "timetrail.editor.inspect",
        input: { collection: "cues" },
        result: "Read cue IDs and groups, then inspect selected items.",
      },
      {
        name: "timetrail.hotspots.propose",
        input: {
          expectedRevision: 3,
          cueIds: ["hotspot-one", "hotspot-two"],
          group: "Field notes",
          layout: "stack-right",
          style: {
            preset: "filled",
            shape: "rounded",
            backgroundColor: "#112233",
            textColor: "#ffffff",
          },
        },
        result:
          "Propose a group arrangement through the same actions the editor uses.",
      },
      {
        name: "timetrail.proposals.preview",
        input: { action: "preview", proposalId: "returned-proposal-id" },
        result: "Inspect the unsaved result and accept it visibly.",
      },
    ],
  },
  {
    id: "quality",
    label: "Review the film",
    brief: "Find broken media and annotations that obstruct the picture.",
    scrape: [
      "Visit each screen and inspect every source by hand.",
      "Track timing gaps and overlapping annotation rectangles.",
      "Remember the affected items while opening their edit forms.",
      "Play through the fixes and check every source again.",
    ],
    calls: [
      {
        name: "timetrail.quality.review",
        input: { checkMedia: true },
        result:
          "Scan all screens. Continue source batches and inspect visual checkpoints.",
      },
      {
        name: "timetrail.quality.propose",
        input: {
          expectedRevision: 4,
          reportId: "returned-report-id",
          findingIds: ["selected-finding-id"],
        },
        result:
          "Selected supported repairs become proposals. Replacement footage still needs sourcing.",
      },
      {
        name: "timetrail.playback.control",
        input: { action: "seek", timeSeconds: 12 },
        result:
          "Watch the checkpoint. Automated checks do not establish visual or audio quality.",
      },
    ],
  },
];
