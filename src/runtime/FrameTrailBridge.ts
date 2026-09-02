import {
  parentMessage,
  runtimeMessage,
  validBridgeEvent,
  type ParentMessage,
  type RuntimeMessage,
} from "./bridgeMessages";
export class FrameTrailBridge {
  private abort = new AbortController();
  constructor(
    private frame: HTMLIFrameElement,
    receive: (m: RuntimeMessage) => void,
  ) {
    window.addEventListener(
      "message",
      (event) => {
        if (!validBridgeEvent(event, frame.contentWindow, location.origin))
          return;
        const result = runtimeMessage.safeParse(event.data);
        if (result.success) receive(result.data);
      },
      { signal: this.abort.signal },
    );
  }
  send(message: ParentMessage) {
    this.frame.contentWindow?.postMessage(
      parentMessage.parse(message),
      location.origin,
    );
  }
  destroy() {
    this.send({ type: "TIMETRAIL_DESTROY" });
    this.abort.abort();
  }
}
