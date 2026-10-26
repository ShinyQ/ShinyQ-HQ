import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allTechLogos, getTechLogo, isTextOnlyTech, normalizeTech, sortLogosFirst, TEXT_ONLY_TECH } from "@/content/tech";

const root = process.cwd();
const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8"));

function contentStackNames(): string[] {
  const names = new Set<string>();
  for (const pod of content.floors.labs.pods) pod.stack.forEach((s: string) => names.add(s));
  for (const entry of content.floors.careerArchive.entries) entry.stack.forEach((s: string) => names.add(s));
  for (const group of content.skills) group.items.forEach((s: string) => names.add(s));
  for (const project of content.sideProjects) project.stack.forEach((s: string) => names.add(s));
  return [...names];
}

describe("tech logos", () => {
  it("resolves every stack and skill name in content or allowlists it as text-only", () => {
    const unresolved = contentStackNames().filter((name) => !getTechLogo(name) && !isTextOnlyTech(name));
    expect(unresolved).toEqual([]);
  });

  it("keeps the text-only allowlist free of names that have a logo", () => {
    expect([...TEXT_ONLY_TECH].filter((name) => getTechLogo(name))).toEqual([]);
  });

  it("points every logo at a committed file under public/tech", () => {
    const missing = allTechLogos().filter((logo) => !existsSync(path.join(root, "public", logo.src)));
    expect(missing).toEqual([]);
    expect(allTechLogos().every((logo) => logo.src.startsWith("/tech/"))).toBe(true);
  });

  it("gives the Data science and ML group its logos and keeps models and logo-less libraries as text", () => {
    const logo = (name: string) => getTechLogo(name)?.src ?? null;
    expect(logo("pandas")).toBe("/tech/pandas.svg");
    expect(logo("Plotly")).toBe("/tech/plotly.svg");
    expect(logo("Streamlit")).toBe("/tech/streamlit.webp");
    expect(logo("Jupyter")).toBe("/tech/jupyter.svg");
    expect(logo("scikit-learn")).toBe("/tech/scikit-learn.svg");
    expect(logo("PyTorch")).toBe("/tech/pytorch.svg");
    expect(logo("Hugging Face Transformers")).toBe("/tech/huggingface.webp");
    expect(logo("NumPy")).toBe("/tech/numpy.svg");
    expect(logo("Matplotlib")).toBe("/tech/matplotlib.svg");
    expect(logo("Seaborn")).toBe("/tech/seaborn.webp");
    expect(logo("Keras")).toBe("/tech/keras.svg");
    expect(logo("LightGBM")).toBe("/tech/lightgbm.svg");
    for (const name of ["Sastrawi", "XGBoost", "IndoBERT", "N-BEATS", "PuLP", "yfinance"]) {
      expect(logo(name), name).toBeNull();
      expect(isTextOnlyTech(name), name).toBe(true);
    }
  });

  it("normalizes case, versions and parentheticals", () => {
    expect(normalizeTech("Next.js 14")).toBe("next.js");
    expect(normalizeTech("Azure OpenAI (incl. Realtime)")).toBe("azure openai");
    expect(normalizeTech("  Bootstrap  5 ")).toBe("bootstrap");
    expect(normalizeTech("k6")).toBe("k6");
  });

  it("resolves aliases and compound skill names", () => {
    expect(getTechLogo("Express.js")?.src).toBe("/tech/express.svg");
    expect(getTechLogo("express")?.label).toBe("Express");
    expect(getTechLogo("Durable Functions")?.src).toBe("/tech/azure-functions.svg");
    expect(getTechLogo("Node.js / Express")?.src).toBe("/tech/nodejs.svg");
    expect(getTechLogo("Azure OpenAI (incl. Realtime)")?.src).toBe("/tech/azure-openai.svg");
    expect(getTechLogo("AWS Lambda")?.label).toBe("AWS");
    expect(getTechLogo("azure-openai-realtime")?.src).toBe("/tech/azure-openai.svg");
    expect(getTechLogo("nodejs")?.src).toBe("/tech/nodejs.svg");
    expect(getTechLogo("Microsoft Fabric")?.src).toBe("/tech/fabric.svg");
    expect(getTechLogo("Lakehouse")?.src).toBe("/tech/fabric-lakehouse.svg");
    expect(getTechLogo("Fabric Data Pipelines")?.src).toBe("/tech/fabric-data-pipelines.svg");
  });

  it("resolves the stack logos found online, including aliases to existing Azure icons", () => {
    const logo = (name: string) => getTechLogo(name)?.src ?? null;
    expect(logo("Java")).toBe("/tech/java.svg");
    expect(logo("MongoDB")).toBe("/tech/mongodb.svg");
    expect(logo("Nuxt")).toBe("/tech/nuxt.svg");
    expect(logo("Drizzle ORM")).toBe("/tech/drizzle.svg");
    expect(logo("WhatsApp Cloud API")).toBe("/tech/whatsapp.svg");
    expect(logo("Entra ID")).toBe("/tech/entra-id.svg");
    expect(logo("Microsoft Entra ID")).toBe("/tech/entra-id.svg");
    expect(logo("Marketplace Metering API")).toBe("/tech/marketplace.svg");
    expect(logo("Prompt Shields")).toBe("/tech/content-safety.svg");
    expect(logo("ARM-TTK")).toBe("/tech/arm-templates.svg");
    expect(logo("Data API Builder")).toBe("/tech/data-api-builder.webp");
    for (const name of ["Bandit", "OSV-Scanner", "KEDA", "Sinon", "Kysely", "CKEditor", "Requests"]) expect(logo(name), name).not.toBeNull();
  });

  it("orders logo chips first and keeps each group in its original order", () => {
    expect(sortLogosFirst(["RAG", "Python", "SSO", "Docker", "Naive Bayes", "Go"])).toEqual(["Python", "Docker", "Go", "RAG", "SSO", "Naive Bayes"]);
    expect(sortLogosFirst(["Python", "Docker"])).toEqual(["Python", "Docker"]);
    expect(sortLogosFirst([])).toEqual([]);
  });

  it("returns null for unknown names so callers fall back to text chips", () => {
    expect(getTechLogo("Totally Unknown Framework")).toBeNull();
    expect(getTechLogo("Gitleaks")).toBeNull();
    expect(getTechLogo("Semgrep")).toBeNull();
    expect(getTechLogo("Codex")).toBeNull();
    expect(isTextOnlyTech("IndoBERT / NLP")).toBe(true);
  });
});
