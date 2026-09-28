import Link from "next/link";
import { BlockchainMenu } from "./BlockchainMenu";
import { DefiMenu } from "./DefiMenu";
import { cn } from "@/lib/utils";

const item =
  "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-dim transition-colors duration-150 hover:bg-surface-2 hover:text-foreground";

export function MainNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Sections" className={cn("flex items-center gap-1", className)}>
      <BlockchainMenu triggerClassName={item} />
      <Link href="/assets" className={item}>
        Assets
      </Link>
      <DefiMenu triggerClassName={item} />
      <Link href="/analytics" className={item}>
        Analytics
      </Link>
      <Link href="/#network" className={item}>
        Network
      </Link>
    </nav>
  );
}
