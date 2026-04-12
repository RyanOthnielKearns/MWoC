export function longestPrefixMatch<T>(
  input: string,
  map: Array<{ prefix: string; value: T }>
): T | null {
  const lower = input.toLowerCase();
  const sorted = [...map].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const entry of sorted) {
    if (lower.startsWith(entry.prefix.toLowerCase())) return entry.value;
  }
  return null;
}

export const sortedLongestPrefixMatch = longestPrefixMatch;
