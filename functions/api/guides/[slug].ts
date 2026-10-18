import { createGuidesHandler } from "../../_lib/guides";
import type { GuidesEnv, PagesContext } from "../../_lib/types";

/** Study guide PDFs (L4 Study Vault, Classic shelf, CertDialog): R2 bucket hq-study-guides behind GUIDES. */
const handler = createGuidesHandler();

export const onRequest = (context: PagesContext<GuidesEnv>) => handler(context);
