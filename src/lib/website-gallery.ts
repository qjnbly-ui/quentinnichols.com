/**
 * N3XRA Website Gallery: a public album of photos held in this website's N3XRA storage.
 * GET https://www.n3xra.com/api/website-gallery?website=<website id>&album=<album slug>
 */
export interface AlbumPhoto {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}
export interface Album {
  title: string;
  slug: string;
  photos: AlbumPhoto[];
}

const STORAGE = "https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;

/** Accepts only photos that live in this website's own public N3XRA storage. */
export function parseAlbum(value: unknown, websiteId: string): Album {
  const data = value as Partial<Album> | null;
  if (!data || typeof data.title !== "string" || !Array.isArray(data.photos) || data.photos.length > 500)
    throw new Error("Invalid album");
  const prefix = `${STORAGE}${websiteId}/`;
  const photos = data.photos.map((photo) => {
    if (!photo || typeof photo.id !== "string" || typeof photo.url !== "string" || !photo.url.startsWith(prefix))
      throw new Error("Invalid album photo");
    return { id: photo.id, url: photo.url, alt: typeof photo.alt === "string" ? photo.alt : null, position: Number(photo.position) || 0 };
  });
  photos.sort((a, b) => a.position - b.position);
  return { title: data.title, slug: String(data.slug || ""), photos };
}

export async function loadAlbum(websiteId: string, slug: string): Promise<Album> {
  if (!UUID.test(websiteId) || !SLUG.test(slug)) throw new Error("Invalid album address");
  const response = await fetch(
    `https://www.n3xra.com/api/website-gallery?website=${encodeURIComponent(websiteId)}&album=${encodeURIComponent(slug)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error("This album is unavailable");
  return parseAlbum(await response.json(), websiteId);
}
