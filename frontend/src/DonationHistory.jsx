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

function formatCompactCurrency(value, significantDigits = null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    ...(significantDigits ? { maximumSignificantDigits: significantDigits } : { maximumFractionDigits: 1 }),
  }).format(value ?? 0);
}

function formatCompactPounds(value) {
  return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 }).format(value ?? 0)} lbs`;
}

function formatPounds(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0)} lbs`;
}

// Categorical slots in fixed order (brand blue first); validated for
// colorblind separation. Chapters keep their slot by rank in the totals.
// Brand categorical palette, shared with the inventory charts (validated:
// lightness band, chroma, CVD and normal-vision separation on white).
const CHAPTER_COLORS = ["#0069f3", "#f0643c", "#12a58a", "#e29b00", "#d9609e", "#5a4fcf", "#2f8a2f"];
const DONUT_RADIUS = 70;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
// Surface-colored gap between slices, in SVG units along the ring.
const DONUT_GAP = 2;

function formatPercent(value) {
  return `${value < 1 ? value.toFixed(1) : Math.round(value)}%`;
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

function ChapterBreakdown({ chapters, visible }) {
  const [activeChapter, setActiveChapter] = useState(null);
  const total = chapters.reduce((sum, entry) => sum + entry.valuation, 0) || 1;

  // Chapters past the palette fold into "Other" rather than reusing a color.
  const slices = chapters.slice(0, CHAPTER_COLORS.length - 1);
  const rest = chapters.slice(CHAPTER_COLORS.length - 1);
  if (rest.length === 1) {
    slices.push(rest[0]);
  } else if (rest.length > 1) {
    slices.push({
      chapter: "Other",
      valuation: rest.reduce((sum, entry) => sum + entry.valuation, 0),
      shipments: rest.reduce((sum, entry) => sum + entry.shipments, 0),
    });
  }

  let offset = 0;
  const arcs = slices.map((entry, index) => {
    const share = entry.valuation / total;
    const length = share * DONUT_CIRCUMFERENCE;
    const arc = {
      ...entry,
      share: share * 100,
      color: CHAPTER_COLORS[index],
      length: Math.max(length - DONUT_GAP, 0.5),
      offset,
      delay: offset / DONUT_CIRCUMFERENCE,
    };
    offset += length;
    return arc;
  });
  const active = arcs.find((entry) => entry.chapter === activeChapter);

  return (
    <div className="chapter-breakdown">
      <div className="donation-chart-header">
        <h3>Donated value by chapter</h3>
        <p className="donation-chart-detail">
          {active
            ? `${active.chapter}: ${formatCurrencyWhole(active.valuation)} · ${formatPercent(active.share)} · ${active.shipments} shipment${active.shipments === 1 ? "" : "s"}`
            : "Hover or tap a chapter for its share."}
        </p>
      </div>

      <div className={visible ? "chapter-breakdown-body is-visible" : "chapter-breakdown-body"}>
        <div className="chapter-donut">
          <svg viewBox="0 0 200 200" role="img" aria-label="Donated value by chapter">
            <g transform="rotate(-90 100 100)">
              {arcs.map((entry) => (
                <circle
                  key={entry.chapter}
                  className={entry.chapter === activeChapter ? "chapter-slice active" : "chapter-slice"}
                  cx="100"
                  cy="100"
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={entry.color}
                  style={{
                    "--slice-length": entry.length,
                    "--slice-delay": `${entry.delay * 1400}ms`,
                    strokeDasharray: `${entry.length} ${DONUT_CIRCUMFERENCE}`,
                    strokeDashoffset: -entry.offset,
                  }}
                  onMouseEnter={() => setActiveChapter(entry.chapter)}
                  onMouseLeave={() => setActiveChapter(null)}
                  onClick={() => setActiveChapter(entry.chapter)}
                />
              ))}
            </g>
          </svg>
          <div className="chapter-donut-center" aria-hidden="true">
            <strong>{active ? formatPercent(active.share) : arcs.length}</strong>
            <span>{active ? active.chapter : "chapters"}</span>
          </div>
        </div>

        <ul className="chapter-legend">
          {arcs.map((entry) => (
            <li key={entry.chapter}>
              <button
                type="button"
                className={entry.chapter === activeChapter ? "active" : ""}
                onMouseEnter={() => setActiveChapter(entry.chapter)}
                onMouseLeave={() => setActiveChapter(null)}
                onFocus={() => setActiveChapter(entry.chapter)}
                onBlur={() => setActiveChapter(null)}
              >
                <span className="chapter-swatch" style={{ background: entry.color }} />
                <span className="chapter-name">{entry.chapter}</span>
                <span className="chapter-value" title={formatCurrencyWhole(entry.valuation)}>
                  {formatCompactCurrency(entry.valuation, 3)}
                </span>
                <span className="chapter-share">{formatPercent(entry.share)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// history may already be narrowed to a range of years (rangeLabel says which);
// allYears is the full by-year list, so year-over-year still has a prior year.
export default function DonationHistory({
  history,
  allYears = null,
  error,
  sideContent = null,
  mapContent = null,
  yearFilter = null,
  rangeLabel = "",
}) {
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
  // Year-over-year change: the last year shown against the one before it.
  const latestYear = years[years.length - 1];
  const priorYear = (allYears ?? years).find((entry) => entry.year === latestYear?.year - 1);
  const yearChange =
    latestYear && priorYear?.valuation > 0
      ? (latestYear.valuation - priorYear.valuation) / priorYear.valuation
      : null;
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
          <p className="section-label">{rangeLabel ? `Donated ${rangeLabel}` : "Donated to date"}</p>
          <div className="donation-toolbar">
            {yearFilter}
            <button
              type="button"
              className="secondary-button donation-report-button"
              onClick={() => window.print()}
            >
              Download report
            </button>
          </div>
          <div className="donation-total-row">
            <p className="donation-total" aria-live="polite">
              {history ? formatCurrencyWhole(animatedTotal) : "—"}
            </p>
            {yearChange !== null ? (
              <p
                className={yearChange >= 0 ? "donation-yoy is-up" : "donation-yoy is-down"}
                aria-label={`${yearChange >= 0 ? "Up" : "Down"} ${Math.round(Math.abs(yearChange) * 100)}% year over year`}
                title={`${latestYear.year}${latestYear.year === currentYear ? " so far" : ""}: ${formatCurrencyWhole(latestYear.valuation)} · ${priorYear.year}: ${formatCurrencyWhole(priorYear.valuation)}`}
              >
                <span className="donation-yoy-change">
                  <span aria-hidden="true">{yearChange >= 0 ? "▲" : "▼"}</span>
                  {" "}
                  {Math.round(Math.abs(yearChange) * 100)}% YoY
                </span>
                <span className="donation-yoy-detail">
                  {latestYear.year} v {priorYear.year}
                </span>
              </p>
            ) : null}
          </div>
          <p className="donation-subtitle">
            {rangeLabel
              ? `Estimated value of the medical supplies Blueprints shipped in ${rangeLabel}.`
              : `Estimated value of the medical supplies Blueprints has shipped${firstYear ? ` since ${firstYear}` : ""}.`}
          </p>
        </div>
        <dl className="donation-stats">
          <div>
            <dt>Supplies shipped</dt>
            <dd title={history ? formatPounds(history.total_pounds) : undefined}>
              {history ? formatCompactPounds(history.total_pounds) : "—"}
            </dd>
          </div>
          <div>
            <dt>Shipments</dt>
            <dd>{history ? history.total_shipments : "—"}</dd>
          </div>
          <div>
            <dt>{rangeLabel ? "Years shown" : "Years active"}</dt>
            <dd>{years.length || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="donation-top-split">
        <div className="donation-year">
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
                    <stop offset="0%" stopColor="#0069f3" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#0069f3" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {points.length ? (
                  <>
                    <path className="donation-area" d={areaPath} fill="url(#donation-area-fill)" />
                    <path
                      className="donation-line"
                      d={linePath}
                      fill="none"
                      stroke="#0035a2"
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

        </div>
        {mapContent}
        {history?.chapters?.length ? (
          <ChapterBreakdown chapters={history.chapters} visible={seen && Boolean(history)} />
        ) : null}
        {sideContent}
      </div>

      {history?.source === "snapshot" ? (
        <p className="donation-footnote">
          Showing saved figures: the Master Shipment Database couldn't be read just now.
        </p>
      ) : null}
    </section>
  );
}
