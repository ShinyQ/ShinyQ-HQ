# Classic site: Security page

- Date: 2026-11-13
- PR: [#430](https://github.com/ShinyQ/ShinyQ-HQ/pull/430)

Owner request: a dedicated Classic page `/{locale}/security` ("Security in Practice") on how Kurniadi secures applications, his security products, the hardening in his git history and his keyless Azure work. Impact first: before and after deltas lead and volume counts are small supporting context. Sections: a hero with three proof results, five principles, keyless Azure with one small diagram, AI and LLM security, security products, anonymized incidents (no client, service or date finer than the month), supply chain and CI, how this site is secured, and the CTF background. Text lives in `content/security.json` (public-safe facts only; nothing from the evidence catalog's risks or gaps). Linked from the footer and About, not the primary nav; no 3D room for now. Ask cites `/security` for security questions, and the stored Ask pack cap rises from 768 KiB to 832 KiB to fit its chunk (main was at 767.8 KiB; text cap 384 KiB unchanged).
