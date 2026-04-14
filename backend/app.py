from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import requests
import csv
import re
from io import StringIO

app = FastAPI(title="Inventory Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# GOOGLE SHEET CONFIG
# ==============================
SHEET_ID = "1qBjJIUajjDFhhYu0Zr_zZYPErsFQKXFOInAgZnHLNxs"
SHEET_GID = "384285232"
SHEET_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export"
    f"?format=csv&gid={SHEET_GID}"
)

APPROVED_CATEGORIES = {
    "Airway & Oxygen",
    "Catheters & Briefs",
    "Gloves",
    "IV Supplies",
    "Masks & Face Shields",
    "Needles & Syringes",
    "Sutures",
    "Wound Care & Bandages",
    "Vitals & Home Health",
    "Apparel (Gowns, Shoe Covers, etc.)",
    "Misc Surgical",
    "Misc Non-Medical",
}

CATEGORY_ALIASES = {
    "misc non‐medical": "Misc Non-Medical",
    "misc non-medical": "Misc Non-Medical",
    "misc non‑medical": "Misc Non-Medical",
    "misc non–medical": "Misc Non-Medical",
    "misc non—medical": "Misc Non-Medical",
    "unspecified": "Misc Non-Medical",
    "uncategorized": "Misc Non-Medical",
    "medical supplies": "Misc Non-Medical",
    "": "Misc Non-Medical",
}



# ==============================
# DATA MODELS
# ==============================
class Item(BaseModel):
    id: int
    name: str
    gen_name: str
    category: str
    manufacturer: str
    days_in_warehouse: int = 0
    image_url: Optional[str] = None
    
    quantity: int
    unit_value: float
    total_value: float
    
    expiration_date: Optional[str] = None
    warehouse_date: str

    pallet_number: int
    category_box: str
    box_number: int


class KPIResponse(BaseModel):
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
    weekly_productivity_kpis: Dict[str, Dict]
    pallet_kpis: Dict[str, Dict]


def parse_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    match = re.search(r"-?\d+", text.replace(",", ""))
    return int(match.group()) if match else default


def parse_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    text = str(value).strip().replace(",", "")
    if not text:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group()) if match else default


def normalize_expiration_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return None

    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue

    return None


def normalize_category(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in APPROVED_CATEGORIES:
        return raw

    alias_key = (
        raw.lower()
        .replace("â\x80\x90", "-")
        .replace("‐", "-")
        .replace("‑", "-")
        .replace("–", "-")
        .replace("—", "-")
    )
    normalized = CATEGORY_ALIASES.get(alias_key)
    if normalized:
        return normalized

    return raw or "Misc Non-Medical"


# ==============================
# FETCH DATA FROM GOOGLE SHEETS
# ==============================
def fetch_items_from_sheet() -> List[Item]:
    try:
        response = requests.get(SHEET_URL, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Unable to load Google Sheet: {exc}") from exc

    csv_data = StringIO(response.text)
    reader = csv.DictReader(csv_data)
    today = datetime.now().date()

    items = []
    for index, row in enumerate(reader, start=1):
        try:
            name = (row.get("Name") or "").strip()
            manufacturer = (row.get("Manufacturer Name") or "").strip()
            category = normalize_category(row.get("Category"))

            if not any([name, manufacturer, category]):
                continue

            days_in_warehouse = parse_int(row.get("Days in Warehouse"))
            warehouse_date = (today - timedelta(days=days_in_warehouse)).isoformat()
            quantity = parse_int(row.get("Quantity"))
            unit_value = parse_float(row.get("Unit Value"))
            total_value = parse_float(row.get("Total Value"), quantity * unit_value)

            item = Item(
                id=index,
                name=name or f"Item {index}",
                gen_name=(row.get("General") or "").strip(),
                category=category,
                manufacturer=manufacturer or "Unknown",
                days_in_warehouse=days_in_warehouse,
                image_url=(row.get("Image URL") or "").strip() or None,
                quantity=quantity,
                unit_value=unit_value,
                total_value=total_value,
                expiration_date=normalize_expiration_date(row.get("Date of Expiration")),
                warehouse_date=warehouse_date,
                pallet_number=parse_int(row.get("Pallet Number"), default=0),
                category_box=category,
                box_number=parse_int(row.get("Box Number"), default=0),
            )
            items.append(item)
        except Exception as e:
            print(f"Error parsing row: {row} -> {e}")

    return items


# ==============================
# ROUTES
# ==============================
@app.get("/")
def root():
    return {"message": "Inventory API is running"}


@app.get("/items", response_model=List[Item])
def get_items():
    return fetch_items_from_sheet()


@app.get("/kpis", response_model=KPIResponse)
def calculate_kpis():
    items_db = fetch_items_from_sheet()

    # ==============================
    # BASIC KPIS
    # ==============================
    total = len(items_db)
    total_quantity = sum(i.quantity for i in items_db)
    value = sum(i.total_value for i in items_db)
    avg_value = value / total_quantity if total_quantity > 0 else 0

    today = datetime.now()
    items_with_dates = [i for i in items_db if i.warehouse_date]

    if items_with_dates:
        durations = [(today - datetime.fromisoformat(i.warehouse_date)).days for i in items_with_dates]
        avg_duration = sum(durations) / len(durations)
    else:
        avg_duration = 0.0

    pallets = len(set(i.pallet_number for i in items_db))
    boxes = len(set((i.category_box, i.box_number) for i in items_db))

    # ==============================
    # EXPIRY CALCULATIONS
    # ==============================
    def in_range(i, start, end):
        return i.expiration_date and start < datetime.fromisoformat(i.expiration_date) <= end

    expires_0_90 = sum(1 for i in items_db if in_range(i, today, today + timedelta(days=90)))
    expires_0_90_qty = sum(i.quantity for i in items_db if in_range(i, today, today + timedelta(days=90)))
    expires_0_90_value = sum(i.total_value for i in items_db if in_range(i, today, today + timedelta(days=90)))

    expires_90_180 = sum(1 for i in items_db if in_range(i, today + timedelta(days=90), today + timedelta(days=180)))
    expires_90_180_qty = sum(i.quantity for i in items_db if in_range(i, today + timedelta(days=90), today + timedelta(days=180)))
    expires_90_180_value = sum(i.total_value for i in items_db if in_range(i, today + timedelta(days=90), today + timedelta(days=180)))

    expires_180_365 = sum(1 for i in items_db if in_range(i, today + timedelta(days=180), today + timedelta(days=365)))
    expires_180_365_qty = sum(i.quantity for i in items_db if in_range(i, today + timedelta(days=180), today + timedelta(days=365)))
    expires_180_365_value = sum(i.total_value for i in items_db if in_range(i, today + timedelta(days=180), today + timedelta(days=365)))

    expires_365_plus = sum(1 for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    expires_365_plus_qty = sum(i.quantity for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))
    expires_365_plus_value = sum(i.total_value for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) > today + timedelta(days=365))

    already_expired = sum(1 for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    already_expired_qty = sum(i.quantity for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)
    already_expired_value = sum(i.total_value for i in items_db if i.expiration_date and datetime.fromisoformat(i.expiration_date) <= today)

    no_expiration = sum(1 for i in items_db if not i.expiration_date)
    no_expiration_qty = sum(i.quantity for i in items_db if not i.expiration_date)
    no_expiration_value = sum(i.total_value for i in items_db if not i.expiration_date)

    expiry_ranges_table = {}
    if total_quantity > 0:
        expiry_ranges_table = {
            "Already Expired": {"entries": already_expired, "raw_items": already_expired_qty, "value": already_expired_value},
            "0-90 days": {"entries": expires_0_90, "raw_items": expires_0_90_qty, "value": expires_0_90_value},
            "90-180 days": {"entries": expires_90_180, "raw_items": expires_90_180_qty, "value": expires_90_180_value},
            "180-365 days": {"entries": expires_180_365, "raw_items": expires_180_365_qty, "value": expires_180_365_value},
            "365+ days": {"entries": expires_365_plus, "raw_items": expires_365_plus_qty, "value": expires_365_plus_value},
            "No expiration": {"entries": no_expiration, "raw_items": no_expiration_qty, "value": no_expiration_value},
        }

    # ==============================
    # RETURN (minimal working version)
    # ==============================
    return KPIResponse(
        total_entries=total,
        total_raw_items=total_quantity,
        total_value=round(value, 2),
        avg_value_per_item=round(avg_value, 2),
        avg_duration_per_item=round(avg_duration, 2),
        pallet_count=pallets,
        box_count=boxes,
        expiry_ranges=expiry_ranges_table,
        duration_ranges={},
        expiry_ranges_category_breakdown={},
        duration_ranges_category_breakdown={},
        category_kpis={},
        top_supplies_table={},
        weekly_productivity_kpis={},
        pallet_kpis={}
    )
