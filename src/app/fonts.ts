import localFont from "next/font/local";

/*
 * Self-hosted latin cuts of the three variable families, narrowed to the axis ranges the site
 * uses. They are preloaded on every page, so their size sits on the Largest Contentful Paint
 * path on slow connections (next/font/google cannot narrow the axes). Sources, ranges and the
 * regeneration command: src/assets/fonts/README.md.
 */
export const inter = localFont({
  src: "../assets/fonts/inter-latin-wght400-800.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "400 800",
});
export const jetbrains = localFont({
  src: "../assets/fonts/jetbrains-mono-latin-wght400-700.woff2",
  variable: "--font-jetbrains",
  display: "swap",
  weight: "400 700",
});
/** Display face for page titles and numerals; the wdth axis gives the condensed cuts. */
export const archivo = localFont({
  src: "../assets/fonts/archivo-latin-wdth72-92-wght600-800.woff2",
  variable: "--font-archivo",
  display: "swap",
  weight: "600 800",
  declarations: [{ prop: "font-stretch", value: "72% 92%" }],
});

export const fontClassName = `${inter.variable} ${jetbrains.variable} ${archivo.variable}`;
