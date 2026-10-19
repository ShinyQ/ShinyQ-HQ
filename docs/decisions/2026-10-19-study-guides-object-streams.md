# Content: study guides

- Date: 2026-10-19
- PR: [#245](https://github.com/ShinyQ/ShinyQ-HQ/pull/245)

The study guide PDFs are prepared with object streams (`qpdf --object-streams=generate`) instead of linearization,
replacing that part of the 2026-10-19 study guides decision. Measured on production, a linearized guide (qpdf flattens
the page tree) made pdf.js read every page object to open it: 51 range requests and 3.3 MB of 4.4 MB, 8.9 s to page 1.
With object streams each guide opens in 3 or 4 range requests and draws page 1 after about 0.2 MB, and the files are
about 4 percent smaller. New versions are uploaded under new keys; the old objects stay at least a day.
