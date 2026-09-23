import { trpc } from "@/lib/trpc";
import {
  type DistrictTuple,
  type LocationResult,
  type SubdistrictTuple,
  searchLocations,
} from "@shared/locationSearch";
import { ChevronDown, List, Loader2, MapPin, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  provinces: any[];
  selectedIso: string;
  selectedLocation: LocationResult | null;
  onSelect: (location: LocationResult) => void;
};

function provinceResult(province: any): LocationResult {
  return {
    kind: "province",
    key: province.iso,
    provinceIso: province.iso,
    nameTh: province.nameTh,
    nameEn: province.nameEn,
    provinceNameTh: province.nameTh,
    provinceNameEn: province.nameEn,
  };
}

function resultSubtitle(location: LocationResult) {
  if (location.kind === "province") return `${location.nameEn} · จังหวัด`;
  const postal = location.postalCode ? ` · ${location.postalCode}` : "";
  if (location.kind === "district") return `${location.nameEn} · ${location.provinceNameTh}${postal}`;
  return `${location.nameEn} · ${location.districtNameTh} · ${location.provinceNameTh}${postal}`;
}

export default function LocationExplorer({ provinces, selectedIso, selectedLocation, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [showProvinceList, setShowProvinceList] = useState(false);
  const index = trpc.locations.index.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const provinceRecords = useMemo(
    () => provinces.map(province => ({ iso: province.iso, nameTh: province.nameTh, nameEn: province.nameEn })),
    [provinces],
  );
  const districts = (index.data?.districts || []) as DistrictTuple[];
  const subdistricts = (index.data?.subdistricts || []) as SubdistrictTuple[];
  const results = useMemo(
    () => searchLocations(query, provinceRecords, districts, subdistricts),
    [districts, provinceRecords, query, subdistricts],
  );
  const sortedProvinces = useMemo(
    () => [...provinces].sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th")),
    [provinces],
  );
  const activeLabel = selectedLocation?.provinceIso === selectedIso
    ? selectedLocation.nameTh
    : provinces.find(province => province.iso === selectedIso)?.nameTh;

  const choose = (location: LocationResult) => {
    onSelect(location);
    setQuery("");
    setShowProvinceList(false);
  };

  return (
    <div className="location-explorer">
      <div className="location-search-row">
        <div className="location-search-box">
          {index.isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          <input
            aria-label="ค้นหาจังหวัด อำเภอ เขต ตำบล หรือแขวง"
            autoComplete="off"
            inputMode="search"
            placeholder="ค้นหา จังหวัด อำเภอ เขต ตำบล แขวง หรือรหัสไปรษณีย์"
            value={query}
            disabled={index.isLoading || index.isError}
            onChange={event => {
              setQuery(event.target.value);
              setShowProvinceList(false);
            }}
            onKeyDown={event => {
              if (event.key === "Enter" && results[0]) choose(results[0]);
              if (event.key === "Escape") setQuery("");
            }}
          />
          {query ? (
            <button className="location-clear" onClick={() => setQuery("")} aria-label="ล้างการค้นหา" type="button">
              <X />
            </button>
          ) : null}
        </div>
        <button
          className={showProvinceList ? "location-list-toggle active" : "location-list-toggle"}
          onClick={() => {
            setShowProvinceList(value => !value);
            setQuery("");
          }}
          type="button"
          aria-expanded={showProvinceList}
        >
          <List /> รายชื่อจังหวัด <ChevronDown />
        </button>
      </div>

      {index.isError ? <div className="location-index-error">ไม่สามารถโหลดดัชนีพื้นที่ได้ · ลองรีเฟรชหน้าอีกครั้ง</div> : null}

      {query && !index.isLoading ? (
        <div className="location-results" role="listbox" aria-label="ผลการค้นหาพื้นที่">
          <div className="location-results-meta">
            <span>{results.length ? `ผลลัพธ์ ${results.length} รายการ` : "ไม่พบพื้นที่"}</span>
            <small>77 จังหวัด · 928 อำเภอ/เขต · 7,425 ตำบล/แขวง</small>
          </div>
          {results.map(location => (
            <button key={location.key} type="button" onClick={() => choose(location)} role="option">
              <MapPin />
              <span>
                <b>{location.nameTh}</b>
                <small>{resultSubtitle(location)}</small>
              </span>
              <em>
                {location.kind === "province" ? "จังหวัด" : location.kind === "district" ? "อำเภอ/เขต" : "ตำบล/แขวง"}
              </em>
            </button>
          ))}
          {!results.length ? <p>ลองค้นหา “ลาดยาว”, “จตุจักร”, “Chatuchak”, “เชียงใหม่” หรือรหัสไปรษณีย์</p> : null}
        </div>
      ) : null}

      {showProvinceList ? (
        <div className="province-browser" aria-label="รายชื่อจังหวัดทั้งหมด">
          <div className="location-results-meta">
            <span>จังหวัดทั้งหมด</span>
            <small>เลือกจังหวัดเพื่อดูค่าฝนและความเสี่ยง</small>
          </div>
          <div className="province-browser-grid">
            {sortedProvinces.map(province => (
              <button
                key={province.iso}
                className={province.iso === selectedIso ? "active" : ""}
                onClick={() => choose(provinceResult(province))}
                type="button"
              >
                <b>{province.nameTh}</b><small>{province.nameEn}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="location-context">
        <MapPin />
        <span><b>พื้นที่ที่เลือก:</b> {activeLabel || "ยังไม่ได้เลือก"}</span>
        <small>
          {selectedLocation?.kind === "subdistrict"
            ? `${selectedLocation.districtNameTh} · ${selectedLocation.provinceNameTh} · ค่าคาดการณ์ระดับจังหวัด`
            : "อำเภอ/เขตและตำบล/แขวงอ้างอิงค่าคาดการณ์ระดับจังหวัดจากกริด ECMWF 0.25°"}
        </small>
      </div>
    </div>
  );
}
