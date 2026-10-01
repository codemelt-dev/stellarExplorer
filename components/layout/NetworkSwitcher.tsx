"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePointerMenu } from "./usePointerMenu";
import {
  getClientNetwork,
  setClientNetwork,
  type ClientNetworkId,
} from "@/lib/stellar/clientConfig";
import { StellarMark } from "@/components/stellar/StellarMark";
import { iconButton } from "./iconButton";
import { cn } from "@/lib/utils";

const LABELS: Record<ClientNetworkId, string> = {
  mainnet: "Stellar Mainnet",
  testnet: "Stellar Testnet",
};

export function NetworkSwitcher() {
  const menu = usePointerMenu();
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
          {...menu.trigger}
          className={iconButton}
          aria-label={`Network: ${LABELS[network]}. Switch network`}
          title={LABELS[network]}
        >
          <StellarMark className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...menu.content} align="end" sideOffset={8} className="w-48 p-1.5">
        <NetworkItem id="mainnet" active={network} onPick={change} />
        <DropdownMenuSeparator className="my-1.5" />
        <NetworkItem id="testnet" active={network} onPick={change} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NetworkItem({
  id,
  active,
  onPick,
}: {
  id: ClientNetworkId;
  active: ClientNetworkId;
  onPick: (id: ClientNetworkId) => void;
}) {
  return (
    <DropdownMenuItem
      onClick={() => onPick(id)}
      aria-current={id === active ? "true" : undefined}
      className={cn("px-2.5 py-2 text-sm", id === active && "font-medium text-gold focus:text-gold")}
    >
      {LABELS[id]}
    </DropdownMenuItem>
  );
}
