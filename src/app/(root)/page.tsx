/**
 * "/" is a static page: it redirects by the remembered choice
 * (localStorage "hq:locale") or navigator.language, and links both locales
 * for no-JS visitors and crawlers (spec appendix 04 section 4).
 */
import Link from "next/link";
import { getProfile } from "@/content/load";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";

const REDIRECT_SCRIPT = `(function(){try{var s=localStorage.getItem("hq:locale");var l=s==="en"||s==="id"?s:((navigator.languages&&navigator.languages[0])||navigator.language||"en").toLowerCase().indexOf("id")===0?"id":"en";location.replace("/"+l+location.search+location.hash);}catch(e){location.replace("/en");}})();`;

export default function RootPage() {
  const profile = getProfile();
  return (
    <main className="glass mx-4 max-w-md p-8 text-center">
      <script dangerouslySetInnerHTML={{ __html: REDIRECT_SCRIPT }} />
      <p className="label mb-3 text-cyan">{en.meta.siteName}</p>
      <h1 className="text-2xl font-extrabold text-ink">{profile.name}</h1>
      <p className="mt-2 text-ink-2">{profile.headline.en}</p>
      <ul className="mt-6 flex justify-center gap-3">
        <li>
          <Link href="/en" hrefLang="en" className="link">
            {en.blog.languageName.en}
          </Link>
        </li>
        <li>
          <Link href="/id" hrefLang="id" className="link">
            {id.blog.languageName.id}
          </Link>
        </li>
      </ul>
    </main>
  );
}
