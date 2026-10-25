import { describe, expect, it } from "vitest";
import { isProblemQuestion } from "../../functions/_lib/scope";

/** Bring your problem (owner decision 2026-10-25): problem questions, approach retrieval, rule 18 and the approach checks. */
describe("isProblemQuestion", () => {
  it.each([
    "Our fraud checks are manual. His approach?",
    "Our call center can't keep up. His approach?",
    "We review documents manually and it is too slow",
    "Our support team is drowning in emails, how would he tackle it?",
    "How would he speed up slow document review?",
    "How would he tackle slow voice AI latency?",
    "How would you approach fraud detection for us?",
    "What would Kurniadi do about our slow onboarding?",
    "Call center kami kewalahan. Pendekatannya?",
    "Review dokumen kami lambat. Pendekatannya?",
    "Tim kami kesulitan menyaring CV pelamar",
    "Bagaimana Kurniadi menangani deteksi fraud dokumen?",
    "Gimana dia akan mengatasi latensi voice AI?",
  ])("detects %s", (q) => expect(isProblemQuestion(q)).toBe(true));

  it.each([
    "How did he build the fraud review platform?",
    "What problems did he solve at Metrodata?",
    "How do I build a RAG chatbot step by step?",
    "What is RAG?",
    "How was this site built?",
    "Can he build us a chatbot?",
    "I need an AI chatbot for my clinic, can you help?",
    "I struggle to learn machine learning",
    "Saya kesulitan belajar AI",
    "How would he solve corruption in the government?",
    "What would he do about AI regulation?",
    "How would he build a RAG chatbot?",
  ])("leaves %s alone", (q) => expect(isProblemQuestion(q)).toBe(false));
});
