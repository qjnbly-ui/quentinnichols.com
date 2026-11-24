/** Resized copies of images held in N3XRA website storage (Supabase image transformations). */
const PUBLIC_OBJECT = "/storage/v1/object/public/";
const RENDER_IMAGE = "/storage/v1/render/image/public/";

/**
 * `resize=contain` keeps the photo's proportions. The tall default height limit means the width always
 * wins, so `w` descriptors in a srcset are accurate for any photo shape. Other URLs pass through untouched.
 */
export function resized(src: string, width: number, height = width * 4) {
  return src.includes(PUBLIC_OBJECT)
    ? `${src.replace(PUBLIC_OBJECT, RENDER_IMAGE)}?width=${width}&height=${height}&resize=contain&quality=72`
    : src;
}

export const gridWidths = [400, 800, 1200];
export const gridSizes = "(max-width: 640px) calc(100vw - 32px), (max-width: 1000px) 50vw, 400px";

/** The grid image, its srcset, and the large copy shown in the photo viewer. */
export function photoSources(src: string) {
  return {
    src: resized(src, 800),
    srcset: gridWidths.map((width) => `${resized(src, width)} ${width}w`).join(", "),
    large: resized(src, 2000, 2000),
  };
}
