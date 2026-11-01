# Classic site

- Date: 2026-11-01
- PR: [#366](https://github.com/ShinyQ/ShinyQ-HQ/pull/366)

Every case study (`/labs/<slug>`) and the CV page end with the landing's closing section (`ClosingCta`): the availability line, the email, About and contact and View CV (the CV page skips View CV); case studies add "Ask Rover about this project" (Ask entry `case`). Reason (idea search 2026-11-01): case studies ended with "More projects" and the footer, so on a phone the voice AI case study (the #2 landing page) showed no email, CV or LinkedIn outside the footer in 11.4 screens, and contact and CV were 3% and 2% of page loads. The availability wording stays as it is (owner, 2026-11-01). Ask routing: a question that names a project by its full title takes the default route (`namesProject`), so the button's question never lands on the lifestyle or policy route.
