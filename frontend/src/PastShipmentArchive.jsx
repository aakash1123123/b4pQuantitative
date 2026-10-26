import { useEffect, useState } from "react";
import "./PastShipmentArchive.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function formatCurrencyWhole(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatPounds(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0)} lbs`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatShipmentMonth(shipment) {
  return shipment.month ? `${MONTH_NAMES[shipment.month - 1]} ${shipment.year}` : shipment.date_label;
}

function matchesSearch(shipment, search) {
  if (!search) {
    return true;
  }
  return [
    shipment.recipient,
    shipment.destination,
    shipment.chapter,
    shipment.sponsor,
    shipment.date_label,
    shipment.transport,
    shipment.comments,
  ].some((field) => field?.toLowerCase().includes(search));
}

// Read-only list of shipments recorded in the Master Shipment Database,
// shown under the app's own past shipments. Filters follow the Past
// Shipments search box and type filter.
export default function PastShipmentArchive({ searchTerm, typeFilter }) {
  const [shipments, setShipments] = useState(null);
  const [error, setError] = useState("");
  const [expandedIds, setExpandedIds] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/history/shipments`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`The Master Shipment Database could not be loaded (${response.status}).`);
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setShipments(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const search = searchTerm.trim().toLowerCase();
  const visible = (shipments ?? []).filter(
    (shipment) =>
      (typeFilter === "All" || shipment.shipment_type === typeFilter) && matchesSearch(shipment, search)
  );

  function toggle(id) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  }

  return (
    <section className="past-archive">
      <div className="past-archive-header">
        <div>
          <p className="section-label">Shipment archive</p>
          <h3>Earlier shipments from the Master Shipment Database</h3>
        </div>
        {shipments ? (
          <span className="pill">
            {visible.length === shipments.length
              ? `${shipments.length} shipments`
              : `${visible.length} of ${shipments.length} shipments`}
          </span>
        ) : null}
      </div>

      {error ? <p className="past-archive-empty">{error}</p> : null}
      {!error && !shipments ? <p className="past-archive-empty">Loading earlier shipments…</p> : null}
      {shipments && visible.length === 0 ? (
        <p className="past-archive-empty">No earlier shipments matched those filters.</p>
      ) : null}

      <div className="past-archive-list">
        {visible.map((shipment) => {
          const expanded = expandedIds.includes(shipment.id);
          const title = shipment.recipient || shipment.destination || "Shipment";
          const showDestination =
            shipment.destination && shipment.destination.toLowerCase() !== title.toLowerCase();
          const details = [
            ["Chapter", shipment.chapter],
            ["Sponsor", shipment.sponsor],
            ["Transport", [shipment.transport, shipment.transport_size].filter(Boolean).join(" · ")],
            ["Boxes", shipment.boxes],
            ["Pallets", shipment.pallets],
            ["Shipping cost", shipment.shipping_cost != null ? formatCurrencyWhole(shipment.shipping_cost) : null],
            ["HQ VPO", shipment.hq_vpo],
            ["COO / CP", shipment.coo_cp],
          ].filter(([, value]) => value);

          return (
            <article key={shipment.id} className="past-archive-card">
              <button
                type="button"
                className="past-archive-summary"
                aria-expanded={expanded}
                onClick={() => toggle(shipment.id)}
              >
                <span className="past-archive-date">{formatShipmentMonth(shipment)}</span>
                <span className="past-archive-title">
                  <strong>{title}</strong>
                  {showDestination ? <span>{shipment.destination}</span> : null}
                </span>
                <span className="past-archive-type">{shipment.type_label || "Type not set"}</span>
                <span className="past-archive-figure">
                  {shipment.valuation != null ? formatCurrencyWhole(shipment.valuation) : "—"}
                </span>
                <span className="past-archive-figure past-archive-figure-muted">
                  {shipment.pounds != null ? formatPounds(shipment.pounds) : "—"}
                </span>
                <span className="past-archive-chevron" aria-hidden="true">
                  {expanded ? "−" : "+"}
                </span>
              </button>

              {expanded ? (
                <div className="past-archive-details">
                  <dl>
                    {details.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {shipment.comments ? <p className="past-archive-comments">{shipment.comments}</p> : null}
                  {shipment.documentation_url ? (
                    <a href={shipment.documentation_url} target="_blank" rel="noreferrer">
                      Open shipment documentation
                    </a>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
