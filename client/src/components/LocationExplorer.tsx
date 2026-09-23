import { trpc } from "@/lib/trpc";
import {
  type DistrictTuple,
  type LocationResult,
  type SubdistrictTuple,
  findNearestSubdistrict,
  searchLocations,
  toggleSavedLocation,
} from "@shared/locationSearch";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Crosshair,
  List,
  Loader2,
  MapPin,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const SAVED_LOCATIONS_KEY = "rain-th-saved-locations-v1";

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

function validSavedLocations(value: unknown): LocationResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item =>
    item && typeof item === "object" &&
    typeof item.key === "string" &&
    typeof item.provinceIso === "string" &&
    typeof item.nameTh === "string",
  ).slice(0, 8) as LocationResult[];
}

export default function LocationExplorer({ provinces, selectedIso, selectedLocation, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [showProvinceList, setShowProvinceList] = useState(false);
  const [savedLocations, setSavedLocations] = useState<LocationResult[]>([]);
  const [savedReady, setSavedReady] = useState(false);
  const [geolocating, setGeolocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
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
  const selectedProvince = provinces.find(province => province.iso === selectedIso);
  const currentLocation = selectedLocation?.provinceIso === selectedIso
    ? selectedLocation
    : selectedProvince
      ? provinceResult(selectedProvince)
      : null;
  const activeLabel = currentLocation?.nameTh;
  const currentIsSaved = currentLocation
    ? savedLocations.some(location => location.key === currentLocation.key)
    : false;

  useEffect(() => {
    try {
      setSavedLocations(validSavedLocations(JSON.parse(localStorage.getItem(SAVED_LOCATIONS_KEY) || "[]")));
    } catch {
      setSavedLocations([]);
    } finally {
      setSavedReady(true);
    }
  }, []);

  useEffect(() => {
    if (!savedReady) return;
    try {
      localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(savedLocations));
    } catch {
      setLocationMessage("เบราว์เซอร์ไม่อนุญาตให้บันทึกพื้นที่บนอุปกรณ์นี้");
    }
  }, [savedLocations, savedReady]);

  const choose = (location: LocationResult) => {
    onSelect(location);
    setQuery("");
    setShowProvinceList(false);
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocationMessage("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    if (!subdistricts.length) {
      setLocationMessage("ดัชนีพื้นที่ยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง");
      return;
    }
    setGeolocating(true);
    setLocationMessage("กำลังหาพื้นที่ใกล้ตำแหน่งของคุณ…");
    navigator.geolocation.getCurrentPosition(
      position => {
        const nearest = findNearestSubdistrict(
          position.coords.latitude,
          position.coords.longitude,
          provinceRecords,
          districts,
          subdistricts,
        );
        setGeolocating(false);
        if (!nearest) {
          setLocationMessage("ไม่พบพื้นที่ที่ตรงกับพิกัดนี้");
          return;
        }
        choose(nearest.location);
        setLocationMessage(
          `พื้นที่ใกล้ที่สุด: ${nearest.location.nameTh} · ห่างจุดกึ่งกลางประมาณ ${nearest.distanceKm.toFixed(1)} กม.`,
        );
      },
      error => {
        setGeolocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationMessage("ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิด Location permission แล้วลองใหม่");
        } else if (error.code === error.TIMEOUT) {
          setLocationMessage("หมดเวลารอตำแหน่ง — กรุณาลองใหม่");
        } else {
          setLocationMessage("ไม่สามารถอ่านตำแหน่งจากอุปกรณ์ได้");
        }
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  };

  const toggleCurrentSaved = () => {
    if (!currentLocation) return;
    setSavedLocations(saved => toggleSavedLocation(saved, currentLocation));
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

      <div className="location-utility-row">
        <button type="button" onClick={locateMe} disabled={geolocating || index.isLoading || index.isError}>
          {geolocating ? <Loader2 className="animate-spin" /> : <Crosshair />}
          ใช้ตำแหน่งของฉัน
        </button>
        <button type="button" onClick={toggleCurrentSaved} disabled={!currentLocation} className={currentIsSaved ? "active" : ""}>
          {currentIsSaved ? <BookmarkCheck /> : <Bookmark />}
          {currentIsSaved ? "บันทึกแล้ว" : "บันทึกพื้นที่นี้"}
        </button>
        <small>ตำแหน่งและรายการบันทึกอยู่ในอุปกรณ์นี้เท่านั้น</small>
      </div>

      {locationMessage ? <div className="location-device-message" role="status">{locationMessage}</div> : null}
      {index.isError ? <div className="location-index-error">ไม่สามารถโหลดดัชนีพื้นที่ได้ · ลองรีเฟรชหน้าอีกครั้ง</div> : null}

      {savedLocations.length ? (
        <div className="saved-locations" aria-label="พื้นที่ที่บันทึกไว้">
          <div className="saved-locations-heading"><BookmarkCheck /><span>พื้นที่ที่บันทึก</span><small>{savedLocations.length}/8</small></div>
          <div className="saved-location-list">
            {savedLocations.map(location => (
              <div key={location.key} className={location.key === currentLocation?.key ? "active" : ""}>
                <button type="button" onClick={() => choose(location)}>
                  <b>{location.nameTh}</b>
                  <small>{location.kind === "province" ? "จังหวัด" : location.provinceNameTh}</small>
                </button>
                <button
                  type="button"
                  aria-label={`นำ ${location.nameTh} ออกจากพื้นที่ที่บันทึก`}
                  onClick={() => setSavedLocations(saved => saved.filter(item => item.key !== location.key))}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
