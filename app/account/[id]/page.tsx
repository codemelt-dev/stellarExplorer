import type { Metadata } from "next";
import { SearchX, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Identicon } from "@/components/stellar/Identicon";
import { CopyButton } from "@/components/stellar/CopyButton";
import { BalancesCard } from "@/components/account/BalancesCard";
import { HistoryFeed } from "@/components/account/HistoryFeed";
import { DetailsAccordion } from "@/components/account/DetailsAccordion";
import { MyActivity } from "@/components/account/MyActivity";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { activeNetwork } from "@/lib/stellar/network";
import {
  getAccount,
  getAccountOperations,
  resolveMuxed,
  type HistoryFilter,
} from "@/lib/stellar/accounts";
import { NotFoundError } from "@/lib/stellar/transactions";
import { fetchTomlOrgInfo } from "@/lib/stellar/toml";
import { truncateKey } from "@/lib/stellar/strkey";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Account ${truncateKey(id, 6)} · Stellar Explorer` };
}

const VALID_FILTERS = new Set(["all", "payments", "trades", "contracts"]);

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    filter?: string;
    cursor?: string;
    dir?: string;
    limit?: string;
  }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const filter: HistoryFilter = VALID_FILTERS.has(query.filter ?? "")
    ? (query.filter as HistoryFilter)
    : "all";
  const limit = [10, 25, 50].includes(Number(query.limit))
    ? Number(query.limit)
    : 10;
  const direction = query.dir === "newer" ? ("newer" as const) : ("older" as const);

  const netLabel = (await activeNetwork()).label.toLowerCase();
  const muxed = resolveMuxed(id);
  const accountId = muxed?.base ?? id;

  let account;
  let ops;
  try {
    [account, ops] = await Promise.all([
      getAccount(accountId),
      getAccountOperations(accountId, {
        cursor: query.cursor,
        direction,
        limit,
        filter,
      }),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <EmptyState
          icon={SearchX}
          message={`Account ${truncateKey(accountId, 8)} doesn't exist on ${netLabel}. It may live on another network, or it hasn't been funded yet.`}
          className="py-24"
        />
      );
    }
    return (
      <ErrorState
        message="Horizon didn't respond while loading this account."
        className="py-24"
      />
    );
  }

  const toml = await fetchTomlOrgInfo(account.home_domain);

  return (
    <div className="flex flex-col gap-6">
      {/* Identity: who this is */}
      <div className="flex items-start gap-4">
        <Identicon
          address={accountId}
          size={44}
          className="mt-1 shrink-0 rounded-md bg-surface p-1.5"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {toml?.orgName ?? "Account"}
          </h1>
          <div className="flex items-center gap-1.5">
            <span
              className="truncate font-mono text-sm text-dim"
              title={accountId}
            >
              {accountId}
            </span>
            <CopyButton value={accountId} label="Copy account address" />
          </div>
          {account.home_domain && (
            <a
              href={`https://${account.home_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm text-gold hover:underline underline-offset-4"
            >
              <Globe className="size-3.5" aria-hidden="true" />
              {account.home_domain}
            </a>
          )}
        </div>
      </div>

      {muxed && (
        <Card className="gap-1 border-l-2 border-l-gold p-4">
          <span className="text-xs uppercase tracking-wider text-dim">
            Muxed account
          </span>
          <p className="text-sm">
            <span className="font-mono">{truncateKey(id, 8)}</span> is virtual
            account <span className="font-mono">id {muxed.muxedId}</span> of the
            base account shown here.
          </p>
        </Card>
      )}

      <MyActivity accountId={accountId} />

      <div className="grid gap-6 md:grid-cols-2">
        <BalancesCard balances={account.balances} />
        <DetailsAccordion account={account} />
      </div>
      <HistoryFeed
        baseHref={`/account/${id}`}
        page={ops}
        filter={filter}
        limit={limit}
        selfAddress={accountId}
      />
    </div>
  );
}
