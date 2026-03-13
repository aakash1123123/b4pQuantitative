from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI(title="Inventory Backend API")

# Data models
class Item(BaseModel):
    id: int
    name: str
    quantity: int
    expiration_date: str = None
    warehouse_date: str = None

# KPI Response is now a dictionary for flexibility
# response_model=Dict[str, Any]

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
    """Return all KPI metrics."""
    kpis = {}
    for name, func in kpi_functions.items():
        kpis[name] = func(items_db)
    return kpis

# TODO: Add Google Sheets integration functions in sheets_client.py
