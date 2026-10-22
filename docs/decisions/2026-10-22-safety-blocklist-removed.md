# Safety

- Date: 2026-10-22

The owner removed the whole public-safety blocklist mechanism, reversing the S1 private blocklist requirement of 2026-10-14 and the automated C3 enforcement. Gone: the committed `content/safety-blocklist.default.txt`, the `SAFETY_BLOCKLIST` secret and the gitignored local list, the `SAFETY_BLOCKLIST_GRACE_UNTIL` variable and its grace-date logic, the `private term #n` labelling and redaction, the export blocklist scan (`scripts/scan-export.ts` keeps only the script policy check), the content, pack, study guide and paper blocklist checks, the Ask `blocklist` output check with its cache re-check and `functions/_generated/safety.json`, and the hq-office title and branch blocklist. The C3 rule itself stays (clients only by sector label, by review and Ask prompt rule 6), as do the forbidden patterns, every other Ask output check and `content/safety-allowlist.txt`, which feeds the Ask entity allowlist.
