"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getClientNetwork,
  setClientNetwork,
  type ClientNetworkId,
} from "@/lib/stellar/clientConfig";

const LABELS: Record<ClientNetworkId, string> = {
  testnet: "Testnet",
  mainnet: "Mainnet",
};

export function NetworkSwitcher() {
  const router = useRouter();
  const [network, setNetwork] = useState<ClientNetworkId>("testnet");

  useEffect(() => {
    setNetwork(getClientNetwork().id);
  }, []);

  function change(id: ClientNetworkId) {
    if (id === network) return;
    setClientNetwork(id);
    setNetwork(id);
    // server pages re-render with the new cookie; live streams reconnect on reload
    window.location.reload();
    void router;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-dim transition-colors duration-150 hover:text-foreground"
          aria-label="Switch network"
        >
          {LABELS[network]}
          <ChevronDown className="size-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(LABELS) as ClientNetworkId[]).map((id) => (
          <DropdownMenuItem
            key={id}
            onClick={() => change(id)}
            className="text-sm"
          >
            <span className="flex-1">{LABELS[id]}</span>
            {id === network && <Check className="size-3.5" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
