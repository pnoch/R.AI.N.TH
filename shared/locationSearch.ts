export type ProvinceTuple = readonly [
  provinceCode: number,
  provinceNameTh: string,
  provinceNameEn: string,
];

export type DistrictTuple = readonly [
  provinceCode: number,
  districtCode: number,
  districtNameTh: string,
  districtNameEn: string,
  postalCode: number | null,
  centerLat: number,
  centerLon: number,
];

export type SubdistrictTuple = readonly [
  provinceCode: number,
  districtCode: number,
  subdistrictCode: number,
  subdistrictNameTh: string,
  subdistrictNameEn: string,
  postalCode: number | null,
  centerLat: number,
  centerLon: number,
];

export type ProvinceSearchRecord = {
  iso: string;
  nameTh: string;
  nameEn: string;
};

export type LocationResult = {
  kind: "province" | "district" | "subdistrict";
  key: string;
  provinceIso: string;
  nameTh: string;
  nameEn: string;
  provinceNameTh: string;
  provinceNameEn: string;
  districtCode?: number;
  districtNameTh?: string;
  districtNameEn?: string;
  subdistrictCode?: number;
  postalCode?: number | null;
  centerLat?: number;
  centerLon?: number;
};

export function normalizeLocationQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s.,/()\-_]+/g, "")
    .trim();
}

function scoreCandidate(query: string, values: Array<string | number | null | undefined>) {
  const normalized = values.filter(value => value !== null && value !== undefined).map(value => normalizeLocationQuery(String(value)));
  if (normalized.some(value => value === query)) return 0;
  if (normalized.some(value => value.startsWith(query))) return 1;
  if (normalizeLocationQuery(normalized.join(" ")).includes(query)) return 2;
  return Number.POSITIVE_INFINITY;
}

export function searchLocations(
  queryValue: string,
  provinces: ProvinceSearchRecord[],
  districts: readonly DistrictTuple[],
  subdistricts: readonly SubdistrictTuple[] = [],
  limit = 16,
): LocationResult[] {
  const query = normalizeLocationQuery(queryValue);
  if (!query) return [];

  const provinceByCode = new Map(
    provinces.map(province => [Number(province.iso.split("-")[1]), province]),
  );
  const districtByCode = new Map(
    districts.map(district => [district[1], district]),
  );
  const candidates: Array<{ score: number; result: LocationResult }> = [];

  for (const province of provinces) {
    const score = scoreCandidate(query, [province.nameTh, province.nameEn, `จังหวัด${province.nameTh}`, province.iso]);
    if (Number.isFinite(score)) {
      candidates.push({
        score,
        result: {
          kind: "province",
          key: province.iso,
          provinceIso: province.iso,
          nameTh: province.nameTh,
          nameEn: province.nameEn,
          provinceNameTh: province.nameTh,
          provinceNameEn: province.nameEn,
        },
      });
    }
  }

  for (const [provinceCode, districtCode, districtNameTh, districtNameEn, postalCode, centerLat, centerLon] of districts) {
    const province = provinceByCode.get(provinceCode);
    if (!province) continue;
    const thaiPrefix = provinceCode === 10 ? "เขต" : "อำเภอ";
    const englishPrefix = provinceCode === 10 ? "Khet" : "Amphoe";
    const score = scoreCandidate(query, [
      districtNameTh,
      districtNameEn,
      `${thaiPrefix}${districtNameTh}`,
      `${englishPrefix} ${districtNameEn}`,
      `${districtNameTh}${province.nameTh}`,
      `${districtNameEn}${province.nameEn}`,
      postalCode,
      districtCode,
    ]);
    if (Number.isFinite(score)) {
      candidates.push({
        score,
        result: {
          kind: "district",
          key: `district-${districtCode}`,
          provinceIso: province.iso,
          nameTh: `${thaiPrefix}${districtNameTh}`,
          nameEn: districtNameEn,
          provinceNameTh: province.nameTh,
          provinceNameEn: province.nameEn,
          districtCode,
          districtNameTh,
          districtNameEn,
          postalCode,
          centerLat,
          centerLon,
        },
      });
    }
  }

  for (const [provinceCode, districtCode, subdistrictCode, subdistrictNameTh, subdistrictNameEn, postalCode, centerLat, centerLon] of subdistricts) {
    const province = provinceByCode.get(provinceCode);
    const district = districtByCode.get(districtCode);
    if (!province || !district) continue;
    const districtPrefix = provinceCode === 10 ? "เขต" : "อำเภอ";
    const subdistrictPrefix = provinceCode === 10 ? "แขวง" : "ตำบล";
    const [, , districtNameTh, districtNameEn] = district;
    const score = scoreCandidate(query, [
      subdistrictNameTh,
      subdistrictNameEn,
      `${subdistrictPrefix}${subdistrictNameTh}`,
      `${subdistrictNameTh}${districtNameTh}${province.nameTh}`,
      `${subdistrictNameEn}${districtNameEn}${province.nameEn}`,
      postalCode,
      subdistrictCode,
    ]);
    if (Number.isFinite(score)) {
      candidates.push({
        score,
        result: {
          kind: "subdistrict",
          key: `subdistrict-${subdistrictCode}`,
          provinceIso: province.iso,
          nameTh: `${subdistrictPrefix}${subdistrictNameTh}`,
          nameEn: subdistrictNameEn,
          provinceNameTh: province.nameTh,
          provinceNameEn: province.nameEn,
          districtCode,
          districtNameTh: `${districtPrefix}${districtNameTh}`,
          districtNameEn,
          subdistrictCode,
          postalCode,
          centerLat,
          centerLon,
        },
      });
    }
  }

  const kindOrder = { province: 0, district: 1, subdistrict: 2 } as const;
  return candidates
    .sort((a, b) =>
      a.score - b.score ||
      kindOrder[a.result.kind] - kindOrder[b.result.kind] ||
      a.result.nameTh.localeCompare(b.result.nameTh, "th"),
    )
    .slice(0, limit)
    .map(candidate => candidate.result);
}

function haversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestSubdistrict(
  latitude: number,
  longitude: number,
  provinces: ProvinceSearchRecord[],
  districts: readonly DistrictTuple[],
  subdistricts: readonly SubdistrictTuple[],
  maximumDistanceKm = 120,
): { location: LocationResult; distanceKm: number } | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  const provinceByCode = new Map(
    provinces.map(province => [Number(province.iso.split("-")[1]), province]),
  );
  const districtByCode = new Map(districts.map(district => [district[1], district]));
  let nearest: { row: SubdistrictTuple; distanceKm: number } | null = null;
  for (const row of subdistricts) {
    const distanceKm = haversineKm(latitude, longitude, row[6], row[7]);
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { row, distanceKm };
  }
  if (!nearest || nearest.distanceKm > maximumDistanceKm) return null;
  const [provinceCode, districtCode, subdistrictCode, subdistrictNameTh, subdistrictNameEn, postalCode, centerLat, centerLon] = nearest.row;
  const province = provinceByCode.get(provinceCode);
  const district = districtByCode.get(districtCode);
  if (!province || !district) return null;
  const districtPrefix = provinceCode === 10 ? "เขต" : "อำเภอ";
  const subdistrictPrefix = provinceCode === 10 ? "แขวง" : "ตำบล";
  return {
    distanceKm: nearest.distanceKm,
    location: {
      kind: "subdistrict",
      key: `subdistrict-${subdistrictCode}`,
      provinceIso: province.iso,
      nameTh: `${subdistrictPrefix}${subdistrictNameTh}`,
      nameEn: subdistrictNameEn,
      provinceNameTh: province.nameTh,
      provinceNameEn: province.nameEn,
      districtCode,
      districtNameTh: `${districtPrefix}${district[2]}`,
      districtNameEn: district[3],
      subdistrictCode,
      postalCode,
      centerLat,
      centerLon,
    },
  };
}

export function toggleSavedLocation(
  saved: readonly LocationResult[],
  location: LocationResult,
  limit = 8,
) {
  if (saved.some(item => item.key === location.key)) {
    return saved.filter(item => item.key !== location.key);
  }
  return [location, ...saved.filter(item => item.key !== location.key)].slice(0, Math.max(1, limit));
}
