/**
 * Picks recommended reads for an entry: entries on the same topic first, then those written closest
 * in time, with a slight preference for entries that have a photo. The entry itself is never included.
 */
export interface Candidate {
  url: string;
  slug: string;
  cover?: string | null;
}

export function recommend<T extends Candidate>(list: T[], currentUrl: string, count = 3): T[] {
  const index = list.findIndex((item) => item.url === currentUrl);
  if (index < 0) return list.slice(0, count);
  const current = list[index]!;
  return list
    .map((item, position) => ({
      item,
      score: (item.slug === current.slug ? 0 : 100) + Math.abs(position - index) + (item.cover ? 0 : 3),
    }))
    .filter(({ item }) => item.url !== currentUrl)
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(({ item }) => item);
}
