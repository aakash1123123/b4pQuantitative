# B4P Quantitative setup guide

The supported application consists of a React/Vite frontend and a FastAPI backend. The legacy Streamlit directory is not used.

## Prerequisites

- Python 3.8 or newer
- Node.js 18 or newer
- Two terminal windows
- A Google service-account JSON key if sheet writes are required

## 1. Configure Google Sheets

1. Enable the Google Sheets API and Google Drive API in Google Cloud.
2. Create a service account and download its JSON key.
3. Save the key as `backend/credentials.json`.
4. Share the inventory spreadsheet with the service account's `client_email` address. Grant Editor access if quantity updates are required.
5. Set `SHEET_ID` and `SHEET_GID` in `backend/app.py` to match the spreadsheet URL.

`backend/credentials.json` is ignored by Git. Never commit or share this key.

## 2. Start the FastAPI backend

In the first PowerShell terminal:

```powershell
cd backend
py -m pip install -r requirements.txt
$env:GOOGLE_SHEETS_CREDENTIALS_PATH = (Resolve-Path ".\credentials.json")
py -m uvicorn app:app --reload
```

The API runs at `http://127.0.0.1:8000`. Verify it at:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/items`
- `http://127.0.0.1:8000/kpis`

## 3. Start the React frontend

In the second PowerShell terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

During local development, Vite proxies `/items` and `/kpis` to `http://127.0.0.1:8000`, so no frontend environment variable is necessary.

## Production frontend configuration

When the frontend and backend use different public origins, set the backend URL before building:

```powershell
$env:VITE_API_BASE = "https://your-api.example.com"
npm run build
```

The production output is written to `frontend/dist/`.

## Troubleshooting

### `py` is not recognized

Install Python for Windows, reopen PowerShell, and verify it with `py --version`.

### `npm` is not recognized

Install the current Node.js LTS release, reopen PowerShell, and verify it with `node --version` and `npm --version`.

### The React page cannot load inventory

- Confirm FastAPI is still running on port 8000.
- Open `http://127.0.0.1:8000/items` and inspect any reported sheet error.
- Confirm the spreadsheet ID and tab GID in `backend/app.py` are correct.
- Confirm the service-account email has access to the spreadsheet.

### Google Sheets writes return 503

Confirm `GOOGLE_SHEETS_CREDENTIALS_PATH` was set in the same terminal used to start Uvicorn.
