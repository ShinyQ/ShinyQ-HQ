# Ask

- Date: 2026-10-18
- PR: [#210](https://github.com/ShinyQ/ShinyQ-HQ/pull/210)

Groq backup tiers for Ask the HQ (owner): after Gemma 4 and Mistral Small 3.1 on Workers AI, Groq answers on its free plan, first `qwen/qwen3.8-27b`, then `openai/gpt-oss-120b`. A Workers AI daily quota error skips Mistral and goes straight to Groq. Qwen 3.8 27B is a Groq preview model that may be discontinued, so gpt-oss-120b (a production model) sits behind it. Zero Data Retention is on at Groq and the privacy note names Groq; the key is the `GROQ_API_KEY` Pages secret (production). Live check before merge (owner): Qwen 3.8 27B passed 10 of 10 golden items (median 533 ms); gpt-oss-120b passed 9 of the same 10 and 11 of 14 with the multi-turn items (79 percent), so it is a weaker last resort that misses some multi-turn follow-ups and short Indonesian answers, but fails safe (no fabrication) and still beats the canned reply.
