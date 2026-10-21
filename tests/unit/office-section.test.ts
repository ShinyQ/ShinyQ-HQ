import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { officeCardLabels } from "@/components/office/OfficeSection";
import { OFFICE_ACTIVITIES, OFFICE_AGENTS, OFFICE_STATES } from "@/lib/office/protocol";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

// The section wrapper pulls in next-intl navigation, which Vitest cannot resolve.
vi.mock("@/components/page/Layout", () => ({ SectionSplit: ({ children }: { children: ReactNode }) => children }));
// Server translations over the real messages: `t` and `t.raw` look up dotted keys.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: "en" | "id"; namespace: string }) => {
    const root = ((locale === "id" ? id : en) as unknown as Record<string, unknown>)[namespace];
    const get = (key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root);
    return Object.assign((key: string) => get(key), { raw: get });
  },
}));

const leaves = (o: object): unknown[] => Object.values(o).flatMap((v) => (typeof v === "object" && v ? leaves(v) : [v]));

describe("officeCardLabels", () => {
  it.each([
    ["en", en],
    ["id", id],
  ] as const)("resolves every %s label from office.classic and the shared office keys", async (locale, messages) => {
    const labels = await officeCardLabels(locale);
    for (const value of leaves(labels)) expect(typeof value === "string" && value.length > 0, String(value)).toBe(true);
    expect(labels.title).toBe(messages.office.classic.title);
    expect(labels.today).toBe(messages.office.classic.today);
    expect(labels.todayNoCi).toBe(messages.office.classic.todayNoCi);
    expect(labels.offlineEmpty).toBe(messages.office.classic.offlineEmpty);
    expect(labels.counts).toEqual(messages.office.classic.counts);
    expect(labels.status).toEqual(messages.office.classic.status);
    expect(labels.clientProject).toBe(messages.office.clientProject);
    expect(labels.helpers).toBe(messages.office.helpers);
    expect("privacy" in labels).toBe(false);
    expect(Object.keys(labels.states)).toEqual([...OFFICE_STATES]);
    expect(Object.keys(labels.activities)).toEqual([...OFFICE_ACTIVITIES]);
    expect(Object.keys(labels.agentNames)).toEqual([...OFFICE_AGENTS]);
    expect(labels.states).toEqual(messages.office.state);
  });
});
