import type { Cue } from "../domain/model";
import {
  positionForCue,
  hasIndicator,
  hotspotAppearance,
} from "../domain/hotspots";

/** Compact annotation controls shared by the hosted and exported players. */
export class AnnotationIndicators {
  readonly element = document.createElement("div");
  private details = document.createElement("section");
  private key = "";
  private opened?: Cue;
  private trigger?: HTMLElement;
  constructor(private select: (cue: Cue) => void) {
    this.element.id = "annotation-indicators";
    this.details.id = "annotation-detail";
    this.details.hidden = true;
    this.details.setAttribute("role", "dialog");
    this.details.setAttribute("aria-label", "Annotation details");
    this.details.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });
    document.body.append(this.element, this.details);
  }
  reset() {
    this.key = "";
    this.element.replaceChildren();
    this.close();
  }
  update(cues: Cue[], time: number) {
    const active = cues.filter(
      (c) =>
        hasIndicator(c) && time >= c.start && time < (c.end ?? c.start + 5),
    );
    if (
      this.opened &&
      (time < this.opened.start ||
        time >= (this.opened.end ?? this.opened.start + 5))
    )
      this.close();
    const key = active.map((c) => c.id).join("|");
    if (key === this.key) return;
    this.key = key;
    this.element.replaceChildren(
      ...active.map((cue) => {
        const position = positionForCue(cue, cues);
        const appearance = hotspotAppearance({
          ...cue.style,
          preset: "marker",
        });
        const button = document.createElement("button");
        button.type = "button";
        button.className = "annotation-indicator";
        button.textContent = "i";
        button.title = cue.title || "More information";
        button.setAttribute(
          "aria-label",
          `Open annotation: ${cue.title || "More information"}`,
        );
        button.style.left = `${position.x}%`;
        button.style.top = `${position.y}%`;
        button.style.width = `${position.width}%`;
        button.style.height = `${position.height}%`;
        button.style.setProperty("--indicator-color", appearance.color);
        button.style.color = appearance.textColor;
        if (typeof cue.style?.backgroundColor === "string")
          button.style.backgroundColor = cue.style.backgroundColor;
        button.style.borderWidth = `${cue.style?.borderWidth ?? 2}px`;
        button.style.borderRadius =
          appearance.shape === "circle"
            ? "50%"
            : appearance.shape === "rectangle"
              ? "0"
              : `${appearance.borderRadius}px`;
        button.onclick = () => {
          this.select(cue);
          this.open(cue, button);
        };
        return button;
      }),
    );
  }
  open(cue: Cue, trigger = document.activeElement as HTMLElement) {
    this.opened = cue;
    this.trigger = trigger;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close annotation";
    close.onclick = () => this.close();
    const title = document.createElement("h2");
    title.textContent = cue.title || "More information";
    const body = document.createElement("p");
    body.textContent = cue.body || "";
    this.details.replaceChildren(close, title, body);
    if (cue.url) {
      const link = document.createElement("a");
      link.href = cue.url;
      link.textContent = "Open source";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      this.details.append(link);
    }
    this.details.hidden = false;
    close.focus({ preventScroll: true });
  }
  private close() {
    const focused = this.details.contains(document.activeElement);
    this.details.hidden = true;
    this.opened = undefined;
    if (focused && this.trigger?.isConnected)
      this.trigger.focus({ preventScroll: true });
  }
}
