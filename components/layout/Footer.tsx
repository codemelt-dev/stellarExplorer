import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/50 text-xs text-dim">
      <div className="mx-auto flex h-12 w-full max-w-300 items-center gap-4 px-4 sm:px-6">
        <span>Astrolabe, a Stellar explorer</span>
        <Link href="/privacy" className="ml-auto hover:text-foreground">
          Privacy
        </Link>
      </div>
    </footer>
  );
}
