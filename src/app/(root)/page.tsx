/**
 * "/" is a static page: it redirects by the remembered choice
 * (localStorage "hq:locale") or navigator.language, and links both locales
 * for no-JS visitors and crawlers (spec appendix 04 section 4).
 */
import Link from "next/link";

const REDIRECT_SCRIPT = `(function(){try{var s=localStorage.getItem("hq:locale");var l=s==="en"||s==="id"?s:((navigator.languages&&navigator.languages[0])||navigator.language||"en").toLowerCase().indexOf("id")===0?"id":"en";location.replace("/"+l+location.search+location.hash);}catch(e){location.replace("/en");}})();`;

export default function RootPage() {
  return (
    <main className="glass mx-4 max-w-md p-8 text-center">
      <script dangerouslySetInnerHTML={{ __html: REDIRECT_SCRIPT }} />
      <p className="label mb-3 text-cyan">ShinyQ HQ</p>
      <h1 className="text-2xl font-extrabold text-ink">Kurniadi Ahmad Wijaya</h1>
      <p className="mt-2 text-ink-2">Software Engineer and AI Engineer (Azure)</p>
      <ul className="mt-6 flex justify-center gap-3">
        <li>
          <Link href="/en" hrefLang="en" className="link">
            English
          </Link>
        </li>
        <li>
          <Link href="/id" hrefLang="id" className="link">
            Bahasa Indonesia
          </Link>
        </li>
      </ul>
    </main>
  );
}
