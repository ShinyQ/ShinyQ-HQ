/**
 * Cheap keyword heuristic for obviously harmful requests (T15). Llama Guard is skipped by owner
 * decision (no extra cost), so these go straight to the decline message without a model call.
 * The decline text never repeats the request.
 */

const PATTERNS: RegExp[] = [
  // Violence and weapons
  /\b(make|build|create|assemble|buat|membuat|merakit)\b.{0,30}\b(bomb|bombs|explosives?|bom|peledak|molotov|gun|senjata|weapon)\b/i,
  /\b(kill|murder|poison|stab|shoot|bunuh|membunuh|racun|meracuni|tembak)\b.{0,30}\b(him|her|them|someone|people|person|orang|dia|mereka|kurniadi)\b/i,
  // Self-harm
  /\b(suicide|self[- ]?harm|kill myself|end my life|bunuh diri|melukai diri|mengakhiri hidup)\b/i,
  // Illegal drugs and crime how-tos
  /\b(cook|make|synthesi[sz]e|buy|beli|membuat|meracik)\b.{0,30}\b(meth|cocaine|heroin|fentanyl|sabu|narkoba|ganja|ekstasi)\b/i,
  /\b(how (do i|to|can i)|cara|teach me|ajari|help me|bantu)\b.{0,30}\b(hack|retas|meretas|bobol|membobol|ddos|phish|curi|steal)\b/i,
  /\b(write|create|buat|membuat)\b.{0,30}\b(malware|ransomware|keylogger|virus|trojan|exploit)\b/i,
  // Sexual content and minors
  /\b(porn|porno|nude|nudes|telanjang|sex|seks|bokep)\b/i,
  /\b(child|children|minor|anak)\b.{0,20}\b(sexual|seksual|explicit)\b/i,
  // Hate
  /\b(hate|benci)\b.{0,20}\b(jews|muslims|christians|blacks|chinese|cina|yahudi|kafir)\b/i,
];

export function isHarmful(question: string): boolean {
  return PATTERNS.some((re) => re.test(question));
}
