from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict
from datetime import datetime, timedelta

app = FastAPI(title="Inventory Backend API")

# Data models
class Item(BaseModel):
    id: int
    name: str
    gen_name: str
    category: str
    manufacturer: str
    
    quantity: int
    unit_value: float
    total_value: float
    
    expiration_date: str = None
    warehouse_date: str

    pallet_number: int
    category_box: str
    box_number: int




class KPIResponse(BaseModel):
    
    # Total inventory KPIs
    total_entries: int
    total_raw_items: int
    total_value: float
    avg_value_per_item: float
    avg_duration_per_item: float
    pallet_count: int
    box_count: int
    expiry_ranges: Dict[str, Dict[str, float]]
    duration_ranges: Dict[str, Dict[str, float]]
    expiry_ranges_category_breakdown: Dict[str, Dict]
    duration_ranges_category_breakdown: Dict[str, Dict]
    category_kpis: Dict[str, Dict]
    top_supplies_table: Dict[str, Dict]


# In-memory placeholder storage
items_db: List[Item] = []

@app.get("/items", response_model=List[Item])
def get_items():
    """Retrieve all items."""
    return items_db

@app.post("/items", response_model=Item)
def create_item(item: Item):
    """Create a new inventory item."""
    items_db.append(item)
    return item

# Boilerplate for KPIs: Add new KPIs here by defining functions and adding to the kpi_functions dict
def total_items_kpi(items: List[Item]) -> int:
    """Calculate total number of items."""
    return len(items)

def expiring_soon_kpi(items: List[Item]) -> int:
    """Calculate number of items expiring soon (placeholder: any item with expiration_date)."""
    return sum(1 for i in items if i.expiration_date)

def avg_warehouse_duration_kpi(items: List[Item]) -> float:
    """Calculate average warehouse duration (placeholder: currently returns 0.0)."""
    # TODO: Implement actual calculation based on warehouse_date
    return 0.0

# Dictionary of KPI functions - team members can add new KPIs here
kpi_functions: Dict[str, callable] = {
    "total_items": total_items_kpi,
    "expiring_soon": expiring_soon_kpi,
    "avg_warehouse_duration": avg_warehouse_duration_kpi,
}

# To add a new KPI:
# 1. Define a function that takes List[Item] and returns the KPI value
# 2. Add it to the kpi_functions dict with a string key

@app.get("/kpis", response_model=Dict[str, Any])
def calculate_kpis():
    """Return basic KPI metrics; placeholder implementation."""
    
# TOTAL INVENTORY KPIS
    total = len(items_db)
    total_quantity = sum(i.quantity for i in items_db)
    value = sum(i.total_value for i in items_db)
    avg_value = value / total_quantity if total_quantity > 0 else 0
    
    today = datetime.now().date()
    items_with_dates = [i for i in items_db if i.warehouse_date]
    if items_with_dates:
        durations = [(today - datetime.fromisoformat(i.warehouse_date)).days for i in items_with_dates]
        avg_duration = sum(durations) / len(durations)
    else:
        avg_duration = 0.0
    
    pallets = len(set(i.pallet_number for i in items_db))
    boxes = len(set((i.category_box, i.box_number) for i in items_db))

# EXPIRY/DURATION INFO - TOTAL INVENTORY

    # Calculate expiry info
    today = datetime.now()
    expires_0_90 = sum(1 for i in items_db if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90))
    expires_0_90_value = sum(i.total_value for i in items_db if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90))
    expires_0_90_qty = sum(i.quantity for i in items_db if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90))
    
    expires_90_180 = sum(1 for i in items_db if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180))
    expires_90_180_value = sum(i.total_value for i in items_db if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180))
    expires_90_180_qty = sum(i.quantity for i in items_db if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180))
    
    expires_180_365 = sum(1 for i in items_db if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365))
    expires_180_365_value = sum(i.total_value for i in items_db if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365))
    expires_180_365_qty = sum(i.quantity for i in items_db if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365))
    
    expires_365_plus = sum(1 for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    expires_365_plus_value = sum(i.total_value for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    expires_365_plus_qty = sum(i.quantity for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    
    no_expiration = sum(1 for i in items_db if not i.expiration_date)
    no_expiration_value = sum(i.total_value for i in items_db if not i.expiration_date)
    no_expiration_qty = sum(i.quantity for i in items_db if not i.expiration_date)
    
    already_expired = sum(1 for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    already_expired_value = sum(i.total_value for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    already_expired_qty = sum(i.quantity for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    
    # Expiration date range KPIS
    expiry_ranges_table = {}
    if total_quantity > 0:
        expiry_ranges_table["Already Expired"] = {"entries": already_expired, "raw_items": already_expired_qty, "value": round(already_expired_value, 2), "percentage": round((already_expired_qty / total_quantity) * 100, 2)}
        expiry_ranges_table["0-90 days"] = {"entries": expires_0_90, "raw_items": expires_0_90_qty, "value": round(expires_0_90_value, 2), "percentage": round((expires_0_90_qty / total_quantity) * 100, 2)}
        expiry_ranges_table["90-180 days"] = {"entries": expires_90_180, "raw_items": expires_90_180_qty, "value": round(expires_90_180_value, 2), "percentage": round((expires_90_180_qty / total_quantity) * 100, 2)}
        expiry_ranges_table["180-365 days"] = {"entries": expires_180_365, "raw_items": expires_180_365_qty, "value": round(expires_180_365_value, 2), "percentage": round((expires_180_365_qty / total_quantity) * 100, 2)}
        expiry_ranges_table["365+ days"] = {"entries": expires_365_plus, "raw_items": expires_365_plus_qty, "value": round(expires_365_plus_value, 2), "percentage": round((expires_365_plus_qty / total_quantity) * 100, 2)}
        expiry_ranges_table["No expiration date"] = {"entries": no_expiration, "raw_items": no_expiration_qty, "value": round(no_expiration_value, 2), "percentage": round((no_expiration_qty / total_quantity) * 100, 2)}

    # Calculate warehouse duration ranges
    duration_0_30 = sum(1 for i in items_db if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30)
    duration_0_30_value = sum(i.total_value for i in items_db if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30)
    duration_0_30_qty = sum(i.quantity for i in items_db if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30)
    
    duration_30_90 = sum(1 for i in items_db if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90)
    duration_30_90_value = sum(i.total_value for i in items_db if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90)
    duration_30_90_qty = sum(i.quantity for i in items_db if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90)
    
    duration_90_180 = sum(1 for i in items_db if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180)
    duration_90_180_value = sum(i.total_value for i in items_db if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180)
    duration_90_180_qty = sum(i.quantity for i in items_db if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180)
    
    duration_180_plus = sum(1 for i in items_db if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180)
    duration_180_plus_value = sum(i.total_value for i in items_db if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180)
    duration_180_plus_qty = sum(i.quantity for i in items_db if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180)
    
    # Warehouse duration range KPIS
    duration_ranges_table = {}
    if total_quantity > 0:
        duration_ranges_table["0-30 days"] = {"entries": duration_0_30, "raw_items": duration_0_30_qty, "value": round(duration_0_30_value, 2), "percentage": round((duration_0_30_qty / total_quantity) * 100, 2)}
        duration_ranges_table["30-90 days"] = {"entries": duration_30_90, "raw_items": duration_30_90_qty, "value": round(duration_30_90_value, 2), "percentage": round((duration_30_90_qty / total_quantity) * 100, 2)}
        duration_ranges_table["90-180 days"] = {"entries": duration_90_180, "raw_items": duration_90_180_qty, "value": round(duration_90_180_value, 2), "percentage": round((duration_90_180_qty / total_quantity) * 100, 2)}
        duration_ranges_table["180+ days"] = {"entries": duration_180_plus, "raw_items": duration_180_plus_qty, "value": round(duration_180_plus_value, 2), "percentage": round((duration_180_plus_qty / total_quantity) * 100, 2)}

#------------------------------------------------------------

# CATEGORY SPECIFIC KPIS
   
    category_kpis = {}
    categories = set(i.category for i in items_db)
    for cat in categories:
        cat_items = [i for i in items_db if i.category == cat]
        cat_total = len(cat_items)
        cat_quantity = sum(i.quantity for i in cat_items)
        cat_value = sum(i.total_value for i in cat_items)
        cat_avg_value = cat_value / cat_total if cat_total > 0 else 0
        
        # Calculate average warehouse duration for this category
        cat_items_with_dates = [i for i in cat_items if i.warehouse_date]
        if cat_items_with_dates:
            durations = [(today - datetime.fromisoformat(i.warehouse_date)).days for i in cat_items_with_dates]
            cat_avg_duration = sum(durations) / len(durations)
        else:
            cat_avg_duration = 0.0
        
        # Calculate expiry ranges for this category
        cat_expires_already = sum(1 for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
        cat_expires_already_value = sum(i.total_value for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
        cat_expires_already_qty = sum(i.quantity for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
        
        cat_expires_0_90 = sum(1 for i in cat_items if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90))
        cat_expires_0_90_value = sum(i.total_value for i in cat_items if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90))
        cat_expires_0_90_qty = sum(i.quantity for i in cat_items if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90))
        
        cat_expires_90_180 = sum(1 for i in cat_items if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180))
        cat_expires_90_180_value = sum(i.total_value for i in cat_items if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180))
        cat_expires_90_180_qty = sum(i.quantity for i in cat_items if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180))
        
        cat_expires_180_365 = sum(1 for i in cat_items if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365))
        cat_expires_180_365_value = sum(i.total_value for i in cat_items if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365))
        cat_expires_180_365_qty = sum(i.quantity for i in cat_items if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365))
        
        cat_expires_365_plus = sum(1 for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
        cat_expires_365_plus_value = sum(i.total_value for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
        cat_expires_365_plus_qty = sum(i.quantity for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
        
        cat_no_expiration = sum(1 for i in cat_items if not i.expiration_date)
        cat_no_expiration_value = sum(i.total_value for i in cat_items if not i.expiration_date)
        cat_no_expiration_qty = sum(i.quantity for i in cat_items if not i.expiration_date)
        
        # Calculate duration ranges for this category
        cat_duration_0_30 = sum(1 for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30)
        cat_duration_0_30_value = sum(i.total_value for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30)
        cat_duration_0_30_qty = sum(i.quantity for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30)
        
        cat_duration_30_90 = sum(1 for i in cat_items if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90)
        cat_duration_30_90_value = sum(i.total_value for i in cat_items if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90)
        cat_duration_30_90_qty = sum(i.quantity for i in cat_items if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90)
        
        cat_duration_90_180 = sum(1 for i in cat_items if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180)
        cat_duration_90_180_value = sum(i.total_value for i in cat_items if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180)
        cat_duration_90_180_qty = sum(i.quantity for i in cat_items if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180)
        
        cat_duration_180_plus = sum(1 for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180)
        cat_duration_180_plus_value = sum(i.total_value for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180)
        cat_duration_180_plus_qty = sum(i.quantity for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180)
        
        # Build expiry and duration tables for this category
        cat_expiry_ranges = {}
        cat_duration_ranges = {}
        if cat_quantity > 0:
            cat_expiry_ranges["Already Expired"] = {"entries": cat_expires_already, "raw_items": cat_expires_already_qty, "value": round(cat_expires_already_value, 2), "percentage": round((cat_expires_already_qty / cat_quantity) * 100, 2)}
            cat_expiry_ranges["0-90 days"] = {"entries": cat_expires_0_90, "raw_items": cat_expires_0_90_qty, "value": round(cat_expires_0_90_value, 2), "percentage": round((cat_expires_0_90_qty / cat_quantity) * 100, 2)}
            cat_expiry_ranges["90-180 days"] = {"entries": cat_expires_90_180, "raw_items": cat_expires_90_180_qty, "value": round(cat_expires_90_180_value, 2), "percentage": round((cat_expires_90_180_qty / cat_quantity) * 100, 2)}
            cat_expiry_ranges["180-365 days"] = {"entries": cat_expires_180_365, "raw_items": cat_expires_180_365_qty, "value": round(cat_expires_180_365_value, 2), "percentage": round((cat_expires_180_365_qty / cat_quantity) * 100, 2)}
            cat_expiry_ranges["365+ days"] = {"entries": cat_expires_365_plus, "raw_items": cat_expires_365_plus_qty, "value": round(cat_expires_365_plus_value, 2), "percentage": round((cat_expires_365_plus_qty / cat_quantity) * 100, 2)}
            cat_expiry_ranges["No expiration date"] = {"entries": cat_no_expiration, "raw_items": cat_no_expiration_qty, "value": round(cat_no_expiration_value, 2), "percentage": round((cat_no_expiration_qty / cat_quantity) * 100, 2)}
            
            cat_duration_ranges["0-30 days"] = {"entries": cat_duration_0_30, "raw_items": cat_duration_0_30_qty, "value": round(cat_duration_0_30_value, 2), "percentage": round((cat_duration_0_30_qty / cat_quantity) * 100, 2)}
            cat_duration_ranges["30-90 days"] = {"entries": cat_duration_30_90, "raw_items": cat_duration_30_90_qty, "value": round(cat_duration_30_90_value, 2), "percentage": round((cat_duration_30_90_qty / cat_quantity) * 100, 2)}
            cat_duration_ranges["90-180 days"] = {"entries": cat_duration_90_180, "raw_items": cat_duration_90_180_qty, "value": round(cat_duration_90_180_value, 2), "percentage": round((cat_duration_90_180_qty / cat_quantity) * 100, 2)}
            cat_duration_ranges["180+ days"] = {"entries": cat_duration_180_plus, "raw_items": cat_duration_180_plus_qty, "value": round(cat_duration_180_plus_value, 2), "percentage": round((cat_duration_180_plus_qty / cat_quantity) * 100, 2)}
        
        category_kpis[cat] = {
            "total_entries": cat_total,
            "total_raw_items": cat_quantity,
            "total_value": round(cat_value, 2),
            "avg_value_per_item": round(cat_avg_value, 2),
            "avg_duration": round(cat_avg_duration, 2),
            "expiry_ranges_table": cat_expiry_ranges,
            "duration_ranges_table": cat_duration_ranges
        }

    #----------------------------------------------------------------
    
    # EXPIRY/DURATION INFO - CATEGORY BREAKDOWN
    
    # expiry ranges category breakdown
    expiry_ranges_category_breakdown = {
        "Already Expired": {"total_entries": already_expired, "total_raw_items": already_expired_qty, "total_value": round(already_expired_value, 2), "categories": {}},
        "0-90 days": {"total_entries": expires_0_90, "total_raw_items": expires_0_90_qty, "total_value": round(expires_0_90_value, 2), "categories": {}},
        "90-180 days": {"total_entries": expires_90_180, "total_raw_items": expires_90_180_qty, "total_value": round(expires_90_180_value, 2), "categories": {}},
        "180-365 days": {"total_entries": expires_180_365, "total_raw_items": expires_180_365_qty, "total_value": round(expires_180_365_value, 2), "categories": {}},
        "365+ days": {"total_entries": expires_365_plus, "total_raw_items": expires_365_plus_qty, "total_value": round(expires_365_plus_value, 2), "categories": {}},
        "No expiration date": {"total_entries": no_expiration, "total_raw_items": no_expiration_qty, "total_value": round(no_expiration_value, 2), "categories": {}}
    }
    
    for cat in categories:
        cat_items = [i for i in items_db if i.category == cat]
        already_expired_cat = [i for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today]
        expires_0_90_cat = [i for i in cat_items if i.expiration_date and today < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=90)]
        expires_90_180_cat = [i for i in cat_items if i.expiration_date and today + timedelta(days=90) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=180)]
        expires_180_365_cat = [i for i in cat_items if i.expiration_date and today + timedelta(days=180) < datetime.fromisoformat(i.expiration_date) <= today + timedelta(days=365)]
        expires_365_plus_cat = [i for i in cat_items if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365)]
        no_expiration_cat = [i for i in cat_items if not i.expiration_date]
        
        if already_expired_qty > 0:
            entries_ae = len(already_expired_cat)
            qty_ae = sum(i.quantity for i in already_expired_cat)
            value_ae = sum(i.total_value for i in already_expired_cat)
            expiry_ranges_category_breakdown["Already Expired"]["categories"][cat] = {"entries": entries_ae, "raw_items": qty_ae, "value": round(value_ae, 2), "percentage": round((qty_ae / already_expired_qty) * 100, 2)}
        
        if expires_0_90_qty > 0:
            entries_0_90 = len(expires_0_90_cat)
            qty_0_90 = sum(i.quantity for i in expires_0_90_cat)
            value_0_90 = sum(i.total_value for i in expires_0_90_cat)
            expiry_ranges_category_breakdown["0-90 days"]["categories"][cat] = {"entries": entries_0_90, "raw_items": qty_0_90, "value": round(value_0_90, 2), "percentage": round((qty_0_90 / expires_0_90_qty) * 100, 2)}
        
        if expires_90_180_qty > 0:
            entries_90_180 = len(expires_90_180_cat)
            qty_90_180 = sum(i.quantity for i in expires_90_180_cat)
            value_90_180 = sum(i.total_value for i in expires_90_180_cat)
            expiry_ranges_category_breakdown["90-180 days"]["categories"][cat] = {"entries": entries_90_180, "raw_items": qty_90_180, "value": round(value_90_180, 2), "percentage": round((qty_90_180 / expires_90_180_qty) * 100, 2)}
        
        if expires_180_365_qty > 0:
            entries_180_365 = len(expires_180_365_cat)
            qty_180_365 = sum(i.quantity for i in expires_180_365_cat)
            value_180_365 = sum(i.total_value for i in expires_180_365_cat)
            expiry_ranges_category_breakdown["180-365 days"]["categories"][cat] = {"entries": entries_180_365, "raw_items": qty_180_365, "value": round(value_180_365, 2), "percentage": round((qty_180_365 / expires_180_365_qty) * 100, 2)}
        
        if expires_365_plus_qty > 0:
            entries_365_plus = len(expires_365_plus_cat)
            qty_365_plus = sum(i.quantity for i in expires_365_plus_cat)
            value_365_plus = sum(i.total_value for i in expires_365_plus_cat)
            expiry_ranges_category_breakdown["365+ days"]["categories"][cat] = {"entries": entries_365_plus, "raw_items": qty_365_plus, "value": round(value_365_plus, 2), "percentage": round((qty_365_plus / expires_365_plus_qty) * 100, 2)}
        
        if no_expiration_qty > 0:
            entries_ne = len(no_expiration_cat)
            qty_ne = sum(i.quantity for i in no_expiration_cat)
            value_ne = sum(i.total_value for i in no_expiration_cat)
            expiry_ranges_category_breakdown["No expiration date"]["categories"][cat] = {"entries": entries_ne, "raw_items": qty_ne, "value": round(value_ne, 2), "percentage": round((qty_ne / no_expiration_qty) * 100, 2)}
    
    
    # duration ranges category breakdown
    duration_ranges_category_breakdown = {
        "0-30 days": {"total_entries": duration_0_30, "total_raw_items": duration_0_30_qty, "total_value": round(duration_0_30_value, 2), "categories": {}},
        "30-90 days": {"total_entries": duration_30_90, "total_raw_items": duration_30_90_qty, "total_value": round(duration_30_90_value, 2), "categories": {}},
        "90-180 days": {"total_entries": duration_90_180, "total_raw_items": duration_90_180_qty, "total_value": round(duration_90_180_value, 2), "categories": {}},
        "180+ days": {"total_entries": duration_180_plus, "total_raw_items": duration_180_plus_qty, "total_value": round(duration_180_plus_value, 2), "categories": {}}
    }
    
    for cat in categories:
        cat_items = [i for i in items_db if i.category == cat]
        duration_0_30_cat = [i for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days <= 30]
        duration_30_90_cat = [i for i in cat_items if i.warehouse_date and 30 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 90]
        duration_90_180_cat = [i for i in cat_items if i.warehouse_date and 90 < (today - datetime.fromisoformat(i.warehouse_date)).days <= 180]
        duration_180_plus_cat = [i for i in cat_items if i.warehouse_date and (today - datetime.fromisoformat(i.warehouse_date)).days > 180]
        
        if duration_0_30_qty > 0:
            entries_0_30 = len(duration_0_30_cat)
            qty_0_30 = sum(i.quantity for i in duration_0_30_cat)
            value_0_30 = sum(i.total_value for i in duration_0_30_cat)
            duration_ranges_category_breakdown["0-30 days"]["categories"][cat] = {"entries": entries_0_30, "raw_items": qty_0_30, "value": round(value_0_30, 2), "percentage": round((qty_0_30 / duration_0_30_qty) * 100, 2)}
        
        if duration_30_90_qty > 0:
            entries_30_90 = len(duration_30_90_cat)
            qty_30_90 = sum(i.quantity for i in duration_30_90_cat)
            value_30_90 = sum(i.total_value for i in duration_30_90_cat)
            duration_ranges_category_breakdown["30-90 days"]["categories"][cat] = {"entries": entries_30_90, "raw_items": qty_30_90, "value": round(value_30_90, 2), "percentage": round((qty_30_90 / duration_30_90_qty) * 100, 2)}
        
        if duration_90_180_qty > 0:
            entries_90_180 = len(duration_90_180_cat)
            qty_90_180 = sum(i.quantity for i in duration_90_180_cat)
            value_90_180 = sum(i.total_value for i in duration_90_180_cat)
            duration_ranges_category_breakdown["90-180 days"]["categories"][cat] = {"entries": entries_90_180, "raw_items": qty_90_180, "value": round(value_90_180, 2), "percentage": round((qty_90_180 / duration_90_180_qty) * 100, 2)}
        
        if duration_180_plus_qty > 0:
            entries_180_plus = len(duration_180_plus_cat)
            qty_180_plus = sum(i.quantity for i in duration_180_plus_cat)
            value_180_plus = sum(i.total_value for i in duration_180_plus_cat)
            duration_ranges_category_breakdown["180+ days"]["categories"][cat] = {"entries": entries_180_plus, "raw_items": qty_180_plus, "value": round(value_180_plus, 2), "percentage": round((qty_180_plus / duration_180_plus_qty) * 100, 2)}

    #------------------------------------------------------------

    # SUPPLY SPECIFIC KPIS
    
    # Calculate top 20 most abundant supplies by gen_name
    supply_metrics = {}
    for item in items_db:
        if item.gen_name not in supply_metrics:
            supply_metrics[item.gen_name] = {
                "total_entries": 0,
                "total_raw_items": 0,
                "total_value": 0,
                "categories": set(),
                "locations": {}  # category_box -> set of box_numbers
            }
        supply_metrics[item.gen_name]["total_entries"] += 1
        supply_metrics[item.gen_name]["total_raw_items"] += item.quantity
        supply_metrics[item.gen_name]["total_value"] += item.total_value
        supply_metrics[item.gen_name]["categories"].add(item.category)
        
        # Track locations (category_box and box_numbers)
        if item.category_box not in supply_metrics[item.gen_name]["locations"]:
            supply_metrics[item.gen_name]["locations"][item.category_box] = set()
        supply_metrics[item.gen_name]["locations"][item.category_box].add(item.box_number)
    
    # Calculate average value per item, format categories and locations for each supply
    for supply_name in supply_metrics:
        total_entries = supply_metrics[supply_name]["total_entries"]
        total_value = supply_metrics[supply_name]["total_value"]
        supply_metrics[supply_name]["avg_value_per_item"] = round(total_value / total_entries, 2) if total_entries > 0 else 0
        supply_metrics[supply_name]["total_value"] = round(total_value, 2)
        
        # Format categories as a list
        supply_metrics[supply_name]["category"] = sorted(list(supply_metrics[supply_name]["categories"]))
        
        # Format locations as: "category_box" (box1, box2, ...); "category_box2" (box1, box2, ...)
        location_parts = []
        for cat_box in sorted(supply_metrics[supply_name]["locations"].keys()):
            box_numbers = sorted(list(supply_metrics[supply_name]["locations"][cat_box]))
            box_str = ", ".join(map(str, box_numbers))
            location_parts.append(f'"{cat_box}" ({box_str})')
        supply_metrics[supply_name]["locations"] = "; ".join(location_parts)
        
        # Remove temporary set
        del supply_metrics[supply_name]["categories"]
    
    # Sort by total raw items (most abundant first) and get top 20
    top_supplies = sorted(supply_metrics.items(), key=lambda x: x[1]["total_raw_items"], reverse=True)[:20]
    top_supplies_table = {supply_name: metrics for supply_name, metrics in top_supplies}

    #------------------------------------------------------------
    
    # Pallet level KPIS


    # Shipment KPIS





    # just execution code for
  
    
    return KPIResponse(total_entries=total, 
                       total_raw_items=total_quantity,
                       total_value=value, 
                       avg_value_per_item=avg_value,
                       avg_duration_per_item=avg_duration,
                       pallet_count=pallets,
                       box_count=boxes,
                       expiry_ranges=expiry_ranges_table,
                       duration_ranges=duration_ranges_table,
                       expiry_ranges_category_breakdown=expiry_ranges_category_breakdown,
                       duration_ranges_category_breakdown=duration_ranges_category_breakdown,
                       category_kpis=category_kpis,
                       top_supplies_table=top_supplies_table)

# TODO: Add Google Sheets integration functions in sheets_client.py
