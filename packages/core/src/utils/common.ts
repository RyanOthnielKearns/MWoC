export function normalizeProbeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Connection timed out";
    return err.message || err.name;
  }
  return String(err);
}

export async function wrapProbe<T>(
  fn: () => Promise<T>,
  onFailure: (err: any) => T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    return onFailure(err);
  }
}
