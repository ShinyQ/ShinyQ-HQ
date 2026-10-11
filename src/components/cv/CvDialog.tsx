"use client";

import { useId } from "react";
import { Modal } from "../Modal";
import { CvViewer } from "./CvViewer";

/** CV viewer modal (lazy chunk, opened by `DialogHost` on the `hq:hud` "cv" command). */
export default function CvDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Modal labelledBy={titleId} onClose={onClose} width="lg" testId="cv-dialog">
      <CvViewer variant="modal" titleId={titleId} onClose={onClose} />
    </Modal>
  );
}
