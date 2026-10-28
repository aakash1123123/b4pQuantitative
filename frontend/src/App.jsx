import { useEffect, useRef, useState } from "react";
import DonationHistory, { useDonationHistory } from "./DonationHistory";
import PastShipmentArchive from "./PastShipmentArchive";
import ShipmentMap from "./ShipmentMap";
import { summarizeHistoryShipments, useHistoryShipments } from "./historyStats";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const SHIPMENT_STORAGE_KEY = "blueprints-current-shipments";
const NON_INVENTORY_SHIPMENT_STORAGE_KEY = "blueprints-non-inventory-shipments";
const PALLET_MAP_STORAGE_KEY = "blueprints-pallet-map-layout";
const PALLET_MAP_DIMENSIONS = { width: 1520, height: 1120 };
const PALLET_CARD_SIZE = { width: 198, height: 198 };
const PALLET_MAP_GAP = 20;

const BUTTON_TOOLTIPS = {
  "total inventory": "View the complete inventory",
  "inventory kpis": "View inventory metrics and charts",
  shipments: "Manage current and past shipments",
  "shipment kpis": "View shipment metrics and performance",
  filters: "Open inventory filters",
  "clear all": "Clear all inventory filters",
  "add selected to shipment": "Add selected supplies to a shipment",
  "current shipments": "View active inventory shipments",
  "non-inventory shipments": "View documented non-inventory shipments",
  "past shipments": "View shipped and delivered shipments",
  "create new shipment": "Create an inventory-based shipment",
  "create non-inventory shipment": "Document a non-inventory shipment",
  "show supplies": "Show supplies in this shipment",
  "hide supplies": "Hide supplies in this shipment",
  "add supplies via id": "Add supplies using supply IDs",
  "consolidate all": "Consolidate all supplies in this shipment",
  "unconsolidate all": "Unconsolidate all supplies in this shipment",
  "back all to inventory": "Return all shipment supplies to inventory",
  "mark as shipped": "Record shipment details and mark as shipped",
  consolidate: "Mark this supply as consolidated",
  unconsolidate: "Return this supply to unconsolidated status",
  "back to inventory": "Return this supply to inventory",
  "requested all units": "Change the requested quantity",
  "use add order filter": "Sort supplies by the order added",
  "use location filter": "Sort supplies by pallet location",
  "use expiration filter": "Sort supplies by expiration date",
  "view all 10 kpis": "View all KPIs",
  "view shipments": "Open current shipments",
  "shipment activity": "View shipment activity KPIs",
  "shipment flow time": "View shipment flow-time KPIs",
  "edit pallet conformation": "Edit the pallet layout configuration",
  "save conformation": "Save the updated pallet layout configuration",
  "same day": "Use the shipment date as the delivery date",
  tbd: "Set this value to TBD",
  "save shipped status": "Mark this shipment as shipped",
  "confirm delivered": "Confirm the shipment was delivered",
  "confirm shipped status": "Revert this shipment to shipped",
  "confirm return": "Confirm return to inventory",
  "confirm return all": "Confirm return of all supplies to inventory",
  "confirm request": "Save the requested quantity",
  "confirm consolidation": "Confirm consolidation of all supplies",
  "confirm unconsolidation": "Confirm unconsolidation of all supplies",
  "add supplies": "Add supplies to this shipment",
  "create shipment": "Create this shipment",
  "document shipment": "Save this non-inventory shipment",
  confirm: "Confirm supply consolidation",
};

function normalizedControlText(element) {
  return String(element.textContent || "")
    .replace(/\s*\([\d,]+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function modalControlTooltip(element, text) {
  const modal = element.closest('[role="dialog"]');
  if (!modal) return "";
  const heading = modal.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim();
  const subject = heading ? heading.toLowerCase() : "this window";
  if (element.classList.contains("modal-close") || text === "x" || text === "×") {
    return `Close ${subject}`;
  }
  if (text === "cancel") return `Cancel ${subject}`;
  return "";
}

function controlTooltip(element) {
  const text = normalizedControlText(element);
  const modalTooltip = modalControlTooltip(element, text);
  if (modalTooltip) return modalTooltip;

  if (element.matches("button, [role='tab'], [role='button']")) {
    if (element.disabled) {
      if (text.startsWith("add selected to shipment")) {
        return "Select at least one available supply";
      }
      if (text === "consolidate all") return "No eligible supplies are available to consolidate";
      if (text === "back all to inventory") return "This shipment has no supplies to return";
      if (text === "mark as shipped") return "Consolidate all supplies before marking as shipped";
      if (text === "create shipment") return "Complete all required shipment details";
      if (text === "add supplies") return "Enter at least one supply ID";
    }
    if (BUTTON_TOOLTIPS[text]) return BUTTON_TOOLTIPS[text];
    if (text.startsWith("add selected to shipment")) {
      return "Add selected supplies to a shipment";
    }
    const ariaLabel = element.getAttribute("aria-label") || "";
    if (/^edit name for /i.test(ariaLabel)) return "Edit shipment name";
    if (/^edit shipment type for /i.test(ariaLabel)) return "Edit shipment type";
    if (/^edit point of contact for /i.test(ariaLabel)) {
      return "Edit Blueprints point of contact";
    }
    if (/^edit recipient point of contact for /i.test(ariaLabel)) {
      return "Edit recipient point of contact";
    }
    if (/^open details for supply /i.test(ariaLabel)) return "View supply details";
    if (/^open pallet details for /i.test(ariaLabel)) return ariaLabel.replace(/^Open/i, "View");
    return ariaLabel;
  }

  if (element.matches("select")) {
    const options = Array.from(element.options || []).map((option) => option.textContent.toLowerCase());
    if (options.some((option) => option.includes("shipment type"))) return "Filter by shipment type";
    if (options.some((option) => option.includes("status date"))) return "Sort by shipment milestone date";
    if (options.some((option) => option.includes("status:"))) return "Filter by shipment status";
    if (options.some((option) => option.includes("location:"))) return "Filter by shipment location";
    if (options.some((option) => option.includes("valuation:"))) return "Sort shipments by valuation";
    if (options.some((option) => option === "local") && options.some((option) => option === "international")) {
      return "Choose local or international shipment";
    }
    if (options.some((option) => option === "planning") && options.some((option) => option === "delivered")) {
      return "Change the shipment status";
    }
    if (element.closest(".shipment-modal")) return "Choose an option";
  }

  if (element.matches("input, textarea")) {
    const placeholder = (element.getAttribute("placeholder") || "").toLowerCase();
    const ariaLabel = element.getAttribute("aria-label") || "";
    if (ariaLabel) {
      if (/select all filtered inventory/i.test(ariaLabel)) return "Select all available supplies";
      if (/^select supply /i.test(ariaLabel)) return "Select this supply";
      return ariaLabel;
    }
    if (placeholder.includes("search by general supply")) return "Search inventory supplies";
    if (placeholder.includes("search shipments")) return "Search shipments";
    if (placeholder.includes("search shipment or clinic")) return "Search non-inventory shipments";
    if (placeholder.includes("recipient name")) return "Enter the receiving clinic or organization";
    if (placeholder.includes("recipient point of contact")) {
      return "Enter the recipient point of contact or select TBD";
    }
    if (placeholder.includes("point of contact")) return "Select a Blueprints point of contact";
    if (placeholder.includes("supply ids")) return "Enter supply IDs to add";
    if (placeholder.includes("shipment notes")) return "Add or update shipment notes";
    if (placeholder.includes("delivery notes")) return "Add or update delivery notes";
    if (placeholder.includes("clinic")) return "Enter the receiving organization";
    if (element.type === "range") return "Filter supplies by unit price";
    if (element.type === "date") {
      return element.closest('[aria-labelledby="delivered-modal-title"]')
        ? "Set the actual delivery date"
        : "Set the shipment date";
    }
    if (element.type === "checkbox") {
      const optionLabel = element.closest("label");
      const optionValue = optionLabel?.querySelector("span")?.textContent?.trim();
      const groupName = element.closest(".filter-group")?.querySelector("h4")?.textContent?.trim();
      if (groupName && optionValue) return `Filter ${groupName} by ${optionValue}`;
      return optionValue ? `Select ${optionValue}` : "Select this option";
    }
    if (element.type === "number") return "Enter the requested quantity";
  }

  return element.getAttribute("aria-label") || "";
}

function applyDashboardTooltips(root = document) {
  root
    .querySelectorAll("button, input, select, textarea, [role='tab'], [role='button']")
    .forEach((element) => {
      const tooltip = controlTooltip(element);
      if (tooltip) element.setAttribute("title", tooltip);
    });
}

const tabs = [
  { id: "shipment-kpis", label: "Shipment KPIs" },
  { id: "kpis", label: "Inventory KPIs" },
  { id: "shipments", label: "Shipments" },
  { id: "inventory", label: "Total Inventory" },
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
const blueprintsRosterNames = [
  "Ben Rathi", "James Ha", "Elliane Siebert", "Anurag Bolneni", "Sana Shah",
  "Hadi Juratli", "Grant Veldhuis", "Maya Nassif", "Aakash Gummidela", "Romel Patel",
  "Liya Berry", "Rahul Nanwani", "Katelyn Knickerbocker", "Rohan Kolli", "Belinda Chang",
  "Amy Mui", "Sania Azhar", "Farhan Ibrahim", "Sahran Hassan", "Russell Day", "Mia Zhong",
  "Jia Anand", "Aditya Chada", "Grisham Halapeti", "Timothy Jho", "Aisha Tokovic",
  "Ajan Arora", "Philip Hadiwidjaja", "Jacqueline Suarez", "Lasya Kolli", "Rishi Garigipati",
  "Samaria Noel", "Rajas Visal", "Vishnav Ramesh", "Stacey Liu", "Yug Patel", "LolaRose Song",
  "Anjali Kakarla", "Arnav Akhaury", "Caleb Knickerbocker", "Navya Yerrapu", "Addison Richmond",
  "Ritvik Sampath", "Allison Mack", "Max Hampel", "Devarshi Dalal", "Yusuf Halilovic",
  "Missole Doe", "Divya Balaji", "Lexy Aguirre",
];

function normalizeShipmentType(value) {
  return value === "National" ? "International" : value || "Local";
}

function normalizePastShipmentStatus(value, deliveryDate = "", manualOverride = "") {
  if (manualOverride === "Shipped" || (value === "Shipped" && manualOverride === true)) {
    return "Shipped";
  }
  if (manualOverride === "Delivered") {
    return "Delivered";
  }

  const hasScheduledDeliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate);
  return hasScheduledDeliveryDate && deliveryDate <= todayIsoDate()
    ? "Delivered"
    : "Shipped";
}

function todayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShipmentHistoryDate(value) {
  return value || "Not set";
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

function withConsolidationCompletionDate(shipment) {
  const anyConsolidated = shipment.items.some((item) => item.isConsolidated);
  const allConsolidated =
    shipment.items.length > 0 && shipment.items.every((item) => item.isConsolidated);

  if (allConsolidated) {
    return {
      ...shipment,
      consolidationStartedAt: shipment.consolidationStartedAt || todayIsoDate(),
      consolidationCompletedAt: shipment.consolidationCompletedAt || todayIsoDate(),
    };
  }

  return {
    ...shipment,
    consolidationStartedAt: anyConsolidated ? shipment.consolidationStartedAt || todayIsoDate() : "",
    consolidationCompletedAt: "",
  };
}

function requestedShipmentItemValue(item) {
  return (Number(item.unitPrice) || 0) * normalizeRequestedQuantity(item);
}

function rankShipmentsBySearch(shipments, normalizedSearch) {
  return [...shipments]
    .map((shipment) => {
      if (!normalizedSearch) {
        return { shipment, score: 0 };
      }

      let score = 0;
      const recipientName = (shipment.recipientName || "").toLowerCase();
      if (recipientName.includes(normalizedSearch)) {
        score += recipientName === normalizedSearch ? 10 : 6;
      }

      shipment.items.forEach((item) => {
        const supplyId = String(item.supplyId || "").toLowerCase();
        const exactSupplyName = (item.exactSupplyName || "").toLowerCase();
        const generalSupply = (item.generalSupply || "").toLowerCase();
        const manufacturer = (item.manufacturer || "").toLowerCase();

        if (supplyId.includes(normalizedSearch)) {
          score += supplyId === normalizedSearch ? 7 : 4;
        }
        if (exactSupplyName.includes(normalizedSearch)) {
          score += exactSupplyName === normalizedSearch ? 5 : 3;
        }
        if (generalSupply.includes(normalizedSearch)) {
          score += 2;
        }
        if (manufacturer.includes(normalizedSearch)) {
          score += 2;
        }
      });

      return { shipment, score };
    })
    .filter(({ score }) => !normalizedSearch || score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.shipment.recipientName.localeCompare(right.shipment.recipientName);
    })
    .map(({ shipment }) => shipment);
}

function shipmentStatusDateValue(shipment, statusDateFilter) {
  const fieldByFilter = {
    creation: shipment.createdAt,
    consolidation: shipment.consolidationCompletedAt,
    ship: shipment.shippedAt,
    delivery: shipment.deliveryDate,
  };

  const rawValue = fieldByFilter[statusDateFilter];
  if (!rawValue || rawValue === "TBD") {
    return 0;
  }

  const parsedValue = new Date(rawValue).getTime();
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCurrentShipmentHistoryDate(value) {
  return value || "Not started";
}

function buildDefaultConsolidationState(item) {
  return {
    consolidatedQuantity: normalizeRequestedQuantity(item),
  };
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

// Short form for big numbers on tiles ($10.2M, 261K); the exact figure goes in a tooltip.
function formatCompactNumber(value, prefix = "") {
  const number = Number(value) || 0;
  if (Math.abs(number) < 10000) {
    return `${prefix}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number)}`;
  }
  return `${prefix}${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumSignificantDigits: 3,
  }).format(number)}`;
}

function formatWholeCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatExpiration(value) {
  return value || "No expiration date";
}

// A bare "YYYY-MM-DD" is parsed by Date as UTC midnight, which lands on the
// previous calendar day for anyone west of UTC. Every date the dashboard shows
// is a calendar date, so build it in local time instead.
function parseLocalDate(dateValue) {
  if (!dateValue) {
    return null;
  }

  const isoDateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue).trim());
  const parsed = isoDateParts
    ? new Date(Number(isoDateParts[1]), Number(isoDateParts[2]) - 1, Number(isoDateParts[3]))
    : new Date(dateValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function daysUntil(dateValue) {
  const target = parseLocalDate(dateValue);
  if (!target) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function daysBetweenDates(targetDateValue, referenceDateValue) {
  const referenceDate = parseLocalDate(referenceDateValue);
  const targetDate = parseLocalDate(targetDateValue);

  if (!referenceDate || !targetDate) {
    return null;
  }

  return Math.round((targetDate - referenceDate) / 86400000);
}

function averageShipmentDays(shipments, startField, endField) {
  const values = shipments
    .map((shipment) => daysBetweenDates(shipment[endField], shipment[startField]))
    .filter((value) => value !== null);

  return average(values);
}

function formatAverageDays(value) {
  return `${value.toFixed(1)} days`;
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
  const isPulled = shipments
    .filter((shipment) => !shipment.isCompleted)
    .some((shipment) =>
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

// Expiry urgency is a single-hue ramp stepped by lightness, not a
// red-amber-yellow rainbow: two adjacent warm hues collapse into each other
// under red-green colour blindness, whereas a lightness order survives it.
// Validated as an ordinal ramp (monotone L, gaps >= 0.06, light end >= 2:1).
// "365+ days" and "No expiration" sit outside the ramp as reserved states.
const expirationBucketColors = {
  "Already expired": "#5E140C",
  "Already Expired": "#5E140C",
  "0-90 days": "#A32B10",
  "90-180 days": "#D35F2A",
  "180-365 days": "#D98038",
  "365+ days": "#1E7A43",
  "No expiration": "#a9b3c8",
  "No expiration date": "#a9b3c8",
};

// Warehouse duration is a magnitude, so it gets one hue light-to-dark --
// the brand azure running down into the logo's navy. Validated ordinal.
const durationBucketColors = {
  "0-30 days": "#93B5E4",
  "31-90 days": "#5C87CE",
  "91-180 days": "#2E5CB4",
  "181-365 days": "#0035a2",
  "365+ days": "#02245F",
  "Unknown duration": "#E2E2E2",
};

const durationBucketOrder = [
  "0-30 days",
  "31-90 days",
  "91-180 days",
  "181-365 days",
  "365+ days",
];

// Supply category is identity, not magnitude, so it needs distinct hues rather
// than the twelve shades of blue this used to be (four of which were
// indistinguishable even with full colour vision). Fixed order, led by the
// brand azure, never cycled. Every slice also carries its name in the legend,
// which is what keeps identity off colour alone.
const categoryPiePalette = [
  "#0069f3",
  "#f0643c",
  "#12a58a",
  "#e29b00",
  "#d9609e",
  "#5a4fcf",
  "#2f8a2f",
  "#a63d7a",
  "#2c4aa6",
  "#c0582a",
  "#008a7c",
  "#8a6c00",
];
// Anything past the fixed order is not given a new hue -- it goes neutral.
const categoryOverflowColor = "#8a93a8";

// The fixed order mirrors the backend's approved category list, so a category
// keeps the same hue no matter what is filtered out, shipped, or missing from
// the sheet. Colour follows the category, never its rank in the current chart.
const categoryColorOrder = [
  "Airway & Oxygen",
  "Apparel (Gowns, Shoe Covers, etc.)",
  "Catheters & Briefs",
  "Gloves",
  "IV Supplies",
  "Masks & Face Shields",
  "Misc Non-Medical",
  "Misc Surgical",
  "Needles & Syringes",
  "Sutures",
  "Vitals & Home Health",
  "Wound Care & Bandages",
];

function colorForCategory(categoryName) {
  const index = categoryColorOrder.indexOf(categoryName);
  return index >= 0 ? categoryPiePalette[index] : categoryOverflowColor;
}

function colorForBoxType(index) {
  return index < boxCategoryPalette.length
    ? boxCategoryPalette[index]
    : categoryOverflowColor;
}

const valueBucketOrder = ["$0-$50", "$50-$100", "$100-$200", "$200+"];
// Price bands are a magnitude: one hue (brand slate), light to dark.
const valueBucketColors = {
  "$0-$50": "#a3b1cf",
  "$50-$100": "#7387b3",
  "$100-$200": "#4a5f91",
  "$200+": "#263a6b",
};

const supplyStatusOrder = ["Inventory", "Pulled", "Consolidated"];
// The workflow is a progression, so it reads as one hue darkening as a supply
// moves from shelf to shipment. Validated ordinal.
const supplyStatusColors = {
  Inventory: "#7FA9F5",
  Pulled: "#0069f3",
  Consolidated: "#0035a2",
};

// Box categories are identity too; take the first six of the fixed order so a
// box type keeps the same hue it has in the category chart.
const boxCategoryPalette = [
  "#0069f3",
  "#f0643c",
  "#12a58a",
  "#e29b00",
  "#d9609e",
  "#5a4fcf",
];

function valueBucketForUnitPrice(unitPrice) {
  const numericValue = Number(unitPrice) || 0;
  if (numericValue < 50) {
    return "$0-$50";
  }
  if (numericValue < 100) {
    return "$50-$100";
  }
  if (numericValue < 200) {
    return "$100-$200";
  }
  return "$200+";
}

function rectanglesOverlap(left, right) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function clampPalletPosition(position) {
  return {
    x: Math.max(0, Math.min(position.x, PALLET_MAP_DIMENSIONS.width - PALLET_CARD_SIZE.width)),
    y: Math.max(0, Math.min(position.y, PALLET_MAP_DIMENSIONS.height - PALLET_CARD_SIZE.height)),
  };
}

function buildDefaultPalletLayout(palletIds) {
  const columns = 5;
  const layout = {};

  palletIds.forEach((palletId, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    layout[palletId] = {
      x: column * (PALLET_CARD_SIZE.width + PALLET_MAP_GAP),
      y: row * (PALLET_CARD_SIZE.height + PALLET_MAP_GAP),
    };
  });

  return layout;
}

function mergePalletLayout(existingLayout, palletIds) {
  const defaultLayout = buildDefaultPalletLayout(palletIds);
  const nextLayout = {};

  palletIds.forEach((palletId) => {
    nextLayout[palletId] = clampPalletPosition(existingLayout?.[palletId] || defaultLayout[palletId]);
  });

  return nextLayout;
}

function canPlacePallet(layout, palletId, nextPosition) {
  const candidateRect = {
    ...nextPosition,
    width: PALLET_CARD_SIZE.width,
    height: PALLET_CARD_SIZE.height,
  };

  return Object.entries(layout).every(([otherPalletId, otherPosition]) => {
    if (otherPalletId === palletId) {
      return true;
    }

    return !rectanglesOverlap(candidateRect, {
      ...otherPosition,
      width: PALLET_CARD_SIZE.width,
      height: PALLET_CARD_SIZE.height,
    });
  });
}

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

  function buildFullDonutPath() {
    return [
      `M ${center} ${center - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${center - 0.01} ${center - outerRadius}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${center} ${center - outerRadius}`,
      `M ${center} ${center - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${center - 0.01} ${center - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${center} ${center - innerRadius}`,
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
      path:
        segments.length === 1 || Math.abs(sweep - 360) < 0.001
          ? buildFullDonutPath()
          : buildDonutSlicePath(startAngle, currentAngle),
    };
  });
}

function MetricCard({ label, value, className = "", valueClassName = "" }) {
  return (
    <div className={className ? `metric-card ${className}` : "metric-card"}>
      <p className="metric-label">{label}</p>
      <p className={valueClassName ? `metric-value ${valueClassName}` : "metric-value"}>{value}</p>
    </div>
  );
}

// One-line legend detail for the three inventory pies that sit side by side.
function pieLegendDetail(segment) {
  return `${formatNumber(segment.value)} · ${segment.percentage}%`;
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
  centerLabel = "raw items",
  renderLegendDetail,
  onSegmentClick,
}) {
  const normalizedActiveLabel = (activeLabel || "").trim().toLowerCase();

  return (
    <div className={`expiry-chart-card compact ${cardClassName}`.trim()}>
      {title ? <h4>{title}</h4> : null}
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
              <span>{centerLabel}</span>
            </div>
          </div>
        </div>

        <div className="expiration-pie-legend">
          {legendSegments.map((segment) => (
             <button
               type="button"
              className={
                normalizedActiveLabel === segment.label.trim().toLowerCase()
                  ? "expiration-pie-legend-row active"
                  : "expiration-pie-legend-row"
              }
              key={segment.label}
              onPointerEnter={() => onHover(segment.label)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(segment.label)}
               onBlur={() => onHover(null)}
               onClick={() => onSegmentClick?.(segment)}
               title={onSegmentClick ? `View ${segment.label} supplies in inventory` : undefined}
             >
                <span
                  className="expiration-pie-swatch"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
              <div className="expiration-pie-copy">
                <strong>{segment.label}</strong>
                <span>
                  {renderLegendDetail
                    ? renderLegendDetail(segment)
                    : `${formatNumber(segment.value)} items • ${segment.percentage}% of raw items`}
                </span>
                {normalizedActiveLabel === segment.label.trim().toLowerCase() ? (
                  <span className="expiration-pie-click-hint">
                    Click to view inventory
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShipmentDistributionChart({ shipmentItems }) {
  const [activeLabel, setActiveLabel] = useState(null);

  const chartData = buildFacetCounts(shipmentItems, "category")
    .map((bucket, index) => {
      const matchingItems = shipmentItems.filter((item) => item.category === bucket.value);
      const rawItems = matchingItems.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      );
      const valuation = matchingItems.reduce(
        (total, item) => total + requestedShipmentItemValue(item),
        0
      );

      return {
        label: bucket.value,
        value: rawItems,
        valuation,
        color: colorForCategory(bucket.value),
      };
    })
    .filter((segment) => segment.value > 0)
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));

  const totalItems = chartData.reduce((total, segment) => total + segment.value, 0);
  const legendSegments = chartData.map((segment) => ({
    ...segment,
    total: totalItems,
    percentage: percentOfTotal(segment.value, totalItems),
  }));
  const pieSegments = buildPieChartSegments(legendSegments);
  const activeSegment =
    legendSegments.find((segment) => segment.label === activeLabel) || legendSegments[0] || null;

  if (!legendSegments.length) {
    return (
      <div className="shipment-distribution-card">
        <span className="shipment-status-label">Supply Distribution</span>
        <p className="shipment-distribution-empty">No supply distribution yet.</p>
      </div>
    );
  }

  return (
    <div className="shipment-distribution-card">
      <span className="shipment-status-label">Supply Distribution</span>
      <div
        className="shipment-distribution-chart"
        role="img"
        aria-label="Pie chart of shipment supply distribution by category"
        onMouseLeave={() => setActiveLabel(null)}
      >
        <div
          className="shipment-distribution-pie"
          style={{ background: buildPieChartBackground(legendSegments) }}
        >
          <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
            {pieSegments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                className={
                  (activeLabel || activeSegment?.label) === segment.label
                    ? "pie-slice-hotspot active"
                    : "pie-slice-hotspot"
                }
                onPointerEnter={() => setActiveLabel(segment.label)}
                onPointerMove={() => setActiveLabel(segment.label)}
              />
            ))}
          </svg>
          <div className="shipment-distribution-center">
            <strong>{formatNumber(totalItems)}</strong>
            <span>items</span>
          </div>
        </div>
      </div>
      {activeSegment ? (
        <div className="shipment-distribution-tooltip">
          <strong>{activeSegment.label}</strong>
          <span>{formatNumber(activeSegment.value)} raw item supplies</span>
          <span>{activeSegment.percentage}% of total supplies</span>
          <span>{formatCurrency(activeSegment.valuation)} valuation</span>
        </div>
      ) : null}
    </div>
  );
}

function ShipmentExpirationChart({ shipmentItems }) {
  const [activeLabel, setActiveLabel] = useState(null);
  const bucketOrder = [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ];
  const chartData = bucketOrder
    .map((label) => {
      const matchingItems = shipmentItems.filter(
        (item) =>
          (item.expirationFilter ||
            expirationBucket(item.expirationRaw || item.expiration_date || null)) === label
      );

      return {
        label,
        value: matchingItems.reduce(
          (total, item) => total + normalizeRequestedQuantity(item),
          0
        ),
        entries: matchingItems.length,
        color: expirationBucketColors[label] || "#8a93a8",
      };
    })
    .filter((segment) => segment.value > 0);
  const totalItems = chartData.reduce((total, segment) => total + segment.value, 0);
  const legendSegments = chartData.map((segment) => ({
    ...segment,
    total: totalItems,
    percentage: percentOfTotal(segment.value, totalItems),
  }));
  const pieSegments = buildPieChartSegments(legendSegments);
  const activeSegment =
    legendSegments.find((segment) => segment.label === activeLabel) || legendSegments[0] || null;

  if (!legendSegments.length) {
    return (
      <div className="shipment-distribution-card">
        <span className="shipment-status-label">Expiration Summary</span>
        <p className="shipment-distribution-empty">No expiration data yet.</p>
      </div>
    );
  }

  return (
    <div className="shipment-distribution-card">
      <span className="shipment-status-label">Expiration Summary</span>
      <div
        className="shipment-distribution-chart"
        role="img"
        aria-label="Pie chart of shipment supplies by expiration bucket"
        onMouseLeave={() => setActiveLabel(null)}
      >
        <div
          className="shipment-distribution-pie"
          style={{ background: buildPieChartBackground(legendSegments) }}
        >
          <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
            {pieSegments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                className={
                  (activeLabel || activeSegment?.label) === segment.label
                    ? "pie-slice-hotspot active"
                    : "pie-slice-hotspot"
                }
                onPointerEnter={() => setActiveLabel(segment.label)}
                onPointerMove={() => setActiveLabel(segment.label)}
              />
            ))}
          </svg>
          <div className="shipment-distribution-center">
            <strong>{formatNumber(totalItems)}</strong>
            <span>items</span>
          </div>
        </div>
      </div>
      {activeSegment ? (
        <div className="shipment-distribution-tooltip">
          <strong>{activeSegment.label}</strong>
          <span>{formatNumber(activeSegment.value)} raw item supplies</span>
          <span>{activeSegment.percentage}% of total supplies</span>
        </div>
      ) : null}
    </div>
  );
}

function CompactPalletPieChart({ title, ariaLabel, segments, tooltipFormatter }) {
  const [activeLabel, setActiveLabel] = useState(null);
  const pieSegments = buildPieChartSegments(segments.filter((segment) => segment.value > 0));
  const activeSegment =
    segments.find((segment) => segment.label === activeLabel) || null;

  return (
    <div className="pallet-mini-chart-card">
      <span className="pallet-mini-chart-title">{title}</span>
      <div
        className="pallet-mini-chart-wrap"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setActiveLabel(null)}
      >
        <div
          className="pallet-mini-chart"
          style={{ background: buildPieChartBackground(segments.filter((segment) => segment.value > 0)) }}
        >
          <svg className="pie-slice-layer" viewBox="0 0 200 200" aria-hidden="true">
            {pieSegments.map((segment) => (
              <path
                key={segment.label}
                d={segment.path}
                className={activeLabel === segment.label ? "pie-slice-hotspot active" : "pie-slice-hotspot"}
                onPointerEnter={() => setActiveLabel(segment.label)}
                onPointerMove={() => setActiveLabel(segment.label)}
              />
            ))}
          </svg>
        </div>
        {activeSegment ? (
          <div className="pallet-mini-tooltip">
            {tooltipFormatter(activeSegment).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function shipmentChartAxisMax(values) {
  const highestValue = Math.max(...values, 0);
  return Math.max(5, Math.ceil(highestValue / 5) * 5);
}

function ShipmentBarChart({ data, variant = "primary", compact = false }) {
  const axisMax = shipmentChartAxisMax(data.map((entry) => entry.count));
  const ticks = Array.from({ length: 6 }, (_, index) => {
    const value = Math.round(((5 - index) / 5) * axisMax);
    return value;
  });
  const plotHeight = compact ? 130 : 220;

  return (
    <div className={compact ? "shipment-bar-chart shipment-bar-chart-compact" : "shipment-bar-chart"}>
      <div className="shipment-bar-chart-y-axis">
        {ticks.map((tickValue) => (
          <span key={tickValue}>{formatNumber(tickValue)}</span>
        ))}
      </div>
      <div className="shipment-bar-chart-plot">
        <div className="shipment-bar-chart-grid" aria-hidden="true">
          {ticks.map((tickValue) => (
            <span key={`grid-${tickValue}`} />
          ))}
        </div>
        <div className="shipment-bar-chart-bars">
          {data.map((entry) => {
            const rawHeight = axisMax > 0 ? (entry.count / axisMax) * plotHeight : 0;
            const height = entry.count > 0 ? Math.max(0, rawHeight - 0.5) : 0;

            return (
              <div className="shipment-bar-chart-column" key={entry.label}>
                <div className="shipment-bar-chart-bar-wrap">
                  <span
                    className="shipment-bar-chart-count"
                    style={{ bottom: `${height + 6}px` }}
                  >
                    {formatNumber(entry.count)}
                  </span>
                  {entry.count > 0 ? (
                    <div
                      className={
                        variant === "secondary"
                          ? "shipment-bar-chart-bar shipment-bar-chart-bar-secondary"
                          : "shipment-bar-chart-bar"
                      }
                      style={{ height: `${height}px` }}
                    />
                  ) : null}
                </div>
                <strong className="shipment-bar-chart-label">{entry.label}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [activeShipmentSubtab, setActiveShipmentSubtab] = useState("current");
  const [activeShipmentKpiSubtab, setActiveShipmentKpiSubtab] = useState("overview");
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExpiration, setSelectedExpiration] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedPallets, setSelectedPallets] = useState([]);
  const [selectedBoxTypes, setSelectedBoxTypes] = useState([]);
  const [selectedWorkflowStatuses, setSelectedWorkflowStatuses] = useState([]);
  const [showAvailableItems, setShowAvailableItems] = useState(false);
  const [showNonAvailableItems, setShowNonAvailableItems] = useState(false);
  const [isInventoryFiltersOpen, setIsInventoryFiltersOpen] = useState(false);
  const [showFloatingInventoryAction, setShowFloatingInventoryAction] = useState(false);
  const [shipments, setShipments] = useState(defaultShipments);
  const [nonInventoryShipments, setNonInventoryShipments] = useState([]);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [pendingShipmentItems, setPendingShipmentItems] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("__new__");
  const [newShipmentRecipientName, setNewShipmentRecipientName] = useState("");
  const [newShipmentType, setNewShipmentType] = useState("Local");
  const [newShipmentPointOfContact, setNewShipmentPointOfContact] = useState("");
  const [newShipmentRecipientPointOfContact, setNewShipmentRecipientPointOfContact] = useState("");
  const [newShipmentSupplyIds, setNewShipmentSupplyIds] = useState("");
  const [selectedInventoryIds, setSelectedInventoryIds] = useState([]);
  const [valuationRange, setValuationRange] = useState({ min: 0, max: 0 });
  const [currentShipmentSearchTerm, setCurrentShipmentSearchTerm] = useState("");
  const [pastShipmentSearchTerm, setPastShipmentSearchTerm] = useState("");
  const [currentShipmentTypeFilter, setCurrentShipmentTypeFilter] = useState("All");
  const [currentShipmentStatusFilter, setCurrentShipmentStatusFilter] = useState("All");
  const [pastShipmentTypeFilter, setPastShipmentTypeFilter] = useState("All");
  const [pastShipmentStatusDateFilter, setPastShipmentStatusDateFilter] = useState("creation");
  const [nonInventoryShipmentSearch, setNonInventoryShipmentSearch] = useState("");
  const [nonInventoryShipmentLocation, setNonInventoryShipmentLocation] = useState("All");
  const [nonInventoryValuationSort, setNonInventoryValuationSort] = useState("high-low");
  const [isCreateShipmentModalOpen, setIsCreateShipmentModalOpen] = useState(false);
  const [isNonInventoryShipmentModalOpen, setIsNonInventoryShipmentModalOpen] = useState(false);
  const [nonInventoryClinicName, setNonInventoryClinicName] = useState("");
  const [nonInventoryPointOfContact, setNonInventoryPointOfContact] = useState("");
  const [nonInventoryShipmentType, setNonInventoryShipmentType] = useState("Local");
  const [nonInventoryShipmentDate, setNonInventoryShipmentDate] = useState(todayIsoDate());
  const [nonInventoryValuation, setNonInventoryValuation] = useState("");
  const [detailsItem, setDetailsItem] = useState(null);
  const [returningShipmentItem, setReturningShipmentItem] = useState(null);
  const [returningShipmentItems, setReturningShipmentItems] = useState(null);
  const [deletingShipment, setDeletingShipment] = useState(null);
  const [requestingShipmentItem, setRequestingShipmentItem] = useState(null);
  const [consolidatingShipmentItem, setConsolidatingShipmentItem] = useState(null);
  const [bulkConsolidationCheck, setBulkConsolidationCheck] = useState(null);
  const [addingSupplyIdsShipmentId, setAddingSupplyIdsShipmentId] = useState(null);
  const [shipmentSupplyIdsInput, setShipmentSupplyIdsInput] = useState("");
  const [requestedUnitsValue, setRequestedUnitsValue] = useState("");
  const [expandedShipmentIds, setExpandedShipmentIds] = useState([]);
  const [editingShipmentField, setEditingShipmentField] = useState(null);
  const [editingShipmentValue, setEditingShipmentValue] = useState("");
  const [editingShipmentNotesId, setEditingShipmentNotesId] = useState(null);
  const [editingShipmentNotesValue, setEditingShipmentNotesValue] = useState("");
  const [shippingShipmentId, setShippingShipmentId] = useState(null);
  const [deliveringShipmentId, setDeliveringShipmentId] = useState(null);
  const [revertingDeliveredShipmentId, setRevertingDeliveredShipmentId] = useState(null);
  const [shipmentDate, setShipmentDate] = useState("");
  const [transportType, setTransportType] = useState("Car");
  const [transportTypeOther, setTransportTypeOther] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryDateMode, setDeliveryDateMode] = useState("date");
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [activeExpirationPieLabel, setActiveExpirationPieLabel] = useState(null);
  const [activeDurationPieLabel, setActiveDurationPieLabel] = useState(null);
  const [activeCategoryPieLabel, setActiveCategoryPieLabel] = useState(null);
  const [activeValuePieLabel, setActiveValuePieLabel] = useState(null);
  const [activeSupplyStatusPieLabel, setActiveSupplyStatusPieLabel] = useState(null);
  const [isAllInventoryKpisOpen, setIsAllInventoryKpisOpen] = useState(false);
  const [isAllShipmentKpisOpen, setIsAllShipmentKpisOpen] = useState(false);
  const [isAllShipmentFlowMetricsOpen, setIsAllShipmentFlowMetricsOpen] = useState(false);
  const [isEditingPalletMap, setIsEditingPalletMap] = useState(false);
  const [savedPalletLayout, setSavedPalletLayout] = useState({});
  const [draftPalletLayout, setDraftPalletLayout] = useState({});
  const [draggingPallet, setDraggingPallet] = useState(null);
  const [activePalletId, setActivePalletId] = useState(null);
  const [focusedPastShipmentId, setFocusedPastShipmentId] = useState(null);
  const palletMapRef = useRef(null);
  const inventoryShipmentButtonRef = useRef(null);
  const { history: fullDonationHistory, error: donationHistoryError } = useDonationHistory();
  const { shipments: historyShipments, error: historyShipmentsError } = useHistoryShipments();
  // Year range for the Shipment KPIs stats and map; null means no limit.
  const [historyYearRange, setHistoryYearRange] = useState({ from: null, to: null });

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
      setLastRefreshedAt(new Date());
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
    applyDashboardTooltips();
    const observer = new MutationObserver(() => applyDashboardTooltips());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
    const button = inventoryShipmentButtonRef.current;
    if (activeTab !== "inventory" || loading || error || !button) {
      setShowFloatingInventoryAction(false);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      const hasScrolledPastButton =
        !entry.isIntersecting && entry.boundingClientRect.bottom <= 16;
      setShowFloatingInventoryAction(hasScrolledPastButton);
    });

    observer.observe(button);
    return () => observer.disconnect();
  }, [activeTab, loading, error]);

  useEffect(() => {
    try {
      const storedShipments = window.localStorage.getItem(SHIPMENT_STORAGE_KEY);
      if (storedShipments) {
        const parsedShipments = JSON.parse(storedShipments);
        const normalizedShipments = (Array.isArray(parsedShipments) ? parsedShipments : defaultShipments)
          .map((shipment) =>
            withConsolidationCompletionDate({
              ...shipment,
              shipmentType: normalizeShipmentType(shipment.shipmentType),
              filterMode:
                !shipment.filterMode || shipment.filterMode === "location"
                  ? "original"
                  : shipment.filterMode,
              isCompleted: Boolean(shipment.isCompleted),
              createdAt: shipment.createdAt || "",
              consolidationStartedAt: shipment.consolidationStartedAt || "",
              consolidationCompletedAt: shipment.consolidationCompletedAt || "",
              pastShipmentStatus: Boolean(shipment.isCompleted)
                ? normalizePastShipmentStatus(
                    shipment.pastShipmentStatus,
                    shipment.deliveryDate,
                    shipment.pastShipmentStatusOverride ||
                      (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
                  )
                : undefined,
              items: (shipment.items || []).map(normalizeShipmentItem),
            })
          );
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

  useEffect(() => {
    try {
      const storedShipments = window.localStorage.getItem(NON_INVENTORY_SHIPMENT_STORAGE_KEY);
      if (storedShipments) {
        const parsedShipments = JSON.parse(storedShipments);
        if (Array.isArray(parsedShipments)) {
          setNonInventoryShipments(
            parsedShipments.map((shipment) => ({
              ...shipment,
              shippedAt: shipment.shippedAt || shipment.createdAt || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("Unable to restore non-inventory shipments", err);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        NON_INVENTORY_SHIPMENT_STORAGE_KEY,
        JSON.stringify(nonInventoryShipments)
      );
    } catch (err) {
      console.error("Unable to persist non-inventory shipments", err);
    }
  }, [nonInventoryShipments]);

  useEffect(() => {
    try {
      const storedLayout = window.localStorage.getItem(PALLET_MAP_STORAGE_KEY);
      if (storedLayout) {
        setSavedPalletLayout(JSON.parse(storedLayout));
      }
    } catch (err) {
      console.error("Unable to restore pallet layout", err);
    }
  }, []);

  // Shipment KPIs year filter. The full summary comes from /history; a
  // narrower range is recomputed from the individual past shipments.
  const historyYears = (fullDonationHistory?.years ?? []).map((entry) => entry.year);
  const historyFirstYear = historyYears[0] ?? null;
  const historyLastYear = historyYears[historyYears.length - 1] ?? null;
  const historyFromYear = historyYearRange.from ?? historyFirstYear;
  const historyToYear = historyYearRange.to ?? historyLastYear;
  const isHistoryYearFiltered =
    historyFromYear !== historyFirstYear || historyToYear !== historyLastYear;
  function inHistoryYearRange(year) {
    return (
      (historyFromYear === null || year >= historyFromYear) &&
      (historyToYear === null || year <= historyToYear)
    );
  }
  const yearFilteredHistoryShipments = historyShipments?.filter((shipment) =>
    inHistoryYearRange(shipment.year)
  );
  const donationHistory =
    isHistoryYearFiltered && yearFilteredHistoryShipments
      ? {
          ...summarizeHistoryShipments(yearFilteredHistoryShipments),
          source: fullDonationHistory?.source,
        }
      : fullDonationHistory;
  const historyRangeLabel = !isHistoryYearFiltered
    ? ""
    : historyFromYear === historyToYear
      ? String(historyFromYear)
      : `${historyFromYear}–${historyToYear}`;

  function setHistoryYear(field, value) {
    const year = Number(value);
    setHistoryYearRange((current) => {
      const next = { from: current.from ?? historyFirstYear, to: current.to ?? historyLastYear, [field]: year };
      // Keep the range the right way round when one end passes the other.
      if (next.from > next.to) {
        if (field === "from") {
          next.to = year;
        } else {
          next.from = year;
        }
      }
      return next;
    });
  }

  const historyYearFilter = historyYears.length ? (
    <div className="history-year-filter">
      <label>
        <span>From</span>
        <select
          value={historyFromYear}
          onChange={(event) => setHistoryYear("from", event.target.value)}
          disabled={!historyShipments}
        >
          {historyYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>To</span>
        <select
          value={historyToYear}
          onChange={(event) => setHistoryYear("to", event.target.value)}
          disabled={!historyShipments}
        >
          {historyYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      {isHistoryYearFiltered ? (
        <button
          type="button"
          className="history-year-reset"
          onClick={() => setHistoryYearRange({ from: null, to: null })}
        >
          All years
        </button>
      ) : null}
    </div>
  ) : null;

  const currentShipments = shipments.filter((shipment) => !shipment.isCompleted);
  const pastShipments = shipments.filter((shipment) => shipment.isCompleted);
  const deliveringShipment = shipments.find((shipment) => shipment.id === deliveringShipmentId);
  const revertingDeliveredShipment = shipments.find(
    (shipment) => shipment.id === revertingDeliveredShipmentId
  );
  const currentShipmentRequestTotals = shipments
    .filter((shipment) => !shipment.isCompleted)
    .reduce((accumulator, shipment) => {
      shipment.items.forEach((item) => {
        const itemId = String(item.id);
        accumulator[itemId] = (accumulator[itemId] || 0) + normalizeRequestedQuantity(item);
      });
      return accumulator;
    }, {});

  const completedShipmentItemIds = new Set(
    shipments
      .filter((shipment) => shipment.isCompleted)
      .flatMap((shipment) => shipment.items.map((item) => String(item.id)))
  );

  const inventoryRows = buildInventoryRows(items).filter(
    (row) => !completedShipmentItemIds.has(String(row.id))
  );
  const inventoryRowsWithStatus = inventoryRows.map((row) => ({
    ...row,
    inventoryStatus: inventoryStatusForItem(row.id, shipments),
    requestedQuantity: currentShipmentRequestTotals[String(row.id)] || 0,
    isPartiallyRequested:
      (currentShipmentRequestTotals[String(row.id)] || 0) > 0 &&
      (currentShipmentRequestTotals[String(row.id)] || 0) < (row.quantity || 0),
  }));
  const inventoryRowsWithShipmentStatus = inventoryRowsWithStatus.map((row) => {
    const matchingShipmentItems = currentShipments.flatMap((shipment) =>
      shipment.items.filter((shipmentItem) => String(shipmentItem.id) === String(row.id))
    );
    const supplyWorkflowStatus =
      matchingShipmentItems.length === 0
        ? "Inventory"
        : matchingShipmentItems.some((shipmentItem) => shipmentItem.isConsolidated)
          ? "Consolidated"
          : "Pulled";

    return {
      ...row,
      inventoryStatus:
        supplyWorkflowStatus === "Inventory" ? "Available" : supplyWorkflowStatus,
      supplyWorkflowStatus,
    };
  });
  const allBoxTypes = [...new Set(inventoryRowsWithStatus.map((row) => row.boxType).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
  const palletSummaries = Object.values(
    inventoryRowsWithShipmentStatus
      .filter((row) => row.palletNumber && row.palletNumber !== "Unassigned")
      .reduce((accumulator, row) => {
        const palletId = String(row.palletNumber);

        if (!accumulator[palletId]) {
          accumulator[palletId] = {
            id: palletId,
            label: `Pallet ${palletId}`,
            rows: [],
            totalSupplies: 0,
            boxKeys: new Set(),
            boxTypeCounts: {},
          };
        }

        accumulator[palletId].rows.push(row);
        accumulator[palletId].totalSupplies += Number(row.quantity) || 0;
        accumulator[palletId].boxKeys.add(`${row.boxType}|${row.boxNumber}`);

        const boxKey = `${row.boxType}|${row.boxNumber}`;
        if (!accumulator[palletId].seenBoxKeys) {
          accumulator[palletId].seenBoxKeys = new Set();
        }
        if (!accumulator[palletId].seenBoxKeys.has(boxKey)) {
          accumulator[palletId].seenBoxKeys.add(boxKey);
          accumulator[palletId].boxTypeCounts[row.boxType] =
            (accumulator[palletId].boxTypeCounts[row.boxType] || 0) + 1;
        }

        return accumulator;
      }, {})
  )
    .map((summary) => ({
      ...summary,
      boxBreakdown: allBoxTypes.map((boxType) => ({
        boxType,
        count: summary.boxTypeCounts[boxType] || 0,
      })),
      totalBoxes: summary.boxKeys.size,
    }))
    .sort((left, right) => Number(left.id) - Number(right.id));
  const palletIdKey = palletSummaries.map((summary) => summary.id).join("|");
  const activePalletSummary =
    palletSummaries.find((summary) => summary.id === activePalletId) || null;
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
  const workflowStatusOptions = buildFacetCounts(
    inventoryRowsWithShipmentStatus,
    "supplyWorkflowStatus",
    supplyStatusOrder
  );

  useEffect(() => {
    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
  }, [minUnitPrice, maxUnitPrice]);

  useEffect(() => {
    const nextLayout = mergePalletLayout(savedPalletLayout, palletSummaries.map((summary) => summary.id));
    if (JSON.stringify(nextLayout) !== JSON.stringify(savedPalletLayout)) {
      setSavedPalletLayout(nextLayout);
    }

    if (isEditingPalletMap) {
      const nextDraftLayout = mergePalletLayout(
        draftPalletLayout,
        palletSummaries.map((summary) => summary.id)
      );
      if (JSON.stringify(nextDraftLayout) !== JSON.stringify(draftPalletLayout)) {
        setDraftPalletLayout(nextDraftLayout);
      }
    }
  }, [palletIdKey, savedPalletLayout, draftPalletLayout, isEditingPalletMap]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PALLET_MAP_STORAGE_KEY, JSON.stringify(savedPalletLayout));
    } catch (err) {
      console.error("Unable to persist pallet layout", err);
    }
  }, [savedPalletLayout]);

  useEffect(() => {
    if (
      !focusedPastShipmentId ||
      activeTab !== "shipments" ||
      activeShipmentSubtab !== "past"
    ) {
      return;
    }

    const target = document.getElementById(`past-shipment-${focusedPastShipmentId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusedPastShipmentId(null);
    }
  }, [focusedPastShipmentId, activeTab, activeShipmentSubtab, shipments]);

  useEffect(() => {
    if (!draggingPallet || !isEditingPalletMap) {
      return undefined;
    }

    function handlePointerMove(event) {
      const canvasBounds = palletMapRef.current?.getBoundingClientRect();
      if (!canvasBounds) {
        return;
      }

      const unclampedPosition = {
        x: event.clientX - canvasBounds.left - draggingPallet.offsetX,
        y: event.clientY - canvasBounds.top - draggingPallet.offsetY,
      };
      const nextPosition = clampPalletPosition(unclampedPosition);

      setDraftPalletLayout((currentLayout) =>
        canPlacePallet(currentLayout, draggingPallet.palletId, nextPosition)
          ? { ...currentLayout, [draggingPallet.palletId]: nextPosition }
          : currentLayout
      );
    }

    function handlePointerUp() {
      setDraggingPallet(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingPallet, isEditingPalletMap]);

  const visiblePalletLayout = isEditingPalletMap ? draftPalletLayout : savedPalletLayout;
  // Outside edit mode the map is only as tall as its lowest pallet, not the full canvas.
  const palletMapFitHeight =
    Math.max(
      0,
      ...Object.values(visiblePalletLayout || {}).map((position) => position?.y || 0)
    ) +
    PALLET_CARD_SIZE.height +
    PALLET_MAP_GAP * 2;

  function matchesSelectedFilter(selectedValues, rowValue) {
    return selectedValues.length === 0 || selectedValues.includes(rowValue);
  }

  function startEditingPalletConformation() {
    setDraftPalletLayout(mergePalletLayout(savedPalletLayout, palletSummaries.map((summary) => summary.id)));
    setIsEditingPalletMap(true);
  }

  function savePalletConformation() {
    setSavedPalletLayout(mergePalletLayout(draftPalletLayout, palletSummaries.map((summary) => summary.id)));
    setIsEditingPalletMap(false);
    setDraggingPallet(null);
  }

  function handlePalletPointerDown(event, palletId) {
    if (!isEditingPalletMap) {
      return;
    }

    const canvasBounds = palletMapRef.current?.getBoundingClientRect();
    const palletPosition = visiblePalletLayout[palletId];
    if (!canvasBounds || !palletPosition) {
      return;
    }

    setDraggingPallet({
      palletId,
      offsetX: event.clientX - canvasBounds.left - palletPosition.x,
      offsetY: event.clientY - canvasBounds.top - palletPosition.y,
    });
  }

  function jumpToPastShipment(shipmentId, shipmentName, shipmentKind = "inventory") {
    setActiveTab("shipments");
    if (shipmentKind === "non-inventory") {
      setActiveShipmentSubtab("non-inventory");
      setNonInventoryShipmentSearch(shipmentName || "");
      return;
    }
    setActiveShipmentSubtab("past");
    setPastShipmentSearchTerm(shipmentName || "");
    setFocusedPastShipmentId(shipmentId);
  }

  function toggleFilter(setter, currentValues, value) {
    setter(
      currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value]
    );
  }

  function clearInventoryFilters() {
    setSelectedExpiration([]);
    setSelectedDuration([]);
    setSelectedCategories([]);
    setSelectedPallets([]);
    setSelectedBoxTypes([]);
    setSelectedWorkflowStatuses([]);
    setShowAvailableItems(false);
    setShowNonAvailableItems(false);
    setValuationRange({ min: minUnitPrice, max: maxUnitPrice });
    setSearchTerm("");
  }

  function openChartSegmentInInventory(filterType, rawLabel) {
    clearInventoryFilters();
    setSelectedInventoryIds([]);

    if (filterType === "expiration") {
      const expirationLabelMap = {
        "Already Expired": "Already expired",
        "No expiration": "No expiration date",
        "No expiration date": "No expiration date",
      };
      setSelectedExpiration([expirationLabelMap[rawLabel] || rawLabel]);
    } else if (filterType === "duration") {
      setSelectedDuration([rawLabel]);
    } else if (filterType === "category") {
      setSelectedCategories([rawLabel]);
    } else if (filterType === "box") {
      setSelectedBoxTypes([rawLabel]);
    } else if (filterType === "workflow") {
      setSelectedWorkflowStatuses([rawLabel]);
    } else if (filterType === "value") {
      const valueRanges = {
        "$0-$50": { min: 0, max: Math.min(49.999, maxUnitPrice) },
        "$50-$100": { min: 50, max: Math.min(99.999, maxUnitPrice) },
        "$100-$200": { min: 100, max: Math.min(199.999, maxUnitPrice) },
        "$200+": { min: 200, max: maxUnitPrice },
      };
      setValuationRange(valueRanges[rawLabel] || { min: minUnitPrice, max: maxUnitPrice });
    }

    setActiveTab("inventory");
    setIsInventoryFiltersOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
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
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
    setIsShipmentModalOpen(true);
  }

  function closeShipmentModal() {
    setIsShipmentModalOpen(false);
    setPendingShipmentItems([]);
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
  }

  function openCreateShipmentModal() {
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
    setIsCreateShipmentModalOpen(true);
  }

  function closeCreateShipmentModal() {
    setIsCreateShipmentModalOpen(false);
    setNewShipmentRecipientName("");
    setNewShipmentType("Local");
    setNewShipmentPointOfContact("");
    setNewShipmentRecipientPointOfContact("");
    setNewShipmentSupplyIds("");
  }

  function openNonInventoryShipmentModal() {
    setNonInventoryClinicName("");
    setNonInventoryPointOfContact("");
    setNonInventoryShipmentType("Local");
    setNonInventoryShipmentDate(todayIsoDate());
    setNonInventoryValuation("");
    setIsNonInventoryShipmentModalOpen(true);
  }

  function closeNonInventoryShipmentModal() {
    setIsNonInventoryShipmentModalOpen(false);
    setNonInventoryClinicName("");
    setNonInventoryPointOfContact("");
    setNonInventoryShipmentType("Local");
    setNonInventoryShipmentDate(todayIsoDate());
    setNonInventoryValuation("");
  }

  function createNonInventoryShipment() {
    const clinicName = nonInventoryClinicName.trim();
    const pointOfContact = nonInventoryPointOfContact.trim();
    const shippedAt = nonInventoryShipmentDate.trim();
    const valuation = Number(nonInventoryValuation);

    if (
      !clinicName ||
      !blueprintsRosterNames.includes(pointOfContact) ||
      !shippedAt ||
      shippedAt > todayIsoDate() ||
      nonInventoryValuation === "" ||
      valuation < 0
    ) {
      return;
    }

    setNonInventoryShipments((currentShipments) => [
      ...currentShipments,
      {
        id: `non-inventory-shipment-${Date.now()}`,
        clinicName,
        pointOfContact,
        shipmentType: normalizeShipmentType(nonInventoryShipmentType),
        shippedAt,
        valuation,
        createdAt: todayIsoDate(),
      },
    ]);
    closeNonInventoryShipmentModal();
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
    return inventoryRowsWithStatus.filter(
      (row) =>
        row.inventoryStatus === "Available" &&
        selectedIds.includes(String(row.supplyId))
    );
  }

  function buildShipmentRecord(
    recipientName,
    shipmentType,
    pointOfContact,
    recipientPointOfContact,
    items = []
  ) {
    return {
      id: `shipment-${Date.now()}`,
      recipientName,
      shipmentType: normalizeShipmentType(shipmentType),
      pointOfContact,
      recipientPointOfContact: recipientPointOfContact || "TBD",
      filterMode: "original",
      createdAt: todayIsoDate(),
      consolidationStartedAt: "",
      consolidationCompletedAt: "",
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
        const recipientPointOfContact = newShipmentRecipientPointOfContact.trim() || "TBD";

        if (!recipientName || !shipmentType || !blueprintsRosterNames.includes(pointOfContact)) {
          return currentShipments;
        }

        const newShipment = buildShipmentRecord(
          recipientName,
          shipmentType,
          pointOfContact,
          recipientPointOfContact
        );
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
    const recipientPointOfContact = newShipmentRecipientPointOfContact.trim() || "TBD";
    const shipmentItems = itemsFromSupplyIds(newShipmentSupplyIds);

    if (!recipientName || !shipmentType || !blueprintsRosterNames.includes(pointOfContact)) {
      return;
    }

    setShipments((currentShipments) => [
      ...currentShipments,
      buildShipmentRecord(
        recipientName,
        shipmentType,
        pointOfContact,
        recipientPointOfContact,
        shipmentItems.map(normalizeShipmentItem)
      ),
    ]);
    closeCreateShipmentModal();
  }

  function toggleInventorySelection(item) {
    if (item.inventoryStatus !== "Available") {
      return;
    }

    setSelectedInventoryIds((currentIds) =>
      currentIds.includes(item.id)
        ? currentIds.filter((currentId) => currentId !== item.id)
        : [...currentIds, item.id]
    );
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filteredInventoryRows
      .filter((row) => row.inventoryStatus === "Available")
      .map((row) => row.id);
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

  function openReturnAllToInventoryModal(shipment) {
    setReturningShipmentItems({
      shipmentId: shipment.id,
      shipmentName: shipment.recipientName,
      itemCount: shipment.items.length,
      unitCount: shipment.items.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      ),
    });
  }

  function closeReturnAllToInventoryModal() {
    setReturningShipmentItems(null);
  }

  function openDeleteShipmentModal(shipment) {
    setDeletingShipment({
      shipmentId: shipment.id,
      shipmentName: shipment.recipientName,
      itemCount: shipment.items.length,
    });
  }

  function closeDeleteShipmentModal() {
    setDeletingShipment(null);
  }

  // Deleting a shipment drops it entirely; its supplies stop counting as
  // pulled, so they show as available in Total Inventory again.
  function deleteShipment() {
    if (!deletingShipment) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.filter((shipment) => shipment.id !== deletingShipment.shipmentId)
    );
    setExpandedShipmentIds((currentIds) =>
      currentIds.filter((shipmentId) => shipmentId !== deletingShipment.shipmentId)
    );
    closeDeleteShipmentModal();
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
    setConsolidatingShipmentItem({ shipmentId, shipmentItem });
  }

  function closeConsolidationModal() {
    setConsolidatingShipmentItem(null);
  }

  function openBulkConsolidationModal(shipment) {
    const shouldConsolidate = !shipment.items.every((item) => item.isConsolidated);
    setBulkConsolidationCheck({
      shipmentId: shipment.id,
      shipmentName: shipment.recipientName,
      shouldConsolidate,
      itemCount: shipment.items.length,
      requestedUnitCount: shipment.items.reduce(
        (total, item) => total + normalizeRequestedQuantity(item),
        0
      ),
    });
  }

  function closeBulkConsolidationModal() {
    setBulkConsolidationCheck(null);
  }

  function confirmBulkConsolidation() {
    if (!bulkConsolidationCheck) {
      return;
    }

    consolidateAllShipmentItems(bulkConsolidationCheck.shipmentId);
    closeBulkConsolidationModal();
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

        if (field === "pointOfContact" && !blueprintsRosterNames.includes(nextValue)) {
          return shipment;
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

  function returnAllShipmentItemsToInventory() {
    if (!returningShipmentItems) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === returningShipmentItems.shipmentId
          ? { ...shipment, items: [] }
          : shipment
      )
    );
    closeReturnAllToInventoryModal();
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

  function saveConsolidation() {
    if (!consolidatingShipmentItem) {
      return;
    }

    const requestedQuantity = normalizeRequestedQuantity(consolidatingShipmentItem.shipmentItem);
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== consolidatingShipmentItem.shipmentId) {
          return shipment;
        }

        return withConsolidationCompletionDate({
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(consolidatingShipmentItem.shipmentItem.id)
              ? {
                  ...item,
                  isConsolidated: true,
                  consolidationDetails: {
                    consolidatedQuantity: requestedQuantity,
                  },
                }
              : item
          ),
        });
      })
    );
    closeConsolidationModal();
  }

  function unconsolidateShipmentItem(shipmentId, itemId) {
    setShipments((currentShipments) =>
      currentShipments.map((shipment) => {
        if (shipment.id !== shipmentId) {
          return shipment;
        }

        return withConsolidationCompletionDate({
          ...shipment,
          items: shipment.items.map((item) =>
            String(item.id) === String(itemId)
              ? {
                  ...item,
                  isConsolidated: false,
                  consolidationDetails: undefined,
                }
              : item
          ),
        });
      })
    );
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

        if (shipment.items.length === 0) {
          return shipment;
        }

        const shouldConsolidate = !shipment.items.every((item) => item.isConsolidated);

        return withConsolidationCompletionDate({
          ...shipment,
          items: shipment.items.map((item) => ({
            ...item,
            isConsolidated: shouldConsolidate,
            consolidationDetails: shouldConsolidate
              ? {
                  exactMatch: true,
                  consolidatedQuantity: normalizeRequestedQuantity(item),
                  varianceReason: "",
                }
              : undefined,
          })),
        });
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
              pastShipmentStatus: normalizePastShipmentStatus(undefined, resolvedDeliveryDate),
              pastShipmentStatusManuallySet: false,
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

  function updatePastShipmentStatus(shipmentId, nextStatus) {
    if (nextStatus === "Delivered") {
      const targetShipment = shipments.find((shipment) => shipment.id === shipmentId);
      setDeliveringShipmentId(shipmentId);
      setDeliveryDate(
        targetShipment?.deliveryDate && targetShipment.deliveryDate !== "TBD"
          ? targetShipment.deliveryDate
          : ""
      );
      setShipmentNotes(targetShipment?.shipmentNotes || "");
      return;
    }

    setRevertingDeliveredShipmentId(shipmentId);
  }

  function closeRevertToShippedModal() {
    setRevertingDeliveredShipmentId(null);
  }

  function confirmRevertToShipped() {
    if (!revertingDeliveredShipmentId) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === revertingDeliveredShipmentId
          ? {
              ...shipment,
              pastShipmentStatus: "Shipped",
              pastShipmentStatusOverride: "Shipped",
              pastShipmentStatusManuallySet: true,
            }
          : shipment
      )
    );
    closeRevertToShippedModal();
  }

  function closeDeliveredModal() {
    setDeliveringShipmentId(null);
    setDeliveryDate("");
    setShipmentNotes("");
  }

  function startEditingShipmentNotes(shipmentId, currentNotes) {
    setEditingShipmentNotesId(shipmentId);
    setEditingShipmentNotesValue(currentNotes || "");
  }

  function cancelEditingShipmentNotes() {
    setEditingShipmentNotesId(null);
    setEditingShipmentNotesValue("");
  }

  function saveEditingShipmentNotes() {
    if (!editingShipmentNotesId) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === editingShipmentNotesId
          ? { ...shipment, shipmentNotes: editingShipmentNotesValue.trim() }
          : shipment
      )
    );
    cancelEditingShipmentNotes();
  }

  function saveDeliveredStatus() {
    if (!deliveringShipmentId || !deliveryDate.trim()) {
      return;
    }

    setShipments((currentShipments) =>
      currentShipments.map((shipment) =>
        shipment.id === deliveringShipmentId
          ? {
              ...shipment,
              deliveryDate: deliveryDate.trim(),
              shipmentNotes: shipmentNotes.trim(),
              pastShipmentStatus: normalizePastShipmentStatus(undefined, deliveryDate.trim()),
              pastShipmentStatusOverride: "Delivered",
              pastShipmentStatusManuallySet: false,
            }
          : shipment
      )
    );
    closeDeliveredModal();
  }

  const filteredInventoryRows = inventoryRowsWithShipmentStatus.filter((row) => {
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
      (!showNonAvailableItems || row.inventoryStatus !== "Available") &&
      matchesSelectedFilter(selectedPallets, row.palletNumber) &&
      matchesSelectedFilter(selectedBoxTypes, row.boxType) &&
      matchesSelectedFilter(selectedExpiration, row.expirationFilter) &&
      matchesSelectedFilter(selectedDuration, row.durationFilter) &&
      matchesSelectedFilter(selectedCategories, row.category) &&
      matchesSelectedFilter(selectedWorkflowStatuses, row.supplyWorkflowStatus)
    );
  });
  const selectableFilteredInventoryRows = filteredInventoryRows.filter(
    (row) => row.inventoryStatus === "Available"
  );
  const selectedInventoryItems = selectableFilteredInventoryRows.filter((row) =>
    selectedInventoryIds.includes(row.id)
  );
  const hasActiveInventoryFilters =
    searchTerm.trim().length > 0 ||
    selectedExpiration.length > 0 ||
    selectedDuration.length > 0 ||
    selectedCategories.length > 0 ||
    selectedPallets.length > 0 ||
    selectedBoxTypes.length > 0 ||
    selectedWorkflowStatuses.length > 0 ||
    showAvailableItems ||
    showNonAvailableItems ||
    valuationRange.min !== minUnitPrice ||
    valuationRange.max !== maxUnitPrice;
  const allFilteredSelected =
    selectableFilteredInventoryRows.length > 0 &&
    selectableFilteredInventoryRows.every((row) => selectedInventoryIds.includes(row.id));
  const normalizedCurrentShipmentSearch = currentShipmentSearchTerm.trim().toLowerCase();
  const normalizedPastShipmentSearch = pastShipmentSearchTerm.trim().toLowerCase();
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
  const rankedShipments = rankShipmentsBySearch(currentShipments, normalizedCurrentShipmentSearch);
  const filteredCurrentShipments = rankedShipments.filter((shipment) => {
    const matchesType =
      currentShipmentTypeFilter === "All" ||
      normalizeShipmentType(shipment.shipmentType) === currentShipmentTypeFilter;
    const matchesStatus =
      currentShipmentStatusFilter === "All" ||
      getShipmentStatus(shipment) === currentShipmentStatusFilter;

    return matchesType && matchesStatus;
  });
  const normalizedNonInventorySearch = nonInventoryShipmentSearch.trim().toLowerCase();
  const filteredNonInventoryShipments = nonInventoryShipments
    .filter((shipment) => {
      const matchesName =
        !normalizedNonInventorySearch ||
        shipment.clinicName.toLowerCase().includes(normalizedNonInventorySearch);
      const matchesLocation =
        nonInventoryShipmentLocation === "All" ||
        normalizeShipmentType(shipment.shipmentType) === nonInventoryShipmentLocation;

      return matchesName && matchesLocation;
    })
    .sort((left, right) =>
      nonInventoryValuationSort === "low-high"
        ? Number(left.valuation) - Number(right.valuation)
        : Number(right.valuation) - Number(left.valuation)
    );
  const rankedPastShipments = rankShipmentsBySearch(pastShipments, normalizedPastShipmentSearch);
  const filteredPastShipments = rankedPastShipments
    .filter((shipment) =>
      pastShipmentTypeFilter === "All"
        ? true
        : normalizeShipmentType(shipment.shipmentType) === pastShipmentTypeFilter
    )
    .sort(
      (left, right) =>
        shipmentStatusDateValue(right, pastShipmentStatusDateFilter) -
        shipmentStatusDateValue(left, pastShipmentStatusDateFilter)
    );
  const shipmentDetailsComplete =
    newShipmentRecipientName.trim() &&
    newShipmentType &&
    blueprintsRosterNames.includes(newShipmentPointOfContact);
  const consolidationTargetItem = consolidatingShipmentItem?.shipmentItem || null;
  const consolidationRequestedQuantity = consolidationTargetItem
    ? normalizeRequestedQuantity(consolidationTargetItem)
    : 0;
  const consolidationTotalQuantity = Number(consolidationTargetItem?.quantity) || 0;
  const consolidationRequestNote = consolidationTargetItem
    ? consolidationRequestedQuantity === consolidationTotalQuantity
      ? `Requested all ${formatNumber(consolidationTotalQuantity)} units`
      : `Requested ${formatNumber(consolidationRequestedQuantity)} of ${formatNumber(consolidationTotalQuantity)} units`
    : "";
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
      color: expirationBucketColors[range] || "#8a93a8",
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
      color: durationBucketColors[bucketLabel] || "#8a93a8",
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
        color: colorForCategory(bucket.value),
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
  const valueBucketChartData = valueBucketOrder.map((bucketLabel) => {
    const matchingRows = inventoryRowsWithShipmentStatus.filter(
      (row) => valueBucketForUnitPrice(row.unitPrice) === bucketLabel
    );
    const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

    return {
      label: bucketLabel,
      value: rawItems,
      color: valueBucketColors[bucketLabel],
    };
  });
  const totalValueBucketItems = valueBucketChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );
  const valueBucketLegendData = valueBucketChartData.map((segment) => ({
    ...segment,
    total: totalValueBucketItems,
    percentage: percentOfTotal(segment.value, totalValueBucketItems),
  }));
  const valueBucketPieBackground = buildPieChartBackground(
    valueBucketLegendData.filter((segment) => segment.value > 0)
  );
  const valueBucketPieSegments = buildPieChartSegments(
    valueBucketLegendData.filter((segment) => segment.value > 0)
  );
  const supplyStatusChartData = supplyStatusOrder.map((statusLabel) => {
    const matchingRows = inventoryRowsWithShipmentStatus.filter(
      (row) => row.supplyWorkflowStatus === statusLabel
    );
    const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

    return {
      label: statusLabel,
      value: rawItems,
      color: supplyStatusColors[statusLabel],
    };
  });
  const totalSupplyStatusItems = supplyStatusChartData.reduce(
    (total, segment) => total + segment.value,
    0
  );
  const supplyStatusLegendData = supplyStatusChartData.map((segment) => ({
    ...segment,
    total: totalSupplyStatusItems,
    percentage: percentOfTotal(segment.value, totalSupplyStatusItems),
  }));
  const supplyStatusPieBackground = buildPieChartBackground(
    supplyStatusLegendData.filter((segment) => segment.value > 0)
  );
  const supplyStatusPieSegments = buildPieChartSegments(
    supplyStatusLegendData.filter((segment) => segment.value > 0)
  );
  const activePalletRows = activePalletSummary?.rows || [];
  const activePalletTotalSupplies = activePalletRows.reduce(
    (total, row) => total + (row.quantity || 0),
    0
  );
  const activePalletTotalBoxes = activePalletSummary?.totalBoxes || 0;
  const activePalletTotalValue = activePalletRows.reduce(
    (total, row) => total + (row.valuation || 0),
    0
  );
  const activePalletExpiredSupplies = activePalletRows
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft <= 0)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const activePalletExpiringSoonSupplies = activePalletRows
    .filter(
      (row) =>
        row.expirationDaysLeft !== null &&
        row.expirationDaysLeft > 0 &&
        row.expirationDaysLeft <= 90
    )
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const palletExpirationLegendData = buildFacetCounts(activePalletRows, "expirationFilter", [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ])
    .map((bucket) => {
      const matchingRows = activePalletRows.filter((row) => row.expirationFilter === bucket.value);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: expirationBucketColors[bucket.value] || "#8a93a8",
      };
    })
    .filter((segment) => segment.value > 0);
  const palletDurationLegendData = durationBucketOrder
    .map((bucketLabel) => {
      const matchingRows = activePalletRows.filter((row) => row.durationFilter === bucketLabel);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucketLabel,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: durationBucketColors[bucketLabel] || "#8a93a8",
      };
    })
    .filter((segment) => segment.value > 0);
  const palletCategoryLegendData = buildFacetCounts(activePalletRows, "category")
    .map((bucket, index) => {
      const matchingRows = activePalletRows.filter((row) => row.category === bucket.value);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: colorForCategory(bucket.value),
      };
    })
    .filter((segment) => segment.value > 0);
  const palletValueLegendData = valueBucketOrder
    .map((bucketLabel) => {
      const matchingRows = activePalletRows.filter(
        (row) => valueBucketForUnitPrice(row.unitPrice) === bucketLabel
      );
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucketLabel,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: valueBucketColors[bucketLabel],
      };
    })
    .filter((segment) => segment.value > 0);
  const palletBoxLegendData = buildFacetCounts(activePalletRows, "boxType")
    .map((bucket, index) => {
      const matchingRows = activePalletRows.filter((row) => row.boxType === bucket.value);
      const uniqueBoxes = new Set(
        matchingRows.map((row) => `${row.boxType}|${row.boxNumber}`)
      );
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: bucket.value,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        boxCount: uniqueBoxes.size,
        color: colorForBoxType(index),
      };
    })
    .filter((segment) => segment.value > 0);
  const palletSupplyStatusLegendData = supplyStatusOrder
    .map((statusLabel) => {
      const matchingRows = activePalletRows.filter((row) => row.supplyWorkflowStatus === statusLabel);
      const rawItems = matchingRows.reduce((total, row) => total + (row.quantity || 0), 0);

      return {
        label: statusLabel,
        value: rawItems,
        total: activePalletTotalSupplies,
        percentage: percentOfTotal(rawItems, activePalletTotalSupplies),
        color: supplyStatusColors[statusLabel],
      };
    })
    .filter((segment) => segment.value > 0);
  const palletDetailCharts = [
    {
      title: "Expiration Summary",
      ariaLabel: "Pallet expiration breakdown",
      segments: palletExpirationLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Category Summary",
      ariaLabel: "Pallet category breakdown",
      segments: palletCategoryLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Value Summary",
      ariaLabel: "Pallet value bucket breakdown",
      segments: palletValueLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
      ],
    },
    {
      title: "Box Category",
      ariaLabel: "Pallet box category breakdown",
      segments: palletBoxLegendData,
      tooltipFormatter: (segment) => [
        segment.label,
        `${formatNumber(segment.value)} supplies`,
        `${segment.percentage}% of pallet supplies`,
        `${formatNumber(segment.boxCount)} boxes`,
      ],
    },
  ];
  const uniqueCategories = new Set(
    inventoryRowsWithStatus.map((row) => row.category).filter(Boolean)
  ).size;
  const expiredInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft <= 0)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const expiringSoonInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.expirationDaysLeft !== null && row.expirationDaysLeft > 0 && row.expirationDaysLeft <= 90)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const slowMovingInventoryUnits = inventoryRowsWithStatus
    .filter((row) => row.daysInWarehouse > 180)
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const assignedSupplyUnits = inventoryRowsWithShipmentStatus
    .filter((row) => row.supplyWorkflowStatus === "Pulled" || row.supplyWorkflowStatus === "Consolidated")
    .reduce((total, row) => total + (row.quantity || 0), 0);
  const averageBoxesPerPallet =
    (kpis?.pallet_count ?? 0) > 0 ? (kpis.box_count ?? 0) / kpis.pallet_count : 0;
  const totalShippedUnits = pastShipments.reduce(
    (total, shipment) =>
      total +
      shipment.items.reduce(
        (shipmentTotal, item) => shipmentTotal + normalizeRequestedQuantity(item),
        0
      ),
    0
  );
  const totalShippedValuation = pastShipments.reduce(
    (total, shipment) =>
      total + shipment.items.reduce((shipmentTotal, item) => shipmentTotal + requestedShipmentItemValue(item), 0),
    0
  );
  const uniqueShipmentRecipients = new Set(
    shipments.map((shipment) => shipment.recipientName).filter(Boolean)
  ).size;
  const recurringShipmentCount = shipments.reduce((total, shipment, _, allShipments) => {
    if (!shipment.recipientName) {
      return total;
    }

    const normalizedRecipientName = shipment.recipientName.trim().toLowerCase();
    const matchingRecipientCount = allShipments.filter(
      (candidate) => candidate.recipientName?.trim().toLowerCase() === normalizedRecipientName
    ).length;

    return total + (matchingRecipientCount > 1 ? 1 : 0);
  }, 0);
  const averageShipmentValuation = average(
    pastShipments.map((shipment) =>
      shipment.items.reduce((shipmentTotal, item) => shipmentTotal + requestedShipmentItemValue(item), 0)
    )
  );
  const averageUnitsPerShippedShipment = average(
    pastShipments.map((shipment) =>
      shipment.items.reduce(
        (shipmentTotal, item) => shipmentTotal + normalizeRequestedQuantity(item),
        0
      )
    )
  );
  const localShipments = shipments.filter(
    (shipment) => normalizeShipmentType(shipment.shipmentType) === "Local"
  );
  const internationalShipments = shipments.filter(
    (shipment) => normalizeShipmentType(shipment.shipmentType) === "International"
  );
  const shipmentTimingMetrics = [
    {
      scope: "Local",
      label: "Avg Days From Creation to Shipment",
      value: averageShipmentDays(localShipments, "createdAt", "shippedAt"),
    },
    {
      scope: "Local",
      label: "Avg Time to Start Consolidation",
      value: averageShipmentDays(localShipments, "createdAt", "consolidationStartedAt"),
    },
    {
      scope: "Local",
      label: "Avg Consolidation Time",
      value: averageShipmentDays(localShipments, "consolidationStartedAt", "consolidationCompletedAt"),
    },
    {
      scope: "Local",
      label: "Avg Waiting Time to Ship",
      value: averageShipmentDays(localShipments, "consolidationCompletedAt", "shippedAt"),
    },
    {
      scope: "Local",
      label: "Avg Delivery Time",
      value: averageShipmentDays(localShipments, "shippedAt", "deliveryDate"),
    },
    {
      scope: "International",
      label: "Avg Days From Creation to Shipment",
      value: averageShipmentDays(internationalShipments, "createdAt", "shippedAt"),
    },
    {
      scope: "International",
      label: "Avg Time to Start Consolidation",
      value: averageShipmentDays(internationalShipments, "createdAt", "consolidationStartedAt"),
    },
    {
      scope: "International",
      label: "Avg Consolidation Time",
      value: averageShipmentDays(internationalShipments, "consolidationStartedAt", "consolidationCompletedAt"),
    },
    {
      scope: "International",
      label: "Avg Waiting Time to Ship",
      value: averageShipmentDays(internationalShipments, "consolidationCompletedAt", "shippedAt"),
    },
    {
      scope: "International",
      label: "Avg Delivery Time",
      value: averageShipmentDays(internationalShipments, "shippedAt", "deliveryDate"),
    },
  ];
  // Past shipments from the Master Shipment Database, by type, plus the ones
  // tracked in this app (counted when created within the chosen years).
  const shipmentsByType = shipmentTypeOptions.map((type) => {
    const past = donationHistory?.types?.find((entry) => entry.type === type);
    const appCount = shipments.filter(
      (shipment) =>
        normalizeShipmentType(shipment.shipmentType) === type &&
        inHistoryYearRange(Number(String(shipment.createdAt || todayIsoDate()).slice(0, 4)))
    ).length;
    return {
      type,
      count: appCount + (past?.shipments ?? 0),
      valuation: past?.valuation ?? 0,
      pounds: past?.pounds ?? 0,
    };
  });
  const shipmentStatusCounts = [
    {
      label: "Planning",
      count: shipments.filter(
        (shipment) => !shipment.isCompleted && getShipmentStatus(shipment) === "Planning"
      ).length,
    },
    {
      label: "Consolidating",
      count: shipments.filter(
        (shipment) => !shipment.isCompleted && getShipmentStatus(shipment) === "Consolidating"
      ).length,
    },
    {
      label: "Consolidation Complete",
      count: shipments.filter(
        (shipment) =>
          !shipment.isCompleted && getShipmentStatus(shipment) === "Consolidation Complete"
      ).length,
    },
    {
      label: "Shipped",
      count: shipments.filter(
        (shipment) =>
          shipment.isCompleted &&
          normalizePastShipmentStatus(
            shipment.pastShipmentStatus,
            shipment.deliveryDate,
            shipment.pastShipmentStatusOverride ||
              (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
          ) === "Shipped"
      ).length,
    },
    {
      label: "Delivered",
      count: shipments.filter(
        (shipment) =>
          shipment.isCompleted &&
          normalizePastShipmentStatus(
            shipment.pastShipmentStatus,
            shipment.deliveryDate,
            shipment.pastShipmentStatusOverride ||
              (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
          ) === "Delivered"
      ).length,
    },
  ];
  const nearExpiryShipmentUnits = pastShipments.reduce(
    (total, shipment) =>
      total +
      shipment.items
        .filter(
          (item) => {
            const daysUntilExpirationAtShipment = daysBetweenDates(
              item.expirationDate,
              shipment.shippedAt
            );

            return (
              daysUntilExpirationAtShipment !== null &&
              daysUntilExpirationAtShipment <= 90
            );
          }
        )
        .reduce(
          (shipmentTotal, item) => shipmentTotal + normalizeRequestedQuantity(item),
          0
        ),
    0
  );

  // Shipment Mix sits beside the chapter breakdown in the donation section.
  // Each bar carries its own count, value and poundage, so no separate cards.
  const maxTypeCount = Math.max(...shipmentsByType.map((entry) => entry.count), 1);
  const shipmentMix = (
    <div className="shipment-mix">
      <div className="donation-chart-header">
        <h3>Shipments by destination type</h3>
      </div>
      <div className="shipment-mix-body type-bars">
        {shipmentsByType.map((entry) => (
          <div className="type-bar-column" key={entry.type}>
            <div className="type-bar-track">
              <div
                className={entry.count / maxTypeCount < 0.25 ? "type-bar is-short" : "type-bar"}
                style={{ height: `${Math.max((entry.count / maxTypeCount) * 100, 4)}%` }}
              >
                <span className="type-bar-count">{formatNumber(entry.count)}</span>
              </div>
            </div>
            <div className="type-bar-label">
              <strong>{entry.type}</strong>
              <span>{formatNumber(entry.count)} shipments</span>
              {donationHistory?.types?.length ? (
                <span title={`${formatWholeCurrency(entry.valuation)} · ${formatNumber(Math.round(entry.pounds))} lbs`}>
                  {formatCompactNumber(entry.valuation, "$")} · {formatCompactNumber(entry.pounds)} lbs
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {donationHistory?.types?.length ? (
        <p className="shipment-type-note">
          Includes past shipments from the Master Shipment Database. National shipments count as
          International.
        </p>
      ) : null}
    </div>
  );

  const lastRefreshedLabel = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const totalUnitsOnHand = inventoryRowsWithStatus.reduce(
    (total, row) => total + (row.quantity || 0),
    0
  );

  return (
    <main className="page-shell">
      {/* A drawing sheet names itself in a ruled title block. This one carries
          the live counts, so the header does a job instead of just branding. */}
      <header className="top-bar">
        <div className="title-block">
          <div className="title-block-cell">
            <h1>
              <em>Blueprints for Pangaea</em>
              Operations Dashboard
            </h1>
          </div>
          <div className="title-block-cell">
            <p className="title-block-label">Units on hand</p>
            <p className="title-block-value">
              {loading || error ? "—" : formatNumber(totalUnitsOnHand)}
            </p>
          </div>
          <div className="title-block-cell">
            <p className="title-block-label">Sheet pulled</p>
            <p className="title-block-value">{lastRefreshedLabel}</p>
          </div>
        </div>
        <div className="title-block-logo">
          <img
            className="dashboard-logo"
            src="/blueprints-logo.png"
            alt="Blueprints for Pangaea"
          />
        </div>
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

      {loading ? (
        <section className="panel skeleton-panel" aria-busy="true" aria-label="Loading dashboard data">
          <div className="skeleton skeleton-title" />
          <div className="skeleton-row">
            <div className="skeleton skeleton-tile" />
            <div className="skeleton skeleton-tile" />
            <div className="skeleton skeleton-tile" />
          </div>
          <div className="skeleton skeleton-chart" />
        </section>
      ) : null}
      {error ? <div className="panel error-panel">{error}</div> : null}

      {!loading && !error && activeTab === "inventory" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Every supply as a line item</h2>
            </div>
            <div className="inventory-actions">
              <button
                type="button"
                className="secondary-button inventory-filter-button"
                onClick={() => setIsInventoryFiltersOpen(true)}
                aria-expanded={isInventoryFiltersOpen}
                aria-controls="inventory-filters"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filters
              </button>
              {hasActiveInventoryFilters ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={clearInventoryFilters}
                >
                  Clear all
                </button>
              ) : null}
              <button
                ref={inventoryShipmentButtonRef}
                type="button"
                className="primary-button"
                disabled={selectedInventoryItems.length === 0}
                onClick={() => openShipmentModal(selectedInventoryItems)}
              >
                Add Selected To Shipment
                {selectedInventoryItems.length > 0
                  ? ` (${formatNumber(selectedInventoryItems.length)})`
                  : ""}
              </button>
              <span className="pill">{formatNumber(filteredInventoryRows.length)} entries</span>
            </div>
          </div>

          {showFloatingInventoryAction ? (
            <div className="floating-inventory-actions">
              <button
                type="button"
                className="secondary-button inventory-filter-button"
                onClick={() => setIsInventoryFiltersOpen(true)}
                aria-expanded={isInventoryFiltersOpen}
                aria-controls="inventory-filters"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Filters
              </button>
              {hasActiveInventoryFilters ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={clearInventoryFilters}
                >
                  Clear all
                </button>
              ) : null}
              <button
                type="button"
                className="primary-button"
                disabled={selectedInventoryItems.length === 0}
                onClick={() => openShipmentModal(selectedInventoryItems)}
              >
                Add Selected To Shipment
                {selectedInventoryItems.length > 0
                  ? ` (${formatNumber(selectedInventoryItems.length)})`
                  : ""}
              </button>
            </div>
          ) : null}

          <div className="inventory-layout">
            {isInventoryFiltersOpen ? (
              <>
                <div
                  className="filter-drawer-backdrop"
                  role="presentation"
                  onClick={() => setIsInventoryFiltersOpen(false)}
                />
                <aside
                  id="inventory-filters"
                  className="filters-sidebar filter-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="inventory-filters-title"
                >
              <div className="filters-header">
                <h3 id="inventory-filters-title">Filter Inventory</h3>
                <div className="filters-header-actions">
                  <button
                    type="button"
                    className="clear-filters"
                    onClick={clearInventoryFilters}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    className="filter-drawer-close"
                    onClick={() => setIsInventoryFiltersOpen(false)}
                    aria-label="Close inventory filters"
                  >
                    ×
                  </button>
                </div>
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

              <div className="availability-filter-group">
                <div className="availability-toggle filter-availability-toggle">
                  <span>Show Available Items</span>
                  <button
                    type="button"
                    className={showAvailableItems ? "toggle-switch on" : "toggle-switch"}
                    onClick={() => {
                      setShowAvailableItems((current) => !current);
                      setShowNonAvailableItems(false);
                    }}
                    aria-label="Show available inventory items only"
                    aria-pressed={showAvailableItems}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
                <div className="availability-toggle filter-availability-toggle">
                  <span>Show Non-Available Items</span>
                  <button
                    type="button"
                    className={showNonAvailableItems ? "toggle-switch on" : "toggle-switch"}
                    onClick={() => {
                      setShowNonAvailableItems((current) => !current);
                      setShowAvailableItems(false);
                    }}
                    aria-label="Show non-available inventory items only"
                    aria-pressed={showNonAvailableItems}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
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
                <h4>Workflow Status</h4>
                {workflowStatusOptions.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedWorkflowStatuses.includes(option.value)}
                      onChange={() =>
                        toggleFilter(
                          setSelectedWorkflowStatuses,
                          selectedWorkflowStatuses,
                          option.value
                        )
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
              </>
            ) : null}

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
                          disabled={selectableFilteredInventoryRows.length === 0}
                        />
                      </th>
                      <th><span className="id-column-label">ID</span></th>
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
                        className={[
                          row.needsReview ? "inventory-row-review" : "",
                          row.isPartiallyRequested ? "inventory-row-partial" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined}
                      >
                        <td>
                          {row.inventoryStatus === "Available" ? (
                            <input
                              type="checkbox"
                              aria-label={`Select supply ${row.supplyId}`}
                              checked={selectedInventoryIds.includes(row.id)}
                              onChange={() => toggleInventorySelection(row)}
                            />
                          ) : (
                            <span
                              className="inventory-selection-unavailable"
                              role="img"
                              aria-label={`${row.inventoryStatus} supply cannot be selected`}
                              title={`${row.inventoryStatus} supplies cannot be selected again`}
                            >
                              ×
                            </span>
                          )}
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
                              row.inventoryStatus === "Available"
                                ? "status-pill inventory"
                                : `status-pill ${row.inventoryStatus.toLowerCase()}`
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
              <h2>Current operating snapshot</h2>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsAllInventoryKpisOpen(true)}
            >
              View all 10 KPIs
            </button>
          </div>

          <div className="metrics-grid metrics-grid-primary">
            <MetricCard label="Total Units On Hand" value={formatNumber(kpis.total_raw_items)} />
            <MetricCard label="Expired Units" value={formatNumber(expiredInventoryUnits)} />
            <MetricCard label="Expiring In 90 Days" value={formatNumber(expiringSoonInventoryUnits)} />
            <MetricCard label="Pallet Count" value={formatNumber(kpis.pallet_count)} />
            <MetricCard label="Box Count" value={formatNumber(kpis.box_count)} />
            <MetricCard label="Avg Boxes per Pallet" value={averageBoxesPerPallet.toFixed(1)} />
          </div>

          <div className="kpi-analytics-grid">
            <div className="summary-card kpi-card-third kpi-pie-card">
              <div className="panel-header">
                <div>
                  <h3>By expiration window</h3>
                </div>
              </div>

              {expirationChartData.length > 0 ? (
                <PieChartCard
                  ariaLabel="Pie chart of inventory by expiration bucket"
                  totalItems={totalExpirationChartItems}
                  segments={expirationPieSegments}
                  legendSegments={expirationChartData}
                  background={expirationPieBackground}
                  activeLabel={activeExpirationPieLabel}
                  renderLegendDetail={pieLegendDetail}
                  onHover={setActiveExpirationPieLabel}
                  onSegmentClick={(segment) =>
                    openChartSegmentInInventory("expiration", segment.label)
                  }
                />
              ) : (
                <p>No expiration data is available yet.</p>
              )}
            </div>

            <div className="summary-card kpi-card-third kpi-pie-card">
              <div className="panel-header">
                <div>
                  <h3>By supply category</h3>
                </div>
                <span className="pill">{formatNumber(uniqueCategories)} categories</span>
              </div>

              {categoryChartLegendData.length > 0 ? (
                <PieChartCard
                  ariaLabel="Pie chart of inventory by supply category"
                  totalItems={totalCategoryChartItems}
                  segments={categoryPieSegments}
                  legendSegments={categoryChartLegendData}
                  background={categoryPieBackground}
                  activeLabel={activeCategoryPieLabel}
                  renderLegendDetail={pieLegendDetail}
                  onHover={setActiveCategoryPieLabel}
                  cardClassName="category-pie-card"
                  onSegmentClick={(segment) =>
                    openChartSegmentInInventory("category", segment.label)
                  }
                />
              ) : (
                <p>No category data is available yet.</p>
              )}
            </div>

            <div className="summary-card kpi-card-third kpi-pie-card">
              <div className="panel-header">
                <div>
                  <h3>By unit price</h3>
                </div>
              </div>

              {valueBucketLegendData.length > 0 ? (
                <PieChartCard
                  ariaLabel="Pie chart of inventory by price per unit bucket"
                  totalItems={totalValueBucketItems}
                  segments={valueBucketPieSegments}
                  legendSegments={valueBucketLegendData}
                  background={valueBucketPieBackground}
                  activeLabel={activeValuePieLabel}
                  renderLegendDetail={pieLegendDetail}
                  onHover={setActiveValuePieLabel}
                  cardClassName="kpi-compact-card"
                  onSegmentClick={(segment) =>
                    openChartSegmentInInventory("value", segment.label)
                  }
                />
              ) : (
                <p>No value data is available yet.</p>
              )}
            </div>

          </div>

          <div className="summary-card pallet-map-card">
            <div className="panel-header">
              <div>
                <h3>Warehouse pallet layout</h3>
              </div>
              <div className="pallet-map-actions">
                {!isEditingPalletMap ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={startEditingPalletConformation}
                  >
                    Edit Pallet Conformation
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={savePalletConformation}
                  >
                    Save Conformation
                  </button>
                )}
              </div>
            </div>

            <div className="pallet-map-scroll">
              <div
                ref={palletMapRef}
                className={isEditingPalletMap ? "pallet-map-canvas is-editing" : "pallet-map-canvas"}
                style={isEditingPalletMap ? undefined : { minHeight: palletMapFitHeight }}
              >
                {palletSummaries.map((summary) => {
                  const position = visiblePalletLayout[summary.id] || { x: 0, y: 0 };

                  return (
                    <div
                      key={summary.id}
                      className={isEditingPalletMap ? "pallet-card is-editing" : "pallet-card"}
                      style={{ left: position.x, top: position.y }}
                      tabIndex={0}
                      onPointerDown={(event) => handlePalletPointerDown(event, summary.id)}
                    >
                      <div className="pallet-card-header">
                        <strong>{summary.label}</strong>
                        <button
                          type="button"
                          className="info-icon-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActivePalletId(summary.id);
                          }}
                          aria-label={`Open pallet details for ${summary.label}`}
                        >
                          ⓘ
                        </button>
                      </div>
                      <div className="pallet-card-copy">
                        <span>{formatNumber(summary.totalSupplies)} supplies</span>
                        <span>{formatNumber(summary.totalBoxes)} boxes</span>
                      </div>
                      {/* Box categories show on hover or focus, so the map stays readable. */}
                      <div className="pallet-card-box-list">
                        {summary.boxBreakdown.filter((entry) => entry.count > 0).map((entry) => (
                          <span key={`${summary.id}-${entry.boxType}`} className="pallet-box-pill">
                            {entry.boxType}: {formatNumber(entry.count)}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                activeShipmentSubtab === "non-inventory"
                  ? "shipment-subtab active"
                  : "shipment-subtab"
              }
              onClick={() => setActiveShipmentSubtab("non-inventory")}
            >
              Non-Inventory Shipments
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
              <div className="create-shipment-bar create-shipment-bar-filtered">
                <input
                  className="search-input"
                  type="text"
                  value={currentShipmentSearchTerm}
                  onChange={(event) => setCurrentShipmentSearchTerm(event.target.value)}
                  placeholder="Search shipments, supply IDs, supplies, or manufacturers"
                />
                <select
                  className="shipment-filter-select"
                  value={currentShipmentTypeFilter}
                  onChange={(event) => setCurrentShipmentTypeFilter(event.target.value)}
                >
                  <option value="All">Shipment type: All</option>
                  <option value="Local">Shipment type: Local</option>
                  <option value="International">Shipment type: International</option>
                </select>
                <select
                  className="shipment-filter-select"
                  value={currentShipmentStatusFilter}
                  onChange={(event) => setCurrentShipmentStatusFilter(event.target.value)}
                >
                  <option value="All">Status: All</option>
                  <option value="Planning">Status: Planning</option>
                  <option value="Consolidating">Status: Consolidating</option>
                  <option value="Consolidation Complete">Status: Consolidated</option>
                </select>
                <button
                  type="button"
                  className="primary-button"
                  onClick={openCreateShipmentModal}
                >
                  Create New Shipment
                </button>
              </div>
              {filteredCurrentShipments.length === 0 ? (
                <p>
                  {currentShipments.length === 0
                    ? "No current shipments yet."
                    : "No shipments matched those filters."}
                </p>
              ) : (
                <div className="shipment-list">
                  {filteredCurrentShipments.map((shipment) => (
                    <article
                      key={shipment.id}
                      className={`shipment-card shipment-card-${getShipmentStatus(shipment).toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {(() => {
                        const shipmentValuation = shipment.items.reduce(
                          (total, item) => total + requestedShipmentItemValue(item),
                          0
                        );

                        return (
                      <div className="shipment-card-header">
                        <div className="shipment-card-left-column">
                          <div className="shipment-card-title">
                            <div className="shipment-inline-edit">
                              {editingShipmentField?.shipmentId === shipment.id &&
                              editingShipmentField?.field === "recipientName" ? (
                                <input
                                  className="shipment-inline-input"
                                  type="text"
                                  value={editingShipmentValue}
                                  placeholder="Enter recipient name"
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
                              <span className="shipment-inline-label">Blueprints PoC:</span>
                              {editingShipmentField?.shipmentId === shipment.id &&
                              editingShipmentField?.field === "pointOfContact" ? (
                                <select
                                  className="shipment-inline-select"
                                  value={editingShipmentValue}
                                  title="Select a Blueprints point of contact"
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setEditingShipmentValue(nextValue);
                                    saveShipmentFieldValue(
                                      shipment.id,
                                      "pointOfContact",
                                      nextValue
                                    );
                                    setEditingShipmentField(null);
                                    setEditingShipmentValue("");
                                  }}
                                  onBlur={cancelEditingShipmentField}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      cancelEditingShipmentField();
                                    }
                                  }}
                                  autoFocus
                                >
                                  <option value="" disabled>Select roster member</option>
                                  {blueprintsRosterNames.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
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
                            <div className="shipment-inline-edit shipment-card-subline shipment-inline-field">
                              <span className="shipment-inline-label">Recipient PoC:</span>
                              {editingShipmentField?.shipmentId === shipment.id &&
                              editingShipmentField?.field === "recipientPointOfContact" ? (
                                <input
                                  className="shipment-inline-input"
                                  type="text"
                                  value={editingShipmentValue}
                                  onChange={(event) => setEditingShipmentValue(event.target.value)}
                                  onBlur={saveEditingShipmentField}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") saveEditingShipmentField();
                                    if (event.key === "Escape") cancelEditingShipmentField();
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span>{shipment.recipientPointOfContact || "TBD"}</span>
                              )}
                              <button
                                type="button"
                                className="edit-icon-button"
                                aria-label={`Edit recipient point of contact for ${shipment.recipientName}`}
                                onClick={() =>
                                  startEditingShipmentField(
                                    shipment.id,
                                    "recipientPointOfContact",
                                    shipment.recipientPointOfContact || "TBD"
                                  )
                                }
                              >
                                &#9998;
                              </button>
                            </div>
                          </div>
                          <div className="shipment-bottom-left-stack">
                            <div className="shipment-history-column shipment-history-column-current">
                              <span className="shipment-status-label">Shipment History</span>
                              <div className="shipment-history-list">
                                <span>Created: {formatCurrentShipmentHistoryDate(shipment.createdAt)}</span>
                                <span>
                                  Consolidating start:{" "}
                                  {formatCurrentShipmentHistoryDate(shipment.consolidationStartedAt)}
                                </span>
                                <span>
                                  Consolidation complete:{" "}
                                  {formatCurrentShipmentHistoryDate(shipment.consolidationCompletedAt)}
                                </span>
                              </div>
                            </div>
                            <div className="shipment-notes-panel shipment-notes-panel-current">
                              <span className="shipment-status-label">Shipment Notes</span>
                              {editingShipmentNotesId === shipment.id ? (
                                <textarea
                                  className="shipment-notes-editor"
                                  value={editingShipmentNotesValue}
                                  onChange={(event) => setEditingShipmentNotesValue(event.target.value)}
                                  onBlur={saveEditingShipmentNotes}
                                  onKeyDown={(event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                      saveEditingShipmentNotes();
                                    }
                                    if (event.key === "Escape") {
                                      cancelEditingShipmentNotes();
                                    }
                                  }}
                                  placeholder="Add shipment notes"
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="shipment-notes-copy"
                                  onClick={() =>
                                    startEditingShipmentNotes(shipment.id, shipment.shipmentNotes)
                                  }
                                >
                                  {shipment.shipmentNotes || "No shipment notes recorded."}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="shipment-status-panel">
                          <div className="shipment-status-column">
                            <span className="shipment-status-label">Shipment Status</span>
                            <span className="shipment-status-badge">
                              {getShipmentStatus(shipment)}
                            </span>
                          </div>
                        </div>
                        <div className="shipment-chart-cluster">
                          <ShipmentDistributionChart shipmentItems={shipment.items} />
                          <ShipmentExpirationChart shipmentItems={shipment.items} />
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
                            className="secondary-button"
                            onClick={() => openBulkConsolidationModal(shipment)}
                            disabled={shipment.items.length === 0}
                          >
                            {shipment.items.length > 0 &&
                            shipment.items.every((item) => item.isConsolidated)
                              ? "Unconsolidate All"
                              : "Consolidate All"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openReturnAllToInventoryModal(shipment)}
                            disabled={shipment.items.length === 0}
                          >
                            Back All to Inventory
                          </button>
                          <button
                            type="button"
                            className="secondary-button danger-button"
                            onClick={() => openDeleteShipmentModal(shipment)}
                          >
                            Delete Shipment
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
                            Mark as Shipped
                          </button>
                        </div>
                      </div>
                        );
                      })()}

                      {shipment.items.length === 0 ? (
                        <p className="shipment-empty">No items have been added yet.</p>
                      ) : expandedShipmentIds.includes(shipment.id) ? (
                        <div className="shipment-line-items">
                          <div className="shipment-line-items-filter-bar">
                            <span className="shipment-filter-label">Filter Supplies</span>
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
                                    <span>{formatCurrency(requestedShipmentItemValue(shipmentItem))} total</span>
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
                                    onClick={() =>
                                      shipmentItem.isConsolidated
                                        ? unconsolidateShipmentItem(shipment.id, shipmentItem.id)
                                        : openConsolidationModal(shipment.id, shipmentItem)
                                    }
                                  >
                                    {shipmentItem.isConsolidated ? "Unconsolidate" : "Consolidate"}
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

          {activeShipmentSubtab === "non-inventory" ? (
            <div className="shipment-subpanel">
              <section className="non-inventory-shipments-section">
                <div className="non-inventory-shipments-heading">
                  <div>
                    <h3>Document shipments outside inventory</h3>
                  </div>
                  <div className="non-inventory-heading-actions">
                    <span>{nonInventoryShipments.length} documented</span>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={openNonInventoryShipmentModal}
                    >
                      Create Non-Inventory Shipment
                    </button>
                  </div>
                </div>
                <div className="create-shipment-bar non-inventory-filter-bar">
                  <input
                    className="search-input"
                    type="text"
                    value={nonInventoryShipmentSearch}
                    onChange={(event) => setNonInventoryShipmentSearch(event.target.value)}
                    placeholder="Search shipment or clinic names"
                  />
                  <select
                    className="shipment-filter-select"
                    value={nonInventoryShipmentLocation}
                    onChange={(event) => setNonInventoryShipmentLocation(event.target.value)}
                  >
                    <option value="All">Location: All</option>
                    <option value="Local">Location: Local</option>
                    <option value="International">Location: International</option>
                  </select>
                  <select
                    className="shipment-filter-select"
                    value={nonInventoryValuationSort}
                    onChange={(event) => setNonInventoryValuationSort(event.target.value)}
                  >
                    <option value="high-low">Valuation: Highest to Lowest</option>
                    <option value="low-high">Valuation: Lowest to Highest</option>
                  </select>
                </div>
                {filteredNonInventoryShipments.length === 0 ? (
                  <p className="non-inventory-empty">
                    {nonInventoryShipments.length === 0
                      ? "No non-inventory shipments have been documented yet."
                      : "No non-inventory shipments matched those filters."}
                  </p>
                ) : (
                  <div className="non-inventory-shipment-list">
                    {filteredNonInventoryShipments.map((shipment) => (
                      <article className="non-inventory-shipment-card" key={shipment.id}>
                        <div className="non-inventory-shipment-card-title">
                          <h3>{shipment.clinicName}</h3>
                        </div>
                        <dl className="non-inventory-shipment-details">
                          <div>
                            <dt>Blueprints Point of Contact</dt>
                            <dd>{shipment.pointOfContact}</dd>
                          </div>
                          <div>
                            <dt>Shipment Type</dt>
                            <dd>{shipment.shipmentType}</dd>
                          </div>
                          <div>
                            <dt>Date Shipped</dt>
                            <dd>{shipment.shippedAt || "Not recorded"}</dd>
                          </div>
                          <div>
                            <dt>Valuation</dt>
                            <dd>{formatCurrency(shipment.valuation)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {activeShipmentSubtab === "past" ? (
            <div className="shipment-subpanel">
              <p className="section-label">Past Shipments</p>
              <div className="create-shipment-bar create-shipment-bar-past">
                <input
                  className="search-input"
                  type="text"
                  value={pastShipmentSearchTerm}
                  onChange={(event) => setPastShipmentSearchTerm(event.target.value)}
                  placeholder="Search shipments, supply IDs, supplies, or manufacturers"
                />
                <select
                  className="shipment-filter-select"
                  value={pastShipmentTypeFilter}
                  onChange={(event) => setPastShipmentTypeFilter(event.target.value)}
                >
                  <option value="All">Shipment type: All</option>
                  <option value="Local">Shipment type: Local</option>
                  <option value="International">Shipment type: International</option>
                </select>
                <select
                  className="shipment-filter-select"
                  value={pastShipmentStatusDateFilter}
                  onChange={(event) => setPastShipmentStatusDateFilter(event.target.value)}
                >
                  <option value="creation">Status date: Creation</option>
                  <option value="consolidation">Status date: Consolidation</option>
                  <option value="ship">Status date: Ship</option>
                  <option value="delivery">Status date: Delivery</option>
                </select>
              </div>
              {filteredPastShipments.length === 0 ? (
                <p>
                  {normalizedPastShipmentSearch || pastShipmentTypeFilter !== "All"
                    ? "No past shipments matched those filters."
                    : "No past shipments yet."}
                </p>
              ) : (
                <div className="shipment-list">
                  {filteredPastShipments.map((shipment) => {
                    const shipmentValuation = shipment.items.reduce(
                      (total, item) => total + requestedShipmentItemValue(item),
                      0
                    );
                    const pastShipmentStatus = normalizePastShipmentStatus(
                      shipment.pastShipmentStatus,
                      shipment.deliveryDate,
                      shipment.pastShipmentStatusOverride ||
                        (shipment.pastShipmentStatusManuallySet ? "Shipped" : "")
                    );

                    return (
                      <article
                        key={shipment.id}
                        id={`past-shipment-${shipment.id}`}
                        className={
                          pastShipmentStatus === "Delivered"
                            ? "shipment-card shipment-card-complete shipment-card-delivered"
                            : "shipment-card shipment-card-past"
                        }
                      >
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
                          <div className="shipment-history-column">
                            <span className="shipment-status-label">Shipment Details</span>
                            <div className="shipment-history-list">
                              <span>{shipment.shipmentType || "Not set"}</span>
                              <span>Blueprints PoC: {shipment.pointOfContact || "Not set"}</span>
                              <span>Recipient PoC: {shipment.recipientPointOfContact || "TBD"}</span>
                              <span>{shipment.transportType || "Method not set"}</span>
                            </div>
                          </div>
                          <div className="shipment-history-column">
                            <span className="shipment-status-label">Shipment History</span>
                            <div className="shipment-history-list">
                              <span>Created: {formatShipmentHistoryDate(shipment.createdAt)}</span>
                              <span>
                                Consolidating start:{" "}
                                {formatShipmentHistoryDate(shipment.consolidationStartedAt)}
                              </span>
                              <span>
                                Consolidated: {formatShipmentHistoryDate(shipment.consolidationCompletedAt)}
                              </span>
                              <span>Shipped: {formatShipmentHistoryDate(shipment.shippedAt)}</span>
                              <span>Delivered: {formatShipmentHistoryDate(shipment.deliveryDate)}</span>
                            </div>
                          </div>
                          <div className="shipment-chart-cluster">
                            <ShipmentDistributionChart shipmentItems={shipment.items} />
                            <ShipmentExpirationChart shipmentItems={shipment.items} />
                          </div>
                          <div className="shipment-status-panel shipment-status-panel-past">
                            <div className="shipment-status-column">
                              <span className="shipment-status-label">Shipment Status</span>
                              <select
                                className={
                                  pastShipmentStatus === "Delivered"
                                    ? "shipment-status-select shipment-status-select-delivered"
                                    : "shipment-status-select"
                                }
                                value={pastShipmentStatus}
                                title="Change shipment status between Shipped and Delivered"
                                onChange={(event) =>
                                  updatePastShipmentStatus(shipment.id, event.target.value)
                                }
                              >
                                <option
                                  value="Shipped"
                                  title="Mark this shipment as shipped but not yet delivered"
                                >
                                  Shipped
                                </option>
                                <option
                                  value="Delivered"
                                  title="Mark this shipment as delivered to the recipient"
                                >
                                  Delivered
                                </option>
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="shipment-notes-panel">
                          <span className="shipment-status-label">Shipment Notes</span>
                          {editingShipmentNotesId === shipment.id ? (
                            <textarea
                              className="shipment-notes-editor"
                              value={editingShipmentNotesValue}
                              onChange={(event) => setEditingShipmentNotesValue(event.target.value)}
                              onBlur={saveEditingShipmentNotes}
                              onKeyDown={(event) => {
                                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                  saveEditingShipmentNotes();
                                }
                                if (event.key === "Escape") {
                                  cancelEditingShipmentNotes();
                                }
                              }}
                              placeholder="Add shipment notes"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              className="shipment-notes-copy"
                              onClick={() =>
                                startEditingShipmentNotes(shipment.id, shipment.shipmentNotes)
                              }
                            >
                              {shipment.shipmentNotes || "No shipment notes recorded."}
                            </button>
                          )}
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
                        </div>
                        {shipment.items.length > 0 && expandedShipmentIds.includes(shipment.id) ? (
                          <div className="shipment-line-items">
                            {shipment.items.map((shipmentItem) => {
                              const requestedQuantity = normalizeRequestedQuantity(shipmentItem);
                              const isRequestingAllUnits =
                                requestedQuantity === (Number(shipmentItem.quantity) || 0);

                              return (
                                <div key={shipmentItem.id} className="shipment-line-item">
                                  <div className="shipment-line-top shipment-line-top-past">
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
                                      <span className="shipment-request-summary">
                                        {isRequestingAllUnits
                                          ? `Requested all ${formatNumber(shipmentItem.quantity)} units`
                                          : `Requested ${formatNumber(requestedQuantity)} of ${formatNumber(shipmentItem.quantity)} units`}
                                      </span>
                                    </div>
                                    <div className="shipment-line-pricing">
                                      <span>{formatCurrency(shipmentItem.unitPrice)} per unit</span>
                                      <span>{formatCurrency(requestedShipmentItemValue(shipmentItem))} total</span>
                                    </div>
                                    <div className="shipment-expiration">
                                      <span>{shipmentItem.expirationDate}</span>
                                      <span
                                        className={`expiration-pill ${shipmentItem.expirationStatus.tone}`}
                                      >
                                        {shipmentItem.expirationStatus.label}
                                      </span>
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
                    );
                  })}
                </div>
              )}
              <PastShipmentArchive
                searchTerm={pastShipmentSearchTerm}
                typeFilter={pastShipmentTypeFilter}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && activeTab === "shipment-kpis" ? (
        <>
        <DonationHistory
          history={donationHistory}
          allYears={fullDonationHistory?.years}
          error={donationHistoryError}
          sideContent={shipmentMix}
          yearFilter={historyYearFilter}
          rangeLabel={historyRangeLabel}
          mapContent={
            <ShipmentMap
              shipments={yearFilteredHistoryShipments}
              error={historyShipmentsError}
              rangeLabel={historyRangeLabel}
            />
          }
        />
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Shipment activity and outbound flow</h2>
            </div>
          </div>

          <div className="shipment-subtabs shipment-kpi-subtabs" role="tablist" aria-label="Shipment KPI views">
            <button
              type="button"
              className={
                activeShipmentKpiSubtab === "overview"
                  ? "shipment-subtab active"
                  : "shipment-subtab"
              }
              onClick={() => setActiveShipmentKpiSubtab("overview")}
            >
              Shipment Activity
            </button>
            <button
              type="button"
              className={
                activeShipmentKpiSubtab === "flow-time"
                  ? "shipment-subtab active"
                  : "shipment-subtab"
              }
              onClick={() => setActiveShipmentKpiSubtab("flow-time")}
            >
              Shipment Flow Time
            </button>
          </div>

          {activeShipmentKpiSubtab === "overview" ? (
            <>
          <div className="shipment-kpi-overview-split">
            <div className="shipment-kpi-summary-pane">
              <div className="shipment-kpi-pane-header">
                <div>
                  <h3>Current shipment activity</h3>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsAllShipmentKpisOpen(true)}
                >
                  View all 10 KPIs
                </button>
              </div>
              <div className="metrics-grid metrics-grid-single">
                <MetricCard
                  label="Current Shipments"
                  value={formatNumber(currentShipments.length)}
                />
              </div>
            </div>

            <div className="shipment-kpi-current-table-panel">
              <div className="shipment-kpi-pane-header">
                <div>
                  <h3>Active shipment overview</h3>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setActiveTab("shipments");
                    setActiveShipmentSubtab("current");
                  }}
                >
                  View shipments
                </button>
              </div>

              <div className="shipment-kpi-table-wrap">
                <table className="shipment-kpi-table">
                  <thead>
                    <tr>
                      <th>Shipment</th>
                      <th>Status</th>
                      <th>Supplies</th>
                      <th>Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentShipments.map((shipment) => {
                      const shipmentStatus = getShipmentStatus(shipment);
                      const shipmentStatusClass = shipmentStatus.toLowerCase().replace(/\s+/g, "-");

                      return (
                      <tr key={shipment.id}>
                        <td>{shipment.recipientName}</td>
                        <td>
                          <span className={`shipment-kpi-status shipment-kpi-status-${shipmentStatusClass}`}>
                            {shipmentStatus}
                          </span>
                        </td>
                        <td>{formatNumber(shipment.items.length)}</td>
                        <td>
                          {formatCurrency(
                            shipment.items.reduce(
                              (total, item) => total + requestedShipmentItemValue(item),
                              0
                            )
                          )}
                        </td>
                      </tr>
                      );
                    })}
                    {currentShipments.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="empty-state-cell">
                          <div className="empty-state">
                            <p>No active shipments right now.</p>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setActiveTab("shipments");
                                setActiveShipmentSubtab("current");
                              }}
                            >
                              Start one on the Shipments tab
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="shipment-kpi-grid shipment-kpi-grid-single">
            <div className="shipment-kpi-column">
              <div className="summary-card shipment-status-card">
                <div className="panel-header">
                  <div>
                    <h3>Shipments by current status</h3>
                  </div>
                </div>

                <div className="expiry-chart-card">
                  <ShipmentBarChart data={shipmentStatusCounts.map((entry) => ({
                    label: entry.label,
                    count: entry.count,
                  }))} />
                </div>
              </div>
            </div>
          </div>
            </>
          ) : null}

          {activeShipmentKpiSubtab === "flow-time" ? (
            <div className="shipment-flow-time-view">
          <div className="panel-header shipment-flow-metrics-header">
            <div>
              <h3>Shipment flow time metrics</h3>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsAllShipmentFlowMetricsOpen(true)}
            >
              View all 10 KPIs
            </button>
          </div>

          <div className="metrics-grid shipment-timing-grid shipment-timing-summary-grid">
            {shipmentTimingMetrics
              .filter((metric) => metric.label !== "Avg Consolidation Time")
              .map((metric) => (
              <MetricCard
                key={`${metric.scope}-${metric.label}`}
                label={`${metric.scope} ${metric.label}`}
                value={formatAverageDays(metric.value)}
                valueClassName="metric-value-compact"
              />
              ))}
          </div>

          <div className="kpi-note-card">
            <p className="section-label">Next Metrics To Add</p>
            <p>
              Fill rate and request-to-shipment time will need request dates and requested quantities
              added to the shipment data model.
            </p>
          </div>
            </div>
          ) : null}
        </section>
        </>
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
                    <select
                      value={newShipmentPointOfContact}
                      onChange={(event) => setNewShipmentPointOfContact(event.target.value)}
                    >
                      <option value="" disabled>Select active roster member</option>
                      {blueprintsRosterNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="modal-field">
                    <span className="modal-field-header">
                      <span>Recipient Point of Contact</span>
                      <button
                        type="button"
                        className="modal-shortcut-button"
                        onClick={() => setNewShipmentRecipientPointOfContact("TBD")}
                      >
                        TBD
                      </button>
                    </span>
                    <input
                      type="text"
                      value={newShipmentRecipientPointOfContact}
                      onChange={(event) => setNewShipmentRecipientPointOfContact(event.target.value)}
                      placeholder="Enter recipient point of contact or select TBD"
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
                <select
                  value={newShipmentPointOfContact}
                  onChange={(event) => setNewShipmentPointOfContact(event.target.value)}
                >
                  <option value="" disabled>Select active roster member</option>
                  {blueprintsRosterNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span className="modal-field-header">
                  <span>Recipient Point of Contact</span>
                  <button
                    type="button"
                    className="modal-shortcut-button"
                    onClick={() => setNewShipmentRecipientPointOfContact("TBD")}
                  >
                    TBD
                  </button>
                </span>
                <input
                  type="text"
                  value={newShipmentRecipientPointOfContact}
                  onChange={(event) => setNewShipmentRecipientPointOfContact(event.target.value)}
                  placeholder="Enter recipient point of contact or select TBD"
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

      {isNonInventoryShipmentModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeNonInventoryShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="non-inventory-shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="non-inventory-shipment-modal-title">Document shipment details</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeNonInventoryShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <label className="modal-field">
                <span>Recipient / Clinic Name</span>
                <input
                  type="text"
                  value={nonInventoryClinicName}
                  onChange={(event) => setNonInventoryClinicName(event.target.value)}
                  placeholder="Enter recipient or clinic name"
                />
              </label>
              <label className="modal-field">
                <span>Blueprints for Pangaea Point of Contact</span>
                <select
                  value={nonInventoryPointOfContact}
                  onChange={(event) => setNonInventoryPointOfContact(event.target.value)}
                >
                  <option value="" disabled>Select active roster member</option>
                  {blueprintsRosterNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Shipment Type</span>
                <select
                  value={nonInventoryShipmentType}
                  onChange={(event) => setNonInventoryShipmentType(event.target.value)}
                >
                  {shipmentTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Date Shipped</span>
                <input
                  type="date"
                  max={todayIsoDate()}
                  value={nonInventoryShipmentDate}
                  onChange={(event) => setNonInventoryShipmentDate(event.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>Valuation of Items</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nonInventoryValuation}
                  onChange={(event) => setNonInventoryValuation(event.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeNonInventoryShipmentModal}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={createNonInventoryShipment}
                disabled={
                  !nonInventoryClinicName.trim() ||
                  !blueprintsRosterNames.includes(nonInventoryPointOfContact) ||
                  !nonInventoryShipmentDate.trim() ||
                  nonInventoryShipmentDate > todayIsoDate() ||
                  nonInventoryValuation === "" ||
                  Number(nonInventoryValuation) < 0
                }
              >
                Document Shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activePalletSummary ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActivePalletId(null)}>
          <div
            className="shipment-modal shipment-modal-large pallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pallet-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="pallet-modal-title">{activePalletSummary.label}</h2>
                <div className="pallet-modal-metrics">
                  <div className="pallet-modal-metric-card">
                    <span>Total Supplies</span>
                    <strong>{formatNumber(activePalletTotalSupplies)}</strong>
                  </div>
                  <div className="pallet-modal-metric-card">
                    <span>Total Boxes</span>
                    <strong>{formatNumber(activePalletTotalBoxes)}</strong>
                  </div>
                  <div className="pallet-modal-metric-card">
                    <span>Total Value</span>
                    <strong>{formatCurrency(activePalletTotalValue)}</strong>
                  </div>
                </div>
                <p className="pallet-modal-supplies">
                  {formatNumber(activePalletExpiredSupplies)} supplies expired,{" "}
                  {formatNumber(activePalletExpiringSoonSupplies)} expiring in 90 days
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setActivePalletId(null)}>
                x
              </button>
            </div>

            <div className="pallet-mini-chart-grid">
              {palletDetailCharts.map((chart) => (
                <CompactPalletPieChart
                  key={`${activePalletSummary.id}-${chart.title}`}
                  title={chart.title}
                  ariaLabel={chart.ariaLabel}
                  segments={chart.segments}
                  tooltipFormatter={chart.tooltipFormatter}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isAllInventoryKpisOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAllInventoryKpisOpen(false)}
        >
          <div
            className="shipment-modal inventory-kpi-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-kpi-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="inventory-kpi-modal-title">Full operating snapshot</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAllInventoryKpisOpen(false)}
                aria-label="Close full KPI view"
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <div className="metrics-grid inventory-kpi-modal-grid">
                <MetricCard label="Total Units On Hand" value={formatNumber(kpis.total_raw_items)} />
                <MetricCard label="Expired Units" value={formatNumber(expiredInventoryUnits)} />
                <MetricCard
                  label="Expiring In 90 Days"
                  value={formatNumber(expiringSoonInventoryUnits)}
                />
                <MetricCard
                  label="Slow-Moving Units"
                  value={formatNumber(slowMovingInventoryUnits)}
                />
                <MetricCard label="Assigned Units" value={formatNumber(assignedSupplyUnits)} />
                <MetricCard label="Pallet Count" value={formatNumber(kpis.pallet_count)} />
                <MetricCard label="Box Count" value={formatNumber(kpis.box_count)} />
                <MetricCard
                  label="Avg Boxes per Pallet"
                  value={averageBoxesPerPallet.toFixed(1)}
                />
                <MetricCard
                  label="Average Duration (Days)"
                  value={(kpis.avg_duration_per_item ?? 0).toFixed(1)}
                />
                <MetricCard
                  label="Estimated Inventory Value"
                  value={formatCurrency(kpis.total_value)}
                  valueClassName="metric-value-compact"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAllShipmentKpisOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAllShipmentKpisOpen(false)}
        >
          <div
            className="shipment-modal inventory-kpi-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-kpi-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="shipment-kpi-modal-title">Full shipment activity snapshot</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAllShipmentKpisOpen(false)}
                aria-label="Close full shipment KPI view"
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <div className="metrics-grid inventory-kpi-modal-grid">
                <MetricCard label="Total Shipments" value={formatNumber(shipments.length)} />
                <MetricCard
                  label="Current Shipments"
                  value={formatNumber(currentShipments.length)}
                />
                <MetricCard
                  label="Completed Shipments"
                  value={formatNumber(pastShipments.length)}
                />
                <MetricCard
                  label="Recurring Shipments"
                  value={formatNumber(recurringShipmentCount)}
                />
                <MetricCard
                  label="Unique Recipients"
                  value={formatNumber(uniqueShipmentRecipients)}
                />
                <MetricCard
                  label="Total Units Shipped"
                  value={formatNumber(totalShippedUnits)}
                />
                <MetricCard
                  label="Avg Units Per Shipment"
                  value={formatNumber(Math.round(averageUnitsPerShippedShipment))}
                />
                <MetricCard
                  label="Total Valuation Shipped"
                  value={formatCurrency(totalShippedValuation)}
                />
                <MetricCard
                  label="Avg Valuation Per Shipment"
                  value={formatCurrency(averageShipmentValuation)}
                />
                <MetricCard
                  label="Near-Expiry Units In Shipments"
                  value={formatNumber(nearExpiryShipmentUnits)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAllShipmentFlowMetricsOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setIsAllShipmentFlowMetricsOpen(false)}
        >
          <div
            className="shipment-modal inventory-kpi-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-flow-metrics-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="shipment-flow-metrics-modal-title">All 10 flow-time metrics</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAllShipmentFlowMetricsOpen(false)}
                aria-label="Close full shipment flow-time metric view"
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <div className="metrics-grid inventory-kpi-modal-grid">
                {shipmentTimingMetrics.map((metric) => (
                  <MetricCard
                    key={`${metric.scope}-${metric.label}`}
                    label={`${metric.scope} ${metric.label}`}
                    value={formatAverageDays(metric.value)}
                    valueClassName="metric-value-compact"
                  />
                ))}
              </div>
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

      {deletingShipment ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeleteShipmentModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-shipment-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="delete-shipment-modal-title">Delete this shipment?</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDeleteShipmentModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Delete <strong>{deletingShipment.shipmentName}</strong>?
              </p>
              <p className="shipment-empty">
                {deletingShipment.itemCount > 0
                  ? `Its ${formatNumber(deletingShipment.itemCount)} supplies go back to available in Total Inventory. This can't be undone.`
                  : "The shipment has no supplies. This can't be undone."}
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeDeleteShipmentModal}>
                Cancel
              </button>
              <button type="button" className="primary-button danger-button" onClick={deleteShipment}>
                Delete Shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {returningShipmentItems ? (
        <div className="modal-backdrop" role="presentation" onClick={closeReturnAllToInventoryModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-all-to-inventory-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="return-all-to-inventory-modal-title">
                  Send all supplies back to inventory?
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={closeReturnAllToInventoryModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Return all <strong>{formatNumber(returningShipmentItems.itemCount)} supplies</strong>{" "}
                ({formatNumber(returningShipmentItems.unitCount)} requested units) from{" "}
                <strong>{returningShipmentItems.shipmentName}</strong> to Total Inventory?
              </p>
              <p className="shipment-empty">
                This will empty the shipment and change every included supply from pulled back to
                available in Total Inventory.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeReturnAllToInventoryModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={returnAllShipmentItemsToInventory}
              >
                Confirm Return All
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
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consolidation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="consolidation-modal-title">
                  Have exactly {formatNumber(consolidationRequestedQuantity)} units been
                  consolidated?
                </h2>
                <p className="modal-helper-note">({consolidationRequestNote})</p>
              </div>
              <button type="button" className="modal-close" onClick={closeConsolidationModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Click confirm once the requested units for{" "}
                <strong>{consolidatingShipmentItem.shipmentItem.exactSupplyName}</strong> have
                been consolidated.
              </p>
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
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkConsolidationCheck ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeBulkConsolidationModal}
        >
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-consolidation-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <p className="section-label">
                  {bulkConsolidationCheck.shouldConsolidate
                    ? "Consolidation Check"
                    : "Unconsolidation Check"}
                </p>
                <h2 id="bulk-consolidation-modal-title">
                  {bulkConsolidationCheck.shouldConsolidate
                    ? `Have all ${formatNumber(
                        bulkConsolidationCheck.requestedUnitCount
                      )} requested units been consolidated?`
                    : `Unconsolidate all ${formatNumber(
                        bulkConsolidationCheck.itemCount
                      )} supplies?`}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={closeBulkConsolidationModal}
              >
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                {bulkConsolidationCheck.shouldConsolidate
                  ? `Confirm that ${formatNumber(
                      bulkConsolidationCheck.itemCount
                    )} supplies for ${bulkConsolidationCheck.shipmentName} have been consolidated.`
                  : `This will return every supply in ${bulkConsolidationCheck.shipmentName} to an unconsolidated state.`}
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeBulkConsolidationModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={confirmBulkConsolidation}
              >
                {bulkConsolidationCheck.shouldConsolidate
                  ? "Confirm Consolidation"
                  : "Confirm Unconsolidation"}
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

      {deliveringShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDeliveredModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivered-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="delivered-modal-title">Confirm delivered status</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeDeliveredModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                {deliveryDate > todayIsoDate()
                  ? `This shipment is scheduled for delivery on ${deliveryDate}. That date has not been reached yet.`
                  : `Confirm that ${deliveringShipment?.recipientName || "this shipment"} has been delivered.`}
              </p>
              {deliveryDate > todayIsoDate() ? (
                <p className="shipment-empty">
                  Continuing will mark the shipment Delivered early and override the automatic delivery-date status.
                </p>
              ) : null}
              <label className="modal-field">
                <span>Delivery Date</span>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </label>
              <label className="modal-field">
                <span>Notes</span>
                <textarea
                  value={shipmentNotes}
                  onChange={(event) => setShipmentNotes(event.target.value)}
                  placeholder="Add or update delivery notes"
                />
              </label>
            </div>

            <div className="shipment-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeDeliveredModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveDeliveredStatus}
                disabled={!deliveryDate.trim()}
              >
                Confirm Delivered
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revertingDeliveredShipmentId ? (
        <div className="modal-backdrop" role="presentation" onClick={closeRevertToShippedModal}>
          <div
            className="shipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="revert-to-shipped-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="shipment-modal-header">
              <div>
                <h2 id="revert-to-shipped-modal-title">Move this delivery back to Shipped?</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeRevertToShippedModal}>
                x
              </button>
            </div>

            <div className="shipment-modal-body">
              <p className="modal-item-name">
                Confirm that <strong>{revertingDeliveredShipment?.recipientName || "this shipment"}</strong>{" "}
                was marked Delivered in error.
              </p>
              <p className="shipment-empty">
                Its scheduled delivery date will be retained, but the status will remain Shipped until someone changes it again.
              </p>
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeRevertToShippedModal}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={confirmRevertToShipped}>
                Confirm Shipped Status
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
