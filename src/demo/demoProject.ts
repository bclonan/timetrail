import { applyOperations, createProject, type Project } from "../domain/model";
import {
  TimelineCompiler,
  type Storyboard,
} from "../services/TimelineCompiler";
export const judgePrompt =
  "Find three credible videos about how CRISPR works. Import them, then build a 90-second beginner-friendly interactive explainer with four chapters, one definition card, two source notes, one misconception warning, a final quiz, and an optional branch about ethics. Propose the complete build for my review and do not commit it without confirmation.";
export const dnaPlan: Storyboard = {
  title: "How DNA Becomes a Protein",
  topic: "DNA, transcription, and translation",
  audience: "Curious beginners",
  targetSeconds: 90,
  segments: [
    {
      title: "A small code. A living world.",
      summary:
        "Inside your cells, genetic instructions become the proteins that help life work.",
      narration:
        "DNA stores genetic information. Cells use a working copy of that information to build proteins.",
      durationWeight: 1,
      cards: [
        {
          kind: "definition",
          title: "DNA",
          body: "Deoxyribonucleic acid stores genetic instructions in a sequence of chemical bases.",
        },
        {
          kind: "note",
          title: "Packed into chromosomes",
          body: "In human cells, DNA is organized into chromosomes. Most cells keep these chromosomes inside a nucleus.",
        },
      ],
    },
    {
      title: "Transcription: make a copy",
      summary:
        "The cell copies a gene into messenger RNA. The DNA remains in place.",
      narration:
        "During transcription, RNA polymerase uses one DNA strand as a template to make RNA.",
      durationWeight: 1,
      cards: [
        {
          kind: "definition",
          title: "Messenger RNA",
          body: "Messenger RNA, or mRNA, carries a copy of genetic instructions to a ribosome.",
        },
        {
          kind: "source",
          title: "The transcription step",
          body: "Read the National Human Genome Research Institute glossary.",
          url: "https://www.genome.gov/genetics-glossary/Transcription",
        },
      ],
    },
    {
      title: "Translation: build a protein",
      summary:
        "A ribosome reads the message, three bases at a time. Amino acids join into a chain.",
      narration:
        "The ribosome reads RNA codons. Transfer RNA brings amino acids, which link together to form a protein.",
      durationWeight: 1,
      cards: [
        {
          kind: "fact",
          title: "The ribosome reads in threes",
          body: "Each codon contains three RNA bases. Most codons specify an amino acid; some signal a stop.",
        },
        {
          kind: "warning",
          title: "DNA does not turn into protein",
          body: "Information is copied and interpreted. The DNA molecule itself does not become a protein.",
        },
        {
          kind: "source",
          title: "Translation, explained",
          body: "National Human Genome Research Institute, genetics glossary.",
          url: "https://www.genome.gov/genetics-glossary/Translation",
        },
      ],
    },
    {
      title: "One message. Many outcomes.",
      summary:
        "The amino acid chain folds into a working protein. Changes in DNA can sometimes change that outcome.",
      narration:
        "A protein is a chain of amino acids that folds into a shape. DNA changes may affect proteins, but many changes do not.",
      durationWeight: 1,
      quiz: {
        question: "What carries a gene's message to the ribosome?",
        options: [
          "Messenger RNA",
          "The entire chromosome",
          "A finished protein",
        ],
        answerIndex: 0,
        explanation:
          "Messenger RNA carries the copied message. The ribosome uses it to assemble a protein.",
      },
      branch: {
        label: "Explore mutations",
        targetTitle: "When the instructions change",
        targetSummary:
          "A DNA change may alter an amino acid, affect how much protein is made, or have no detectable effect. Context matters.",
      },
    },
  ],
};
export function makeDemo(): Project {
  const p = createProject({ title: dnaPlan.title, topic: dnaPlan.topic });
  p.id = "demo_dna";
  p.activeSequenceId = "demo_dna_main";
  p.sequences[0]!.id = p.activeSequenceId;
  p.createdAt = "2026-09-02T12:00:00.000Z";
  p.updatedAt = p.createdAt;
  const result = new TimelineCompiler().compile(p, dnaPlan);
  const project = applyOperations(p, result.operations);
  project.tags = ["Biology", "Beginner", "Generated"];
  project.description =
    "Follow the journey from genetic instructions to a working protein. An offline interactive lesson.";
  project.provenance = { creator: "TimeTrail", license: "MIT" };
  return project;
}
export const samplePlan = (project: Project): Storyboard => ({
  ...dnaPlan,
  title: project.title === "Untitled project" ? dnaPlan.title : project.title,
  topic: project.topic || dnaPlan.topic,
});
