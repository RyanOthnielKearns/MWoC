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
