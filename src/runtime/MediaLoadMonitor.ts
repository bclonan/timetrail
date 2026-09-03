/** Watches the actual media element, including sources that fail before FrameTrail is ready. */
export class MediaLoadMonitor {
  private abort = new AbortController();
  private observer: MutationObserver;
  private timer?: ReturnType<typeof setTimeout>;
  private element?: HTMLMediaElement;
  private waiting = false;
  private failed = false;
  constructor(
    private host: HTMLElement,
    private frameReady: () => boolean,
    private changed: (
      state: "loading" | "ready" | "error",
      message?: string,
    ) => void,
    private timeout = 20000,
  ) {
    this.observer = new MutationObserver(() => this.inspect());
    this.observer.observe(host, { childList: true, subtree: true });
    this.wait();
    this.inspect();
  }
  private wait() {
    if (this.failed || this.waiting) return;
    this.waiting = true;
    this.changed("loading");
    this.timer = setTimeout(
      () =>
        this.fail(
          "The source did not deliver a playable frame. It may be unavailable, blocked, or in an unsupported format.",
        ),
      this.timeout,
    );
  }
  private fail(message: string) {
    if (this.failed || this.abort.signal.aborted) return;
    this.failed = true;
    clearTimeout(this.timer);
    this.changed("error", message);
  }
  inspect() {
    if (this.abort.signal.aborted || this.failed) return;
    const media = this.host.querySelector<HTMLMediaElement>("video, audio");
    if (media && media !== this.element) {
      this.element = media;
      const options = { signal: this.abort.signal };
      for (const event of ["loadeddata", "canplay", "playing", "seeked"])
        media.addEventListener(event, () => this.inspect(), options);
      for (const event of ["waiting", "stalled", "seeking"])
        media.addEventListener(
          event,
          () => {
            if (media.readyState < (event === "seeking" ? 2 : 3)) this.wait();
          },
          options,
        );
      media.addEventListener(
        "error",
        () =>
          this.fail(
            "The browser could not load or decode this source. Try again or choose another source.",
          ),
        options,
      );
      // Source-element failures do not bubble to their media element.
      media.addEventListener(
        "error",
        () =>
          this.fail(
            "The video source could not be loaded. Try again or choose another source.",
          ),
        { ...options, capture: true },
      );
      media.preload = "auto";
    }
    if (media?.error) {
      this.fail(
        "The browser could not load or decode this source. Try again or choose another source.",
      );
      return;
    }
    if (
      this.frameReady() &&
      (!media || media.readyState >= 2) &&
      this.waiting
    ) {
      clearTimeout(this.timer);
      this.waiting = false;
      this.changed("ready");
    }
  }
  destroy() {
    clearTimeout(this.timer);
    this.abort.abort();
    this.observer.disconnect();
  }
}
