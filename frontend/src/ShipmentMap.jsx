import { useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import "./ShipmentMap.css";

const WIDTH = 960;
// The map is drawn at most this tall on screen, so it fits beside the year chart.
const MAX_DISPLAY_HEIGHT = 250;
const MAX_RADIUS = 30;
const MIN_RADIUS = 4.5;

// The sheet's "Shipping Destination" is free text: a country, a city, a
// clinic or a partner organization. Countries are matched by name; [lon, lat]
// is where the bubble sits, and atlas is the country's name in world-atlas.
const COUNTRIES = {
  "United States": { atlas: "United States of America", coords: [-88, 39.5] },
  Ghana: { coords: [-1.0, 7.9] },
  Niger: { coords: [8.1, 17.6] },
  "Dominican Republic": { atlas: "Dominican Rep.", coords: [-70.2, 18.8] },
  Myanmar: { coords: [96.0, 21.9] },
  "Puerto Rico": { coords: [-66.5, 18.2] },
  Guatemala: { coords: [-90.3, 15.7] },
  India: { coords: [78.9, 21.5] },
  Ukraine: { coords: [31.2, 48.8] },
  Ecuador: { coords: [-78.2, -1.6] },
  Cuba: { coords: [-78.5, 21.7] },
  Syria: { coords: [38.5, 35.2] },
  Lebanon: { coords: [35.8, 33.9] },
  Mexico: { coords: [-102.5, 24.0] },
};

const COUNTRY_NAMES = Object.keys(COUNTRIES);

// Where a shipment ended up. A destination naming a country maps to it
// ("Agua Prieta, Mexico" -> Mexico). Anything else sent Local or National
// went to a US clinic or partner (Project CURE included). International
// shipments to a partner organization (SAMS, CMMB, FAJR) don't record the
// final country, so they are listed under the map rather than placed on it.
function countryFor(shipment) {
  const destination = (shipment.destination || "").trim().toLowerCase();
  const match = COUNTRY_NAMES.find(
    (name) => destination === name.toLowerCase() || destination.endsWith(`, ${name.toLowerCase()}`)
  );
  if (match) {
    return match;
  }
  const label = (shipment.type_label || shipment.shipment_type || "").trim().toLowerCase();
  return label === "international" ? null : "United States";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value ?? 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0);
}

function aggregate(shipments) {
  const byCountry = new Map();
  const partners = new Map();
  for (const shipment of shipments) {
    const country = countryFor(shipment);
    const bucket = country ? byCountry : partners;
    const key = country || (shipment.recipient || shipment.destination || "Unrecorded").trim();
    const entry = bucket.get(key) || { name: key, valuation: 0, pounds: 0, shipments: 0 };
    entry.valuation += shipment.valuation || 0;
    entry.pounds += shipment.pounds || 0;
    entry.shipments += 1;
    bucket.set(key, entry);
  }
  const sortByValue = (a, b) => b.valuation - a.valuation;
  return {
    countries: [...byCountry.values()].sort(sortByValue),
    partners: [...partners.values()].sort(sortByValue),
  };
}

// shipments: Master Shipment Database rows, already narrowed to the chosen years.
export default function ShipmentMap({ shipments, error: loadError, rangeLabel }) {
  const [world, setWorld] = useState(null);
  const [mapError, setMapError] = useState("");
  const [active, setActive] = useState(null);
  const error = loadError || mapError;

  useEffect(() => {
    let cancelled = false;
    // The world outline is ~100 KB, so it loads on its own after the page.
    import("world-atlas/countries-110m.json")
      .then((topology) => {
        if (!cancelled) {
          const countries = feature(topology.default ?? topology, "countries");
          setWorld(countries.features.filter((entry) => entry.properties.name !== "Antarctica"));
        }
      })
      .catch(() => !cancelled && setMapError("The world map could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, []);

  const { countries, partners } = useMemo(() => aggregate(shipments ?? []), [shipments]);

  const { projection, height } = useMemo(() => {
    const base = geoNaturalEarth1();
    if (!world) {
      return { projection: base, height: 470 };
    }
    const collection = { type: "FeatureCollection", features: world };
    base.fitWidth(WIDTH - 8, collection);
    const [[, top], [, bottom]] = geoPath(base).bounds(collection);
    base.translate([base.translate()[0] + 4, base.translate()[1] - top + 4]);
    return { projection: base, height: Math.ceil(bottom - top + 8) };
  }, [world]);
  const path = useMemo(() => geoPath(projection), [projection]);

  const reached = new Set(countries.map((entry) => COUNTRIES[entry.name].atlas || entry.name));
  const maxValue = countries[0]?.valuation || 1;
  const bubbles = countries.map((entry) => {
    const [x, y] = projection(COUNTRIES[entry.name].coords);
    const radius = Math.max(MIN_RADIUS, Math.sqrt(entry.valuation / maxValue) * MAX_RADIUS);
    return { ...entry, x, y, radius };
  });
  const activeBubble = bubbles.find((entry) => entry.name === active);
  const loading = !error && (!shipments || !world);

  return (
    <>
      <div className="shipment-map" aria-labelledby="shipment-map-title">
        <div className="donation-chart-header">
          <h3 id="shipment-map-title">Where our supplies have gone{rangeLabel ? `, ${rangeLabel}` : ""}</h3>
          <p className="donation-chart-detail">
            Bubble size is donated value per country. Hover a bubble for details.
          </p>
        </div>

        {error ? <p className="shipment-map-message">{error}</p> : null}
        {loading ? <div className="shipment-map-skeleton" aria-busy="true" /> : null}

        {!loading && !error ? (
          <div className="shipment-map-canvas">
            <div
              className="shipment-map-stage"
              style={{ maxWidth: `${(MAX_DISPLAY_HEIGHT * WIDTH) / height}px` }}
            >
              <svg
                viewBox={`0 0 ${WIDTH} ${height}`}
                role="img"
                aria-label="World map of donated value by destination country"
              >
                <g>
                  {world.map((country) => (
                    <path
                      key={country.id ?? country.properties.name}
                      d={path(country)}
                      className={reached.has(country.properties.name) ? "is-reached" : undefined}
                    />
                  ))}
                </g>
                {/* Largest first so small bubbles stay on top and hoverable. */}
                <g>
                  {bubbles.map((entry) => (
                    <g
                      key={entry.name}
                      className={`shipment-map-bubble${active === entry.name ? " is-active" : ""}`}
                      onMouseEnter={() => setActive(entry.name)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => setActive(active === entry.name ? null : entry.name)}
                    >
                      <circle cx={entry.x} cy={entry.y} r={Math.max(entry.radius, 12)} className="hit" />
                      <circle cx={entry.x} cy={entry.y} r={entry.radius} className="mark" />
                    </g>
                  ))}
                </g>
              </svg>
              {activeBubble ? (
                <div
                  className="shipment-map-tooltip"
                  style={{
                    left: `${(activeBubble.x / WIDTH) * 100}%`,
                    top: `${((activeBubble.y - activeBubble.radius) / height) * 100}%`,
                  }}
                  role="status"
                >
                  <strong>{activeBubble.name}</strong>
                  <span>{formatCurrency(activeBubble.valuation)} donated</span>
                  <span>
                    {formatNumber(activeBubble.shipments)} shipment{activeBubble.shipments === 1 ? "" : "s"} ·{" "}
                    {formatNumber(activeBubble.pounds)} lbs
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {!loading && !error ? (
        <div className="shipment-map-list">
          <div className="donation-chart-header">
            <h3>Top destinations</h3>
            <p className="donation-chart-detail">By donated value. Hover a row to find it on the map.</p>
          </div>
          <div className="shipment-map-list-card">
            <div className="shipment-map-list-header" aria-hidden="true">
              <span>Country</span>
              <span>Shipments</span>
              <span>Value</span>
            </div>
            <ol>
              {countries.map((entry) => (
                <li key={entry.name}>
                  <button
                    type="button"
                    className={active === entry.name ? "is-active" : undefined}
                    onMouseEnter={() => setActive(entry.name)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(entry.name)}
                    onBlur={() => setActive(null)}
                  >
                    <span className="name">{entry.name}</span>
                    <span className="count">{formatNumber(entry.shipments)}</span>
                    <span className="value">{formatCurrency(entry.valuation)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <p className="shipment-map-note">
            US includes local clinics and Project CURE, which forwards supplies overseas.
            {partners.length > 0
              ? ` Not on the map, country not recorded: ${partners
                  .map((entry) => `${entry.name} (${formatCurrency(entry.valuation)})`)
                  .join(", ")}.`
              : ""}
          </p>
        </div>
      ) : null}
    </>
  );
}
