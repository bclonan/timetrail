TimeTrail Studio: an interactive film editor people and agents use together

Live URL: https://timetrail-studio-bclonan.netlify.app/hackathon
Working editor: https://timetrail-studio-bclonan.netlify.app/demo
Public Player example: https://timetrail-studio-bclonan.netlify.app/player/example_europa
Authentication: none. Open in ChatGPT's in-app browser or Google Chrome with WebMCP enabled. Ordinary browsers can use the human editor; native tool availability depends on the browser configuration.

Why is this a strong fit for WebMCP?
A video editor has structured work hidden behind a dense interface: media IDs, source trims, timed cues, screen destinations and layout settings. TimeTrail exposes those concepts as tools. An agent can submit an ordered storyboard or arrange a group of hotspots without trying to infer timing from pixel positions. Browser research still helps find sources, and visual playback still matters. WebMCP gives the agent a direct way to author the film once it has the content.

How does it improve the user experience?
Start with a brief, then review a concrete draft in the same editor you use by hand. Tools fill visible forms, import credited media, build screens, add quizzes and propose custom Player views. Batch requests reduce repeated form filling. Preview is unsaved; you accept all changes or individual items. Compatible edits preserve newer saved work. A quality review finds structural problems and proposes selected repairs.

What can people and agents do together?
The agent can research footage, upload files it creates, organize a timeline and prepare interactive context. You choose the direction, inspect the footage, edit any detail and accept the changes. Viewers can follow branches, answer quizzes and explore context without opening the editor. This connects research, authoring, review and portable delivery in one browser session, a workflow that otherwise requires repeated copying between search, media libraries, forms and editing tools.

How did you implement WebMCP?
TimeTrail uses Vue and TypeScript with a portable, validated project model. A route-scoped registry calls document.modelContext.registerTool with names, descriptions, JSON Schemas and read-only hints. Zod validates input. UI controls and tools share the same project, media, timeline and proposal services. Agent edits stay as proposals; visible acceptance applies a validated IndexedDB transaction against the current revision. Abort signals clean up tools and pending confirmations on navigation. FrameTrail handles playback through an isolated, same-origin bridge. IndexedDB and OPFS hold local work; HTML and ZIP exports support portable viewing. The Lab labels its local execution fallback separately from native WebMCP.

Demo video requirement: a public YouTube video under three minutes, with audio and a real walkthrough of the product and WebMCP. The demo production prompt and 2:40 shot plan are on this page. Add the public YouTube URL after recording and publishing; an interactive HTML export alone does not satisfy that requirement.