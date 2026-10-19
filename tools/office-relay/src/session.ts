import { createHmac } from "node:crypto";

/** A stable, salted, one-way id for an agent session (the raw id never leaves the machine). */
export function sessionHash(agent: string, rawId: string, salt: string): string {
  return createHmac("sha256", salt).update(`${agent}:${rawId}`).digest("hex");
}
