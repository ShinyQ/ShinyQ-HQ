# Self-hosted page fonts (next/font/local)

Loaded by `src/app/fonts.ts`. All three are preloaded on every page, so their size counts toward the Largest Contentful Paint on slow connections (see `docs/deploy.md`, Lighthouse CI). Each file is the Google Fonts `latin` subset of the variable font, narrowed to the axis ranges the site uses. `next/font/google` cannot narrow axes (and rejects weight ranges under Turbopack), hence self-hosting.

| File | Source | Ranges | Size (full Google file) | License |
| --- | --- | --- | --- | --- |
| `inter-latin-wght400-800.woff2` | Inter 4.001 | wght 400 to 800 | 37 KB (48 KB) | `LICENSE-Inter.txt` |
| `jetbrains-mono-latin-wght400-700.woff2` | JetBrains Mono 2.211 | wght 400 to 700 | 31 KB (40 KB) | `LICENSE-JetBrainsMono.txt` |
| `archivo-latin-wdth72-92-wght600-800.woff2` | Archivo 2.001 (Google v25) | wght 600 to 800, wdth 72 to 92 | 42 KB (90 KB) | `LICENSE-Archivo.txt` |

All are SIL OFL 1.1 without a Reserved Font Name, so the cut files keep their names.

Uses: Inter is the body face (400 to 800), JetBrains Mono the data labels (400 to 700), Archivo the Page View display face (`--font-display`: `.pv-d-*`, `.pv-h2`, `.pv-h3`, `.pv-num`, the header monogram, the Home contact link; weights 600 to 800, `font-stretch` 72% to 92%). The browser clamps anything outside a range, so if a design needs another weight or width, widen the cut instead.

The latin subset covers every character in the content. Characters outside it (for example the arrows) come from the system fallback, as they did with Google's subsets.

## Regenerate (fonttools 4.x)

1. Get the `/* latin */` woff2 URL of the full variable font, for example
   `curl -sA "Mozilla/5.0 Chrome/130" "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900"`
   (Inter: `family=Inter:wght@100..900`, JetBrains Mono: `family=JetBrains+Mono:wght@100..800`), and download it.
2. Narrow the axes:

```sh
python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib import instancer; t = instancer.instantiateVariableFont(TTFont('archivo-latin.woff2'), {'wght': (600, 800), 'wdth': (72, 92)}); t.flavor = 'woff2'; t.save('archivo-latin-wdth72-92-wght600-800.woff2')"
```

3. Update the file name, `weight` and `declarations` in `src/app/fonts.ts` and the table above.
