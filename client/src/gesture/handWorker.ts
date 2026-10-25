/// <reference lib="webworker" />
import { createLandmarker, toDetection, type WorkerReply, type WorkerRequest } from "./landmarker";

declare const self: DedicatedWorkerGlobalScope;

// MediaPipe loads its WASM glue with importScripts, which module workers forbid.
// Fetch and run it in the global scope instead, which is what importScripts does.
(self as unknown as { importScripts: (...urls: string[]) => void }).importScripts = (...urls: string[]) => {
  for (const url of urls) {
    const request = new XMLHttpRequest();
    request.open("GET", url, false);
    request.send();
    if (request.status >= 400) throw new Error(`Could not load ${url} (${request.status})`);
    (0, eval)(request.responseText);
  }
};

const reply = (message: WorkerReply) => self.postMessage(message);

const ready = createLandmarker();
ready.then(
  () => reply({ type: "ready" }),
  (error: unknown) => reply({ type: "error", message: error instanceof Error ? error.message : String(error) }),
);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { frame, timestamp } = event.data;
  try {
    const landmarker = await ready;
    reply({ type: "result", detection: toDetection(landmarker.detectForVideo(frame, timestamp)) });
  } catch (error) {
    reply({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    frame.close();
  }
};
