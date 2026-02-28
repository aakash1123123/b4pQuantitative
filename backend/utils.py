"""Utility functions for KPI calculations and data transformations."""
from typing import List


def compute_expiring_soon(items: List[dict], days_threshold: int = 30) -> int:
    # placeholder implementation
    return sum(1 for i in items if i.get("expiration_date"))
