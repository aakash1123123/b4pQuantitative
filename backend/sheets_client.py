import requests
import csv
from io import StringIO

SHEET_URL = "YOUR_CSV_LINK_HERE"

def fetch_items_from_sheet():
    response = requests.get(SHEET_URL)
    response.raise_for_status()

    csv_data = StringIO(response.text)
    reader = csv.DictReader(csv_data)

    items = []
    for row in reader:
        try:
            item = Item(
                id=int(row["id"]),
                name=row["name"],
                gen_name=row["gen_name"],
                category=row["category"],
                manufacturer=row["manufacturer"],
                quantity=int(row["quantity"]),
                unit_value=float(row["unit_value"]),
                total_value=float(row["total_value"]),
                expiration_date=row.get("expiration_date") or None,
                warehouse_date=row["warehouse_date"],
                pallet_number=int(row["pallet_number"]),
                category_box=row["category_box"],
                box_number=int(row["box_number"]),
            )
            items.append(item)
        except Exception as e:
            print(f"Error parsing row: {row}, {e}")

    return items