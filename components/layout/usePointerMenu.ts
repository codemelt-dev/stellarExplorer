"use client";

import { useRef } from "react";

// radix hands focus back to the trigger on close, which paints the focus ring after a mouse click.
// keep that for keyboard users, skip it when the menu was opened with a pointer
export function usePointerMenu() {
  const byPointer = useRef(false);
  return {
    trigger: {
      onPointerDown: () => {
        byPointer.current = true;
      },
      onKeyDown: () => {
        byPointer.current = false;
      },
    },
    content: {
      onCloseAutoFocus: (e: Event) => {
        if (byPointer.current) e.preventDefault();
      },
    },
  };
}
