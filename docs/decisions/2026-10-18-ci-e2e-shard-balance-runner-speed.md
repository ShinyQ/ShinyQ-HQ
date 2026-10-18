# CI

- Date: 2026-10-18

Owner request: "balance the e2e shards (duration-sized greedy packing with the refreshed durations.json, or split the longest specs) so complement and full runs finish evenly." Evidence from 7 runs: every test of a shard runs at about its runner's speed factor (0.65 to 1.21 across 48 shard jobs), so equal estimates finished 6.6 to 10.8 min (complement 39125181678); no retries, no serial pinning. Shipped: worker-aware packing (2 workers per shard), a runner fingerprint in each shard log and runner-speed-normalized medians in `e2e:durations`. Expected residual spread about 3 min. Dynamic tail claiming (needs `contents: write` on jobs that run PR code) waits for the owner; more shards are not adopted (they raise concurrency against the two-runs-in-flight rule).
