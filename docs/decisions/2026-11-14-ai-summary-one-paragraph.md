# Classic site

- Date: 2026-11-14

Owner feedback after the five-paragraph summaries shipped: the AI Summary should read as one continuous paragraph with no line breaks. Every hosted post now stores one `{ en, id }` summary paragraph instead of five. The copy is the same neutral synopsis, joined into one paragraph, and stays about 90 to 180 words. The schema, content test and `PostSummary` component enforce a single paragraph and reject line breaks. This replaces the five-paragraph rule; the neutral voice and generated-text label are unchanged.
