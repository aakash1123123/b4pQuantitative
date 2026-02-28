from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Inventory Backend API")

# Data models
class Item(BaseModel):
    id: int
    name: str
    quantity: int
    expiration_date: str = None
    warehouse_date: str = None

class KPIResponse(BaseModel):
    total_items: int
    expiring_soon: int
    avg_warehouse_duration: float

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

@app.get("/kpis", response_model=KPIResponse)
def calculate_kpis():
    """Return basic KPI metrics; placeholder implementation."""
    total = len(items_db)
    #we need to work on this function 
    #whats up ritvik!
    expiring = sum(1 for i in items_db if i.expiration_date)
    avg_duration = 0.0
    if items_db:
        avg_duration = sum(
            0 for i in items_db
        ) / total
    return KPIResponse(total_items=total, expiring_soon=expiring, avg_warehouse_duration=avg_duration)

# TODO: Add Google Sheets integration functions in sheets_client.py
