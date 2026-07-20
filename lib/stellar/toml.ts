import "server-only";

// SEP-1 stellar.toml lookup. Lenient on purpose, plenty of issuer tomls are
// broken. Cached a day, fails quietly
export interface TomlOrgInfo {
  orgName: string | null;
}

export async function fetchTomlOrgInfo(
  homeDomain: string | undefined,
): Promise<TomlOrgInfo | null> {
  if (!homeDomain || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(homeDomain)) {
    return null;
  }
  try {
    const res = await fetch(
      `https://${homeDomain}/.well-known/stellar.toml`,
      {
        signal: AbortSignal.timeout(3000),
        next: { revalidate: 86_400 },
      },
    );
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, 200_000);
    const orgName =
      text.match(/^\s*ORG_NAME\s*=\s*"([^"]{1,80})"/m)?.[1] ?? null;
    return { orgName };
  } catch {
    return null;
  }
}
