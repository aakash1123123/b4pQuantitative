import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Loads every Master Shipment Database row once (/history/shipments). Used to
// recompute the donation stats for a chosen range of years and for the map.
export function useHistoryShipments() {
  const [shipments, setShipments] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/history/shipments`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Past shipments could not be loaded (${response.status}).`);
        }
        return response.json();
      })
      .then((data) => !cancelled && setShipments(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return { shipments, error };
}

const SHIPMENT_TYPES = ["Local", "International"];

// Same totals as the backend's /history, from individual shipments: per year,
// per type, and per chapter (a shipment listed under several chapters splits
// its value evenly; names match ignoring case and keep the first spelling).
export function summarizeHistoryShipments(shipments) {
  const byYear = new Map();
  const byType = new Map();
  const byChapter = new Map();
  const add = (bucket, shipment) => {
    bucket.valuation += shipment.valuation || 0;
    bucket.pounds += shipment.pounds || 0;
    bucket.shipments += 1;
  };
  const emptyBucket = () => ({ valuation: 0, pounds: 0, shipments: 0 });

  for (const shipment of shipments) {
    if (!shipment.year) {
      continue;
    }
    if (!byYear.has(shipment.year)) {
      byYear.set(shipment.year, { year: shipment.year, ...emptyBucket() });
    }
    add(byYear.get(shipment.year), shipment);
    if (shipment.shipment_type) {
      if (!byType.has(shipment.shipment_type)) {
        byType.set(shipment.shipment_type, { type: shipment.shipment_type, ...emptyBucket() });
      }
      add(byType.get(shipment.shipment_type), shipment);
    }
    const chapters = (shipment.chapter || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    for (const name of chapters) {
      const key = name.toLowerCase();
      if (!byChapter.has(key)) {
        byChapter.set(key, { chapter: name, valuation: 0, shipments: 0 });
      }
      const bucket = byChapter.get(key);
      bucket.valuation += (shipment.valuation || 0) / chapters.length;
      bucket.shipments += 1;
    }
  }

  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  return {
    total_valuation: years.reduce((sum, entry) => sum + entry.valuation, 0),
    total_pounds: years.reduce((sum, entry) => sum + entry.pounds, 0),
    total_shipments: years.reduce((sum, entry) => sum + entry.shipments, 0),
    years,
    types: SHIPMENT_TYPES.filter((type) => byType.has(type)).map((type) => byType.get(type)),
    chapters: [...byChapter.values()].sort((a, b) => b.valuation - a.valuation),
  };
}
