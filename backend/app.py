from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import requests
import csv
import re
import os
import json
from io import StringIO

try:
    import gspread
    from google.oauth2.service_account import Credentials
except ImportError:  # pragma: no cover - optional until credentials are configured
    gspread = None
    Credentials = None

app = FastAPI(title="Inventory Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# GOOGLE SHEET CONFIG
# ==============================
SHEET_ID = "1OiT1QBBnlazfRCv0MgwE_LXvIVJNAVQha1Ez7M4Vc88"
# The "Final Inventorying" tab: every inventoried item, all pallets. Box type
# is column B ("Category"), pallet is J and box number is K.
SHEET_GID = "1019735220"
SHEET_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export"
    f"?format=csv&gid={SHEET_GID}"
)

# Historical shipments (read-only): the "Master Shipment List" tab of the
# Master Shipment Database. Never written to from this app.
HISTORY_SHEET_ID = "1M4d2QYA90Ma3_Zkyh0l2oED-tqeRPDIaeUxF2Ovyao0"
HISTORY_SHEET_GID = "0"
HISTORY_SHEET_URL = (
    f"https://docs.google.com/spreadsheets/d/{HISTORY_SHEET_ID}/export"
    f"?format=csv&gid={HISTORY_SHEET_GID}"
)
HISTORY_SNAPSHOT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history_snapshot.json")

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
    id: str
    name: str
    gen_name: str
    category: str
    manufacturer: str
    review_status: Optional[str] = None
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


class HistoryYear(BaseModel):
    year: int
    valuation: float
    pounds: float
    shipments: int


class HistoryResponse(BaseModel):
    total_valuation: float
    total_pounds: float
    total_shipments: int
    years: List[HistoryYear]
    source: str


class QuantityUpdateRequest(BaseModel):
    quantity: int


class QuantityUpdateResponse(BaseModel):
    item_id: str
    quantity: int
    total_value: float


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


def read_category(row: Dict[str, Any]) -> Any:
    """Return the raw category cell, tolerating the sheet's column renames.

    The live tab labels the approved-category column "Subcategories"; older tabs
    used "Category"/"Subcategory". Pick the first one that has a value.
    """
    for header in ("Subcategories", "Subcategory", "Category"):
        value = str(row.get(header) or "").strip()
        if value:
            return value

    return ""


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


def normalize_item_id(row: Dict[str, Any], fallback_index: int) -> str:
    candidate_headers = [
        "Supply ID",
        "Supply Id",
        "Supply Ud",
        "SupplyUD",
        "ID",
        "Id",
        "SupplyId",
        "Unique ID",
        "Item ID",
        "",
    ]

    for header in candidate_headers:
        value = str(row.get(header) or "").strip()
        if value:
            return value

    return str(fallback_index)


def get_gspread_worksheet():
    if gspread is None or Credentials is None:
        raise HTTPException(
            status_code=503,
            detail="Google Sheets write support is not installed on the backend yet.",
        )

    credentials_path = os.getenv("GOOGLE_SHEETS_CREDENTIALS_PATH")
    credentials_json = os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON")
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]

    try:
        if credentials_json:
            info = json.loads(credentials_json)
            credentials = Credentials.from_service_account_info(info, scopes=scopes)
        elif credentials_path:
            credentials = Credentials.from_service_account_file(credentials_path, scopes=scopes)
        else:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Google Sheets credentials are not configured. Set "
                    "GOOGLE_SHEETS_CREDENTIALS_PATH or GOOGLE_SHEETS_CREDENTIALS_JSON."
                ),
            )

        client = gspread.authorize(credentials)
        spreadsheet = client.open_by_key(SHEET_ID)
        try:
            return spreadsheet.get_worksheet_by_id(int(SHEET_GID))
        except AttributeError:
            for worksheet in spreadsheet.worksheets():
                if str(worksheet.id) == str(SHEET_GID):
                    return worksheet
            raise HTTPException(status_code=500, detail="Configured worksheet could not be found.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Unable to connect to Google Sheets: {exc}") from exc


def update_sheet_quantity(item_id: str, quantity: int) -> QuantityUpdateResponse:
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0.")

    worksheet = get_gspread_worksheet()
    records = worksheet.get_all_records()
    headers = worksheet.row_values(1)

    supply_id_column = None
    quantity_column = None
    total_price_column = None
    unit_price_column = None

    for index, header in enumerate(headers, start=1):
        normalized = str(header or "").strip().lower()
        if normalized == "supply id":
            supply_id_column = index
        elif normalized == "quantity":
            quantity_column = index
        elif normalized == "total price":
            total_price_column = index
        elif normalized == "price per unit":
            unit_price_column = index

    if not supply_id_column or not quantity_column:
        raise HTTPException(
            status_code=500,
            detail="Required Google Sheet columns (Supply ID, Quantity) were not found.",
        )

    row_number = None
    unit_value = 0.0
    for index, row in enumerate(records, start=2):
        if str(row.get("Supply ID") or "").strip() == str(item_id).strip():
            row_number = index
            unit_value = parse_float(row.get("Price per unit"), 0.0)
            break

    if row_number is None:
        raise HTTPException(status_code=404, detail=f"Supply ID {item_id} was not found in the sheet.")

    updates = [
        {
            "range": gspread.utils.rowcol_to_a1(row_number, quantity_column),
            "values": [[quantity]],
        }
    ]

    total_value = round(unit_value * quantity, 2)
    if total_price_column:
        updates.append(
            {
                "range": gspread.utils.rowcol_to_a1(row_number, total_price_column),
                "values": [[total_value]],
            }
        )

    worksheet.batch_update(updates, value_input_option="USER_ENTERED")
    return QuantityUpdateResponse(item_id=item_id, quantity=quantity, total_value=total_value)


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
            category = normalize_category(read_category(row))

            if not any([name, manufacturer, category]):
                continue

            days_in_warehouse = parse_int(row.get("Days in Warehouse"))
            warehouse_date = (today - timedelta(days=days_in_warehouse)).isoformat()
            quantity = parse_int(row.get("Quantity"))
            unit_value = parse_float(row.get("Price per unit"), parse_float(row.get("Unit Value")))
            total_value = parse_float(row.get("Total Price"), parse_float(row.get("Total Value"), quantity * unit_value))

            item = Item(
                id=normalize_item_id(row, index),
                name=name or f"Item {index}",
                gen_name=(row.get("General") or "").strip(),
                category=category,
                manufacturer=manufacturer or "Unknown",
                review_status=(row.get("Review") or "").strip() or None,
                days_in_warehouse=days_in_warehouse,
                image_url=(row.get("Image URL") or "").strip() or None,
                quantity=quantity,
                unit_value=unit_value,
                total_value=total_value,
                expiration_date=normalize_expiration_date(row.get("Date of Expiration")),
                warehouse_date=warehouse_date,
                pallet_number=parse_int(row.get("Pallet Number"), default=0),
                category_box=(row.get("Category") or row.get("Box Category") or "").strip() or "Unassigned",
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


@app.post("/items/{item_id}/quantity", response_model=QuantityUpdateResponse)
def update_item_quantity(item_id: str, payload: QuantityUpdateRequest):
    return update_sheet_quantity(item_id=item_id, quantity=payload.quantity)


# ==============================
# DONATION HISTORY
# ==============================
def summarize_history_rows(rows: List[Dict[str, Any]]) -> Dict[int, Dict[str, float]]:
    by_year: Dict[int, Dict[str, float]] = {}
    for row in rows:
        # Summary rows at the bottom of the sheet have no shipment date.
        match = re.search(r"(19|20)\d{2}", str(row.get("Date of Shipment") or ""))
        if not match:
            continue
        bucket = by_year.setdefault(int(match.group()), {"valuation": 0.0, "pounds": 0.0, "shipments": 0})
        bucket["valuation"] += parse_float(row.get("Estimated Shipment Valuation"))
        bucket["pounds"] += parse_float(row.get("Poundage of shipments (lbs)"))
        bucket["shipments"] += 1
    return by_year


def load_history_snapshot() -> Dict[int, Dict[str, float]]:
    with open(HISTORY_SNAPSHOT_PATH, encoding="utf-8") as handle:
        return {int(entry["year"]): entry for entry in json.load(handle)["years"]}


@app.get("/history", response_model=HistoryResponse)
def get_history():
    source = "live"
    try:
        response = requests.get(HISTORY_SHEET_URL, timeout=15)
        response.raise_for_status()
        by_year = summarize_history_rows(list(csv.DictReader(StringIO(response.text))))
        if not by_year:
            raise ValueError("No dated shipments found in the history sheet.")
    except Exception as exc:
        print(f"Falling back to the history snapshot: {exc}")
        by_year = load_history_snapshot()
        source = "snapshot"

    years = [
        HistoryYear(
            year=year,
            valuation=round(values["valuation"], 2),
            pounds=round(values["pounds"], 2),
            shipments=int(values["shipments"]),
        )
        for year, values in sorted(by_year.items())
    ]
    return HistoryResponse(
        total_valuation=round(sum(entry.valuation for entry in years), 2),
        total_pounds=round(sum(entry.pounds for entry in years), 2),
        total_shipments=sum(entry.shipments for entry in years),
        years=years,
        source=source,
    )
