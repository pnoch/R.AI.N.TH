export type DistrictTuple = readonly [
  provinceCode: number,
  districtCode: number,
  districtNameTh: string,
  districtNameEn: string,
  postalCode: number,
];

export type ProvinceSearchRecord = {
  iso: string;
  nameTh: string;
  nameEn: string;
};

export type LocationResult = {
  kind: "province" | "district";
  key: string;
  provinceIso: string;
  nameTh: string;
  nameEn: string;
  provinceNameTh: string;
  provinceNameEn: string;
  districtCode?: number;
  postalCode?: number;
};

export function normalizeLocationQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s.,/()\-_]+/g, "")
    .trim();
}

function scoreCandidate(query: string, values: string[]) {
  const normalized = values.map(normalizeLocationQuery);
  if (normalized.some(value => value === query)) return 0;
  if (normalized.some(value => value.startsWith(query))) return 1;
  if (normalizeLocationQuery(values.join(" ")).includes(query)) return 2;
  return Number.POSITIVE_INFINITY;
}

export function searchLocations(
  queryValue: string,
  provinces: ProvinceSearchRecord[],
  districts: readonly DistrictTuple[],
  limit = 14,
): LocationResult[] {
  const query = normalizeLocationQuery(queryValue);
  if (!query) return [];

  const provinceByCode = new Map(
    provinces.map(province => [Number(province.iso.split("-")[1]), province]),
  );
  const candidates: Array<{ score: number; result: LocationResult }> = [];

  for (const province of provinces) {
    const score = scoreCandidate(query, [
      province.nameTh,
      province.nameEn,
      `จังหวัด${province.nameTh}`,
      province.iso,
    ]);
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

  for (const [provinceCode, districtCode, districtNameTh, districtNameEn, postalCode] of districts) {
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
      String(postalCode),
      String(districtCode),
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
          postalCode,
        },
      });
    }
  }

  return candidates
    .sort((a, b) =>
      a.score - b.score ||
      Number(a.result.kind === "district") - Number(b.result.kind === "district") ||
      a.result.nameTh.localeCompare(b.result.nameTh, "th"),
    )
    .slice(0, limit)
    .map(candidate => candidate.result);
}
