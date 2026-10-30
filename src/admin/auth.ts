async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

export async function passwordMatches(provided: string, expected: string | undefined): Promise<boolean> {
  if (!expected || !provided) return false;
  const [left, right] = await Promise.all([digest(provided), digest(expected)]);
  return crypto.subtle.timingSafeEqual(left, right);
}

// Scripts can still call the admin API with "Authorization: Bearer <ADMIN_TOKEN>".
export async function adminAuthorized(request: Request, expected: string | undefined): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return passwordMatches(provided, expected);
}
