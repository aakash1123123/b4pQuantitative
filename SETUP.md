# B4P Quantitative - Setup Guide

## Quick Start

### Prerequisites
- Python 3.8+
- Two terminal windows
- Google Sheet (optional, for Google Sheets integration)

## Running the Application

### 1. Start the Backend (Terminal 1)

```powershell
cd backend
pip install -r requirements.txt
uvicorn app:app --reload
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

The backend API will be available at `http://localhost:8000`

### 2. Start the Frontend (Terminal 2)

```powershell
cd streamlit_app
pip install -r requirements.txt
streamlit run app.py
```

**Expected output:**
```
You can now view your Streamlit app in your browser.
Local URL: http://localhost:8501
```

The frontend will automatically open in your browser at `http://localhost:8501`

---

## Google Sheets Integration (Optional but Recommended)

### Step 1: Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google Sheets API** and **Google Drive API**
4. Create a **Service Account** (Go to Credentials → Create Credentials → Service Account)
5. Create a **Service Account Key** (JSON format)
6. Download the JSON file and save it as `credentials.json` in the `backend/` folder

### Step 2: Prepare Your Google Sheet

1. Create a Google Sheet with inventory data
2. The sheet should have these columns (exact names):
   - `id` (integer)
   - `name` (text)
   - `gen_name` (text)
   - `category` (text)
   - `manufacturer` (text)
   - `quantity` (integer)
   - `unit_value` (decimal)
   - `total_value` (decimal)
   - `expiration_date` (date, format: YYYY-MM-DD or leave blank)
   - `warehouse_date` (date, format: YYYY-MM-DD)
   - `pallet_number` (integer)
   - `category_box` (text)
   - `box_number` (integer)

3. Share the Google Sheet with your service account email (found in credentials.json as `client_email`)

### Step 3: Configure Environment Variables

In PowerShell, set these environment variables before starting the backend:

```powershell
# For the default sheet name and tab
$env:GOOGLE_SHEET_NAME = "Your Sheet Name"
$env:GOOGLE_SHEET_TAB = "Sheet1"  # or your tab name
```

Or add them to your system environment variables permanently.

### Step 4: Restart Backend

The backend will automatically load data from Google Sheets on startup.

---

## API Endpoints

### Core Endpoints
- `GET /items` - Get all items
- `POST /items` - Create a new item (for manual entry)
- `GET /kpis` - Get all KPI calculations

### Google Sheets Management
- `POST /reload-sheets` - Manually reload data from Google Sheets
- `GET /sheets-status` - Check if Google Sheets integration is configured

### Example: Check Sheet Status

```powershell
curl http://localhost:8000/sheets-status
```

Response:
```json
{
  "sheet_name": "Your Sheet Name",
  "tab_name": "Sheet1",
  "credentials_found": true,
  "items_loaded": 150,
  "configured": true
}
```

---

## Features

### Backend Features
- **FastAPI** - RESTful API with automatic documentation
- **Google Sheets Integration** - Automatically loads inventory data
- **KPI Calculations** - Comprehensive analytics including:
  - Expiry date analysis by range
  - Warehouse duration tracking
  - Category breakdown
  - Top supplies by quantity
  - Pallet-level analytics
  - Weekly productivity metrics

### Frontend Features
- **Streamlit Dashboard** - Interactive web interface
- **Multiple Views**:
  - Overview - Key metrics at a glance
  - Expiry Analysis - Understand product expiration patterns
  - Duration Analysis - Track how long items are in warehouse
  - Category Breakdown - View by product category
  - Top Supplies - Most abundant items
  - Pallet Analytics - Analyze by pallet
  - Weekly Productivity - Inventory activity trends

- **Manual Data Entry** - Add items through the sidebar form
- **Real-time Updates** - Automatically fetches latest data from backend

---

## Troubleshooting

### Backend won't start
**Issue:** `ModuleNotFoundError: No module named 'fastapi'`
- **Solution:** Run `pip install -r requirements.txt` in the backend folder

### Streamlit can't connect to backend
**Issue:** `Could not reach backend`
- **Solution:** Ensure backend is running on `http://localhost:8000`
- Check that CORS is enabled (it should be by default)

### Google Sheets not loading
**Issue:** `credentials.json not found`
- **Solution:** Download your service account key and save it as `credentials.json` in the backend folder

**Issue:** `No data found in Google Sheet`
- **Solution:** 
  - Verify the sheet name matches `GOOGLE_SHEET_NAME` environment variable
  - Check column names match exactly (case-sensitive)
  - Ensure the service account has access to the sheet

### No data displays in frontend
**Issue:** Dashboard shows all zeros
- **Solution:** 
  - Click "Add Item" to manually add test data, OR
  - Use `/reload-sheets` endpoint to refresh Google Sheets data
  - Visit `http://localhost:8000/sheets-status` to see how many items are loaded

---

## Example Workflow

### Option 1: Quick Start with Manual Data Entry
1. Start backend and frontend
2. Use the "Add Item" form in the sidebar to enter inventory
3. View analytics in the dashboard

### Option 2: Load from Google Sheets
1. Create and populate your Google Sheet
2. Download service account credentials
3. Save as `backend/credentials.json`
4. Set environment variables for sheet name
5. Restart backend - data loads automatically
6. View seamlessly in frontend dashboard

---

## API Documentation

When the backend is running, visit:
- **Interactive API Docs:** `http://localhost:8000/docs` (Swagger UI)
- **Alternative Docs:** `http://localhost:8000/redoc`

---

## Notes

- The backend stores data in memory while running
- To persist data, manually save from the frontend or use Google Sheets as your source of truth
- KPIs are calculated on-demand when `/kpis` endpoint is called
- Streamlit caches KPI data for 60 seconds to improve performance
