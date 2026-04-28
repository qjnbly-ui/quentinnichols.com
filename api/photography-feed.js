const BUCKET = "quentinnichols.com";
const PREFIX_CANDIDATES = [
  "photography",
  "quentinnichols.com/photography",
  "quentinnichols.com/quentinnichols.com/photography",
];
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

function isImageName(name) {
  const lower = String(name || "").toLowerCase();
  return Array.from(IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext));
}

function buildPublicUrl(baseUrl, bucket, objectPath) {
  const encodedPath = objectPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
}

async function listObjects(supabaseUrl, supabaseAnonKey, prefix) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(BUCKET)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        prefix,
        limit: 200,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Unable to list storage objects: ${detail || response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY." }));
    return;
  }

  try {
    const imageMap = new Map();
    const addObjects = (objects, category, rootPrefix) => {
      objects
        .filter((item) => item && isImageName(item.name))
        .forEach((item) => {
          const objectPath = `${rootPrefix}/${category}/${item.name}`;
          const url = buildPublicUrl(supabaseUrl, BUCKET, objectPath);
          imageMap.set(url, {
            category,
            name: item.name,
            url,
          });
        });
    };

    for (const rootPrefix of PREFIX_CANDIDATES) {
      const [landscapes, portraits] = await Promise.all([
        listObjects(supabaseUrl, supabaseAnonKey, `${rootPrefix}/landscapes`),
        listObjects(supabaseUrl, supabaseAnonKey, `${rootPrefix}/portraits`),
      ]);
      addObjects(landscapes, "landscapes", rootPrefix);
      addObjects(portraits, "portraits", rootPrefix);
    }

    const images = Array.from(imageMap.values());
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ images }));
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Failed to load photography feed." }));
  }
};
