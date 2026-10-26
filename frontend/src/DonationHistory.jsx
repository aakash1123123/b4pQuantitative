import { useEffect, useRef, useState } from "react";
import "./DonationHistory.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const COUNT_UP_MS = 1800;
const BAR_STAGGER_MS = 140;

function formatCurrencyWhole(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function formatPounds(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0)} lbs`;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Becomes true the first time the element scrolls into view, so the
// animations play when someone actually sees them.
function useSeenOnce(ref) {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || seen) {
      return undefined;
    }
    if (!("IntersectionObserver" in window)) {
      setSeen(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, seen]);

  return seen;
}

function useCountUp(target, start) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) {
      return undefined;
    }
    if (prefersReducedMotion()) {
      setValue(target);
      return undefined;
    }
    let frame;
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startedAt) / COUNT_UP_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, start]);

  return value;
}

export default function DonationHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [activeYear, setActiveYear] = useState(null);
  const sectionRef = useRef(null);
  const seen = useSeenOnce(sectionRef);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/history`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Donation history could not be loaded (${response.status}).`);
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setHistory(data);
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

  const animatedTotal = useCountUp(history?.total_valuation ?? 0, seen && Boolean(history));

  if (error) {
    return <section className="panel error-panel">{error}</section>;
  }

  const years = history?.years ?? [];
  const maxValuation = Math.max(...years.map((entry) => entry.valuation), 1);
  const currentYear = new Date().getFullYear();
  const firstYear = years[0]?.year;
  const active = years.find((entry) => entry.year === activeYear);

  return (
    <section className="panel donation-history" ref={sectionRef}>
      <div className="donation-hero">
        <div>
          <p className="section-label">Donated to date</p>
          <p className="donation-total" aria-live="polite">
            {history ? formatCurrencyWhole(animatedTotal) : "—"}
          </p>
          <p className="donation-subtitle">
            Estimated value of the medical supplies Blueprints has shipped
            {firstYear ? ` since ${firstYear}` : ""}.
          </p>
        </div>
        <dl className="donation-stats">
          <div>
            <dt>Supplies shipped</dt>
            <dd>{history ? formatPounds(history.total_pounds) : "—"}</dd>
          </div>
          <div>
            <dt>Shipments</dt>
            <dd>{history ? history.total_shipments : "—"}</dd>
          </div>
          <div>
            <dt>Years active</dt>
            <dd>{years.length || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="donation-chart-header">
        <h3>Donated value by year</h3>
        <p className="donation-chart-detail">
          {active
            ? `${active.year}: ${formatCurrencyWhole(active.valuation)} · ${formatPounds(active.pounds)} · ${active.shipments} shipment${active.shipments === 1 ? "" : "s"}`
            : "Hover or tap a year for its poundage and shipment count."}
        </p>
      </div>

      <div
        className={seen && history ? "donation-chart is-visible" : "donation-chart"}
        role="list"
        aria-label="Donated value by year"
      >
        {years.map((entry, index) => (
          <button
            key={entry.year}
            type="button"
            role="listitem"
            className={entry.year === activeYear ? "donation-bar-column active" : "donation-bar-column"}
            style={{ "--bar-delay": `${index * BAR_STAGGER_MS}ms` }}
            onMouseEnter={() => setActiveYear(entry.year)}
            onMouseLeave={() => setActiveYear(null)}
            onFocus={() => setActiveYear(entry.year)}
            onBlur={() => setActiveYear(null)}
            onClick={() => setActiveYear(entry.year)}
            aria-label={`${entry.year}: ${formatCurrencyWhole(entry.valuation)}, ${formatPounds(entry.pounds)}, ${entry.shipments} shipments`}
          >
            <span className="donation-bar-value">{formatCompactCurrency(entry.valuation)}</span>
            <span className="donation-bar-track">
              <span
                className="donation-bar"
                style={{ "--bar-height": `${(entry.valuation / maxValuation) * 100}%` }}
              />
            </span>
            <span className="donation-bar-year">
              {entry.year}
              {entry.year === currentYear ? <small> YTD</small> : null}
            </span>
          </button>
        ))}
      </div>

      {history?.source === "snapshot" ? (
        <p className="donation-footnote">
          Showing saved figures: the Master Shipment Database couldn't be read just now.
        </p>
      ) : null}
    </section>
  );
}
