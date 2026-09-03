import type { RuntimeMessage } from "./bridgeMessages";

// Keep the second public FrameTrail player and TimeTrail controls over the picture,
// leaving the first player's native ContentViews available around it.
export class LayoutAreaBridge {
  private observer?: ResizeObserver;
  private mutations?: MutationObserver;
  private last = "";
  readonly picture = document.createElement("div");
  constructor(
    private send: (message: RuntimeMessage) => void,
    private seek: (time: number) => void,
  ) {
    this.picture.id = "picture-layer";
    document.body.append(this.picture);
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element;
        const tab = target.closest("#player .contentViewTab");
        if (tab && !target.closest(".layoutAreaToggleCloseButton"))
          tab.closest(".layoutArea")?.classList.remove("closed");
      },
      true,
    );
    document.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLElement>(
        "#player [data-timetrail-seek]",
      );
      if (button) this.seek(Number(button.dataset.timetrailSeek));
    });
    document.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement;
      if (
        target.matches(
          "#player .contentViewTab, #player .layoutAreaToggleCloseButton",
        ) &&
        ["Enter", " "].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        target.click();
      }
    });
  }
  mount() {
    this.disconnect();
    this.last = "";
    const host = document.getElementById("player")!;
    const video = host.querySelector<HTMLElement>(".videoContainer");
    if (!video) return;
    const update = () => {
      const rect = video.getBoundingClientRect();
      const bounds = {
        x: (rect.x / innerWidth) * 100,
        y: (rect.y / innerHeight) * 100,
        width: (rect.width / innerWidth) * 100,
        height: (rect.height / innerHeight) * 100,
      };
      const key = JSON.stringify(bounds);
      if (key !== this.last && rect.width > 0 && rect.height > 0) {
        this.last = key;
        Object.assign(this.picture.style, {
          left: `${bounds.x}%`,
          top: `${bounds.y}%`,
          width: `${bounds.width}%`,
          height: `${bounds.height}%`,
        });
        this.send({ type: "TIMETRAIL_VIEWPORT", ...bounds });
      }
      for (const area of host.querySelectorAll<HTMLElement>(".layoutArea")) {
        const side = area.dataset.area?.replace("area", "").toLowerCase();
        for (const tab of area.querySelectorAll<HTMLElement>(
          ".contentViewTab",
        )) {
          const name =
            tab.querySelector(".contentViewTabName")?.textContent?.trim() ||
            "Content";
          const set = (el: HTMLElement, key: string, value: string) => {
            if (el.getAttribute(key) !== value) el.setAttribute(key, value);
          };
          set(tab, "role", "tab");
          set(tab, "tabindex", "0");
          set(tab, "aria-label", `${name}, ${side} area`);
          set(
            tab,
            "aria-selected",
            String(
              tab.classList.contains("active") &&
                !area.classList.contains("closed"),
            ),
          );
          const toggle = tab.querySelector<HTMLElement>(
            ".layoutAreaToggleCloseButton",
          );
          if (toggle) {
            set(toggle, "role", "button");
            set(toggle, "tabindex", "0");
            set(
              toggle,
              "aria-label",
              `${area.classList.contains("closed") ? "Open" : "Close"} ${side} area`,
            );
          }
        }
        const tabs = area.querySelector(".layoutAreaTabs");
        if (tabs) {
          tabs.setAttribute("role", "tablist");
          tabs.setAttribute("aria-label", `${side} area tabs`);
        }
      }
    };
    this.observer = new ResizeObserver(update);
    this.observer.observe(video);
    this.observer.observe(document.body);
    this.mutations = new MutationObserver(update);
    for (const element of host.querySelectorAll(".layoutArea, .contentViewTab"))
      this.mutations.observe(element, {
        attributes: true,
        attributeFilter: ["class", "data-size"],
      });
    update();
  }
  disconnect() {
    this.observer?.disconnect();
    this.mutations?.disconnect();
  }
}
