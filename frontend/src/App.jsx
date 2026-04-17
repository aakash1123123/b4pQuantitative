import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";
const SHIPMENT_STORAGE_KEY = "blueprints-current-shipments";

const tabs = [
  { id: "inventory", label: "Total Inventory" },
  { id: "kpis", label: "Inventory KPIs" },
  { id: "shipments", label: "Shipments" },
  { id: "shipment-kpis", label: "Shipment KPIs" },
];

const defaultShipments = [
  {
    id: "shipment-1",
    recipientName: "Shipment A",
    shipmentType: "Local",
    pointOfContact: "",
    filterMode: "original",
    items: [],
  },
  {
    id: "shipment-2",
    recipientName: "Shipment B",
    shipmentType: "Local",
    pointOfContact: "",
    filterMode: "original",
    items: [],
  },
];

const shipmentTypeOptions = ["Local", "International"];
const transportTypeOptions = ["Car", "Boat", "Plane", "Other"];

function normalizeShipmentType(value) {
  return value === "National" ? "International" : value || "Local";
}

function getShipmentStatus(shipment) {
  if (!shipment.items.length) {
    return "Planning";
  }

  const consolidatedCount = shipment.items.filter((item) => item.isConsolidated).length;
  if (consolidatedCount === 0) {
    return "Planning";
  }
  if (consolidatedCount === shipment.items.length) {
    return "Consolidation Complete";
  }
  return "Consolidating";
}

function normalizeRequestedQuantity(item) {
  const maxQuantity = Number(item.quantity) || 0;
  const requestedQuantity = Number(item.requestedQuantity);

  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return maxQuantity;
  }

  return Math.min(requestedQuantity, maxQuantity || requestedQuantity);
}

function normalizeShipmentItem(item) {
  return {
    ...item,
    requestedQuantity: normalizeRequestedQuantity(item),
  };
}

function buildDefaultConsolidationState(item) {
  return {
    exactMatch: null,
    consolidatedQuantity: normalizeRequestedQuantity(item),
    varianceReason: [],
  };
}

function normalizeVarianceReasons(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function getAutomaticConsolidationReasons(requestedQuantity, totalQuantity, actualQuantity) {
  if (actualQuantity <= requestedQuantity) {
    return [];
  }
  if (requestedQuantity >= totalQuantity) {
    return ["Found extra units"];
  }
  if (actualQuantity > totalQuantity) {
    return ["Gave more than requested", "Found extra units"];
  }
  return ["Gave more than requested"];
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value ?? 0);
}

function formatExpiration(value) {
  return value || "No expiration date";
}

function daysUntil(dateValue) {
  if (!dateValue) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function expirationStatus(diff) {
  if (diff === null) {
    return {
      label: "No expiration date",
      tone: "none",
    };
  }

  if (diff <= 0) {
    return {
      label: `${Math.abs(diff)} days overdue`,
      tone: "expired",
    };
  }

  if (diff <= 90) {
    return {
      label: `${diff} days left`,
      tone: "urgent",
    };
  }

  if (diff <= 180) {
    return {
      label: `${diff} days left`,
      tone: "warning",
    };
  }

  if (diff <= 365) {
    return {
      label: `${diff} days left`,
      tone: "caution",
    };
  }

  return {
    label: `${diff} days left`,
    tone: "healthy",
  };
}

function expirationBucket(dateValue) {
  const diff = daysUntil(dateValue);
  if (diff === null) {
    return "No expiration date";
  }
  if (diff <= 0) {
    return "Already expired";
  }
  if (diff <= 90) {
    return "0-90 days";
  }
  if (diff <= 180) {
    return "90-180 days";
  }
  if (diff <= 365) {
    return "180-365 days";
  }
  return "365+ days";
}

function durationBucket(warehouseDate) {
  const diff = daysUntil(warehouseDate);
  const daysInWarehouse = diff === null ? null : Math.abs(diff);

  if (daysInWarehouse === null) {
    return "Unknown duration";
  }
  if (daysInWarehouse <= 30) {
    return "0-30 days";
  }
  if (daysInWarehouse <= 90) {
    return "31-90 days";
  }
  if (daysInWarehouse <= 180) {
    return "91-180 days";
  }
  if (daysInWarehouse <= 365) {
    return "181-365 days";
  }
  return "365+ days";
}

function buildInventoryRows(items) {
  return items.map((item) => ({
    id: item.id,
    supplyId: item.id,
    quantity: item.quantity || 0,
    unitPrice: item.unit_value || 0,
    palletSortValue: Number(item.pallet_number) || 0,
    palletNumber: item.pallet_number ? String(item.pallet_number) : "Unassigned",
    boxType: item.category_box || "Unassigned",
    boxNumber: Number(item.box_number) || 0,
    daysInWarehouse: item.days_in_warehouse ?? 0,
    generalSupply: item.gen_name || "Unspecified",
    exactSupplyName: item.name || "Unnamed supply",
    manufacturer: item.manufacturer || "Unknown",
    category: item.category || "Uncategorized",
    reviewStatus: item.review_status || "",
    needsReview: (item.review_status || "").trim().toLowerCase() === "review needed",
    imageUrl: item.image_url || "",
    locationInfo: `Pallet ${item.pallet_number || "N/A"} - ${item.category_box || "Unassigned"} #${item.box_number || "N/A"}`,
    expirationDate: formatExpiration(item.expiration_date),
    expirationRaw: item.expiration_date || null,
    expirationDaysLeft: daysUntil(item.expiration_date || null),
    expirationStatus: expirationStatus(daysUntil(item.expiration_date || null)),
    warehouseDate: item.warehouse_date || null,
    expirationFilter: expirationBucket(item.expiration_date || null),
    durationFilter: durationBucket(item.warehouse_date || null),
    valuation: item.total_value || 0,
  }));
}

function compareItemsByLocation(left, right) {
  const palletDiff = (left.palletSortValue || 0) - (right.palletSortValue || 0);
  if (palletDiff !== 0) {
    return palletDiff;
  }

  const boxTypeDiff = (left.boxType || "").localeCompare(right.boxType || "");
  if (boxTypeDiff !== 0) {
    return boxTypeDiff;
  }

  const boxNumberDiff = (left.boxNumber || 0) - (right.boxNumber || 0);
  if (boxNumberDiff !== 0) {
    return boxNumberDiff;
  }

  return String(left.supplyId || "").localeCompare(String(right.supplyId || ""));
}

function sortItemsByLocation(items) {
  return [...items].sort(compareItemsByLocation);
}

function sortItemsByExpiration(items) {
  return [...items].sort((left, right) => {
    const leftDays = left.expirationDaysLeft;
    const rightDays = right.expirationDaysLeft;

    if (leftDays === null && rightDays !== null) {
      return 1;
    }
    if (leftDays !== null && rightDays === null) {
      return -1;
    }
    if (leftDays !== null && rightDays !== null && leftDays !== rightDays) {
      return leftDays - rightDays;
    }

    return compareItemsByLocation(left, right);
  });
}

function getShipmentItemsForDisplay(shipment) {
  if ((shipment.filterMode || "original") === "expiration") {
    return sortItemsByExpiration(shipment.items);
  }
  if (shipment.filterMode === "location") {
    return sortItemsByLocation(shipment.items);
  }

  return shipment.items;
}

function inventoryStatusForItem(itemId, shipments) {
  const isPulled = shipments.some((shipment) =>
    shipment.items.some((shipmentItem) => String(shipmentItem.id) === String(itemId))
  );

  return isPulled ? "Pulled" : "Available";
}

function buildFacetCounts(rows, key, preferredOrder = []) {
  const counts = rows.reduce((accumulator, row) => {
    const value = row[key];
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});

  const remaining = Object.keys(counts)
    .filter((value) => !preferredOrder.includes(value))
    .sort((a, b) => a.localeCompare(b));

  return [...preferredOrder, ...remaining].map((value) => ({
    value,
    count: counts[value] || 0,
  }));
}

function percentOfTotal(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 1000) / 10;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

const expirationBucketColors = {
  "Already expired": "#111111",
  "Already Expired": "#111111",
  "0-90 days": "#d93025",
  "90-180 days": "#f57c00",
  "180-365 days": "#f4c542",
  "365+ days": "#1e8e3e",
  "No expiration": "#b7c9dc",
  "No expiration date": "#b7c9dc",
};

const durationBucketColors = {
  "0-30 days": "#dce9f8",
  "31-90 days": "#a9c9ee",
  "91-180 days": "#6fa2d9",
  "181-365 days": "#356fae",
  "365+ days": "#0d3b6f",
  "Unknown duration": "#d8dde6",
};

const durationBucketOrder = [
  "0-30 days",
  "31-90 days",
  "91-180 days",
  "181-365 days",
  "365+ days",
];

const categoryPiePalette = [
  "#0d3b6f",
  "#1f5f99",
  "#2f7db6",
  "#4b95c9",
  "#6aaed6",
  "#8bc2df",
  "#4b6785",
  "#5d7c9d",
  "#7a96b2",
  "#98b0c6",
  "#b6cad9",
  "#d2e0eb",
];

function buildPieChartBackground(segments) {
  if (!segments.length) {
    return "conic-gradient(#dfe9f5 0deg 360deg)";
  }

  let currentAngle = 0;
  const stops = segments.map((segment) => {
    const start = currentAngle;
    const sweep = (segment.value / segment.total) * 360;
    currentAngle += sweep;
    return `${segment.color} ${start}deg ${currentAngle}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function buildPieChartSegments(segments) {
  if (!segments.length) {
    return [];
  }

  const center = 100;
  const outerRadius = 100;
  const innerRadius = 72;

  function pointForAngle(angleInDegrees, radius) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(angleInRadians),
      y: center + radius * Math.sin(angleInRadians),
    };
  }

  function buildDonutSlicePath(startAngle, endAngle) {
    const outerStart = pointForAngle(startAngle, outerRadius);
    const outerEnd = pointForAngle(endAngle, outerRadius);
    const innerEnd = pointForAngle(endAngle, innerRadius);
    const innerStart = pointForAngle(startAngle, innerRadius);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
      "Z",
    ].join(" ");
  }

  let currentAngle = 0;
  return segments.map((segment) => {
    const startAngle = currentAngle;
    const sweep = segment.total ? (segment.value / segment.total) * 360 : 0;
    const midAngle = currentAngle + sweep / 2;
    currentAngle += sweep;

    return {
      ...segment,
      startAngle,
      endAngle: currentAngle,
      midAngle,
      path: buildDonutSlicePath(startAngle, currentAngle),
    };
  });
}

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function PieChartCard({
  title,
  ariaLabel,
  totalItems,
  segments,
  legendSegments = segments,
  background,
  activeLabel,
  onHover,
  cardClassName = "",
}) {
  const normalizedActiveLabel = (activeLabel || "").trim().toLowerCase();

  return (
    <div className={`expiry-chart-card compact ${cardClassName}`.trim()}>
      <h4>{title}</h4>
      <div className="expiration-pie-layout">
        <div className="expiration-pie-wrap">
          <div
            className="expiration-pie-chart"
            style={{ background }}
            aria-label={ariaLabel}
            role="img"
            onMouseLeave={() => onHover(null)}
          >
            <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
              {segments.map((segment) => (
                <path
                  key={segment.label}
                  d={segment.path}
                  className={
                    normalizedActiveLabel === segment.label.trim().toLowerCase()
                      ? "pie-slice-hotspot active"
                      : "pie-slice-hotspot"
                  }
                  onPointerEnter={() => onHover(segment.label)}
                  onPointerMove={() => onHover(segment.label)}
                />
              ))}
            </svg>
            <div className="expiration-pie-center">
              <strong>{formatNumber(totalItems)}</strong>
              <span>raw items</span>
            </div>
          </div>
        </div>

        <div className="expiration-pie-legend">
          {legendSegments.map((segment) => (
            <div
              className={
                normalizedActiveLabel === segment.label.trim().toLowerCase()
                  ? "expiration-pie-legend-row active"
                  : "expiration-pie-legend-row"
              }
              key={segment.label}
              onPointerEnter={() => onHover(segment.label)}
              onPointerLeave={() => onHover(null)}
            >
                <span
                  className="expiration-pie-swatch"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
              <div className="expiration-pie-copy">
                <strong>{segment.label}</strong>
                <span>
                  {formatNumber(segment.value)} items • {segment.percentage}% of raw items
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("inventory");
  const [activeShipmentSubtab, setActiveShipmentSubtab] = useState("current");
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExpiration, setSelectedExpiration] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedPallets, setSelectedPallets] = useState([]);
  const [selectedBoxTypes, setSelectedBoxTypes] = useState([]);
  const [showAvailableItems, setShowAvailableItems] = useState(false);
  const [shipments, setShipments] = useState(defaultShipments);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [pendingShipmentItems, setPendingShipmentItems] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("__new__");
  const [newShipmentRecipientName, setNewShipmentRecipientName] = useState("");
  const [newShipmentType, setNewShipmentType] = useState("Local");
  const [newShipmentPointOfContact, setNewShipmentPointOfContact] = useState("");
  const [newShipmentSupplyIds, setNewShipmentSupplyIds] = useState("");
  const [selectedInventoryIds, setSelectedInventoryIds] = useState([]);
  const [valuationRange, setValuationRange] = useState({ min: 0, max: 0 });
  const [shipmentSearchTerm, setShipmentSearchTerm] = useState("");
  const [isCreateShipmentModalOpen, setIsCreateShipmentModalOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState(null);
  const [returningShipmentItem, setReturningShipmentItem] = useState(null);
  const [requestingShipmentItem, setRequestingShipmentItem] = useState(null);
  const [consolidatingShipmentItem, setConsolidatingShipmentItem] = useState(null);
  const [consolidationExactAnswer, setConsolidationExactAnswer] = useState(null);
  const [consolidatedUnitsValue, setConsolidatedUnitsValue] = useState("");
  const [consolidationVarianceReasons, setConsolidationVarianceReasons] = useState([]);
  const [addingSupplyIdsShipmentId, setAddingSupplyIdsShipmentId] = useState(null);
  const [shipmentSupplyIdsInput, setShipmentSupplyIdsInput] = useState("");
  const [requestedUnitsValue, setRequestedUnitsValue] = useState("");
  const [expandedShipmentIds, setExpandedShipmentIds] = useState([]);
  const [editingShipmentField, setEditingShipmentField] = useState(null);
  const [editingShipmentValue, setEditingShipmentValue] = useState("");
  const [shippingShipmentId, setShippingShipmentId] = useState(null);
  const [shipmentDate, setShipmentDate] = useState("");
  const [transportType, setTransportType] = useState("Car");
  const [transportTypeOther, setTransportTypeOther] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryDateMode, setDeliveryDateMode] = useState("date");
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [activeExpirationPieLabel, setActiveExpirationPieLabel] = useState(null);
  const [activeDurationPieLabel, setActiveDurationPieLabel] = useState(null);
  const [activeCategoryPieLabel, setActiveCategoryPieLabel] = useState(null);

  async function refreshDashboard(showLoader = false) {
    try {
      if (showLoader) {
        setLoading(true);
      }
      setError("");

      const [itemsResponse, kpisResponse] = await Promise.all([
        fetch(`${API_BASE}/items`),
        fetch(`${API_BASE}/kpis`),
      ]);

      if (!itemsResponse.ok || !kpisResponse.ok) {
        throw new Error("The dashboard could not load data from the backend.");
      }

      const [itemsData, kpisData] = await Promise.all([
        itemsResponse.json(),
        kpisResponse.json(),
      ]);

      setItems(itemsData);
      setKpis(kpisData);
    } catch (err) {
      setError(err.message || "Something went wrong while loading the dashboard.");
      throw err;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    refreshDashboard(true).catch(() => {
      if (cancelled) {
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const storedShipments = window.localStorage.getItem(SHIPMENT_STORAGE_KEY);
      if (storedShipments) {
        const parsedShipments = JSON.parse(storedShipments);
        const normalizedShipments = (parsedShipments.length > 0 ? parsedShipments : defaultShipments)
          .map((shipment) => ({
            ...shipment,
            shipmentType: normalizeShipmentType(shipment.shipmentType),
            filterMode:
              !shipment.filterMode || shipment.filterMode === "location"
                ? "original"
                : shipment.filterMode,
            isCompleted: Boolean(shipment.isCompleted),
            items: (shipment.items || []).map(normalizeShipmentItem),
          }));
        setShipments(normalizedShipments);
      }
    } catch (err) {
      console.error("Unable to restore shipments", err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHIPMENT_STORAGE_KEY, JSON.stringify(shipments));
    } catch (err) {
      console.error("Unable to persist shipments", err);
    }
  }, [shipments]);

  const inventoryRows = buildInventoryRows(items);
  const inventoryRowsWithStatus = inventoryRows.map((row) => ({
    ...row,
    inventoryStatus: inventoryStatusForItem(row.id, shipments),
  }));
  const unitPriceValues = inventoryRowsWithStatus.map((row) => row.unitPrice);
  const minUnitPrice = unitPriceValues.length > 0 ? Math.min(...unitPriceValues) : 0;
  const maxUnitPrice = unitPriceValues.length > 0 ? Math.max(...unitPriceValues) : 0;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const expirationOptions = buildFacetCounts(inventoryRowsWithStatus, "expirationFilter", [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ]);
  const durationOptions = buildFacetCounts(
    inventoryRowsWithStatus.filter((row) => row.durationFilter !== "Unknown duration"),
    "durationFilter",
    durationBucketOrder
  );
  const categoryOptions = buildFacetCounts(inventoryRowsWithStatus, "category");
  const palletOptions = buildFacetCounts(inventoryRowsWithStatus, "palletNumber").sort(
    (left, right) => {
      const leftNumber = Number(left.value);
      const rightNumber = Number(right.value);

      if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
        return leftNumber - rightNumber;
      }

      return left.value.localeCompare(right.value);
    }
  );
  const boxTypeOptions = buildFacetCounts(inventoryRowsWithStatus, "boxType");

  useEffect(() => {
    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
  }, [minUnitPrice, maxUnitPrice]);

  function matchesSelectedFilter(selectedValues, rowValue) {
    return selectedValues.length === 0 || selectedValues.includes(rowValue);
  }

  function toggleFilter(setter, currentValues, value) {
    setter(
      currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value]
    );
  }

  function openShipmentModal(selectedItems) {
    if (selectedItems.length === 0) {
      return;
    }

    setPendingShipmentItems(selectedItems);
    setSelectedShipmentId(currentShipments[0]?.id || "__new__");
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentSupplyIds("");
    setIsShipmentModalOpen(true);
  }

  function closeShipmentModal() {
    setIsShipmentModalOpen(false);
    setPendingShipmentItems([]);
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentSupplyIds("");
  }

  function openCreateShipmentModal() {
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentSupplyIds("");
    setIsCreateShipmentModalOpen(true);
  }

  function closeCreateShipmentModal() {
    setIsCreateShipmentModalOpen(false);
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentSupplyIds("");
  }

  function parseSupplyIdsInput(value) {
    return [...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    )];
  }

  function itemsFromSupplyIds(value) {
    const selectedIds = parseSupplyIdsInput(value);
    return inventoryRowsWithStatus.filter((row) => selectedIds.includes(String(row.supplyId)));
  }

  function buildShipmentRecord(recipientName, shipmentType, pointOfContact, items = []) {
    return {
      id: `shipment-${Date.now()}`,
      recipientName,
      shipmentType: normalizeShipmentType(shipmentType),
      pointOfContact,
      filterMode: "original",
      items,
    };
  }

  function setShipmentFilterMode(shipmentId, filterMode) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === shipmentId
          ? { ...shipment, filterMode }
          : shipment
      )
    );
  }

  function addItemToShipment() {
    if (pendingShipmentItems.length === 0) {
      return;
    }

    setShipments((currentShipments) => {
      let workingShipments = currentShipments;
      let targetShipmentId = selectedShipmentId;

      if (selectedShipmentId === "__new__") {
        const recipientName = newShipmentRecipientName.trim();
        const shipmentType = newShipmentType;
        const pointOfContact = newShipmentPointOfContact.trim();

        if (!recipientName || !shipmentType || !pointOfContact) {
          return currentShipments;
        }

        const newShipment = buildShipmentRecord(recipientName, shipmentType, pointOfContact);
        targetShipmentId = newShipment.id;
        workingShipments = [
          ...currentShipments,
          newShipment,
        ];
      }

      return workingShipments.map((shipment) => {
        if (shipment.id !== targetShipmentId) {
          return shipment;
        }

        const existingIds = new Set(shipment.items.map((shipmentItem) => String(shipmentItem.id)));
        const newItems = pendingShipmentItems
          .filter((item) => !existingIds.has(String(item.id)))
          .map(normalizeShipmentItem);

        return {
          ...shipment,
          items: [...shipment.items, ...newItems],
        };
      });
    });

    setActiveTab("shipments");
    setActiveShipmentSubtab("current");
    setSelectedInventoryIds([]);
    closeShipmentModal();
  }

  function createNewShipment() {
    const recipientName = newShipmentRecipientName.trim();
    const shipmentType = newShipmentType;
    const pointOfContact = newShipmentPointOfContact.trim();
    const shipmentItems = itemsFromSupplyIds(newShipmentSupplyIds);

    if (!recipientName || !shipmentType || !pointOfContact) {
      return;
    }

    setShipments((currentShipments) => [
      ...currentShipments,
      buildShipmentRecord(
        recipientName,
        shipmentType,
        pointOfContact,
        shipmentItems.map(normalizeShipmentItem)
      ),
    ]);
    closeCreateShipmentModal();
  }

  function toggleInventorySelection(itemId) {
    setSelectedInventoryIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId]
    );
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filteredInventoryRows.map((row) => row.id);
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedInventoryIds.includes(id));

    setSelectedInventoryIds((currentIds) => {
      if (allSelected) {
        return currentIds.filter((id) => !filteredIds.includes(id));
      }

      return [...new Set([...currentIds, ...filteredIds])];
    });
  }

  function openDetailsModal(item) {
    setDetailsItem(item);
  }

  function closeDetailsModal() {
    setDetailsItem(null);
  }

  function openReturnToInventoryModal(shipmentId, shipmentItem) {
    setReturningShipmentItem({ shipmentId, shipmentItem });
  }

  function closeReturnToInventoryModal() {
    setReturningShipmentItem(null);
  }

  function openRequestedUnitsModal(shipmentId, shipmentItem) {
    setRequestingShipmentItem({ shipmentId, shipmentItem });
    setRequestedUnitsValue(
      String(normalizeRequestedQuantity(shipmentItem) || shipmentItem.quantity || 0)
    );
  }

  function closeRequestedUnitsModal() {
    setRequestingShipmentItem(null);
    setRequestedUnitsValue("");
  }

  function openConsolidationModal(shipmentId, shipmentItem) {
    const requestedQuantity = normalizeRequestedQuantity(shipmentItem);
    const existingDetails = shipmentItem.consolidationDetails || buildDefaultConsolidationState(shipmentItem);
    setConsolidatingShipmentItem({ shipmentId, shipmentItem });
    setConsolidationExactAnswer(existingDetails.exactMatch);
    setConsolidatedUnitsValue(
      String(existingDetails.consolidatedQuantity || requestedQuantity || shipmentItem.quantity || 0)
    );
    setConsolidationVarianceReasons(normalizeVarianceReasons(existingDetails.varianceReason));
  }

  function closeConsolidationModal() {
    setConsolidatingShipmentItem(null);
    setConsolidationExactAnswer(null);
    setConsolidatedUnitsValue("");
    setConsolidationVarianceReasons([]);
  }

  function openAddSupplyIdsModal(shipmentId) {
    setAddingSupplyIdsShipmentId(shipmentId);
    setShipmentSupplyIdsInput("");
  }

  function closeAddSupplyIdsModal() {
    setAddingSupplyIdsShipmentId(null);
    setShipmentSupplyIdsInput("");
  }

  function startEditingShipmentField(shipmentId, field, value) {
    setEditingShipmentField({ shipmentId, field });
    setEditingShipmentValue(value || "");
  }

  function saveShipmentFieldValue(shipmentId, field, rawValue) {
    const nextValue = typeof rawValue === "string" ? rawValue.trim() : rawValue;

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        if (field === "shipmentType") {
          return { ...shipment, shipmentType: normalizeShipmentType(rawValue) };
        }

        if (!nextValue) {
          return shipment;
        }

        return { ...shipment, [field]: nextValue };
      })
    );
  }

  function saveEditingShipmentField() {
    if (!editingShipmentField) {
      return;
    }

    saveShipmentFieldValue(
      editingShipmentField.shipmentId,
      editingShipmentField.field,
      editingShipmentValue
    );
    setEditingShipmentField(null);
    setEditingShipmentValue("");
  }

  function cancelEditingShipmentField() {
    setEditingShipmentField(null);
    setEditingShipmentValue("");
  }

  function openShippingModal(shipmentId) {
    setShippingShipmentId(shipmentId);
    setShipmentDate("");
    setTransportType("Car");
    setTransportTypeOther("");
    setDeliveryDate("");
    setDeliveryDateMode("date");
    setShipmentNotes("");
  }

  function closeShippingModal() {
    setShippingShipmentId(null);
    setShipmentDate("");
    setTransportType("Car");
    setTransportTypeOther("");
    setDeliveryDate("");
    setDeliveryDateMode("date");
    setShipmentNotes("");
  }

  function toggleShipmentItemConsolidated(shipmentId, itemId) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        return {
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(itemId)
              ? { ...item, isConsolidated: !item.isConsolidated }
              : item
          ),
        };
      })
    );
  }

  function returnShipmentItemToInventory() {
    if (!returningShipmentItem) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== returningShipmentItem.shipmentId) {
          return shipment;
        }

        return {
          ...shipment,
          items: shipment.items.filter(
            (item) => String(item.id) !== String(returningShipmentItem.shipmentItem.id)
          ),
        };
      })
    );
    closeReturnToInventoryModal();
  }

  function saveRequestedUnits() {
    if (!requestingShipmentItem) {
      return;
    }

    const maxQuantity = Number(requestingShipmentItem.shipmentItem.quantity) || 0;
    const parsedQuantity = Number(requestedUnitsValue);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > maxQuantity) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== requestingShipmentItem.shipmentId) {
          return shipment;
        }

        return {
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(requestingShipmentItem.shipmentItem.id)
              ? { ...item, requestedQuantity: parsedQuantity }
              : item
          ),
        };
      })
    );
    closeRequestedUnitsModal();
  }

  async function saveConsolidation() {
    if (!consolidatingShipmentItem || consolidationExactAnswer === null) {
      return;
    }

    const requestedQuantity = normalizeRequestedQuantity(consolidatingShipmentItem.shipmentItem);
    const supplyId = String(consolidatingShipmentItem.shipmentItem.supplyId);
    const parsedQuantity = Number(consolidatedUnitsValue);
    const consolidatedQuantity =
      consolidationExactAnswer === true ? requestedQuantity : parsedQuantity;

    if (
      !Number.isFinite(consolidatedQuantity) ||
      consolidatedQuantity <= 0
    ) {
      return;
    }

    if (
      consolidationExactAnswer === false &&
      consolidatedQuantity !== requestedQuantity &&
      consolidationDifference < 0 &&
      effectiveConsolidationVarianceReasons.length === 0
    ) {
      return;
    }

    const nextVarianceReasons =
      consolidatedQuantity === requestedQuantity
        ? []
        : effectiveConsolidationVarianceReasons;
    const shouldSyncFoundExtra = nextVarianceReasons.includes("Found extra units");

    try {
      if (shouldSyncFoundExtra) {
        const response = await fetch(`${API_BASE}/items/${encodeURIComponent(supplyId)}/quantity`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quantity: consolidatedQuantity }),
        });

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(errorPayload?.detail || "Unable to update Google Sheet quantity.");
        }
      }

      setShipments((currentShipments) =>
        currentShipments.map((shipment) => ({
          ...shipment,
          items: shipment.items.map((item) => {
            if (String(item.id) !== String(consolidatingShipmentItem.shipmentItem.id)) {
              return item;
            }

            const nextQuantity = shouldSyncFoundExtra ? consolidatedQuantity : item.quantity;
            const nextRequestedQuantity =
              shouldSyncFoundExtra && requestedQuantity >= consolidationTargetItem.quantity
                ? consolidatedQuantity
                : item.requestedQuantity;

            return {
              ...item,
              quantity: nextQuantity,
              requestedQuantity: nextRequestedQuantity,
              valuation: (item.unitPrice || 0) * nextQuantity,
              isConsolidated: true,
              consolidationDetails: {
                exactMatch: consolidationExactAnswer,
                consolidatedQuantity,
                varianceReason: nextVarianceReasons,
              },
            };
          }),
        }))
      );

      if (shouldSyncFoundExtra) {
        await refreshDashboard();
      }
      closeConsolidationModal();
    } catch (err) {
      setError(err.message || "Unable to save consolidation details.");
    }
  }

  function addSuppliesToShipmentById() {
    if (!addingSupplyIdsShipmentId) {
      return;
    }

    const shipmentItems = itemsFromSupplyIds(shipmentSupplyIdsInput).map(normalizeShipmentItem);
    if (shipmentItems.length === 0) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== addingSupplyIdsShipmentId) {
          return shipment;
        }

        const existingIds = new Set(shipment.items.map((shipmentItem) => String(shipmentItem.id)));
        const newItems = shipmentItems.filter((item) => !existingIds.has(String(item.id)));

        return {
          ...shipment,
          items: [...shipment.items, ...newItems],
        };
      })
    );
    closeAddSupplyIdsModal();
  }

  function consolidateAllShipmentItems(shipmentId) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        return {
          ...shipment,
          items: shipment.items.map((item) => ({
            ...item,
            isConsolidated: true,
            consolidationDetails: {
              exactMatch: true,
              consolidatedQuantity: normalizeRequestedQuantity(item),
              varianceReason: "",
            },
          })),
        };
      })
    );
  }

  function markShipmentComplete() {
    if (!shippingShipmentId) {
      return;
    }

    const resolvedShipmentDate = shipmentDate.trim();
    const resolvedTransportType = transportType === "Other"
      ? transportTypeOther.trim()
      : transportType;
    const resolvedDeliveryDate = deliveryDateMode === "tbd"
      ? "TBD"
      : deliveryDate.trim();

    if (!resolvedShipmentDate || !resolvedTransportType || !resolvedDeliveryDate) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === shippingShipmentId
          ? {
              ...shipment,
              isCompleted: true,
              shippedAt: resolvedShipmentDate,
              transportType: resolvedTransportType,
              deliveryDate: resolvedDeliveryDate,
              shipmentNotes: shipmentNotes.trim(),
            }
          : shipment
      )
    );
    closeShippingModal();
  }

  function toggleShipmentSupplies(shipmentId) {
    setExpandedShipmentIds((currentIds) =>
      currentIds.includes(shipmentId)
        ? currentIds.filter((currentId) => currentId !== shipmentId)
        : [...currentIds, shipmentId]
    );
  }

  const filteredInventoryRows = inventoryRowsWithStatus.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      [row.generalSupply, row.exactSupplyName, row.manufacturer].some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );

    return (
      matchesSearch &&
      row.unitPrice >= valuationRange.min &&
      row.unitPrice <= valuationRange.max &&
      (!showAvailableItems || row.inventoryStatus === "Available") &&
      matchesSelectedFilter(selectedPallets, row.palletNumber) &&
      matchesSelectedFilter(selectedBoxTypes, row.boxType) &&
      matchesSelectedFilter(selectedExpiration, row.expirationFilter) &&
      matchesSelectedFilter(selectedDuration, row.durationFilter) &&
      matchesSelectedFilter(selectedCategories, row.category)
    );
  });
  const selectedInventoryItems = filteredInventoryRows.filter((row) =>
    selectedInventoryIds.includes(row.id)
  );
  const allFilteredSelected =
    filteredInventoryRows.length > 0 &&
    filteredInventoryRows.every((row) => selectedInventoryIds.includes(row.id));
  const normalizedShipmentSearch = shipmentSearchTerm.trim().toLowerCase();
  const currentShipments = shipments.filter((shipment) => !shipment.isCompleted);
  const pastShipments = shipments.filter((shipment) => shipment.isCompleted);
  const currentShipmentRequestMap = currentShipments.reduce((accumulator, shipment) => {
    shipment.items.forEach((item) => {
      const supplyId = String(item.supplyId || item.id || "");
      if (!supplyId) {
        return;
      }

      if (!accumulator[supplyId]) {
        accumulator[supplyId] = [];
      }

      accumulator[supplyId].push({
        shipmentId: shipment.id,
        shipmentName: shipment.recipientName || "Unnamed shipment",
        requestedQuantity: normalizeRequestedQuantity(item),
      });
    });

    return accumulator;
  }, {});
  const rankedShipments = [...currentShipments]
    .map((shipment) => {
      if (!normalizedShipmentSearch) {
        return { shipment, score: 0 };
      }

      let score = 0;
      const recipientName = shipment.recipientName.toLowerCase();
      if (recipientName.includes(normalizedShipmentSearch)) {
        score += recipientName === normalizedShipmentSearch ? 10 : 6;
      }

      shipment.items.forEach((item) => {
        const supplyId = String(item.supplyId || "").toLowerCase();
        const exactSupplyName = item.exactSupplyName.toLowerCase();
        const generalSupply = item.generalSupply.toLowerCase();
        const manufacturer = item.manufacturer.toLowerCase();

        if (supplyId.includes(normalizedShipmentSearch)) {
          score += supplyId === normalizedShipmentSearch ? 7 : 4;
        }
        if (exactSupplyName.includes(normalizedShipmentSearch)) {
          score += exactSupplyName === normalizedShipmentSearch ? 5 : 3;
        }
        if (generalSupply.includes(normalizedShipmentSearch)) {
          score += 2;
        }
        if (manufacturer.includes(normalizedShipmentSearch)) {
          score += 2;
        }
      });

      return { shipment, score };
    })
    .filter(({ shipment, score }) => !normalizedShipmentSearch || score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.shipment.recipientName.localeCompare(right.shipment.recipientName);
    })
    .map(({ shipment }) => shipment);
  const shipmentDetailsComplete =
    newShipmentRecipientName.trim() &&
    newShipmentType &&
    newShipmentPointOfContact.trim();
  const consolidationTargetItem = consolidatingShipmentItem?.shipmentItem || null;
  const consolidationRequestedQuantity = consolidationTargetItem
    ? normalizeRequestedQuantity(consolidationTargetItem)
    : 0;
  const consolidationTotalQuantity = Number(consolidationTargetItem?.quantity) || 0;
  const parsedConsolidatedUnitsValue = Number(consolidatedUnitsValue);
  const consolidationHasValidUnits =
    Number.isFinite(parsedConsolidatedUnitsValue) &&
    parsedConsolidatedUnitsValue > 0;
  const consolidationDifference = consolidationHasValidUnits
    ? parsedConsolidatedUnitsValue - consolidationRequestedQuantity
    : 0;
  const consolidationRequestNote = consolidationTargetItem
    ? consolidationRequestedQuantity === consolidationTotalQuantity
      ? `Requested all ${formatNumber(consolidationTotalQuantity)} units`
      : `Requested ${formatNumber(consolidationRequestedQuantity)} of ${formatNumber(consolidationTotalQuantity)} units`
    : "";
  const consolidationReasonOptions =
    consolidationExactAnswer === false && consolidationHasValidUnits
      ? consolidationDifference < 0
        ? ["Found less units", "Gave less than requested"]
        : []
      : [];
  const automaticConsolidationReasons =
    consolidationExactAnswer === false && consolidationHasValidUnits
      ? getAutomaticConsolidationReasons(
          consolidationRequestedQuantity,
          consolidationTotalQuantity,
          parsedConsolidatedUnitsValue
        )
      : [];
  const effectiveConsolidationVarianceReasons =
    consolidationDifference > 0
      ? automaticConsolidationReasons
      : consolidationVarianceReasons;
  const consolidationConfirmDisabled =
    consolidationExactAnswer === null ||
    (consolidationExactAnswer === false &&
      (!consolidationHasValidUnits ||
        (consolidationDifference < 0 && consolidationVarianceReasons.length === 0)));
  const shippingDetailsComplete =
    shipmentDate.trim() &&
    (transportType !== "Other" || transportTypeOther.trim()) &&
    (deliveryDateMode === "tbd" || deliveryDate.trim());
  const expiryRanges = Object.entries(kpis?.expiry_ranges || {});
  const expirationChartSegments = expiryRanges
    .map(([range, values]) => ({
      label: range,
      value: values?.raw_items ?? 0,
      entries: values?.entries ?? 0,
      color: expirationBucketColors[range] || "#4a90e2",
    }))
    .filter((segment) => segment.value > 0);
  const totalExpirationChartItems = expirationChartSegments.reduce(
    (total, segment) => total + segment.value,
    0
  );
  const expirationChartData = expirationChartSegments.map((segment) => ({
    ...segment,
    total: totalExpirationChartItems,
    percentage: percentOfTotal(segment.value, totalExpirationChartItems),
  }));
  const expirationPieBackground = buildPieChartBackground(expirationChartData);
  const expirationPieSegments = buildPieChartSegments(expirationChartData);
  const durationChartData = durationBucketOrder.map((bucketLabel) => {
    const matchingRows = inventoryRowsWithStatus.filter(
      (row) => row.durationFilter === bucketLabel
    );
    const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

    return {
      label: bucketLabel,
      value: rawItems,
      entries: matchingRows.length,
      color: durationBucketColors[bucketLabel] || "#4a90e2",
    };
  });
  const totalDurationChartItems = durationChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );
  const durationChartLegendData = durationChartData.map((segment) => ({
    ...segment,
    total: totalDurationChartItems,
    percentage: percentOfTotal(segment.value, totalDurationChartItems),
  }));
  const durationPieBackground = buildPieChartBackground(
    durationChartLegendData.filter((segment) => segment.value > 0)
  );
  const durationPieSegments = buildPieChartSegments(
    durationChartLegendData.filter((segment) => segment.value > 0)
  );
  const categoryChartData = buildFacetCounts(inventoryRowsWithStatus, "category")
    .map((bucket, index) => {
      const matchingRows = inventoryRowsWithStatus.filter((row) => row.category === bucket.value);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        entries: bucket.count,
        color: categoryPiePalette[index % categoryPiePalette.length],
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  const totalCategoryChartItems = categoryChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );
  const categoryChartLegendData = categoryChartData.map((segment) => ({
    ...segment,
    total: totalCategoryChartItems,
    percentage: percentOfTotal(segment.value, totalCategoryChartItems),
  }));
  const categoryPieBackground = buildPieChartBackground(
    categoryChartLegendData.filter((segment) => segment.value > 0)
  );
  const categoryPieSegments = buildPieChartSegments(
    categoryChartLegendData.filter((segment) => segment.value > 0)
  );
  const uniqueSupplyTypes = new Set(
    inventoryRowsWithStatus.map((row) => row.generalSupply).filter(Boolean)
  ).size;
  const uniqueExactSupplies = new Set(
    inventoryRowsWithStatus.map((row) => row.exactSupplyName).filter(Boolean)
  ).size;
  const uniqueCategories = new Set(
    inventoryRowsWithStatus.map((row) => row.category).filter(Boolean)
  ).size;
  const expiredInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft <= 0)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const expiringSoonInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft > 0 && row.expirationDaysLeft <= 90)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const noExpirationInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft === null)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const slowMovingInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.daysInWarehouse > 180)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const shipmentsWithItems = shipments.filter((shipment) => shipment.items.length > 0);
  const totalShipmentUnits = shipments.reduce(
    (total, shipment) =>
      total +
      shipment.items.reduce((shipmentTotal, item) => shipmentTotal + (item.quantity || 0), 0),
    0
  );
  const totalShipmentLines = shipments.reduce((total, shipment) => total + shipment.items.length, 0);
  const uniqueShipmentRecipients = new Set(
    shipments.map((shipment) => shipment.recipientName).filter(Boolean)
  ).size;
  const averageUnitsPerShipment = average(
    shipmentsWithItems.map((shipment) =>
      shipment.items.reduce((shipmentTotal, item) => shipmentTotal + (item.quantity || 0), 0)
    )
  );
  const shipmentsByType = shipmentTypeOptions.map((type) => ({
    type,
    count: shipments.filter((shipment) => normalizeShipmentType(shipment.shipmentType) === type).length,
  }));
  const maxShipmentTypeCount = shipmentsByType.reduce(
    (highest, shipmentType) => Math.max(highest, shipmentType.count),
    0
  );
  const nearExpiryShipmentUnits = shipments.reduce(
    (total, shipment) =>
      total +
      shipment.items
        .filter(
          (item) => item.expirationDaysLeft !== null && item.expirationDaysLeft > 0 && item.expirationDaysLeft <= 90
        )
        .reduce((shipmentTotal, item) => shipmentTotal + (item.quantity || 0), 0),
    0
  );
  const shippedCategoryCount = new Set(
    shipments.flatMap((shipment) => shipment.items.map((item) => item.category)).filter(Boolean)
  ).size;

  return (
    <main className="page-shell">
      <header className="top-bar">
        <h1>Blueprints Operations Dashboard</h1>
      </header>

      <section className="tabs-section">
        <div className="tabs" role="tablist" aria-label="Dashboard sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? <div className="panel">Loading dashboard data...</div> : null}
      {error ? <div className="panel error-panel">{error}</div> : null}

      {!loading && !error && activeTab === "inventory" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Total Inventory</p>
              <h2>Every supply as a line item</h2>
            </div>
            <div className="inventory-actions">
              <label className="availability-toggle">
                <span>Show Available Items</span>
                <button
                  type="button"
                  className={showAvailableItems ? "toggle-switch on" : "toggle-switch"}
                  onClick={() => setShowAvailableItems((current) => !current)}
                  aria-pressed={showAvailableItems}
                >
                  <span className="toggle-knob" />
                </button>
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={selectedInventoryItems.length === 0}
                onClick={() => openShipmentModal(selectedInventoryItems)}
              >
                Add Selected To Shipment
              </button>
              <span className="pill">{formatNumber(filteredInventoryRows.length)} entries</span>
            </div>
          </div>

          <div className="inventory-layout">
            <aside className="filters-sidebar">
              <div className="filters-header">
                <h3>Filter Inventory</h3>
                <button
                  type="button"
                  className="clear-filters"
                  onClick={() => {
                    setSelectedExpiration([]);
                    setSelectedDuration([]);
                    setSelectedCategories([]);
                    setSelectedPallets([]);
                    setSelectedBoxTypes([]);
                    setShowAvailableItems(false);
                    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
                    setSearchTerm("");
                  }}
                >
                  Clear all
                </button>
              </div>

              <div className="search-row">
                <label className="search-label" htmlFor="inventory-search">
                  Search inventory
                </label>
                <input
                  id="inventory-search"
                  className="search-input"
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by general supply, exact name, or manufacturer"
                />
              </div>

              <div className="filter-group">
                <h4>Price per Unit</h4>
                <div className="valuation-summary">
                  <span>{formatCurrency(valuationRange.min)}</span>
                  <span>{formatCurrency(valuationRange.max)}</span>
                </div>
                <div className="valuation-range-slider">
                  <div className="valuation-range-track" />
                  <div
                    className="valuation-range-active"
                    style={{
                      left: `${
                        maxUnitPrice === minUnitPrice
                          ? 0
                          : ((valuationRange.min - minUnitPrice) / (maxUnitPrice - minUnitPrice)) *
                            100
                      }%`,
                      right: `${
                        maxUnitPrice === minUnitPrice
                          ? 0
                          : 100 -
                            ((valuationRange.max - minUnitPrice) / (maxUnitPrice - minUnitPrice)) *
                              100
                      }%`,
                    }}
                  />
                  <input
                    type="range"
                    min={minUnitPrice}
                    max={maxUnitPrice}
                    step="1"
                    value={valuationRange.min}
                    onChange={(event) => {
                      const nextMin = Number(event.target.value);
                      setValuationRange((currentRange) => ({
                        min: Math.min(nextMin, currentRange.max),
                        max: currentRange.max,
                      }));
                    }}
                  />
                  <input
                    className="valuation-range-input valuation-range-input-max"
                    type="range"
                    min={minUnitPrice}
                    max={maxUnitPrice}
                    step="1"
                    value={valuationRange.max}
                    onChange={(event) => {
                      const nextMax = Number(event.target.value);
                      setValuationRange((currentRange) => ({
                        min: currentRange.min,
                        max: Math.max(nextMax, currentRange.min),
                      }));
                    }}
                  />
                </div>
              </div>

              <div className="filter-group">
                <h4>Pallet #</h4>
                {palletOptions.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedPallets.includes(option.value)}
                      onChange={() =>
                        toggleFilter(setSelectedPallets, selectedPallets, option.value)
                      }
                    />
                    <span>{option.value}</span>
                    <span className="filter-count">{option.count}</span>
                  </label>
                ))}
              </div>

              <div className="filter-group">
                <h4>Box Type</h4>
                {boxTypeOptions.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedBoxTypes.includes(option.value)}
                      onChange={() =>
                        toggleFilter(setSelectedBoxTypes, selectedBoxTypes, option.value)
                      }
                    />
                    <span>{option.value}</span>
                    <span className="filter-count">{option.count}</span>
                  </label>
                ))}
              </div>

              <div className="filter-group">
                <h4>Expiration Date</h4>
                {expirationOptions.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedExpiration.includes(option.value)}
                      onChange={() =>
                        toggleFilter(setSelectedExpiration, selectedExpiration, option.value)
                      }
                    />
                    <span>{option.value}</span>
                    <span className="filter-count">{option.count}</span>
                  </label>
                ))}
              </div>

              <div className="filter-group">
                <h4>Duration Date</h4>
                {durationOptions.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedDuration.includes(option.value)}
                      onChange={() =>
                        toggleFilter(setSelectedDuration, selectedDuration, option.value)
                      }
                    />
                    <span>{option.value}</span>
                    <span className="filter-count">{option.count}</span>
                  </label>
                ))}
              </div>

              <div className="filter-group">
                <h4>Supply Categories</h4>
                <div className="category-filter-list">
                  {categoryOptions.map((option) => (
                    <label key={option.value} className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(option.value)}
                        onChange={() =>
                          toggleFilter(setSelectedCategories, selectedCategories, option.value)
                        }
                      />
                      <span>{option.value}</span>
                      <span className="filter-count">{option.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            </aside>

            <div className="inventory-results">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select all filtered inventory items"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                        />
                      </th>
                      <th>ID</th>
                      <th>Status</th>
                      <th>General Supply</th>
                      <th>Exact Supply Name</th>
                      <th>Expiration Date</th>
                      <th>Quantity</th>
                      <th>Per Unit Price</th>
                      <th>Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryRows.map((row) => (
                      <tr
                        key={row.id}
                        className={row.needsReview ? "inventory-row-review" : undefined}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select supply ${row.supplyId}`}
                            checked={selectedInventoryIds.includes(row.id)}
                            onChange={() => toggleInventorySelection(row.id)}
                          />
                        </td>
                        <td>
                          <div className="id-cell">
                            <button
                              type="button"
                              className="info-icon-button"
                              onClick={() => openDetailsModal(row)}
                              aria-label={`Open details for supply ${row.supplyId}`}
                            >
                              ⓘ
                            </button>
                          </div>
                        </td>
                        <td>
                          <span
                            className={
                              row.inventoryStatus === "Pulled"
                                ? "status-pill pulled"
                                : "status-pill inventory"
                            }
                          >
                            {row.inventoryStatus}
                          </span>
                        </td>
                        <td>{row.generalSupply}</td>
                        <td>{row.exactSupplyName}</td>
                        <td>
                          <div className="expiration-cell">
                            <span>{row.expirationDate}</span>
                            <span className={`expiration-pill ${row.expirationStatus.tone}`}>
                              {row.expirationStatus.label}
                            </span>
                          </div>
                        </td>
                        <td>{formatNumber(row.quantity)}</td>
                        <td>{formatCurrency(row.unitPrice)}</td>
                        <td>{formatCurrency(row.valuation)}</td>
                      </tr>
                    ))}
                    {filteredInventoryRows.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="empty-state-cell">
                          No inventory items matched the current filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && !error && activeTab === "kpis" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Inventory KPIs</p>
              <h2>Current operating snapshot</h2>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Total Units On Hand" value={formatNumber(kpis.total_raw_items)} />
            <MetricCard label="Distinct Supply Types" value={formatNumber(uniqueSupplyTypes)} />
            <MetricCard label="Distinct Line Items" value={formatNumber(uniqueExactSupplies)} />
            <MetricCard label="Supply Categories" value={formatNumber(uniqueCategories)} />
            <MetricCard label="Expired Units" value={formatNumber(expiredInventoryUnits)} />
            <MetricCard label="Expiring In 90 Days" value={formatNumber(expiringSoonInventoryUnits)} />
            <MetricCard
              label="Average Duration (Days)"
              value={(kpis.avg_duration_per_item ?? 0).toFixed(1)}
            />
            <MetricCard label="Slow-Moving Units" value={formatNumber(slowMovingInventoryUnits)} />
            <MetricCard label="No Expiration Recorded" value={formatNumber(noExpirationInventoryUnits)} />
            <MetricCard label="Pallet Count" value={formatNumber(kpis.pallet_count)} />
            <MetricCard label="Box Count" value={formatNumber(kpis.box_count)} />
            <MetricCard label="Estimated Inventory Value" value={formatCurrency(kpis.total_value)} />
          </div>

          <div className="kpi-analytics-grid">
            <div className="summary-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Expiration Summary</p>
                  <h3>Inventory at a glance by expiration window</h3>
                </div>
              </div>

              {expirationChartData.length > 0 ? (
                <PieChartCard
                  title="Supplies by expiration bucket"
                  ariaLabel="Pie chart of inventory by expiration bucket"
                  totalItems={totalExpirationChartItems}
                  segments={expirationPieSegments}
                  legendSegments={expirationChartData}
                  background={expirationPieBackground}
                  activeLabel={activeExpirationPieLabel}
                  onHover={setActiveExpirationPieLabel}
                />
              ) : (
                <p>No expiration data is available yet.</p>
              )}
            </div>

            <div className="summary-card">
              <div className="panel-header">
                <div>
                  <p className="section-label">Duration Summary</p>
                  <h3>Inventory at a glance by warehouse duration</h3>
                </div>
              </div>

              {durationChartLegendData.length > 0 ? (
                <PieChartCard
                  title="Supplies by duration bucket"
                  ariaLabel="Pie chart of inventory by duration bucket"
                  totalItems={totalDurationChartItems}
                  segments={durationPieSegments}
                  legendSegments={durationChartLegendData}
                  background={durationPieBackground}
                  activeLabel={activeDurationPieLabel}
                  onHover={setActiveDurationPieLabel}
                />
              ) : (
                <p>No duration data is available yet.</p>
              )}
            </div>

            <div className="summary-card kpi-card-full">
              <div className="panel-header">
                <div>
                  <p className="section-label">Category Summary</p>
                  <h3>Inventory at a glance by supply category</h3>
                </div>
                <span className="pill">{formatNumber(uniqueCategories)} categories</span>
              </div>

              {categoryChartLegendData.length > 0 ? (
                <PieChartCard
                  title="Supplies by category"
                  ariaLabel="Pie chart of inventory by supply category"
                  totalItems={totalCategoryChartItems}
                  segments={categoryPieSegments}
                  legendSegments={categoryChartLegendData}
                  background={categoryPieBackground}
                  activeLabel={activeCategoryPieLabel}
                  onHover={setActiveCategoryPieLabel}
                  cardClassName="category-pie-card"
                />
              ) : (
                <p>No category data is available yet.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {!loading && !error && activeTab === "shipments" ? (
        <section className="panel empty-panel">
          <div className="shipment-subtabs" role="tablist" aria-label="Shipment subviews">
            <button
              type="button"
              className={
                activeShipmentSubtab === "current"
                  ? "shipment-subtab active"
                  : "shipment-subtab"
              }
              onClick={() => setActiveShipmentSubtab("current")}
            >
              Current Shipments
            </button>
            <button
              type="button"
              className={
                activeShipmentSubtab === "past"
                  ? "shipment-subtab active"
                  : "shipment-subtab"
              }
              onClick={() => setActiveShipmentSubtab("past")}
            >
              Past Shipments
            </button>
          </div>

          {activeShipmentSubtab === "current" ? (
            <div className="shipment-subpanel">
              <p className="section-label">Current Shipments</p>
              <div className="create-shipment-bar">
                <input
                  type="text"
                  value={shipmentSearchTerm}
                  onChange={(event) => setShipmentSearchTerm(event.target.value)}
                  placeholder="Search shipments, supply IDs, supplies, or manufacturers"
                />
                <button
                  type="button"
                  className="primary-button"
                  onClick={openCreateShipmentModal}
                >
                  Create New Shipment
                </button>
              </div>
              {rankedShipments.length === 0 ? (
                <p>
                  {currentShipments.length === 0
                    ? "No current shipments yet."
                    : "No shipments matched that search."}
                </p>
              ) : (
                <div className="shipment-list">
                  {rankedShipments.map((shipment) => (
                    <article
                      key={shipment.id}
                      className={`shipment-card shipment-card-${getShipmentStatus(shipment).toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {(() => {
                        const shipmentValuation = shipment.items.reduce(
                          (total, item) => total + (item.valuation || 0),
                          0
                        );

                        return (
                      <div className="shipment-card-header">
                        <div className="shipment-card-title">
                          <div className="shipment-inline-edit">
                            {editingShipmentField?.shipmentId === shipment.id &&
                            editingShipmentField?.field === "recipientName" ? (
                              <input
                                className="shipment-inline-input"
                                type="text"
                                value={editingShipmentValue}
                                onChange={(event) => setEditingShipmentValue(event.target.value)}
                                onBlur={saveEditingShipmentField}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    saveEditingShipmentField();
                                  }
                                  if (event.key === "Escape") {
                                    cancelEditingShipmentField();
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <h3>{shipment.recipientName}</h3>
                            )}
                            <button
                              type="button"
                              className="edit-icon-button"
                              aria-label={`Edit name for ${shipment.recipientName}`}
                              onClick={() =>
                                startEditingShipmentField(
                                  shipment.id,
                                  "recipientName",
                                  shipment.recipientName
                                )
                              }
                            >
                              ✎
                            </button>
                          </div>
                          <p className="shipment-card-subline">
                            {formatNumber(shipment.items.length)} assigned items
                          </p>
                          <p className="shipment-card-subline shipment-card-valuation">
                            {formatCurrency(shipmentValuation)} valuation
                          </p>
                          <div className="shipment-inline-edit shipment-card-subline shipment-inline-field">
                            <span className="shipment-inline-label">Type:</span>
                            {editingShipmentField?.shipmentId === shipment.id &&
                            editingShipmentField?.field === "shipmentType" ? (
                              <select
                                className="shipment-inline-select"
                                value={editingShipmentValue}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setEditingShipmentValue(nextValue);
                                  saveShipmentFieldValue(
                                    shipment.id,
                                    "shipmentType",
                                    nextValue
                                  );
                                  setEditingShipmentField(null);
                                  setEditingShipmentValue("");
                                }}
                                onBlur={cancelEditingShipmentField}
                                autoFocus
                              >
                                {shipmentTypeOptions.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            ) : (
                              <span>{shipment.shipmentType || "No shipment type"}</span>
                            )}
                            <button
                              type="button"
                              className="edit-icon-button"
                              aria-label={`Edit shipment type for ${shipment.recipientName}`}
                              onClick={() =>
                                startEditingShipmentField(
                                  shipment.id,
                                  "shipmentType",
                                  shipment.shipmentType || "Local"
                                )
                              }
                            >
                              ✎
                            </button>
                          </div>
                          <div className="shipment-inline-edit shipment-card-subline shipment-inline-field">
                            <span className="shipment-inline-label">PoC:</span>
                            {editingShipmentField?.shipmentId === shipment.id &&
                            editingShipmentField?.field === "pointOfContact" ? (
                              <input
                                className="shipment-inline-input"
                                type="text"
                                value={editingShipmentValue}
                                onChange={(event) => setEditingShipmentValue(event.target.value)}
                                onBlur={saveEditingShipmentField}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    saveEditingShipmentField();
                                  }
                                  if (event.key === "Escape") {
                                    cancelEditingShipmentField();
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <span>{shipment.pointOfContact || "No point of contact"}</span>
                            )}
                            <button
                              type="button"
                              className="edit-icon-button"
                              aria-label={`Edit point of contact for ${shipment.recipientName}`}
                              onClick={() =>
                                startEditingShipmentField(
                                  shipment.id,
                                  "pointOfContact",
                                  shipment.pointOfContact
                                )
                              }
                            >
                              ✎
                            </button>
                          </div>
                        </div>
                        <div className="shipment-status-panel">
                          <div className="shipment-status-column">
                            <span className="shipment-status-label">Shipment Status</span>
                            <span className="shipment-status-badge">
                              {getShipmentStatus(shipment)}
                            </span>
                          </div>
                          <div className="shipment-filter-panel">
                            <span className="shipment-filter-label">Filter Status</span>
                            <div className="shipment-filter-buttons">
                              <button
                                type="button"
                                className={
                                  (shipment.filterMode || "original") === "original"
                                    ? "secondary-button filter-toggle-button is-active"
                                    : "secondary-button filter-toggle-button"
                                }
                                onClick={() => setShipmentFilterMode(shipment.id, "original")}
                              >
                                Use Add Order Filter
                              </button>
                              <button
                                type="button"
                                className={
                                  shipment.filterMode === "location"
                                    ? "secondary-button filter-toggle-button is-active"
                                    : "secondary-button filter-toggle-button"
                                }
                                onClick={() => setShipmentFilterMode(shipment.id, "location")}
                              >
                                Use Location Filter
                              </button>
                              <button
                                type="button"
                                className={
                                  shipment.filterMode === "expiration"
                                    ? "secondary-button filter-toggle-button is-active"
                                    : "secondary-button filter-toggle-button"
                                }
                                onClick={() => setShipmentFilterMode(shipment.id, "expiration")}
                              >
                                Use Expiration Filter
                              </button>
                            </div>
                          </div>
                          <div className="shipment-action-column">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => consolidateAllShipmentItems(shipment.id)}
                              disabled={shipment.items.length === 0}
                            >
                              Consolidate All
                            </button>
                          </div>
                        </div>
                        <div className="shipment-card-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => toggleShipmentSupplies(shipment.id)}
                          >
                            {expandedShipmentIds.includes(shipment.id)
                              ? "Hide Supplies"
                              : "Show Supplies"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openAddSupplyIdsModal(shipment.id)}
                          >
                            Add Supplies via ID
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => openShippingModal(shipment.id)}
                            disabled={
                              getShipmentStatus(shipment) !==
                              "Consolidation Complete"
                            }
                          >
                            Shipped
                          </button>
                        </div>
                      </div>
                        );
                      })()}

                      {shipment.items.length === 0 ? (
                        <p className="shipment-empty">No items have been added yet.</p>
                      ) : expandedShipmentIds.includes(shipment.id) ? (
                        <div className="shipment-line-items">
                          {getShipmentItemsForDisplay(shipment).map((shipmentItem) => {
                            const requestedQuantity = normalizeRequestedQuantity(shipmentItem);
                            const isRequestingAllUnits =
                              requestedQuantity === (Number(shipmentItem.quantity) || 0);
                            const otherShipmentRequests = (
                              currentShipmentRequestMap[String(shipmentItem.supplyId || shipmentItem.id)] || []
                            ).filter((request) => request.shipmentId !== shipment.id);
                            const requestConflictLabel = otherShipmentRequests
                              .map(
                                (request) =>
                                  `${formatNumber(request.requestedQuantity)} units also requested by ${request.shipmentName}`
                              )
                              .join(" • ");

                            return (
                              <div
                                key={shipmentItem.id}
                                className={[
                                  "shipment-line-item",
                                  shipmentItem.isConsolidated ? "is-consolidated" : "",
                                  otherShipmentRequests.length > 0 ? "is-conflicted" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <div className="shipment-line-top">
                                  <div className="shipment-item-id-row">
                                    <strong>#{shipmentItem.supplyId}</strong>
                                    <button
                                      type="button"
                                      className="info-icon-button"
                                      onClick={() => openDetailsModal(shipmentItem)}
                                      aria-label={`Open details for supply ${shipmentItem.supplyId}`}
                                    >
                                      ⓘ
                                    </button>
                                    <span>{shipmentItem.exactSupplyName}</span>
                                  </div>
                                  <div className="shipment-line-middle">
                                    <strong>{shipmentItem.locationInfo}</strong>
                                    <strong>{formatNumber(shipmentItem.quantity)} units</strong>
                                  <button
                                    type="button"
                                    className={
                                      isRequestingAllUnits
                                        ? "requested-units-button"
                                          : "requested-units-button is-partial"
                                      }
                                      onClick={() =>
                                        openRequestedUnitsModal(shipment.id, shipmentItem)
                                      }
                                    >
                                    {isRequestingAllUnits
                                      ? "Requested All Units"
                                      : `Requested ${formatNumber(requestedQuantity)} Units`}
                                  </button>
                                  {otherShipmentRequests.length > 0 ? (
                                    <span className="shipment-request-conflict">
                                      {requestConflictLabel}
                                    </span>
                                  ) : null}
                                </div>
                                  <div className="shipment-line-pricing">
                                    <span>{formatCurrency(shipmentItem.unitPrice)} per unit</span>
                                    <span>{formatCurrency(shipmentItem.valuation)} total</span>
                                  </div>
                                  <div className="shipment-expiration">
                                    <span>{shipmentItem.expirationDate}</span>
                                    <span
                                      className={`expiration-pill ${shipmentItem.expirationStatus.tone}`}
                                    >
                                      {shipmentItem.expirationStatus.label}
                                    </span>
                                  </div>
                                  <div className="shipment-line-actions">
                                  <button
                                    type="button"
                                    className={
                                      shipmentItem.isConsolidated
                                        ? "consolidated-button is-consolidated"
                                        : "consolidated-button"
                                    }
                                    onClick={() => openConsolidationModal(shipment.id, shipmentItem)}
                                  >
                                    Consolidated
                                  </button>
                                    <button
                                      type="button"
                                      className="secondary-button shipment-return-button"
                                      onClick={() =>
                                        openReturnToInventoryModal(shipment.id, shipmentItem)
                                      }
                                    >
                                      Back to Inventory
                                    </button>
                                  </div>
                                </div>
                                <div className="shipment-line-meta">
                                  <span>{shipmentItem.generalSupply}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeShipmentSubtab === "past" ? (
            <div className="shipment-subpanel">
              <p className="section-label">Past Shipments</p>
              {pastShipments.length === 0 ? (
                <p>No past shipments yet.</p>
              ) : (
                <div className="shipment-list">
                  {pastShipments.map((shipment) => {
                    const shipmentValuation = shipment.items.reduce(
                      (total, item) => total + (item.valuation || 0),
                      0
                    );

                    return (
                      <article key={shipment.id} className="shipment-card shipment-card-complete">
                        <div className="shipment-card-header">
                          <div className="shipment-card-title">
                            <h3>{shipment.recipientName}</h3>
                            <p className="shipment-card-subline">
                              {formatNumber(shipment.items.length)} assigned items
                            </p>
                            <p className="shipment-card-subline shipment-card-valuation">
                              {formatCurrency(shipmentValuation)} valuation
                            </p>
                          </div>
                          <div className="shipment-status-panel">
                            <span className="shipment-status-label">Shipment Status</span>
                            <span className="shipment-status-badge">Shipped</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && activeTab === "shipment-kpis" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Shipment KPIs</p>
              <h2>Shipment activity and outbound flow</h2>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Total Shipments" value={formatNumber(shipments.length)} />
            <MetricCard label="Shipments With Items" value={formatNumber(shipmentsWithItems.length)} />
            <MetricCard label="Total Units Assigned" value={formatNumber(totalShipmentUnits)} />
            <MetricCard label="Total Shipment Line Items" value={formatNumber(totalShipmentLines)} />
            <MetricCard label="Unique Recipients" value={formatNumber(uniqueShipmentRecipients)} />
            <MetricCard label="Avg Units Per Shipment" value={formatNumber(Math.round(averageUnitsPerShipment))} />
            <MetricCard label="Near-Expiry Units In Shipments" value={formatNumber(nearExpiryShipmentUnits)} />
            <MetricCard label="Categories Being Shipped" value={formatNumber(shippedCategoryCount)} />
          </div>

          <div className="summary-card">
            <div className="panel-header">
              <div>
                <p className="section-label">Shipment Mix</p>
                <h3>Shipments by destination type</h3>
              </div>
            </div>

            {shipmentsByType.length > 0 ? (
              <div className="expiry-chart-card">
                <div className="expiry-bars">
                  {shipmentsByType.map((shipmentType) => {
                    const width = maxShipmentTypeCount > 0
                      ? (shipmentType.count / maxShipmentTypeCount) * 100
                      : 0;

                    return (
                      <div className="expiry-bar-row" key={shipmentType.type}>
                        <div className="expiry-bar-labels">
                          <strong>{shipmentType.type}</strong>
                          <span>{formatNumber(shipmentType.count)} shipments</span>
                        </div>
                        <div className="expiry-bar-track" aria-hidden="true">
                          <div
                            className="expiry-bar-fill expiry-bar-fill-secondary"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="kpi-note-card">
              <p className="section-label">Next Metrics To Add</p>
              <p>
                Fill rate and request-to-shipment time will need request dates and requested quantities
                added to the shipment data model.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {isShipmentModalOpen && pendingShipmentItems.length > 0 ? (
        <div className="modal-backdrop" role="presentation" onClick={closeShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Add To Shipment</p>
                <h2 id="shipment-modal-title">
                  Choose a shipment for {pendingShipmentItems.length} selected item
                  {pendingShipmentItems.length === 1 ? "" : "s"}
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={closeShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                {pendingShipmentItems.length === 1
                  ? pendingShipmentItems[0].exactSupplyName
                  : `${pendingShipmentItems.length} inventory items selected`}
              </p>

              <label className="modal-field">
                <span>Select shipment</span>
                <select
                  value={selectedShipmentId}
                  onChange={(event) => setSelectedShipmentId(event.target.value)}
                >
                  {currentShipments.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.recipientName || shipment.name || shipment.id}
                    </option>
                  ))}
                  <option value="__new__">Create new shipment</option>
                </select>
              </label>

              {selectedShipmentId === "__new__" ? (
                <>
                  <label className="modal-field">
                    <span>Recipient Name</span>
                    <input
                      type="text"
                      value={newShipmentRecipientName}
                      onChange={(event) => setNewShipmentRecipientName(event.target.value)}
                      placeholder="Enter recipient name"
                    />
                  </label>
                  <label className="modal-field">
                    <span>Shipment Type</span>
                    <select
                      value={newShipmentType}
                      onChange={(event) => setNewShipmentType(event.target.value)}
                    >
                      {shipmentTypeOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    <span>Blueprints Point of Contact</span>
                    <input
                      type="text"
                      value={newShipmentPointOfContact}
                      onChange={(event) => setNewShipmentPointOfContact(event.target.value)}
                      placeholder="Enter point of contact"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeShipmentModal}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={addItemToShipment}
                disabled={selectedShipmentId === "__new__" && !shipmentDetailsComplete}
              >
                Add to shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shippingShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeShippingModal}>
          <div
            className="shipment-modal shipment-modal-large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipping-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Shipped</p>
                <h2 id="shipping-modal-title">Shipment details</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeShippingModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Shipment Date</span>
                <input
                  type="date"
                  value={shipmentDate}
                  onChange={(event) => {
                    setShipmentDate(event.target.value);
                    if (deliveryDateMode === "same-day") {
                      setDeliveryDate(event.target.value);
                    }
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Transport Type</span>
                <select
                  value={transportType}
                  onChange={(event) => setTransportType(event.target.value)}
                >
                  {transportTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              {transportType === "Other" ? (
                <label className="modal-field">
                  <span>Exact Transport Type</span>
                  <input
                    type="text"
                    value={transportTypeOther}
                    onChange={(event) => setTransportTypeOther(event.target.value)}
                    placeholder="Enter exact transport type"
                  />
                </label>
              ) : null}

              <label className="modal-field">
                <div className="modal-field-header">
                  <span>Delivery Date</span>
                  <div className="modal-shortcuts">
                    <button
                      type="button"
                      className="modal-shortcut-button"
                      onClick={() => {
                        setDeliveryDateMode("same-day");
                        setDeliveryDate(shipmentDate);
                      }}
                    >
                      Same day
                    </button>
                    <button
                      type="button"
                      className="modal-shortcut-button"
                      onClick={() => {
                        setDeliveryDateMode("tbd");
                        setDeliveryDate("");
                      }}
                    >
                      TBD
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  value={deliveryDate}
                  disabled={deliveryDateMode === "tbd"}
                  onChange={(event) => {
                    setDeliveryDateMode("date");
                    setDeliveryDate(event.target.value);
                  }}
                />
              </label>

              <label className="modal-field">
                <span>Notes</span>
                <textarea
                  value={shipmentNotes}
                  onChange={(event) => setShipmentNotes(event.target.value)}
                  placeholder="Add shipment notes"
                  rows="4"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeShippingModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={markShipmentComplete}
                disabled={!shippingDetailsComplete}
              >
                Save Shipped Status
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateShipmentModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Create Shipment</p>
                <h2 id="create-shipment-modal-title">New shipment details</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeCreateShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Recipient Name</span>
                <input
                  type="text"
                  value={newShipmentRecipientName}
                  onChange={(event) => setNewShipmentRecipientName(event.target.value)}
                  placeholder="Enter recipient name"
                />
              </label>
              <label className="modal-field">
                <span>Shipment Type</span>
                <select
                  value={newShipmentType}
                  onChange={(event) => setNewShipmentType(event.target.value)}
                >
                  {shipmentTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Blueprints Point of Contact</span>
                <input
                  type="text"
                  value={newShipmentPointOfContact}
                  onChange={(event) => setNewShipmentPointOfContact(event.target.value)}
                  placeholder="Enter point of contact"
                />
              </label>
              <label className="modal-field">
                <span>Supply IDs</span>
                <input
                  type="text"
                  value={newShipmentSupplyIds}
                  onChange={(event) => setNewShipmentSupplyIds(event.target.value)}
                  placeholder="Paste supply IDs separated by commas"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeCreateShipmentModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={createNewShipment}
                disabled={!shipmentDetailsComplete}
              >
                Create Shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailsItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDetailsModal}>
          <div
            className="shipment-modal shipment-modal-large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Supply Details</p>
                <h2 id="details-modal-title">Supply #{detailsItem.supplyId}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDetailsModal}>
                x
              </button>
            </div>

            <div className="details-grid">
              <div className="details-item"><span>Supply ID</span><strong>{detailsItem.supplyId}</strong></div>
              <div className="details-item"><span>Days in Warehouse</span><strong>{formatNumber(detailsItem.daysInWarehouse)}</strong></div>
              <div className="details-item"><span>Manufacturer Name</span><strong>{detailsItem.manufacturer}</strong></div>
              <div className="details-item"><span>Category</span><strong>{detailsItem.category}</strong></div>
              <div className="details-item"><span>General</span><strong>{detailsItem.generalSupply}</strong></div>
              <div className="details-item"><span>Name</span><strong>{detailsItem.exactSupplyName}</strong></div>
              <div className="details-item"><span>Location Information</span><strong>{detailsItem.locationInfo}</strong></div>
              <div className="details-item"><span>Quantity</span><strong>{formatNumber(detailsItem.quantity)}</strong></div>
              <div className="details-item"><span>Price per Unit</span><strong>{formatCurrency(detailsItem.unitPrice)}</strong></div>
              <div className="details-item"><span>Total Price</span><strong>{formatCurrency(detailsItem.valuation)}</strong></div>
              <div className="details-item"><span>Expiration Date</span><strong>{detailsItem.expirationDate}</strong></div>
              <div className="details-item">
                <span>Image URL</span>
                <strong>
                  {detailsItem.imageUrl ? (
                    <a href={detailsItem.imageUrl} target="_blank" rel="noreferrer">
                      Open image link
                    </a>
                  ) : (
                    "Not available"
                  )}
                </strong>
              </div>
            </div>

            {detailsItem.imageUrl ? (
              <div className="details-image-wrap">
                <img className="details-image" src={detailsItem.imageUrl} alt={detailsItem.exactSupplyName} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {returningShipmentItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeReturnToInventoryModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-to-inventory-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Confirm Return</p>
                <h2 id="return-to-inventory-modal-title">Move supply back to inventory?</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeReturnToInventoryModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Remove <strong>{returningShipmentItem.shipmentItem.exactSupplyName}</strong> from
                this shipment and move it back to inventory?
              </p>
              <p className="shipment-empty">
                This will remove the item from the shipment and change its status in Total
                Inventory from pulled back to available.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeReturnToInventoryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={returnShipmentItemToInventory}
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {requestingShipmentItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeRequestedUnitsModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="requested-units-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Requested Units</p>
                <h2 id="requested-units-modal-title">Adjust requested units</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeRequestedUnitsModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Choose how many units are being requested for{" "}
                <strong>{requestingShipmentItem.shipmentItem.exactSupplyName}</strong>.
              </p>
              <label className="modal-field">
                <span>Requested Units</span>
                <input
                  type="number"
                  min="1"
                  max={String(requestingShipmentItem.shipmentItem.quantity || 1)}
                  value={requestedUnitsValue}
                  onChange={(event) => setRequestedUnitsValue(event.target.value)}
                />
                <small>
                  Maximum: {formatNumber(requestingShipmentItem.shipmentItem.quantity)} units
                </small>
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeRequestedUnitsModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveRequestedUnits}
                disabled={
                  !requestedUnitsValue ||
                  Number(requestedUnitsValue) <= 0 ||
                  Number(requestedUnitsValue) >
                    Number(requestingShipmentItem.shipmentItem.quantity || 0)
                }
              >
                Confirm Request
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {consolidatingShipmentItem ? (
        <div className="modal-backdrop" role="presentation" onClick={closeConsolidationModal}>
          <div
            className="shipment-modal shipment-modal-large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consolidation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Consolidation Check</p>
                <h2 id="consolidation-modal-title">
                  Have exactly {formatNumber(consolidationRequestedQuantity)} units been
                  consolidated?
                </h2>
                <p className="modal-helper-note">({consolidationRequestNote})</p>
              </div>
              <div className="binary-choice-group">
                <button
                  type="button"
                  className={
                    consolidationExactAnswer === true
                      ? "binary-choice-button is-active"
                      : "binary-choice-button"
                  }
                  onClick={() => {
                    setConsolidationExactAnswer(true);
                    setConsolidatedUnitsValue(String(consolidationRequestedQuantity));
                    setConsolidationVarianceReasons([]);
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={
                    consolidationExactAnswer === false
                      ? "binary-choice-button is-active"
                      : "binary-choice-button"
                  }
                  onClick={() => {
                    setConsolidationExactAnswer(false);
                    setConsolidatedUnitsValue(String(consolidationRequestedQuantity));
                    setConsolidationVarianceReasons([]);
                  }}
                >
                  No
                </button>
              </div>
            </div>

            <div className="shipment-modal-body">
              {consolidationExactAnswer === false ? (
                <>
                  <label className="modal-field">
                    <span>How many units were actually consolidated?</span>
                    <input
                      type="number"
                      min="1"
                      value={consolidatedUnitsValue}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        const parsedValue = Number(nextValue);
                        setConsolidatedUnitsValue(nextValue);
                        setConsolidationVarianceReasons(
                          Number.isFinite(parsedValue) && parsedValue > 0
                            ? getAutomaticConsolidationReasons(
                                consolidationRequestedQuantity,
                                consolidationTotalQuantity,
                                parsedValue
                              )
                            : []
                        );
                      }}
                    />
                  </label>

                  {consolidationReasonOptions.length > 0 ? (
                    <div className="status-option-list">
                      {consolidationReasonOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={
                            consolidationVarianceReasons.includes(option)
                              ? "status-option-button is-active"
                              : "status-option-button"
                          }
                          onClick={() => setConsolidationVarianceReasons([option])}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {automaticConsolidationReasons.length > 0 ? (
                    <div className="status-option-list">
                      {automaticConsolidationReasons.map((option) => (
                        <div key={option} className="status-option-button is-active">
                          {option}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeConsolidationModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveConsolidation}
                disabled={consolidationConfirmDisabled}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addingSupplyIdsShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeAddSupplyIdsModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-supply-ids-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">Add Supplies</p>
                <h2 id="add-supply-ids-modal-title">Add supplies via ID</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeAddSupplyIdsModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Supply IDs</span>
                <input
                  type="text"
                  value={shipmentSupplyIdsInput}
                  onChange={(event) => setShipmentSupplyIdsInput(event.target.value)}
                  placeholder="Paste supply IDs separated by commas"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeAddSupplyIdsModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={addSuppliesToShipmentById}
                disabled={!shipmentSupplyIdsInput.trim()}
              >
                Add Supplies
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
