"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches a crash while the WebGL canvas is created or rendered (R3F rethrows its errors, including
 * "Error creating WebGL context.", into its parent) and hands it to the gate's recovery.
 */
export class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
