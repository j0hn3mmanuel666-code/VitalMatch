// Verified municipal centers, Oriental Mindoro (Wikipedia / PhilAtlas). Used ONLY as
// approximate fallback pins when a record has no GPS coordinates.
export const MUNICIPALITY_COORDS = {
  "baco": [13.3580, 121.0965],
  "bansud": [12.8602, 121.4560],
  "bongabong": [12.7452, 121.4866],
  "bulalacao": [12.3254, 121.3435],
  "san pedro": [12.3254, 121.3435],
  "calapan": [13.4070, 121.1778],
  "gloria": [12.9700, 121.4778],
  "mansalay": [12.5198, 121.4383],
  "naujan": [13.3242, 121.3030],
  "pinamalayan": [13.0387, 121.4801],
  "pola": [13.1435, 121.4416],
  "puerto galera": [13.5018, 120.9541],
  "roxas": [12.5898, 121.5167],
  "san teodoro": [13.4365, 121.0199],
  "socorro": [13.0562, 121.4060],
  "victoria": [13.1733, 121.2787]
};

export const PROVINCE_CENTER = [12.95, 121.30];

// Philippine Red Cross chapters / centers (static, public information)
export const RED_CROSS_PINS = [
  {
    name: "PRC Oriental Mindoro Chapter",
    address: "Capitol Complex, Camilmil, Calapan City",
    phone: "(043) 286-7173",
    lat: 13.4070,
    lng: 121.1778
  }
];

export function normalizeCity(city) {
  if (!city) return "";
  return String(city).toLowerCase().replace(/city$/i, "").trim();
}

// Small edit-distance matcher so typos like "calapa" still resolve to Calapan
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[n];
}

export function cityCenter(city) {
  const name = normalizeCity(city);
  if (!name) return null;
  if (MUNICIPALITY_COORDS[name]) {
    const coords = MUNICIPALITY_COORDS[name];
    return { lat: coords[0], lng: coords[1] };
  }
  // Prefix / substring match ("cal" -> Calapan, "galera" -> Puerto Galera).
  // Substring matching needs 4+ chars so short inputs do not match everywhere.
  for (const key of Object.keys(MUNICIPALITY_COORDS)) {
    if (key.startsWith(name) || name.startsWith(key)) {
      const coords = MUNICIPALITY_COORDS[key];
      return { lat: coords[0], lng: coords[1] };
    }
    if (name.length >= 4 && (key.includes(name) || name.includes(key))) {
      const coords = MUNICIPALITY_COORDS[key];
      return { lat: coords[0], lng: coords[1] };
    }
  }
  // Typo tolerance: closest key within 2 edits
  let best = null;
  let bestDist = 3;
  for (const key of Object.keys(MUNICIPALITY_COORDS)) {
    const dist = levenshtein(name, key);
    if (dist < bestDist) {
      bestDist = dist;
      best = key;
    }
  }
  if (best) {
    const coords = MUNICIPALITY_COORDS[best];
    return { lat: coords[0], lng: coords[1] };
  }
  return null;
}

export function hasCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 || ln === 0) return false;
  if (la < 4 || la > 21 || ln < 116 || ln > 127) return false;
  return true;
}

// Exact GPS when present, otherwise approximate city-center fallback.
export function resolveCoords(lat, lng, city) {
  if (hasCoords(lat, lng)) return { lat: Number(lat), lng: Number(lng), approximate: false };
  const fallback = cityCenter(city);
  if (fallback) return { lat: fallback.lat, lng: fallback.lng, approximate: true };
  return { lat: PROVINCE_CENTER[0], lng: PROVINCE_CENTER[1], approximate: true };
}
