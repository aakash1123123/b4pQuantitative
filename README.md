# Inventory Management and Analytics System

This repository contains a basic boilerplate for an internal inventory system with a Streamlit frontend and Python backend (FastAPI). Google Sheets is used as the initial database layer.

## Structure
```
/streamlit_app         # Streamlit frontend code
/backend               # Python backend (FastAPI)
  app.py               # Main API application
  sheets_client.py     # Placeholder for Google Sheets integration
  utils.py             # Utility functions and KPI calculations
  requirements.txt     # Backend dependencies
/streamlit_app
  app.py               # Streamlit application entrypoint
  requirements.txt     # Frontend dependencies
README.md
```

## Running
### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

### Frontend
```bash
cd streamlit_app
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```
