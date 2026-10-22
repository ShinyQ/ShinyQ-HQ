/**
 * The Agent Office chunk entry (L1, loaded on demand by `./chunk.ts`): everything live about the office but the drawer body (`./body.ts`, its own chunk). Main-path
 * code imports nothing from here but types (tests/unit/office-chunk-graph.test.ts). The drawer body reads the one poller
 * (`officeLive`, `useOfficeFeed`) from this loaded module, never by importing `./live`.
 */
export { officeLive, officeTest, useOfficeFeed } from "./live";
export { OfficeScene } from "./OfficeScene";
export { OfficeChips } from "./OfficeChips";
export { loadOfficeReplay, useReplay } from "./replayLink";
