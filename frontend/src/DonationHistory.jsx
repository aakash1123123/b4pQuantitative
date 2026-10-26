import { useEffect, useRef, useState } from "react";
import "./DonationHistory.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const COUNT_UP_MS = 1800;
const LINE_DRAW_MS = 2600;
// Leave headroom above the highest point for its value label.
const PLOT_TOP = 16;

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

// Loads the Master Shipment Database summary once. Shared by the donation
// section and the local/international stats on Shipment KPIs.
export function useDonationHistory() {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");

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

  return { history, error };
}

export default function DonationHistory({ history, error }) {
  const [activeYear, setActiveYear] = useState(null);
  const sectionRef = useRef(null);
  const seen = useSeenOnce(sectionRef);

  const animatedTotal = useCountUp(history?.total_valuation ?? 0, seen && Boolean(history));

  if (error) {
    return <section className="panel error-panel">{error}</section>;
  }

  const years = history?.years ?? [];
  const maxValuation = Math.max(...years.map((entry) => entry.valuation), 1);
  const currentYear = new Date().getFullYear();
  const firstYear = years[0]?.year;
  const active = years.find((entry) => entry.year === activeYear);

  // x runs 0-1000 and y 0-100 in the SVG's stretched coordinate space.
  const points = years.map((entry, index) => ({
    ...entry,
    x: ((index + 0.5) / years.length) * 1000,
    y: 100 - (entry.valuation / maxValuation) * (100 - PLOT_TOP),
  }));
  const linePath = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x},100 L${points[0].x},100 Z`
    : "";

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
            : "Hover or tap a point for that year's poundage and shipment count."}
        </p>
      </div>

      <div
        className={seen && history ? "donation-chart is-visible" : "donation-chart"}
        role="list"
        aria-label="Donated value by year"
      >
        <div className="donation-plot">
          <svg
            className="donation-line-svg"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="donation-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0069f3" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#0069f3" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="donation-line-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#000e3f" />
                <stop offset="55%" stopColor="#0035a2" />
                <stop offset="100%" stopColor="#0069f3" />
              </linearGradient>
            </defs>
            {points.length ? (
              <>
                <path className="donation-area" d={areaPath} fill="url(#donation-area-fill)" />
                <path
                  className="donation-line"
                  d={linePath}
                  fill="none"
                  stroke="url(#donation-line-stroke)"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          {points.map((point, index) => (
            <button
              key={point.year}
              type="button"
              role="listitem"
              className={point.year === activeYear ? "donation-point active" : "donation-point"}
              style={{
                "--x": `${point.x / 10}%`,
                "--y": `${point.y}%`,
                "--point-delay": `${(index / Math.max(points.length - 1, 1)) * LINE_DRAW_MS}ms`,
              }}
              onMouseEnter={() => setActiveYear(point.year)}
              onMouseLeave={() => setActiveYear(null)}
              onFocus={() => setActiveYear(point.year)}
              onBlur={() => setActiveYear(null)}
              onClick={() => setActiveYear(point.year)}
              aria-label={`${point.year}: ${formatCurrencyWhole(point.valuation)}, ${formatPounds(point.pounds)}, ${point.shipments} shipments`}
            >
              <span className="donation-point-value">{formatCompactCurrency(point.valuation)}</span>
              <span className="donation-point-dot" />
            </button>
          ))}
        </div>

        <div className="donation-x-axis" aria-hidden="true">
          {points.map((point) => (
            <span
              key={point.year}
              className={point.year === activeYear ? "active" : ""}
              style={{ "--x": `${point.x / 10}%` }}
            >
              <span className="donation-year-full">{point.year}</span>
              <span className="donation-year-short">&rsquo;{String(point.year).slice(-2)}</span>
              {point.year === currentYear ? <small> YTD</small> : null}
            </span>
          ))}
        </div>
      </div>

      {history?.source === "snapshot" ? (
        <p className="donation-footnote">
          Showing saved figures: the Master Shipment Database couldn't be read just now.
        </p>
      ) : null}
    </section>
  );
}
