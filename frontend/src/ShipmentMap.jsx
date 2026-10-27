import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import "./ShipmentMap.css";

const WIDTH = 960;
// The map is drawn at most this tall on screen, so it fits beside the year chart.
const MAX_DISPLAY_HEIGHT = 250;

// The sheet's "Shipping Destination" is free text: a country, a city, a
// clinic or a partner organization. Countries are matched by name; [lon, lat]
// is where its tooltip points, and atlas is the country's name in world-atlas.
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

// Value bands for shading destination countries, light to dark brand blue.
// The US is far larger than everywhere else, so the bands step roughly by
// order of magnitude rather than evenly.
const VALUE_BANDS = [
  { min: 0, label: "Under $10K", color: "#b9cff8" },
  { min: 10000, label: "$10K–$100K", color: "#86adf3" },
  { min: 100000, label: "$100K–$500K", color: "#4a87ee" },
  { min: 500000, label: "$500K–$1M", color: "#1663dc" },
  { min: 1000000, label: "$1M+", color: "#0035a2" },
];

function bandFor(value) {
  return [...VALUE_BANDS].reverse().find((band) => value >= band.min);
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
  const [expanded, setExpanded] = useState(false);
  const error = loadError || mapError;

  useEffect(() => {
    if (!expanded) {
      return undefined;
    }
    const closeOnEscape = (event) => event.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

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

  // Destination totals keyed by the country's world-atlas name.
  const byAtlasName = new Map(
    countries.map((entry) => {
      const [x, y] = projection(COUNTRIES[entry.name].coords);
      return [COUNTRIES[entry.name].atlas || entry.name, { ...entry, x, y }];
    })
  );
  const activeCountry = countries.length
    ? [...byAtlasName.values()].find((entry) => entry.name === active)
    : null;
  const loading = !error && (!shipments || !world);

  const title = `Where our supplies have gone${rangeLabel ? `, ${rangeLabel}` : ""}`;

  // The map drawing, shared by the card and the expanded view.
  function renderMap(maxHeight, onCountryClick) {
    return (
      <div className="shipment-map-stage" style={{ maxWidth: `${(maxHeight * WIDTH) / height}px` }}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="World map shaded by donated value per destination country">
          {world.map((country) => {
            const destination = byAtlasName.get(country.properties.name);
            if (!destination) {
              return <path key={country.id ?? country.properties.name} d={path(country)} />;
            }
            return (
              <path
                key={country.id ?? country.properties.name}
                d={path(country)}
                className={`is-reached${active === destination.name ? " is-active" : ""}`}
                style={{ fill: bandFor(destination.valuation).color }}
                onMouseEnter={() => setActive(destination.name)}
                onMouseLeave={() => setActive(null)}
                onClick={() => onCountryClick(destination.name)}
              />
            );
          })}
        </svg>
        {activeCountry ? (
          <div
            className="shipment-map-tooltip"
            style={{
              left: `${(activeCountry.x / WIDTH) * 100}%`,
              top: `${(activeCountry.y / height) * 100}%`,
            }}
            role="status"
          >
            <strong>{activeCountry.name}</strong>
            <span>{formatCurrency(activeCountry.valuation)} donated</span>
            <span>
              {formatNumber(activeCountry.shipments)} shipment{activeCountry.shipments === 1 ? "" : "s"} ·{" "}
              {formatNumber(activeCountry.pounds)} lbs
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  const legend = (
    <ul className="shipment-map-legend" aria-label="Donated value bands">
      {VALUE_BANDS.map((band) => (
        <li key={band.label}>
          <span className="swatch" style={{ background: band.color }} aria-hidden="true" />
          {band.label}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="shipment-map" aria-labelledby="shipment-map-title">
      <div className="donation-chart-header">
        <h3 id="shipment-map-title">{title}</h3>
        <p className="donation-chart-detail">
          Darker countries received more. Click the map for every country.
        </p>
      </div>

      {error ? <p className="shipment-map-message">{error}</p> : null}
      {loading ? <div className="shipment-map-skeleton" aria-busy="true" /> : null}

      {!loading && !error ? (
        <div
          className="shipment-map-canvas is-clickable"
          role="button"
          tabIndex={0}
          aria-label="Open the map with every destination country"
          onClick={() => setExpanded(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setExpanded(true);
            }
          }}
        >
          {renderMap(MAX_DISPLAY_HEIGHT, () => setExpanded(true))}
          {legend}
          <span className="shipment-map-expand" aria-hidden="true">⤢ Expand</span>
        </div>
      ) : null}

      {/* Portaled to <body>: the glass panel's backdrop-filter would otherwise
          trap the fixed overlay inside the panel. */}
      {expanded && !loading && !error ? createPortal(
        <div className="modal-backdrop" role="presentation" onClick={() => setExpanded(false)}>
          <div
            className="shipment-map-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-map-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-map-modal-header">
              <div>
                <h2 id="shipment-map-modal-title">{title}</h2>
                <p className="donation-chart-detail">
                  Darker countries received more. Hover a country or a row for details.
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setExpanded(false)}>
                x
              </button>
            </div>

            <div className="shipment-map-modal-body">
              <div className="shipment-map-canvas">
                {renderMap(520, (name) => setActive(active === name ? null : name))}
                {legend}
              </div>

              <div className="shipment-map-list">
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
            </div>
          </div>
        </div>
        ,
        document.body
      ) : null}
    </div>
  );
}
