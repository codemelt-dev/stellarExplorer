import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Address } from "@/components/stellar/Address";
import { Amount } from "@/components/stellar/Amount";
import { EmptyState } from "@/components/states/EmptyState";
import { stroopsToLumens } from "@/lib/stellar/amount";
import type { EffectRecord } from "@/lib/stellar/transactions";
import type { TokenMovement } from "@/lib/stellar/xdrDecode";
import { truncateKey } from "@/lib/stellar/strkey";
import { cn } from "@/lib/utils";

type AnyEffect = EffectRecord & Record<string, unknown>;

interface ChangeRow {
  account: string;
  direction: "in" | "out" | "neutral";
  label: string;
  amount: string | null;
  assetCode: string;
  assetIssuer?: string;
}

function str(e: AnyEffect, k: string): string {
  const v = e[k];
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}

function asset(e: AnyEffect, prefix = "asset"): { code: string; issuer?: string } {
  const type = str(e, `${prefix}_type`);
  if (!type || type === "native") return { code: "XLM" };
  return { code: str(e, `${prefix}_code`), issuer: str(e, `${prefix}_issuer`) };
}

// effects -> readable per-account changes. Not every effect moves money;
// the interesting non-monetary ones become neutral rows
function toRows(effects: EffectRecord[]): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const record of effects) {
    const e = record as AnyEffect;
    const account = str(e, "account");
    switch (record.type as string) {
      case "account_credited":
      case "contract_credited": {
        const a = asset(e);
        rows.push({
          account: str(e, "contract") || account,
          direction: "in",
          label: "received",
          amount: str(e, "amount"),
          assetCode: a.code,
          assetIssuer: a.issuer,
        });
        break;
      }
      case "account_debited":
      case "contract_debited": {
        const a = asset(e);
        rows.push({
          account: str(e, "contract") || account,
          direction: "out",
          label: "sent",
          amount: str(e, "amount"),
          assetCode: a.code,
          assetIssuer: a.issuer,
        });
        break;
      }
      case "account_created":
        rows.push({
          account,
          direction: "in",
          label: "account created",
          amount: str(e, "starting_balance"),
          assetCode: "XLM",
        });
        break;
      case "trade": {
        const bought = asset(e, "bought_asset");
        rows.push({
          account,
          direction: "in",
          label: "trade filled",
          amount: str(e, "bought_amount"),
          assetCode: bought.code,
          assetIssuer: bought.issuer,
        });
        const sold = asset(e, "sold_asset");
        rows.push({
          account,
          direction: "out",
          label: "trade filled",
          amount: str(e, "sold_amount"),
          assetCode: sold.code,
          assetIssuer: sold.issuer,
        });
        break;
      }
      case "trustline_created":
      case "trustline_removed":
      case "trustline_updated": {
        const a = asset(e);
        rows.push({
          account,
          direction: "neutral",
          label: `trustline ${record.type.split("_")[1]} (${a.code})`,
          amount: null,
          assetCode: a.code,
        });
        break;
      }
      case "signer_created":
      case "signer_removed":
      case "signer_updated":
        rows.push({
          account,
          direction: "neutral",
          label: record.type.replace(/_/g, " "),
          amount: null,
          assetCode: "",
        });
        break;
      default:
        break;
    }
  }
  return rows;
}

const MOVEMENT_LABEL: Record<
  TokenMovement["kind"],
  { in: string; out: string }
> = {
  transfer: { in: "received", out: "sent" },
  mint: { in: "minted", out: "minted" },
  burn: { in: "burned", out: "burned" },
  clawback: { in: "clawed back", out: "clawed back" },
};

// SAC / token movements decoded from contract events (Horizon effects omit them)
function movementRows(movements: TokenMovement[]): ChangeRow[] {
  return movements.map((m) => ({
    account: m.account,
    direction: m.direction,
    label: MOVEMENT_LABEL[m.kind][m.direction],
    amount: stroopsToLumens(m.amount),
    assetCode: truncateKey(m.token, 4),
  }));
}

export function BalanceChanges({
  effects,
  sorobanMovements = [],
  feeCharged,
  feeAccount,
  successful,
}: {
  effects: EffectRecord[];
  sorobanMovements?: TokenMovement[];
  feeCharged: string;
  feeAccount: string;
  successful: boolean;
}) {
  const rows = [...toRows(effects), ...movementRows(sorobanMovements)];

  return (
    <Card className="gap-3 p-5">
      {rows.length === 0 && (
        <EmptyState
          message={
            successful
              ? "No balance movements. This transaction changed state without moving assets."
              : "No balance changes. Failed transactions change nothing except the fee below."
          }
        />
      )}
      {rows.length > 0 && (
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)] items-center gap-x-4 border-b border-border pb-2 text-xs font-medium uppercase tracking-wider text-dim">
            <span>Account</span>
            <span>Effect</span>
            <span className="text-right">Change</span>
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid h-[44px] grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)] items-center gap-x-4 border-b border-border last:border-b-0"
            >
              <span className="min-w-0 truncate">
                <Address address={row.account} chars={6} />
              </span>
              <Badge variant="outline" className="w-fit font-mono text-[11px] text-dim">
                {row.label}
              </Badge>
              <span
                className={cn(
                  "text-right font-mono text-sm",
                  row.direction === "in" && "text-ok",
                  row.direction === "out" && "text-fail",
                )}
              >
                {row.amount ? (
                  <>
                    {row.direction === "in" ? "+" : row.direction === "out" ? "-" : ""}
                    <Amount
                      amount={row.amount}
                      assetCode={row.assetCode}
                      assetIssuer={row.assetIssuer}
                      className={cn(
                        row.direction === "in" && "text-ok",
                        row.direction === "out" && "text-fail",
                      )}
                    />
                  </>
                ) : (
                  <span className="text-dim">–</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* the fee always moves, even on failure */}
      <div className="grid grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)] items-center gap-x-4 border-t border-border pt-3">
        <span className="min-w-0 truncate">
          <Address address={feeAccount} chars={6} />
        </span>
        <Badge variant="outline" className="w-fit font-mono text-[11px] text-dim">
          network fee
        </Badge>
        <span className="text-right font-mono text-sm text-fail">
          -<Amount amount={stroopsToLumens(feeCharged)} className="text-fail" />
        </span>
      </div>
    </Card>
  );
}
