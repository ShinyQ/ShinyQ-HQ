import { describe, expect, it } from "vitest";
import { BRAND_CASING, isTitleCase, titleCase } from "@/content/title-case";

describe("titleCase", () => {
  it.each([
    ["Realtime voice AI contact center", "Realtime Voice AI Contact Center"],
    ["Contact center voice AI realtime", "Contact Center Voice AI Realtime"],
    ["Explainable credit scoring in the browser", "Explainable Credit Scoring in the Browser"],
    ["Credit scoring di browser yang dapat dijelaskan", "Credit Scoring di Browser yang Dapat Dijelaskan"],
    ["From a request to a tool-using agent with tracing in Microsoft Agent Framework", "From a Request to a Tool-Using Agent with Tracing in Microsoft Agent Framework"],
    ["Mengapa fraud engine yang lebih baik dirilis dalam shadow mode", "Mengapa Fraud Engine yang Lebih Baik Dirilis dalam Shadow Mode"],
  ])("capitalizes major words and keeps minor words lowercase: %s", (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it("capitalizes the first word, the last word and the first word after a colon", () => {
    expect(titleCase("the case for evals")).toBe("The Case for Evals");
    expect(titleCase("what to log for")).toBe("What to Log For");
    expect(titleCase("45% of our LLM calls failed: what the error strings told us")).toBe("45% of Our LLM Calls Failed: What the Error Strings Told Us");
    expect(titleCase("Gemastik 2022: data mining")).toBe("Gemastik 2022: Data Mining");
  });

  it("lowercases minor words written with a capital", () => {
    expect(titleCase("CRUD NodeJS Menggunakan Framework ExpressJS Dan MySQL")).toBe("CRUD NodeJS Menggunakan Framework ExpressJS dan MySQL");
    expect(titleCase("Capture The Flag Competition")).toBe("Capture the Flag Competition");
    expect(titleCase("Kafka Vs. Redis Streams")).toBe("Kafka vs. Redis Streams");
  });

  it("keeps acronyms and brand casing", () => {
    expect(titleCase("Bank GenAI portal governance")).toBe("Bank GenAI Portal Governance");
    expect(titleCase("Bank statement analysis PoC")).toBe("Bank Statement Analysis PoC");
    expect(titleCase("Multi-tenant SaaS and asset management")).toBe("Multi-Tenant SaaS and Asset Management");
    expect(titleCase("IndoBERTweet app-review sentiment model")).toBe("IndoBERTweet App-Review Sentiment Model");
    expect(titleCase("shipping ios and .NET apps with e2e tests")).toBe("Shipping iOS and .NET Apps with e2e Tests");
    expect(titleCase("pris.ai and openai on azure")).toBe("Pris.AI and OpenAI on Azure");
    expect(titleCase("S&P 500 portfolio optimizer")).toBe("S&P 500 Portfolio Optimizer");
    expect(BRAND_CASING.it).toBeUndefined();
    expect(titleCase("why it failed")).toBe("Why It Failed");
  });

  it("cases each part of hyphenated and slashed compounds", () => {
    expect(titleCase("Anime figure e-commerce backend")).toBe("Anime Figure E-Commerce Backend");
    expect(titleCase("Chart-of-accounts AI assistant")).toBe("Chart-of-Accounts AI Assistant");
    expect(titleCase("E-wallet sentiment analysis (CNN-LSTM)")).toBe("E-Wallet Sentiment Analysis (CNN-LSTM)");
    expect(titleCase("ui/ux design competition")).toBe("UI/UX Design Competition");
    expect(titleCase("apa kata pesan error-nya")).toBe("Apa Kata Pesan Error-nya");
  });

  it("keeps listed creative titles as written and is idempotent", () => {
    expect(titleCase("The Sun, The Moon, and The Dark Sea")).toBe("The Sun, The Moon, and The Dark Sea");
    for (const s of ["Realtime voice AI contact center", "Asisten AI chart of accounts", "Delegate implementation, own the review"]) {
      expect(titleCase(titleCase(s))).toBe(titleCase(s));
      expect(isTitleCase(titleCase(s))).toBe(true);
    }
    expect(isTitleCase("Realtime voice AI contact center")).toBe(false);
  });
});
