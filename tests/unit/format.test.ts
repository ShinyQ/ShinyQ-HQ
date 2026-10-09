import { describe, expect, it } from "vitest";
import { formatDate, formatPeriod, formatYearMonth } from "@/lib/format";

describe("formatYearMonth", () => {
  it("formats per locale", () => {
    expect(formatYearMonth("2024-06", "en")).toBe("Jun 2024");
    expect(formatYearMonth("2024-06", "id")).toBe("Jun 2024");
    expect(formatYearMonth("2026-10", "id")).toBe("Okt 2026");
  });

  it("handles present", () => {
    expect(formatYearMonth("present", "en")).toBe("Present");
    expect(formatYearMonth("present", "id")).toBe("Sekarang");
  });
});

describe("formatPeriod", () => {
  it("joins start and end without dashes", () => {
    expect(formatPeriod("2024-06", "2025-12", "en")).toBe("Jun 2024 to Dec 2025");
    expect(formatPeriod("2026-02", "present", "id")).toBe("Feb 2026 hingga Sekarang");
  });

  it("collapses identical months", () => {
    expect(formatPeriod("2023-05", "2023-05", "en")).toBe("May 2023");
  });
});

describe("formatDate", () => {
  it("formats ISO dates", () => {
    expect(formatDate("2025-06-06", "en")).toBe("Jun 6, 2025");
    expect(formatDate("2025-06-06", "id")).toBe("6 Jun 2025");
  });
});
