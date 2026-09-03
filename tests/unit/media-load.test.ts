import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaLoadMonitor } from "../../src/runtime/MediaLoadMonitor";
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe("media loading lifecycle", () => {
  it("requires a decoded frame and FrameTrail readiness, not metadata alone", () => {
    vi.useFakeTimers();
    const host = document.createElement("div"),
      video = document.createElement("video");
    host.append(video);
    let ready = false,
      state = 1;
    Object.defineProperty(video, "readyState", { get: () => state });
    const changed = vi.fn();
    const monitor = new MediaLoadMonitor(host, () => ready, changed);
    expect(changed).toHaveBeenLastCalledWith("loading");
    ready = true;
    monitor.inspect();
    expect(changed).toHaveBeenCalledTimes(1);
    state = 2;
    video.dispatchEvent(new Event("loadeddata"));
    expect(changed).toHaveBeenLastCalledWith("ready");
    vi.advanceTimersByTime(21000);
    expect(changed).toHaveBeenCalledTimes(2);
    monitor.destroy();
  });
  it("reports an immediate source failure and ignores late readiness until retried", () => {
    const host = document.createElement("div"),
      video = document.createElement("video"),
      source = document.createElement("source");
    video.append(source);
    host.append(video);
    const changed = vi.fn();
    const monitor = new MediaLoadMonitor(host, () => true, changed);
    source.dispatchEvent(new Event("error"));
    expect(changed).toHaveBeenLastCalledWith(
      "error",
      expect.stringContaining("could not be loaded"),
    );
    Object.defineProperty(video, "readyState", { value: 4 });
    video.dispatchEvent(new Event("canplay"));
    expect(changed).toHaveBeenCalledTimes(2);
    monitor.destroy();
  });
  it("bounds loading and buffering waits and cancels callbacks on disposal", () => {
    vi.useFakeTimers();
    const host = document.createElement("div"),
      changed = vi.fn();
    const monitor = new MediaLoadMonitor(host, () => false, changed);
    vi.advanceTimersByTime(20000);
    expect(changed).toHaveBeenLastCalledWith(
      "error",
      expect.stringContaining("playable frame"),
    );
    monitor.destroy();
    const another = new MediaLoadMonitor(host, () => false, changed);
    another.destroy();
    vi.advanceTimersByTime(21000);
    expect(changed).toHaveBeenCalledTimes(3);
  });
});
