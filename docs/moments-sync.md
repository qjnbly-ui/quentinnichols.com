# Moments photo collection

Quentin approved copying 300 selected personal still photos from his private Google Photos album into N3XRA and publishing display copies on his website on October 18, 2026. The Google Photos album remains private. No Google Photos image links, account cookies, or source album identifiers belong in the public feed.

After review, 33 photos were excluded for smoking, alcohol, text overlays/screenshots, borderline scenes, or presentation. The published collection contains 267 reviewed photos. Excluded assets are archived in N3XRA; source originals remain intact.

## Storage and presentation

The collection belongs to the existing Quentin Nichols website in N3XRA Website Files & Assets, under **Moments from my phone**. Metadata-free website copies are stored in `website-assets-private`; published display copies are stored in `website-assets-public`. Full-resolution source photos remain in the private Google Photos album and the user’s Desktop export. The private website copies and public display copies strip EXIF, embedded thumbnails, and camera GPS metadata. The public feed includes only rounded map coordinates where recorded location metadata exists. Missing dates and locations remain unknown.

The gallery is `/moments/`, accessible through the site navigation. It reads `/api/moments-feed` every minute. The handler joins the existing anonymous N3XRA published asset manifest with the explicitly reviewed identities and rounded metadata in `moments/feed.json`. Archived/unpublished assets disappear from the public manifest. Adding files to storage alone does not publish them: the reviewed identity list must also be updated. Published versions of reviewed assets update automatically. No recurring import or direct Google Photos synchronization is configured.

## N3XRA Maps

The map uses the reusable N3XRA photo map component and existing basemap configuration. It automatically reads the embedding website’s logo, name, and theme. It includes required basemap attribution. Map view fits the viewport while preserving map pan and zoom; Photos view scrolls normally.

The canonical component and data helpers live in N3XRA `maps-app/src/components/PhotoMap.tsx`, `maps-app/src/lib/photo-map-data.ts`, and `maps-app/src/embeds/photo-map.tsx`. Rebuild website JS and CSS using `scripts/build-photo-map.mjs` in the N3XRA repository, passing the target website’s map asset path.

## Future imports

Use a reviewed local export rather than private Google Photos image URLs, which are not reliable public website image sources. Accept only selected still images; exclude video and motion companions. Keep the source export intact and create metadata-free website copies. Verify every upload before publishing the feed. Register one asset and published version per still in the existing website assets system. Bulk publication must not generate per-file email or SMS review notifications.

This initial collection was uploaded and published through the existing signed-in N3XRA administrator Files interface. Future import code must use an appropriately authorized server environment or the existing signed-in workflow. Never put service credentials or temporary upload capabilities in the website, repository, or public feed. Temporary import access must expire and be revoked when the import completes.

## Travel additions — October 19, 2026

Added 45 reviewed still photos from New Zealand, Hawaii, and North Carolina, plus restored the New Zealand meal photo after Quentin allowed drinks in New Zealand images. Smoking and text screenshots remain excluded. The reviewed metadata list now contains 313 photos; only assets still published in N3XRA are displayed. Duplicate-looking castle and plane views and a tilted tractor shot were left out. The default gallery order is a stable mix across dates and places; newest and oldest remain optional.
