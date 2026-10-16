import { tsImport } from "tsx/esm/api";

// One --import entry also works with Next's build-worker NODE_OPTIONS parser.
await tsImport("./mock-server.ts", import.meta.url);
