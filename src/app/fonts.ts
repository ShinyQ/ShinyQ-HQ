import { Archivo, Inter, JetBrains_Mono } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
/** Display face for page titles and numerals; the wdth axis gives the condensed cuts. */
export const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", axes: ["wdth"] });

export const fontClassName = `${inter.variable} ${jetbrains.variable} ${archivo.variable}`;
