import { applyOperations, createProject, type Media } from "../domain/model";
import { defaultPresentation } from "../domain/presentation";
import {
  compileProduction,
  type ProductionSpec,
} from "../services/ProductionService";
import type { Storyboard } from "../services/TimelineCompiler";

export const recipeIds = [
  "europa",
  "phishing",
  "atlas",
  "mars",
  "pizza",
] as const;
export type RecipeId = (typeof recipeIds)[number];
const stamp = "2026-09-02T12:00:00.000Z";
const source = "https://science.nasa.gov/mission/europa-clipper/";
const facts =
  "https://science.nasa.gov/jupiter/jupiter-moons/europa/europa-facts/";
const oceanSource = "https://europa.nasa.gov/europa/ocean/";
export function recipe(
  id: RecipeId,
  origin: string,
): { spec: ProductionSpec; media: Media[] } {
  const media: Media[] = [];
  const asset = (
    key: string,
    name: string,
    file: string,
    type: "video" | "image",
    attribution: Media["attribution"],
  ) => {
    media.push({
      id: key,
      name,
      type,
      source: { kind: "remote", url: `${origin}/example-assets/${file}` },
      importedBy: "demo",
      importedAt: stamp,
      tags: ["example"],
      attribution,
    });
    return key;
  };
  const text = (
    title: string,
    summary: string,
    layout: "title" | "concept" | "comparison" | "recap" = "concept",
  ) => ({
    title,
    summary,
    narration: summary,
    card: {
      layout,
      heading: title,
      body: summary,
      background: "ink" as const,
      illustration: "none" as const,
    },
  });
  const plan = (
    title: string,
    seconds: number,
    segments: Storyboard["segments"],
  ): Storyboard => ({ title, topic: title, targetSeconds: seconds, segments });
  const presentation = defaultPresentation();
  if (id === "europa") {
    const orbit = asset(
      "europa_orbit",
      "Europa from orbit, artist concept",
      "europa-orbit.png",
      "image",
      {
        creator: "Generated with OpenAI image generation for TimeTrail",
        title: "Europa orbital artist concept",
        license: "Original generated artwork; not spacecraft photography",
      },
    );
    const ocean = asset(
      "europa_ocean",
      "Beneath the ice, speculative artist concept",
      "europa-ocean.png",
      "image",
      {
        creator: "Generated with OpenAI image generation for TimeTrail",
        title: "Speculative Europa ocean",
        license: "Original generated artwork; environment is speculative",
      },
    );
    const video = asset(
      "europa_nasa",
      "What You Need to Know About Europa",
      "europa-nasa.mp4",
      "video",
      {
        creator: "NASA",
        title: "What You Need to Know About Europa",
        sourceUrl:
          "https://images.nasa.gov/details/What%20You%20Need%20to%20Know%20About%20Europa",
        license: "NASA media usage guidelines; NASA credits retained",
      },
    );
    const cutaway = asset(
      "europa_cutaway",
      "Europa layers, schematic",
      "europa-cutaway.svg",
      "image",
      {
        creator: "TimeTrail",
        sourceUrl: facts,
        license: "MIT; schematic, not to scale",
      },
    );
    presentation.views[0]!.panels = ["regions"];
    presentation.views[1]!.panels = [
      "facts",
      "layers",
      "regions",
      "transcript",
    ];
    presentation.views[2]!.panels = ["score", "transcript"];
    presentation.panels.push(
      {
        id: "facts",
        title: "Evidence, not a discovery of life",
        kind: "facts",
        entries: [
          {
            id: "ice",
            label: "Surface",
            detail:
              "Europa's visible surface is mostly water ice, crossed by dark fractures.",
            url: facts,
          },
          {
            id: "ocean",
            label: "Hidden ocean",
            detail:
              "Magnetic and geological evidence supports a salty ocean below the ice. This film does not depict an observed seafloor.",
            url: oceanSource,
          },
          {
            id: "mission",
            label: "Mission question",
            detail:
              "Europa Clipper investigates whether Europa has conditions suitable for life.",
            url: source,
          },
        ],
      },
      {
        id: "layers",
        title: "A layered world",
        kind: "map",
        body: "Schematic cutaway. Positions illustrate layers, not geography or scale.",
        entries: [
          {
            id: "shell",
            label: "Ice shell",
            x: 25,
            y: 20,
            sequenceId: "ice",
            timeSeconds: 0,
          },
          {
            id: "water",
            label: "Ocean",
            x: 55,
            y: 50,
            sequenceId: "ocean",
            timeSeconds: 0,
          },
          {
            id: "rock",
            label: "Rocky interior",
            x: 65,
            y: 80,
            sequenceId: "main",
            timeSeconds: 75,
          },
        ],
      },
      {
        id: "regions",
        title: "Choose your next question",
        kind: "facts",
        entries: [
          {
            id: "ice",
            label: "Read the fractured ice",
            detail: "What can the surface tell us?",
            sequenceId: "ice",
            timeSeconds: 0,
          },
          {
            id: "ocean",
            label: "Explore the hidden ocean",
            detail: "Which parts are evidence, and which are imagined?",
            sequenceId: "ocean",
            timeSeconds: 0,
          },
        ],
      },
    );
    return {
      media,
      spec: {
        title: "Europa · Beneath the silence",
        description:
          "An ocean world, a sheet of ice, and questions we are learning how to ask. NASA footage with original artist concepts and a schematic cutaway.",
        presentation,
        sequences: [
          {
            key: "main",
            storyboard: plan("Beneath the silence", 150, [
              {
                title: "A world of ice",
                mediaId: orbit,
                narration:
                  "Far from Earth, Jupiter's moon Europa wears a shell of ice. Its fractured surface is the beginning of a much deeper story.",
                cards: [
                  {
                    kind: "note",
                    title: "Artist's concept",
                    body: "The orbital artwork was generated for this film. It is not a spacecraft photograph.",
                  },
                ],
              },
              {
                title: "Follow the evidence",
                mediaId: video,
                narration:
                  "Spacecraft observations give scientists clues. The surface and Europa's response to Jupiter's magnetic field point toward liquid water hidden below the ice.",
                cards: [
                  {
                    kind: "source",
                    title: "NASA footage and evidence",
                    body: "NASA video introduces Europa. Magnetic measurements are one line of evidence for a salty ocean.",
                    url: oceanSource,
                  },
                ],
              },
              {
                title: "An unseen ocean",
                mediaId: ocean,
                narration:
                  "We have not visited this seafloor. This imagined scene makes the question tangible: could water, chemistry and energy meet in an environment that supports life?",
                cards: [
                  {
                    kind: "warning",
                    title: "Speculative visualization",
                    body: "The ocean interior is an artist's concept. No life has been discovered on Europa.",
                  },
                ],
              },
              {
                title: "Read the layers",
                mediaId: cutaway,
                narration:
                  "Separate the visible ice shell from the inferred ocean and the rocky interior. This diagram is a schematic, not a measurement of their relative thickness.",
                cards: [
                  {
                    kind: "source",
                    title: "Europa's structure",
                    body: "Compare the diagram with NASA's overview and the uncertainties it describes.",
                    url: facts,
                  },
                ],
              },
              {
                title: "Ask better questions",
                mediaId: video,
                narration:
                  "Europa Clipper is designed to study this ocean world. Its investigation connects the ice, chemistry and geology to a broader question about habitability.",
                cards: [
                  {
                    kind: "source",
                    title: "Mission purpose",
                    body: "Habitability means conditions that could support life. It is different from detecting living organisms.",
                    url: source,
                  },
                ],
              },
              {
                ...text(
                  "Where will you look next?",
                  "Follow the ice fractures or explore the ocean hypothesis. Change views to keep the evidence beside the picture.",
                  "recap",
                ),
                quiz: {
                  question: "What does an artist's concept show here?",
                  options: [
                    "An observed Europa seafloor",
                    "A visual interpretation of an uncertain environment",
                  ],
                  answerIndex: 1,
                  explanation:
                    "The interior artwork illustrates a possibility, not direct observation.",
                  retryTime: 50,
                },
              },
            ]),
            cues: [
              {
                kind: "branch",
                title: "Explore the ice",
                start: 125,
                end: 150,
                position: { x: 8, y: 69, width: 38, height: 12 },
                branch: {
                  label: "Explore the ice",
                  targetSequenceId: "ice",
                  setsFlag: "visited_ice",
                },
              },
              {
                kind: "branch",
                title: "Explore the ocean",
                start: 125,
                end: 150,
                position: { x: 54, y: 69, width: 38, height: 12 },
                branch: {
                  label: "Explore the ocean",
                  targetSequenceId: "ocean",
                  setsFlag: "visited_ocean",
                },
              },
            ],
          },
          {
            key: "ice",
            storyboard: plan("The ice remembers", 30, [
              {
                title: "Fractures as clues",
                mediaId: orbit,
                narration:
                  "Europa's fractured ice records a changing surface. Scientists study its patterns to understand the relationship between the shell and the ocean below.",
                cards: [
                  {
                    kind: "source",
                    title: "Read the evidence",
                    body: "Explore NASA's account of Europa's ice and geology.",
                    url: facts,
                  },
                ],
              },
            ]),
            cues: [
              {
                kind: "branch",
                start: 0,
                end: 30,
                title: "Return to the main film",
                branch: {
                  label: "Return to the main film",
                  targetSequenceId: "main",
                  targetTime: 125,
                },
              },
            ],
          },
          {
            key: "ocean",
            storyboard: plan("The ocean hypothesis", 30, [
              {
                title: "Evidence below the surface",
                mediaId: ocean,
                narration:
                  "The case for a hidden ocean comes from multiple observations. Its depth, chemistry and exchange with the surface remain research questions.",
                cards: [
                  {
                    kind: "source",
                    title: "What supports an ocean?",
                    body: "Read the magnetic and geological evidence rather than treating this visualization as a photograph.",
                    url: oceanSource,
                  },
                ],
              },
            ]),
            cues: [
              {
                kind: "branch",
                start: 0,
                end: 30,
                title: "Return to the main film",
                branch: {
                  label: "Return to the main film",
                  targetSequenceId: "main",
                  targetTime: 125,
                },
              },
            ],
          },
        ],
      },
    };
  }
  if (id === "phishing") {
    presentation.defaultViewId = "classroom";
    presentation.views[2]!.panels = ["investigation", "evidence", "score"];
    presentation.views[1]!.panels = ["investigation", "evidence", "transcript"];
    presentation.panels.push(
      {
        id: "investigation",
        kind: "checklist",
        title: "Your investigation",
        body: "Training scenario. Inspect the sender before deciding.",
        entries: [
          {
            id: "sender_checked",
            label: "I checked the sender address",
            detail:
              "The display name says IT. The sender is reset@helpdesk-example.invalid.",
          },
        ],
      },
      {
        id: "evidence",
        kind: "text",
        title: "Evidence notebook",
        requiresFlag: "sender_checked",
        body: "The sender domain differs from the organization's example.com domain. The urgent password-reset request needs independent verification.",
        entries: [],
      },
    );
    const branch = (
      label: string,
      targetSequenceId: string,
      y: number,
      requiresFlag?: string,
    ) => ({
      kind: "branch" as const,
      title: label,
      start: 0,
      end: 30,
      position: { x: 55, y, width: 40, height: 12 },
      branch: { label, targetSequenceId, requiresFlag },
    });
    return {
      media,
      spec: {
        title: "The email at 4:59",
        description:
          "A fictional security exercise. Investigate an urgent email, choose a response and see the consequences.",
        presentation,
        sequences: [
          {
            key: "main",
            storyboard: plan("The message", 30, [
              text(
                "One minute before you leave",
                "From: IT Support\nSubject: Your account closes today\nReset your password immediately using the link below.\n\nThis email is fictional.",
                "title",
              ),
            ]),
            cues: [
              branch("Inspect the link", "inspect", 45),
              branch("Enter your password", "credential_failure", 62),
              branch(
                "Report after checking sender",
                "safe",
                79,
                "sender_checked",
              ),
            ],
          },
          {
            key: "inspect",
            storyboard: plan("Inspect without visiting", 30, [
              text(
                "Read the destination",
                "The displayed link says company.example.com. Its destination is login-company.example.invalid. No external page is opened in this exercise.",
              ),
            ]),
            cues: [
              branch("Download the attachment", "attachment_failure", 55),
              branch("Report and verify independently", "safe", 73),
            ],
          },
          {
            key: "safe",
            storyboard: plan("A safer response", 20, [
              text(
                "You stopped the chain",
                "You reported the message and checked with IT through a known contact. Suspicion became a question to verify, not a link to follow.",
                "recap",
              ),
            ]),
          },
          {
            key: "credential_failure",
            storyboard: plan("Credential trap", 20, [
              text(
                "A password went to the wrong place",
                "In this fictional route, the attacker receives a password. Report the incident and follow your organization's account recovery process. Start again to choose a different response.",
              ),
            ]),
          },
          {
            key: "attachment_failure",
            storyboard: plan("Attachment trap", 20, [
              text(
                "The attachment was the trap",
                "In this fictional route, opening the attachment causes an incident. Stop interacting and contact your security team through a known channel. Replay to investigate safely.",
              ),
            ]),
          },
        ],
      },
    };
  }
  if (id === "atlas") {
    const hero = asset(
      "atlas_hero",
      "Atlas backpack, fictional product concept",
      "atlas.png",
      "image",
      {
        creator: "Generated with OpenAI image generation for TimeTrail",
        license: "Original generated artwork; fictional product",
      },
    );
    presentation.views[0]!.accent = "#f3bd83";
    presentation.views[1]!.name = "Specifications";
    presentation.views[1]!.panels = ["specs", "power"];
    presentation.panels.push(
      {
        id: "specs",
        kind: "facts",
        title: "Fictional specifications",
        body: "These numbers describe a concept, not a product for sale.",
        entries: [
          { id: "capacity", label: "Capacity", value: 24, unit: "L" },
          { id: "battery", label: "Battery", value: 40, unit: "Wh" },
          {
            id: "panel",
            label: "Solar panel",
            value: 8,
            unit: "W rated concept",
          },
        ],
      },
      {
        id: "power",
        kind: "chart",
        title: "Illustrative battery budget",
        body: "Synthetic demonstration data in watt-hours. No product performance claim.",
        entries: [
          {
            id: "phone",
            label: "Phone charging",
            value: 18,
            unit: "Wh",
            timeSeconds: 15,
          },
          {
            id: "navigation",
            label: "Navigation",
            value: 6,
            unit: "Wh",
            timeSeconds: 45,
          },
          {
            id: "reserve",
            label: "Reserve",
            value: 16,
            unit: "Wh",
            timeSeconds: 0,
          },
        ],
      },
    );
    return {
      media,
      spec: {
        title: "Atlas · Carry the next idea",
        description:
          "A fictional expedition backpack concept, with original product artwork and interactive specifications.",
        presentation,
        sequences: [
          {
            key: "main",
            storyboard: plan("Atlas", 60, [
              {
                title: "Carry the next idea",
                mediaId: hero,
                narration:
                  "Meet Atlas, a fictional backpack concept for a day spent exploring. Every feature in this film is an idea, not a product promise.",
              },
              text(
                "Power, packed",
                "A fictional 40 Wh battery gives this concept a simple design brief: keep small devices ready without turning a backpack into a power station.",
              ),
              {
                title: "Follow the light",
                mediaId: hero,
                narration:
                  "An integrated solar panel suggests a way to collect energy along the route. Real output would depend on sunlight, angle and conditions.",
              },
              {
                ...text(
                  "A quieter kind of navigation",
                  "A small directional cue keeps attention on the trail. Open Specifications to explore the concept. This is a design demonstration, not a checkout.",
                  "recap",
                ),
                cards: [
                  {
                    kind: "note",
                    title: "Concept only",
                    body: "All specifications and energy allocations are fictional.",
                  },
                ],
              },
            ]),
            cues: [
              {
                kind: "hotspot",
                title: "Explore the concept",
                start: 45,
                end: 60,
                body: "Open Specifications above to inspect the design assumptions.",
                url: "https://example.com/atlas-concept",
              },
            ],
          },
        ],
      },
    };
  }
  if (id === "mars") {
    const questions = [
      [
        "Air",
        "A spacesuit is an independent life-support system. Mars' thin atmosphere cannot supply breathable air.",
        "What provides breathable air?",
        "A life-support system",
        "The open Martian atmosphere",
      ],
      [
        "Shelter",
        "A habitat must manage pressure and temperature. A beautiful view does not replace those systems.",
        "Which shelter function matters?",
        "Maintaining pressure",
        "Having an open roof",
      ],
      [
        "Water",
        "A mission needs a verified water supply and recycling plan. A photograph alone cannot establish safe drinking water.",
        "What makes water usable?",
        "Verification and treatment",
        "Its appearance in a picture",
      ],
      [
        "Power",
        "Life support needs dependable energy and reserves. Plan for interruptions rather than assuming constant generation.",
        "Why keep an energy reserve?",
        "To handle interruptions",
        "To replace all maintenance",
      ],
      [
        "Communication",
        "Communication across interplanetary distances takes time. Astronauts need procedures they can carry out without instant replies.",
        "How should crews plan decisions?",
        "Allow for communication delays",
        "Assume instant replies",
      ],
    ];
    presentation.defaultViewId = "classroom";
    return {
      media,
      spec: {
        title: "Mars · Five decisions before sunrise",
        description:
          "A classroom exercise about the systems a crew would need. Generated title cards, five questions and a transcript.",
        presentation,
        sequences: [
          {
            key: "main",
            storyboard: plan(
              "Five decisions",
              120,
              questions.map((q, i) => ({
                ...text(q[0]!, q[1]!),
                quiz: {
                  question: q[2]!,
                  options: [q[3]!, q[4]!],
                  answerIndex: 0,
                  explanation: q[1],
                  retryTime: i * 24,
                },
                cards: [
                  {
                    kind: "source" as const,
                    title: "NASA Mars overview",
                    body: "Background reading on the Martian environment.",
                    url: "https://science.nasa.gov/mars/facts/",
                  },
                ],
              })),
            ),
          },
        ],
      },
    };
  }
  presentation.defaultViewId = "research";
  presentation.views[1]!.name = "Cook along";
  presentation.views[1]!.panels = ["ingredients", "timer", "transcript"];
  presentation.panels.push(
    {
      id: "ingredients",
      kind: "checklist",
      title: "One sample pizza",
      body: "Illustrative home recipe. Oven settings and cooking time depend on your dough and equipment.",
      entries: [
        { id: "dough", label: "250 g prepared dough" },
        { id: "sauce", label: "60 g tomato sauce" },
        { id: "cheese", label: "80 g mozzarella" },
        { id: "basil", label: "A few basil leaves" },
      ],
    },
    {
      id: "timer",
      kind: "timer",
      title: "Film countdown",
      body: "This follows the film playhead. It is not a kitchen timer.",
      entries: [],
      end: 90,
    },
  );
  return {
    media,
    spec: {
      title: "Pizza · A little order before the oven",
      description:
        "A cook-along demonstration with an ingredient checklist and a playhead-based timer. Text-led sample recipe.",
      presentation,
      sequences: [
        {
          key: "main",
          storyboard: plan("One pizza", 90, [
            text(
              "Start with the ingredients",
              "Prepare the dough, sauce and cheese before you shape anything. Check off ingredients in Cook along view.",
              "title",
            ),
            text(
              "Give the dough room",
              "Work on a lightly floured surface. Stretch prepared dough gently and keep the rim a little thicker.",
            ),
            text(
              "Less sauce, more control",
              "Spread a thin layer of tomato sauce. Leave a small border so the rim can rise.",
            ),
            text(
              "Build a balanced topping",
              "Distribute mozzarella without burying the dough. Keep toppings light enough for the base to bake.",
            ),
            text(
              "Bake, then look closely",
              "Follow the dough recipe and your oven's instructions. Look for a baked base and melted cheese, then finish with basil.",
              "recap",
            ),
          ]),
        },
      ],
    },
  };
}
export function makeExample(id: RecipeId, origin: string) {
  const { spec, media } = recipe(id, origin);
  const p = createProject({
    title: spec.title,
    topic: spec.title,
    targetSeconds: spec.sequences[0]!.storyboard.targetSeconds,
  });
  p.id = `example_${id}`;
  p.activeSequenceId = `example_${id}_main`;
  p.sequences[0]!.id = p.activeSequenceId;
  p.createdAt = stamp;
  p.updatedAt = stamp;
  p.provenance = {
    creator: "TimeTrail examples",
    license: "MIT for project; media credits apply",
  };
  p.tags =
    id === "europa" ? ["Space", "Documentary", "Interactive"] : ["Example", id];
  return applyOperations(p, compileProduction(p, spec, media).operations);
}
