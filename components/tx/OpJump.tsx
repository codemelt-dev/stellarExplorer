"use client";

import { useId, useState, type FormEvent } from "react";
import { CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// past this the numbered chips wrap into a wall, so a number input takes over
const CHIP_LIMIT = 12;

export function OpJump({ count }: { count: number }) {
  const id = useId();
  const [value, setValue] = useState("");

  if (count <= CHIP_LIMIT) {
    return (
      <nav className="flex max-w-full flex-wrap gap-1" aria-label="Jump to operation">
        {Array.from({ length: count }, (_, i) => (
          <a
            key={i}
            href={`#op-${i + 1}`}
            className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-dim transition-colors duration-150 hover:text-foreground"
          >
            {i + 1}
          </a>
        ))}
      </nav>
    );
  }

  function jump(e: FormEvent) {
    e.preventDefault();
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return;
    const target = Math.min(Math.max(n, 1), count);
    setValue(String(target));
    const hash = `#op-${target}`;
    if (window.location.hash === hash) {
      // same op again: no navigation happens, so tell the list to go there itself
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } else {
      // a real fragment navigation, so the card gets :target and the URL is shareable.
      // The paged list opens the right page and scrolls
      window.location.replace(hash);
    }
  }

  return (
    <form onSubmit={jump} className="flex items-center gap-2" aria-label="Jump to operation">
      <label
        htmlFor={id}
        className="sr-only text-xs uppercase tracking-wider text-dim sm:not-sr-only"
      >
        Jump to
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) =>
          setValue(e.target.value.replace(/\D/g, "").slice(0, String(count).length))
        }
        inputMode="numeric"
        enterKeyHint="go"
        autoComplete="off"
        placeholder="#"
        className="h-8 w-14 px-1.5 text-center font-mono tabular-nums"
      />
      <span className="text-sm text-dim tabular-nums">of {count}</span>
      <Button type="submit" variant="outline" size="icon-sm" aria-label="Go to operation">
        <CornerDownLeft />
      </Button>
    </form>
  );
}
