# Inventory Management and Analytics System

This project uses a React/Vite frontend, a FastAPI backend, and Google Sheets as the inventory data source.

## Project structure

```text
backend/       FastAPI application
frontend/      React application
api/           Serverless API entry point
```

The legacy `streamlit_app/` directory is not used and is ignored by Git.

## Run locally

Open two terminals from the repository root.

### Backend

```powershell
cd backend
py -m pip install -r requirements.txt
$env:GOOGLE_SHEETS_CREDENTIALS_PATH = (Resolve-Path ".\credentials.json")
py -m uvicorn app:app --reload
```

The API is available at `http://127.0.0.1:8000` and its interactive documentation is at `http://127.0.0.1:8000/docs`.

### React frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies the React app's `/items` and `/kpis` requests to the local FastAPI server.

For a separately hosted backend, set `VITE_API_BASE` to its public URL before building the frontend.
