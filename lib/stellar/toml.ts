import "server-only";

// SEP-1 stellar.toml lookup. Lenient on purpose, plenty of issuer tomls are
// broken. Cached a day, fails quietly
export interface TomlCurrency {
  code: string;
  issuer: string;
  image: string | null;
}

export interface TomlOrgInfo {
  orgName: string | null;
  currencies: TomlCurrency[];
}

const field = (block: string, name: string) =>
  block.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]{1,300})"`, "m"))?.[1] ?? null;

// [[CURRENCIES]] tables, read the same lenient way as ORG_NAME
function parseCurrencies(text: string): TomlCurrency[] {
  return text
    .split(/^\s*\[\[CURRENCIES\]\]\s*$/m)
    .slice(1)
    .map((block) => block.split(/^\s*\[/m)[0])
    .flatMap((block) => {
      const code = field(block, "code");
      const issuer = field(block, "issuer");
      const image = field(block, "image");
      if (!code || !issuer) return [];
      return [{ code, issuer, image: image?.startsWith("https://") ? image : null }];
    });
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
    return { orgName, currencies: parseCurrencies(text) };
  } catch {
    return null;
  }
}
