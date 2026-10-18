/** Lazy chunks of the site-wide modals; entry points call these on hover or focus to preload. */
export const loadCvDialog = () => import("./cv/CvDialog");
export const loadPaperDialog = () => import("./paper/PaperDialog");
export const loadCertDialog = () => import("./certs/CertDialog");
export const loadGuideDialog = () => import("./guides/GuideDialog");

export function preloadCvDialog() {
  void loadCvDialog();
}

export function preloadPaperDialog() {
  void loadPaperDialog();
}

export function preloadCertDialog() {
  void loadCertDialog();
}

export function preloadGuideDialog() {
  void loadGuideDialog();
}
