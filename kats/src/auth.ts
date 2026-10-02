async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

export async function passwordMatches(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(provided), digest(expected)]);
  return crypto.subtle.timingSafeEqual(left, right);
}
