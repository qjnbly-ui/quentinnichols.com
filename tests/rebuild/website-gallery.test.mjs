import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlbum } from "../../src/lib/website-gallery.ts";
import { resized, photoSources } from "../../src/lib/images.ts";

const website = "851e334c-2ed7-4c82-9690-27f9ff8792d4";
const storage = `https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/${website}/`;
const album = (photos) => ({ id: "a", title: "Photography", slug: "photography", revision: 1, photos });

test("N3XRA album photos are accepted only from this website's storage, in album order", () => {
  const parsed = parseAlbum(
    album([
      { id: "2", url: `${storage}b/v1-second.jpg`, alt: "Second", position: 1 },
      { id: "1", url: `${storage}a/v1-first.jpg`, alt: null, position: 0 },
    ]),
    website,
  );
  assert.deepEqual(
    parsed.photos.map((photo) => photo.id),
    ["1", "2"],
  );
  assert.throws(() =>
    parseAlbum(album([{ id: "x", url: "https://example.com/photo.jpg", alt: "", position: 0 }]), website),
  );
  const otherSite = storage.replace(website, "00000000-0000-4000-8000-000000000000");
  assert.throws(() => parseAlbum(album([{ id: "x", url: `${otherSite}x.jpg`, alt: "", position: 0 }]), website));
  assert.throws(() => parseAlbum({ title: 1 }, website));
});

test("resized copies keep proportions and leave other images alone", () => {
  const url = `${storage}a/v1-first.jpg`;
  assert.match(resized(url, 800), /\/render\/image\/public\/.*width=800&height=3200&resize=contain/);
  assert.equal(resized("/images/local.webp", 800), "/images/local.webp");
  const sources = photoSources(url);
  assert.match(sources.srcset, /width=400.* 400w, .*width=800.* 800w, .*width=1200.* 1200w$/);
  assert.match(sources.large, /width=2000&height=2000/);
});
