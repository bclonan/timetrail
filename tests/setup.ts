import "fake-indexeddb/auto";
import { Blob } from "node:buffer";
import { vi } from "vitest";
vi.stubGlobal("Blob", Blob);
