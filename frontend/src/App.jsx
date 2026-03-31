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
    name: "Shipment A",
    items: [],
  },
  {
    id: "shipment-2",
    name: "Shipment B",
    items: [],
  },
];

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
    generalSupply: item.gen_name || "Unspecified",
    exactSupplyName: item.name || "Unnamed supply",
    manufacturer: item.manufacturer || "Unknown",
    category: item.category || "Uncategorized",
    expirationDate: formatExpiration(item.expiration_date),
    expirationRaw: item.expiration_date || null,
    expirationDaysLeft: daysUntil(item.expiration_date || null),
    expirationStatus: expirationStatus(daysUntil(item.expiration_date || null)),
    warehouseDate: item.warehouse_date || null,
    expirationFilter: expirationBucket(item.expiration_date || null),
    durationFilter: durationBucket(item.warehouse_date || null),
    valuation: item.id === 1 ? 100 : 0,
  }));
}

function inventoryStatusForItem(itemId, shipments) {
  const isPulled = shipments.some((shipment) =>
    shipment.items.some((shipmentItem) => shipmentItem.id === itemId)
  );

  return isPulled ? "Pulled" : "Inventory";
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

function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
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
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [shipments, setShipments] = useState(defaultShipments);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [pendingShipmentItems, setPendingShipmentItems] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("shipment-1");
  const [newShipmentName, setNewShipmentName] = useState("");
  const [selectedInventoryIds, setSelectedInventoryIds] = useState([]);
  const [valuationLimit, setValuationLimit] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);
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

        if (!cancelled) {
          setItems(itemsData);
          setKpis(kpisData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Something went wrong while loading the dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const storedShipments = window.localStorage.getItem(SHIPMENT_STORAGE_KEY);
      if (storedShipments) {
        setShipments(JSON.parse(storedShipments));
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
  const valuationValues = inventoryRowsWithStatus.map((row) => row.valuation);
  const minValuation = valuationValues.length > 0 ? Math.min(...valuationValues) : 0;
  const maxValuation = valuationValues.length > 0 ? Math.max(...valuationValues) : 0;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const expirationOptions = buildFacetCounts(inventoryRowsWithStatus, "expirationFilter", [
    "Already expired",
    "0-90 days",
    "90-180 days",
    "180-365 days",
    "365+ days",
    "No expiration date",
  ]);
  const durationOptions = buildFacetCounts(inventoryRowsWithStatus, "durationFilter", [
    "0-30 days",
    "31-90 days",
    "91-180 days",
    "181-365 days",
    "365+ days",
    "Unknown duration",
  ]);
  const categoryOptions = buildFacetCounts(inventoryRowsWithStatus, "category");
  const statusOptions = buildFacetCounts(inventoryRowsWithStatus, "inventoryStatus", [
    "Inventory",
    "Pulled",
    "Consolidated",
    "Shipped",
    "Delivered",
  ]);

  useEffect(() => {
    setValuationLimit(maxValuation);
  }, [maxValuation]);

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
    setSelectedShipmentId(shipments[0]?.id || "__new__");
    setNewShipmentName("");
    setIsShipmentModalOpen(true);
  }

  function closeShipmentModal() {
    setIsShipmentModalOpen(false);
    setPendingShipmentItems([]);
    setNewShipmentName("");
  }

  function addItemToShipment() {
    if (pendingShipmentItems.length === 0) {
      return;
    }

    setShipments((currentShipments) => {
      let workingShipments = currentShipments;
      let targetShipmentId = selectedShipmentId;

      if (selectedShipmentId === "__new__") {
        const shipmentName = newShipmentName.trim();
        if (!shipmentName) {
          return currentShipments;
        }

        targetShipmentId = `shipment-${Date.now()}`;
        workingShipments = [
          ...currentShipments,
          { id: targetShipmentId, name: shipmentName, items: [] },
        ];
      }

      return workingShipments.map((shipment) => {
        if (shipment.id !== targetShipmentId) {
          return shipment;
        }

        const existingIds = new Set(shipment.items.map((shipmentItem) => shipmentItem.id));
        const newItems = pendingShipmentItems.filter((item) => !existingIds.has(item.id));

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

  const filteredInventoryRows = inventoryRowsWithStatus.filter((row) => {
    const matchesSearch =
      !normalizedSearch ||
      [row.generalSupply, row.exactSupplyName, row.manufacturer].some((value) =>
        value.toLowerCase().includes(normalizedSearch)
      );

    return (
      matchesSearch &&
      row.valuation >= minValuation &&
      row.valuation <= valuationLimit &&
      matchesSelectedFilter(selectedStatuses, row.inventoryStatus) &&
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
  const expiryRanges = Object.entries(kpis?.expiry_ranges || {});

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
                    setSelectedStatuses([]);
                    setValuationLimit(maxValuation);
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
                <h4>Valuation</h4>
                <div className="valuation-summary">
                  <span>{formatCurrency(minValuation)}</span>
                  <span>{formatCurrency(valuationLimit)}</span>
                </div>
                <div className="valuation-sliders">
                  <input
                    type="range"
                    min={minValuation}
                    max={maxValuation}
                    step="1"
                    value={valuationLimit}
                    onChange={(event) => setValuationLimit(Number(event.target.value))}
                  />
                </div>
              </div>

              <div className="filter-group">
                <h4>Inventory Status</h4>
                {statusOptions.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(option.value)}
                      onChange={() =>
                        toggleFilter(setSelectedStatuses, selectedStatuses, option.value)
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
                      <th>Valuation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventoryRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select supply ${row.supplyId}`}
                            checked={selectedInventoryIds.includes(row.id)}
                            onChange={() => toggleInventorySelection(row.id)}
                          />
                        </td>
                        <td>{row.supplyId}</td>
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
                        <td>{formatCurrency(row.valuation)}</td>
                      </tr>
                    ))}
                    {filteredInventoryRows.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="empty-state-cell">
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
            <MetricCard label="Total Entries" value={formatNumber(kpis.total_entries)} />
            <MetricCard label="Total Raw Items" value={formatNumber(kpis.total_raw_items)} />
            <MetricCard label="Pallet Count" value={formatNumber(kpis.pallet_count)} />
            <MetricCard label="Box Count" value={formatNumber(kpis.box_count)} />
            <MetricCard
              label="Average Duration (Days)"
              value={(kpis.avg_duration_per_item ?? 0).toFixed(1)}
            />
            <MetricCard
              label="Total Value Placeholder"
              value={formatCurrency(kpis.total_value)}
            />
          </div>

          <div className="summary-card">
            <div className="panel-header">
              <div>
                <p className="section-label">Expiration Summary</p>
                <h3>Inventory at a glance by expiration window</h3>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Range</th>
                    <th>Entries</th>
                    <th>Raw Items</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryRanges.map(([range, values]) => (
                    <tr key={range}>
                      <td>{range}</td>
                      <td>{formatNumber(values.entries)}</td>
                      <td>{formatNumber(values.raw_items)}</td>
                      <td>{formatCurrency(values.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && !error && activeTab === "shipments" ? (
        <section className="panel empty-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Shipments</p>
              <h2>Shipment views</h2>
            </div>
          </div>

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
              {shipments.length === 0 ? (
                <p>No current shipments yet.</p>
              ) : (
                <div className="shipment-list">
                  {shipments.map((shipment) => (
                    <article key={shipment.id} className="shipment-card">
                      <div className="shipment-card-header">
                        <div>
                          <h3>{shipment.name}</h3>
                          <p>{formatNumber(shipment.items.length)} assigned items</p>
                        </div>
                      </div>

                      {shipment.items.length === 0 ? (
                        <p className="shipment-empty">No items have been added yet.</p>
                      ) : (
                        <div className="shipment-line-items">
                          {shipment.items.map((shipmentItem) => (
                            <div key={shipmentItem.id} className="shipment-line-item">
                              <div>
                                <strong>#{shipmentItem.supplyId}</strong> {shipmentItem.exactSupplyName}
                              </div>
                              <div className="shipment-line-meta">
                                <span>{shipmentItem.generalSupply}</span>
                                <span>{shipmentItem.expirationDate}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeShipmentSubtab === "past" ? (
            <div className="shipment-subpanel">
              <p className="section-label">Past Shipments</p>
              <p>This view is ready for completed shipment history.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && activeTab === "shipment-kpis" ? (
        <section className="panel empty-panel">
          <p className="section-label">Shipment KPIs</p>
          <h2>Reserved for future shipment metrics</h2>
          <p>Nothing is shown here yet by design.</p>
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
                  {shipments.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.name}
                    </option>
                  ))}
                  <option value="__new__">Create new shipment</option>
                </select>
              </label>

              {selectedShipmentId === "__new__" ? (
                <label className="modal-field">
                  <span>New shipment name</span>
                  <input
                    type="text"
                    value={newShipmentName}
                    onChange={(event) => setNewShipmentName(event.target.value)}
                    placeholder="Enter shipment name"
                  />
                </label>
              ) : null}
            </div>

            <div className="shipment-modal-actions">
              <button type="button" className="secondary-button" onClick={closeShipmentModal}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={addItemToShipment}>
                Add to shipment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
