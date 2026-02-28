"""Placeholder module for Google Sheets interactions.

You can implement functions here using `gspread` or `pygsheets` to read/write
inventory data from a shared Google Sheet that acts as the database.
"""

# Example using gspread (uncomment after installing and configuring credentials):
# import gspread
# from oauth2client.service_account import ServiceAccountCredentials

# def get_sheet_client():
#     scope = [
#         'https://spreadsheets.google.com/feeds',
#         'https://www.googleapis.com/auth/drive',
#     ]
#     creds = ServiceAccountCredentials.from_json_keyfile_name('credentials.json', scope)
#     client = gspread.authorize(creds)
#     return client

# def read_inventory(sheet_id: str):
#     client = get_sheet_client()
#     sheet = client.open_by_key(sheet_id).sheet1
#     return sheet.get_all_records()

# def write_inventory(sheet_id: str, data: list):
#     client = get_sheet_client()
#     sheet = client.open_by_key(sheet_id).sheet1
#     # implement write logic here

# For now, the backend uses in-memory list (items_db) for prototyping.
