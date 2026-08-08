/**
 * Strip common tracking query parameters from a URL before it is ever shown
 * to the user or considered for storage (Plane D.2: "source_url... stripped
 * of tracking parameters"). Best-effort — an unparsable string is returned
 * unchanged rather than thrown on.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^igshid$/i,
  /^mc_(eid|cid)$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^ref_url$/i,
  /^spm$/i,
  /^si$/i, // YouTube/Spotify share-tracking id
];

export function stripTrackingParams(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const keep = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (!TRACKING_PARAMS.some((re) => re.test(key))) keep.append(key, value);
  }
  parsed.search = keep.toString();
  return parsed.toString();
}
