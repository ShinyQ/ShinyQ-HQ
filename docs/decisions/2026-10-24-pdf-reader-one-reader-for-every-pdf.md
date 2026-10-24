# Content: PDF reader

- Date: 2026-10-24
- PR: [#314](https://github.com/ShinyQ/ShinyQ-HQ/pull/314)

Every PDF on the site opens in the study guide reader's modal: the CV (every CV button, `/cv`'s View CV, the RF kiosk) and the paper PDFs ("Read the paper") as well as the study guides, one shared reader in `src/components/pdf-reader/` instead of the image-based page viewer. The owner chose pdf.js for every PDF with page 1's image as the loading cover, `/cv` as a cover card (page 1, View CV, Download PDF) with no new JS, the pdf.js text layer on for every PDF, the CV included (runtime only, from the PDF itself, never in page HTML, metadata, search or alt text, never OCR), and the page image pipelines unchanged.
