import districtRows from "@/data/thailand-districts.compact.json";
import {
  type DistrictTuple,
  type LocationResult,
  searchLocations,
} from "@shared/locationSearch";
import { ChevronDown, List, MapPin, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

const districts = districtRows as unknown as DistrictTuple[];

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

export default function LocationExplorer({ provinces, selectedIso, selectedLocation, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [showProvinceList, setShowProvinceList] = useState(false);
  const provinceRecords = useMemo(
    () => provinces.map(province => ({ iso: province.iso, nameTh: province.nameTh, nameEn: province.nameEn })),
    [provinces],
  );
  const results = useMemo(
    () => searchLocations(query, provinceRecords, districts),
    [provinceRecords, query],
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
          <Search aria-hidden="true" />
          <input
            aria-label="ค้นหาจังหวัด อำเภอ หรือเขต"
            autoComplete="off"
            inputMode="search"
            placeholder="ค้นหา จังหวัด อำเภอ เขต หรือรหัสไปรษณีย์"
            value={query}
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

      {query ? (
        <div className="location-results" role="listbox" aria-label="ผลการค้นหาพื้นที่">
          <div className="location-results-meta">
            <span>{results.length ? `ผลลัพธ์ ${results.length} รายการ` : "ไม่พบพื้นที่"}</span>
            <small>ค้นหาได้ 77 จังหวัด · 928 อำเภอ/เขต</small>
          </div>
          {results.map(location => (
            <button key={location.key} type="button" onClick={() => choose(location)} role="option">
              <MapPin />
              <span>
                <b>{location.nameTh}</b>
                <small>
                  {location.kind === "district"
                    ? `${location.nameEn} · ${location.provinceNameTh}${location.postalCode ? ` · ${location.postalCode}` : ""}`
                    : `${location.nameEn} · จังหวัด`}
                </small>
              </span>
              <em>{location.kind === "district" ? "อำเภอ/เขต" : "จังหวัด"}</em>
            </button>
          ))}
          {!results.length ? <p>ลองค้นหา “จตุจักร”, “Chatuchak”, “เชียงใหม่” หรือรหัสไปรษณีย์</p> : null}
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
        <small>ผลระดับอำเภอ/เขตอ้างอิงค่าคาดการณ์ระดับจังหวัดจากกริด ECMWF 0.25°</small>
      </div>
    </div>
  );
}
