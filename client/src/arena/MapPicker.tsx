import { useState } from "react";
import { MAP_ORDER, MAPS, loadMapChoice, saveMapChoice, type MapId } from "./maps";

/** The chosen arena map, remembered between visits. */
export function useMapChoice(): [MapId, (id: MapId) => void] {
  const [map, setMap] = useState<MapId>(loadMapChoice);
  return [
    map,
    (id) => {
      saveMapChoice(id);
      setMap(id);
    },
  ];
}

interface MapPickerProps {
  value: MapId;
  onChange: (id: MapId) => void;
  compact?: boolean;
}

export function MapPicker({ value, onChange, compact = false }: MapPickerProps) {
  return (
    <label className={`map-picker ${compact ? "compact" : ""}`}>
      <span className="map-picker-label">{compact ? "Map" : "Choose your arena"}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as MapId)}>
        {MAP_ORDER.map((id) => (
          <option key={id} value={id}>
            {MAPS[id].name}
          </option>
        ))}
      </select>
      {!compact && <span className="map-picker-blurb">{MAPS[value].blurb}</span>}
    </label>
  );
}
