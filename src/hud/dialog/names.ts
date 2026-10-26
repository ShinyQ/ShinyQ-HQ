/** The first word of a name (Rover's lines say "Kurniadi's HQ"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
