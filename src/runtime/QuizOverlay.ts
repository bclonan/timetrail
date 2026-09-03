import type { Cue } from "../domain/model";

export type QuizState = {
  answers: Record<string, number>;
  dismissedCueIds: string[];
};

/** One quiz layer above either FrameTrail player, using cue IDs rather than question text. */
export class QuizOverlay {
  readonly element = document.createElement("section");
  private cue?: Cue;
  private key = "";
  private seen = new Set<string>();
  private state: QuizState = { answers: {}, dismissedCueIds: [] };
  private previousFocus?: HTMLElement;

  constructor(
    private actions: {
      pause: () => void;
      answer: (cueId: string, index: number) => void;
      dismiss: (cueId: string) => void;
      resume: () => void;
    },
  ) {
    this.element.id = "timetrail-quiz";
    this.element.hidden = true;
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "Video question");
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close(true);
      }
    });
    document.body.append(this.element);
  }

  setState(state: QuizState) {
    // A restart clears both collections. Let quizzes pause again on the next visit.
    if (
      !Object.keys(state.answers).length &&
      !state.dismissedCueIds.length &&
      (Object.keys(this.state.answers).length ||
        this.state.dismissedCueIds.length)
    )
      this.seen.clear();
    this.state = {
      answers: { ...state.answers },
      dismissedCueIds: [...state.dismissedCueIds],
    };
  }

  reset(state: QuizState) {
    this.hide();
    this.seen.clear();
    this.setState(state);
  }

  update(cues: Cue[], time: number) {
    const cue = cues.find(
      (c) =>
        c.quiz &&
        time >= c.start &&
        time < (c.end ?? c.start + 5) &&
        !this.state.dismissedCueIds.includes(c.id),
    );
    if (!cue) {
      this.hide();
      return;
    }
    const key = `${cue.id}:${this.state.answers[cue.id]}`;
    if (key === this.key) return;
    const opening = this.element.hidden;
    const hadFocus = this.element.contains(document.activeElement);
    if (opening) this.previousFocus = document.activeElement as HTMLElement;
    this.key = key;
    this.cue = cue;
    this.element.hidden = false;
    const quiz = cue.quiz!;
    const selected = this.state.answers[cue.id];
    const close = this.button("Close question and continue", () =>
      this.close(true),
    );
    close.className = "quiz-close";
    const heading = document.createElement("h2");
    heading.textContent = quiz.question;
    const choices = document.createElement("div");
    choices.className = "quiz-options";
    for (const [index, option] of quiz.options.entries()) {
      const button = this.button(option, () => {
        this.state.answers[cue.id] = index;
        this.actions.answer(cue.id, index);
        this.update(cues, time);
      });
      button.disabled = selected !== undefined;
      if (selected !== undefined && index === quiz.answerIndex)
        button.className = "correct";
      choices.append(button);
    }
    const footer = document.createElement("div");
    footer.className = "quiz-footer";
    if (selected !== undefined) {
      const feedback = document.createElement("p");
      feedback.setAttribute("role", "status");
      feedback.textContent =
        (selected === quiz.answerIndex
          ? "Correct. "
          : `The correct answer is ${quiz.options[quiz.answerIndex]}. `) +
        (quiz.explanation || "");
      footer.append(feedback);
    }
    const proceed = this.button(
      selected === undefined ? "Skip question" : "Continue film",
      () => this.close(true),
    );
    footer.append(proceed);
    this.element.replaceChildren(close, heading, choices, footer);
    if (opening) close.focus({ preventScroll: true });
    else if (hadFocus) proceed.focus({ preventScroll: true });
    if (!this.seen.has(cue.id)) {
      this.seen.add(cue.id);
      this.actions.pause();
    }
  }

  close(resume: boolean) {
    if (this.cue) {
      const id = this.cue.id;
      if (!this.state.dismissedCueIds.includes(id))
        this.state.dismissedCueIds.push(id);
      this.hide();
      this.actions.dismiss(id);
    }
    if (resume) this.actions.resume();
  }

  private hide() {
    const focused = this.element.contains(document.activeElement);
    this.element.hidden = true;
    this.key = "";
    this.cue = undefined;
    if (focused && this.previousFocus?.isConnected)
      this.previousFocus.focus({ preventScroll: true });
  }

  private button(text: string, action: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.onclick = action;
    return button;
  }
}
