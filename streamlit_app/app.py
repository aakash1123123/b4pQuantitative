import streamlit as st
import requests

API_BASE = "http://localhost:8000"  # adjust if backend is hosted elsewhere

st.title("Inventory Dashboard")

st.sidebar.header("Add Item")
name = st.sidebar.text_input("Name")
quantity = st.sidebar.number_input("Quantity", min_value=0, step=1)
expiration = st.sidebar.date_input("Expiration Date")

if st.sidebar.button("Create Item"):
    payload = {
        "id": 0,  # backend can assign real ID
        "name": name,
        "quantity": quantity,
        "expiration_date": expiration.isoformat(),
    }
    resp = requests.post(f"{API_BASE}/items", json=payload)
    if resp.ok:
        st.success("Item created")
    else:
        st.error(f"Failed: {resp.text}")


st.header("Current Inventory")
try:
    resp = requests.get(f"{API_BASE}/items")
    items = resp.json()
    st.write(items)
except requests.exceptions.RequestException as e:
    st.error(f"Could not reach backend: {e}")

st.header("KPIs")
try:
    kp = requests.get(f"{API_BASE}/kpis").json()
    st.json(kp)
except Exception:
    st.write("Unable to load KPIs")
