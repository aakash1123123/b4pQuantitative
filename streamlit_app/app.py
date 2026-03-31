import pandas as pd
import requests
import streamlit as st


API_BASE = "http://localhost:8000"

st.set_page_config(page_title="Medical Supply Dashboard", layout="wide")


@st.cache_data(ttl=60)
def load_kpis():
    response = requests.get(f"{API_BASE}/kpis", timeout=20)
    response.raise_for_status()
    return response.json()


@st.cache_data(ttl=60)
def load_items():
    response = requests.get(f"{API_BASE}/items", timeout=20)
    response.raise_for_status()
    return response.json()


def format_expiration(value):
    if not value:
        return "No expiration listed"
    return value


def build_inventory_table(items):
    inventory_df = pd.DataFrame(items)
    inventory_df["valuation"] = 0.0

    table = inventory_df.rename(
        columns={
            "gen_name": "General Supply",
            "name": "Exact Supply Name",
            "manufacturer": "Manufacturer",
            "expiration_date": "Expiration Date",
            "valuation": "Valuation",
        }
    )[
        [
            "General Supply",
            "Exact Supply Name",
            "Manufacturer",
            "Expiration Date",
            "Valuation",
        ]
    ]

    table["General Supply"] = table["General Supply"].fillna("").replace("", "Unspecified")
    table["Manufacturer"] = table["Manufacturer"].fillna("").replace("", "Unknown")
    table["Expiration Date"] = table["Expiration Date"].apply(format_expiration)
    table["Valuation"] = table["Valuation"].map(lambda value: f"${value:,.2f}")
    return table


try:
    kpis = load_kpis()
    items = load_items()
except requests.RequestException as exc:
    st.error(f"Unable to load dashboard data from the backend: {exc}")
    st.stop()


inventory_table = build_inventory_table(items)

st.title("Medical Supply Redistribution Dashboard")
st.caption("Inventory synced from the connected Google Sheet.")

tab_inventory, tab_kpis, tab_shipments, tab_shipment_kpis = st.tabs(
    [
        "Total Inventory",
        "Inventory KPIs",
        "Shipments",
        "Shipment KPIs",
    ]
)

with tab_inventory:
    st.subheader("Full Inventory")
    st.dataframe(inventory_table, use_container_width=True, hide_index=True)

with tab_kpis:
    st.subheader("Inventory Summary")

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Entries", f"{kpis['total_entries']:,}")
    col2.metric("Total Raw Items", f"{kpis['total_raw_items']:,}")
    col3.metric("Pallet Count", f"{kpis['pallet_count']:,}")
    col4.metric("Box Count", f"{kpis['box_count']:,}")

    col5, col6 = st.columns(2)
    col5.metric("Average Duration (Days)", f"{kpis['avg_duration_per_item']:.1f}")
    col6.metric("Total Value Placeholder", f"${kpis['total_value']:,.2f}")

    st.subheader("Expiration Summary")
    expiry_df = pd.DataFrame(
        [{"Range": range_name, **values} for range_name, values in kpis["expiry_ranges"].items()]
    )

    if expiry_df.empty:
        st.info("No expiration summary is available yet.")
    else:
        expiry_df = expiry_df.rename(
            columns={
                "entries": "Entries",
                "raw_items": "Raw Items",
                "value": "Value",
            }
        )
        st.dataframe(expiry_df, use_container_width=True, hide_index=True)

with tab_shipments:
    st.subheader("Shipments")
    st.info("Shipment views are intentionally empty for now.")

with tab_shipment_kpis:
    st.subheader("Shipment KPIs")
    st.info("Shipment KPI views are intentionally empty for now.")
