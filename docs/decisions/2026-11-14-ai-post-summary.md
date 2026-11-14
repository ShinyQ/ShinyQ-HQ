# Classic site

- Date: 2026-11-14

Every hosted post (`/blog/<slug>`) opens with an AI Summary block between its title and meta line and its first body
paragraph: 3 to 5 short paragraphs (1 to 2 sentences each, about 100 to 160 words) labelled "AI Summary" /
"Ringkasan AI", the label being the disclosure that the text is generated from the post rather than written as part of
it. The copy lives in the dataset as `PostRef.summary` (`{ en, id }` per paragraph, 3 to 5 paragraphs, 320 characters
each), not in the MDX frontmatter, so the schema and `bun run validate:content` bound it and every post is covered by
one content test. The block reads in the language of the body, so a translation-fallback page shows its own language's
paragraphs under the page's label, and it never becomes the meta description, the share card or the Ask knowledge pack:
`excerpt` stays the only SEO summary. The protected Sun/Moon essay family gets Indonesian paragraphs only; no English
copy is added for it. The paragraphs were drafted from each article's own evidence and reviewed by the owner.
