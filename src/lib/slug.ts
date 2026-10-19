const reservedSlugs = new Set([
  "www", "app", "api", "admin", "mail", "static", "assets", "support", "help", "status",
  "billing", "account", "accounts", "auth", "sign-in", "sign-up", "login", "register", "docs",
  "blog", "cdn", "ftp", "smtp", "imap", "pop", "dev", "staging", "test", "root",
])

const transliteration: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ö: "o", ő: "o", ú: "u", ü: "u", ű: "u",
  Á: "a", É: "e", Í: "i", Ó: "o", Ö: "o", Ő: "o", Ú: "u", Ü: "u", Ű: "u",
}

export function suggestSlug(value: string): string {
  const ascii = [...value].map((character) => transliteration[character] ?? character).join("")
  return ascii
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
}

export function validateSlug(value: string): { valid: boolean; reason?: "format" | "reserved" } {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(value)) {
    return { valid: false, reason: "format" }
  }
  if (reservedSlugs.has(value)) return { valid: false, reason: "reserved" }
  return { valid: true }
}

export function getTenantSlugFromHost(host: string, rootDomain = process.env.ROOT_DOMAIN || "localhost:3000"): string | null {
  const normalizedHost = host.toLowerCase().split(",")[0]?.trim().replace(/\.$/, "") ?? ""
  const normalizedRoot = rootDomain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\.$/, "")
  if (!normalizedHost || !normalizedRoot || normalizedHost === normalizedRoot) return null
  const suffix = `.${normalizedRoot}`
  if (!normalizedHost.endsWith(suffix)) return null
  const subdomain = normalizedHost.slice(0, -suffix.length)
  if (subdomain.includes(".")) return null
  return validateSlug(subdomain).valid ? subdomain : null
}

export { reservedSlugs }
