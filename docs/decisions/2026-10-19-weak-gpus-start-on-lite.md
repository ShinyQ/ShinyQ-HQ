# 3D experience

- Date: 2026-10-19
- PR: [#259](https://github.com/ShinyQ/ShinyQ-HQ/pull/259)

Known-weak integrated GPUs start on the lite tier, read from the `WEBGL_debug_renderer_info` renderer string
(`WEAK_GPU` in `src/lib/gpu-tier.ts`): Intel HD and UHD Graphics (Iris, Iris Xe, Iris Plus and Arc stay full), Mali-4xx,
the Mali-T series and Mali-G31 to G52, and Adreno 5xx and below (also the Windows on Arm form `Adreno(TM) 540`).
Before, a fine-pointer device with at least 4 GB and more than 2 cores always started on full, so a UHD 620 laptop or a
Mali-G52 Chromebook rendered the full tier (bloom and post passes). Every other device keeps today's tier; a Firefox renderer
bucket (it ends in ", or similar" and reports every Intel iGPU, Iris Xe included, as "Intel(R) HD Graphics") is not a
known GPU and keeps today's tier too. Software renderers stay static, and a `?tier=` override and the visitor's graphics
quality setting still win. The boot-first head script keeps deciding only static.
