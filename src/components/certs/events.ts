/** Window event that opens the shared certification preview (Page View rows and the 3D Lobby wall). */
export const CERT_EVENT = "hq:cert";

export function openCertPreview(id: string) {
  window.dispatchEvent(new CustomEvent<string>(CERT_EVENT, { detail: id }));
}

export function onCertPreview(listener: (id: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(CERT_EVENT, handler);
  return () => window.removeEventListener(CERT_EVENT, handler);
}
