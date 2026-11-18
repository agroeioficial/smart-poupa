export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-MZ", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-MZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function errorMessage(err: unknown, fallback = "Ocorreu um erro. Tente novamente.") {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    const m = err.message;
    if (/Invalid login credentials/i.test(m)) return "Email ou palavra-passe incorretos.";
    if (/Email not confirmed/i.test(m)) return "Confirme o seu email antes de entrar.";
    if (/User already registered/i.test(m)) return "Já existe uma conta com este email.";
    if (/Password should be/i.test(m)) return "A palavra-passe deve ter pelo menos 8 caracteres.";
    if (/rate limit/i.test(m)) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
    if (/permission denied|row-level security/i.test(m)) return "Sem permissão para esta operação.";
    if (/fetch|network/i.test(m)) return "Sem ligação. Verifique a internet e tente novamente.";
    return m;
  }
  return fallback;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
