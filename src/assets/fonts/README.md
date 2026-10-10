# Self-hosted fonts (next/font/local)

| File | Source | License |
| --- | --- | --- |
| `archivo-latin-wdth72-92-wght600-800.woff2` | Archivo v25 (2.001) variable, Google Fonts `latin` subset, cut to wght 600 to 800 and wdth 72 to 92 | SIL OFL 1.1, `LICENSE-Archivo.txt` (no Reserved Font Name) |

Archivo is the Page View display face (`--font-display`). Every use sits between weight 600 and 800 and font-stretch 72% and 92% (`src/app/pageview.css`, the header monogram, the Home contact link). The full Google file carries wght 100 to 900 and wdth 62 to 125 (90 KB); this cut is 42 KB, which matters because it is preloaded on every page and counts toward the Largest Contentful Paint on slow connections. If a design needs a weight or width outside these ranges, widen the cut instead of letting the browser clamp it.

Regenerate (fonttools 4.x):

```sh
curl -sA "Mozilla/5.0 Chrome/130" "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900" # copy the /* latin */ woff2 URL
python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib import instancer; t = instancer.instantiateVariableFont(TTFont('archivo-latin.woff2'), {'wght': (600, 800), 'wdth': (72, 92)}); t.flavor = 'woff2'; t.save('archivo-latin-wdth72-92-wght600-800.woff2')"
```

The latin subset covers every character in the content (characters outside it, such as the arrows, already came from the system fallback).
