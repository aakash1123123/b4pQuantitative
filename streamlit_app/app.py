import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

API_BASE = "http://localhost:8000"

# Page config
st.set_page_config(page_title="Inventory Dashboard", layout="wide")

st.title("📦 Inventory KPI Dashboard")

# Sidebar for navigation and controls
st.sidebar.header("Navigation")
page = st.sidebar.radio("Select View", [
    "Overview",
    "Expiry Analysis",
    "Duration Analysis",
    "Category Breakdown",
    "Top Supplies",
    "Pallet Analytics",
    "Weekly Productivity"
])

st.sidebar.divider()
st.sidebar.header("Add Item")
with st.sidebar.form("add_item_form"):
    item_id = st.number_input("Item ID", min_value=1, step=1)
    name = st.text_input("Item Name")
    gen_name = st.text_input("Generic Name")
    category = st.text_input("Category")
    manufacturer = st.text_input("Manufacturer")
    quantity = st.number_input("Quantity", min_value=1, step=1)
    unit_value = st.number_input("Unit Value", min_value=0.0, step=0.01)
    total_value = st.number_input("Total Value", min_value=0.0, step=0.01)
    expiration = st.date_input("Expiration Date", value=None)
    warehouse_date = st.date_input("Warehouse Date")
    pallet_number = st.number_input("Pallet Number", min_value=1, step=1)
    category_box = st.text_input("Category Box")
    box_number = st.number_input("Box Number", min_value=1, step=1)

    if st.form_submit_button("Create Item"):
        payload = {
            "id": int(item_id),
            "name": name,
            "gen_name": gen_name,
            "category": category,
            "manufacturer": manufacturer,
            "quantity": int(quantity),
            "unit_value": float(unit_value),
            "total_value": float(total_value),
            "expiration_date": expiration.isoformat() if expiration else None,
            "warehouse_date": warehouse_date.isoformat(),
            "pallet_number": int(pallet_number),
            "category_box": category_box,
            "box_number": int(box_number)
        }
        try:
            resp = requests.post(f"{API_BASE}/items", json=payload)
            if resp.ok:
                st.sidebar.success("Item created!")
            else:
                st.sidebar.error(f"Failed: {resp.text}")
        except Exception as e:
            st.sidebar.error(f"Error: {e}")

# Load KPI data
@st.cache_data(ttl=60)
def load_kpis():
    try:
        resp = requests.get(f"{API_BASE}/kpis")
        return resp.json()
    except Exception as e:
        st.error(f"Could not reach backend: {e}")
        return None

kpis = load_kpis()

if kpis is None:
    st.error("Unable to load KPI data. Please ensure the backend is running.")
    st.stop()

# OVERVIEW PAGE
if page == "Overview":
    st.header("📊 Inventory Overview")

    # Top KPIs
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Entries", f"{kpis['total_entries']:,}")
    with col2:
        st.metric("Total Raw Items", f"{kpis['total_raw_items']:,}")
    with col3:
        st.metric("Total Value", f"${kpis['total_value']:,.2f}")
    with col4:
        st.metric("Avg Value/Item", f"${kpis['avg_value_per_item']:,.2f}")

    col5, col6, col7 = st.columns(3)
    with col5:
        st.metric("Avg Duration (days)", f"{kpis['avg_duration_per_item']:.1f}")
    with col6:
        st.metric("Pallet Count", f"{kpis['pallet_count']:,}")
    with col7:
        st.metric("Box Count", f"{kpis['box_count']:,}")

    # Expiry and Duration summary
    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Expiry Ranges Summary")
        expiry_df = pd.DataFrame([
            {"Range": k, **v}
            for k, v in kpis['expiry_ranges'].items()
        ])
        st.dataframe(expiry_df, use_container_width=True)

    with col2:
        st.subheader("Duration Ranges Summary")
        duration_df = pd.DataFrame([
            {"Range": k, **v}
            for k, v in kpis['duration_ranges'].items()
        ])
        st.dataframe(duration_df, use_container_width=True)

# EXPIRY ANALYSIS PAGE
elif page == "Expiry Analysis":
    st.header("📅 Expiry Analysis")

    # Overall expiry chart
    expiry_data = []
    for range_name, stats in kpis['expiry_ranges'].items():
        expiry_data.append({
            'Expiry Range': range_name,
            'Items': stats['entries'],
            'Quantity': stats['raw_items'],
            'Value': stats['value']
        })

    expiry_df = pd.DataFrame(expiry_data)

    col1, col2 = st.columns(2)

    with col1:
        fig = px.bar(expiry_df, x='Expiry Range', y='Items',
                     title='Items by Expiry Range',
                     color_discrete_sequence=['#636EFA'])
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        fig = px.pie(expiry_df, values='Quantity', names='Expiry Range',
                     title='Quantity Distribution by Expiry Range')
        st.plotly_chart(fig, use_container_width=True)

    # Category breakdown by expiry
    st.subheader("Category Breakdown by Expiry Range")

    expiry_category_data = []
    for expiry_range, data in kpis['expiry_ranges_category_breakdown'].items():
        for category, cat_data in data.get('categories', {}).items():
            expiry_category_data.append({
                'Expiry Range': expiry_range,
                'Category': category,
                'Items': cat_data['entries'],
                'Quantity': cat_data['raw_items'],
                'Value': cat_data['value'],
                'Percentage': cat_data['percentage']
            })

    if expiry_category_data:
        expiry_cat_df = pd.DataFrame(expiry_category_data)
        fig = px.bar(expiry_cat_df, x='Expiry Range', y='Quantity', color='Category',
                     title='Quantity Distribution by Category and Expiry Range',
                     barmode='stack')
        st.plotly_chart(fig, use_container_width=True)

        st.dataframe(expiry_cat_df, use_container_width=True)
    else:
        st.info("No category breakdown data available")

# DURATION ANALYSIS PAGE
elif page == "Duration Analysis":
    st.header("⏱️ Warehouse Duration Analysis")

    duration_data = []
    for range_name, stats in kpis['duration_ranges'].items():
        duration_data.append({
            'Duration Range': range_name,
            'Items': stats['entries'],
            'Quantity': stats['raw_items'],
            'Value': stats['value']
        })

    duration_df = pd.DataFrame(duration_data)

    col1, col2 = st.columns(2)

    with col1:
        fig = px.bar(duration_df, x='Duration Range', y='Items',
                     title='Items by Warehouse Duration',
                     color_discrete_sequence=['#00CC96'])
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        fig = px.pie(duration_df, values='Quantity', names='Duration Range',
                     title='Quantity Distribution by Duration Range')
        st.plotly_chart(fig, use_container_width=True)

    # Category breakdown by duration
    st.subheader("Category Breakdown by Duration Range")

    duration_category_data = []
    for duration_range, data in kpis['duration_ranges_category_breakdown'].items():
        for category, cat_data in data.get('categories', {}).items():
            duration_category_data.append({
                'Duration Range': duration_range,
                'Category': category,
                'Items': cat_data['entries'],
                'Quantity': cat_data['raw_items'],
                'Value': cat_data['value'],
                'Percentage': cat_data['percentage']
            })

    if duration_category_data:
        duration_cat_df = pd.DataFrame(duration_category_data)
        fig = px.bar(duration_cat_df, x='Duration Range', y='Quantity', color='Category',
                     title='Quantity Distribution by Category and Duration Range',
                     barmode='stack')
        st.plotly_chart(fig, use_container_width=True)

        st.dataframe(duration_cat_df, use_container_width=True)
    else:
        st.info("No category breakdown data available")

# CATEGORY BREAKDOWN PAGE
elif page == "Category Breakdown":
    st.header("🏷️ Category Breakdown")

    if kpis['category_kpis']:
        # Summary table
        category_summary = []
        for cat_name, cat_data in kpis['category_kpis'].items():
            category_summary.append({
                'Category': cat_name,
                'Total Entries': cat_data['total_entries'],
                'Total Items': cat_data['total_raw_items'],
                'Total Value': cat_data['total_value'],
                'Avg Value/Item': cat_data['avg_value_per_item'],
                'Avg Duration (days)': cat_data['avg_duration']
            })

        cat_summary_df = pd.DataFrame(category_summary)
        st.dataframe(cat_summary_df, use_container_width=True)

        # Value distribution by category
        col1, col2 = st.columns(2)

        with col1:
            fig = px.pie(cat_summary_df, values='Total Value', names='Category',
                         title='Value Distribution by Category')
            st.plotly_chart(fig, use_container_width=True)

        with col2:
            fig = px.bar(cat_summary_df, x='Category', y='Total Items',
                         title='Total Items by Category',
                         color_discrete_sequence=['#AB63FA'])
            st.plotly_chart(fig, use_container_width=True)

        # Detailed category view
        selected_category = st.selectbox("Select Category for Details",
                                         list(kpis['category_kpis'].keys()))

        if selected_category:
            cat_detail = kpis['category_kpis'][selected_category]

            st.subheader(f"{selected_category} - Detail View")

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Entries", cat_detail['total_entries'])
            with col2:
                st.metric("Total Items", cat_detail['total_raw_items'])
            with col3:
                st.metric("Total Value", f"${cat_detail['total_value']:,.2f}")
            with col4:
                st.metric("Avg Value/Item", f"${cat_detail['avg_value_per_item']:,.2f}")

            # Expiry ranges for category
            if cat_detail.get('expiry_ranges_table'):
                st.subheader("Expiry Distribution")
                expiry_data = pd.DataFrame([
                    {"Range": k, **v}
                    for k, v in cat_detail['expiry_ranges_table'].items()
                ])
                st.dataframe(expiry_data, use_container_width=True)

            # Duration ranges for category
            if cat_detail.get('duration_ranges_table'):
                st.subheader("Duration Distribution")
                duration_data = pd.DataFrame([
                    {"Range": k, **v}
                    for k, v in cat_detail['duration_ranges_table'].items()
                ])
                st.dataframe(duration_data, use_container_width=True)
    else:
        st.info("No category data available")

# TOP SUPPLIES PAGE
elif page == "Top Supplies":
    st.header("🏆 Top 20 Supplies")

    if kpis['top_supplies_table']:
        supplies_data = []
        for supply_name, supply_data in kpis['top_supplies_table'].items():
            supplies_data.append({
                'Supply Name': supply_name,
                'Total Entries': supply_data['total_entries'],
                'Total Items': supply_data['total_raw_items'],
                'Total Value': supply_data['total_value'],
                'Avg Value/Item': supply_data['avg_value_per_item'],
                'Categories': ', '.join(supply_data['category']),
                'Locations': supply_data['locations']
            })

        supplies_df = pd.DataFrame(supplies_data)

        # Charts
        col1, col2 = st.columns(2)

        with col1:
            top_10_by_qty = supplies_df.nlargest(10, 'Total Items')
            fig = px.bar(top_10_by_qty, x='Supply Name', y='Total Items',
                         title='Top 10 Supplies by Quantity',
                         color_discrete_sequence=['#FFA15A'])
            fig.update_layout(xaxis_tickangle=-45)
            st.plotly_chart(fig, use_container_width=True)

        with col2:
            top_10_by_value = supplies_df.nlargest(10, 'Total Value')
            fig = px.bar(top_10_by_value, x='Supply Name', y='Total Value',
                         title='Top 10 Supplies by Value',
                         color_discrete_sequence=['#FF6692'])
            fig.update_layout(xaxis_tickangle=-45)
            st.plotly_chart(fig, use_container_width=True)

        # Full table
        st.subheader("All Top 20 Supplies")
        st.dataframe(supplies_df, use_container_width=True, hide_index=True)
    else:
        st.info("No supply data available")

# PALLET ANALYTICS PAGE
elif page == "Pallet Analytics":
    st.header("📍 Pallet Analytics")

    if kpis['pallet_kpis']:
        # Summary metrics
        pallet_summary = []
        for pallet_num, pallet_data in kpis['pallet_kpis'].items():
            pallet_summary.append({
                'Pallet': f"#{pallet_num}",
                'Entries': pallet_data['total_entries'],
                'Total Items': pallet_data['total_raw_items'],
                'Total Value': pallet_data['total_value'],
                'Avg Price/Item': pallet_data['avg_price_per_raw_item']
            })

        pallet_df = pd.DataFrame(pallet_summary)

        # Charts
        col1, col2 = st.columns(2)

        with col1:
            fig = px.bar(pallet_df, x='Pallet', y='Total Items',
                         title='Items per Pallet',
                         color_discrete_sequence=['#00CC96'])
            st.plotly_chart(fig, use_container_width=True)

        with col2:
            fig = px.bar(pallet_df, x='Pallet', y='Total Value',
                         title='Value per Pallet',
                         color_discrete_sequence=['#636EFA'])
            st.plotly_chart(fig, use_container_width=True)

        st.dataframe(pallet_df, use_container_width=True)

        # Detailed pallet view
        selected_pallet = st.selectbox("Select Pallet for Details",
                                       [f"#{p}" for p in sorted(kpis['pallet_kpis'].keys())])

        if selected_pallet:
            pallet_num = int(selected_pallet.replace("#", ""))
            pallet_detail = kpis['pallet_kpis'][pallet_num]

            st.subheader(f"Pallet #{pallet_num} - Details")

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Entries", pallet_detail['total_entries'])
            with col2:
                st.metric("Total Items", pallet_detail['total_raw_items'])
            with col3:
                st.metric("Total Value", f"${pallet_detail['total_value']:,.2f}")
            with col4:
                st.metric("Avg Price/Item", f"${pallet_detail['avg_price_per_raw_item']:,.2f}")

            # Category distribution
            if pallet_detail.get('category_distribution'):
                st.subheader("Category Distribution")
                cat_dist = pd.DataFrame(list(pallet_detail['category_distribution'].items()),
                                       columns=['Category', 'Count'])
                fig = px.pie(cat_dist, values='Count', names='Category',
                            title='Category Distribution on Pallet')
                st.plotly_chart(fig, use_container_width=True)

            # Expiry ranges
            if pallet_detail.get('expiry_ranges_table'):
                st.subheader("Expiry Distribution")
                expiry_data = pd.DataFrame([
                    {"Range": k, **v}
                    for k, v in pallet_detail['expiry_ranges_table'].items()
                ])
                st.dataframe(expiry_data, use_container_width=True)

            # Top items on pallet
            if pallet_detail.get('top_20_items'):
                st.subheader("Top Items on Pallet")
                top_items = []
                for item_name, item_data in pallet_detail['top_20_items'].items():
                    top_items.append({
                        'Item': item_name,
                        'Entries': item_data['total_entries'],
                        'Quantity': item_data['total_raw_items'],
                        'Value': item_data['total_value'],
                        'Avg Value/Item': item_data['avg_value_per_item']
                    })
                top_items_df = pd.DataFrame(top_items)
                st.dataframe(top_items_df, use_container_width=True)
    else:
        st.info("No pallet data available")

# WEEKLY PRODUCTIVITY PAGE
elif page == "Weekly Productivity":
    st.header("📈 Weekly Productivity KPIs")

    if kpis['weekly_productivity_kpis']:
        # Timeline view
        weeks_data = []
        for week_key, week_data in kpis['weekly_productivity_kpis'].items():
            weeks_data.append({
                'Week': week_key,
                'Entries': week_data['total_entries'],
                'Total Items': week_data['total_raw_items'],
                'Total Value': week_data['total_value'],
                'Pallets Accessed': week_data['total_pallets_accessed'],
                'Category Boxes Added': week_data['total_category_boxes_added']
            })

        weeks_df = pd.DataFrame(weeks_data)

        # Charts
        col1, col2 = st.columns(2)

        with col1:
            fig = px.bar(weeks_df, x='Week', y='Total Items',
                         title='Items Added per Week',
                         color_discrete_sequence=['#00CC96'])
            fig.update_layout(xaxis_tickangle=-45)
            st.plotly_chart(fig, use_container_width=True)

        with col2:
            fig = px.bar(weeks_df, x='Week', y='Total Value',
                         title='Value Added per Week',
                         color_discrete_sequence=['#FF6692'])
            fig.update_layout(xaxis_tickangle=-45)
            st.plotly_chart(fig, use_container_width=True)

        st.dataframe(weeks_df, use_container_width=True)

        # Weekly detail view
        selected_week = st.selectbox("Select Week for Details",
                                     list(kpis['weekly_productivity_kpis'].keys()))

        if selected_week:
            week_detail = kpis['weekly_productivity_kpis'][selected_week]

            st.subheader(f"Week: {selected_week}")

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Entries", week_detail['total_entries'])
            with col2:
                st.metric("Total Items", week_detail['total_raw_items'])
            with col3:
                st.metric("Total Value", f"${week_detail['total_value']:,.2f}")
            with col4:
                st.metric("Pallets Accessed", week_detail['total_pallets_accessed'])

            # Category breakdown for week
            if week_detail.get('pallets_accessed'):
                st.subheader("Pallets Accessed This Week")
                pallets_data = []
                for pallet_num, pallet_info in week_detail['pallets_accessed'].items():
                    pallets_data.append({
                        'Pallet': f"#{pallet_num}",
                        'Boxes Added': pallet_info['total_boxes_added'],
                        'Category Boxes': ', '.join([f"{cb} ({c})" for cb, c in pallet_info['category_boxes'].items()])
                    })
                pallets_df = pd.DataFrame(pallets_data)
                st.dataframe(pallets_df, use_container_width=True)
    else:
        st.info("No weekly productivity data available")
