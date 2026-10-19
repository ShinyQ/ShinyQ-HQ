/**
 * The Agent Office chunk entry (L1, loaded on demand by `./chunk.ts`): everything live about the office. Main-path
 * code imports nothing from here but types (tests/unit/office-chunk-graph.test.ts).
 */
export { officeTest } from "./live";
export { OfficeScene } from "./OfficeScene";
export { OfficeChips } from "./OfficeChips";
export { OfficeBody } from "./OfficeBody";
