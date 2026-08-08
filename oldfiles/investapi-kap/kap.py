"""
API router for KAP announcements endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

# Import from the models and services
from models.kap import KAPAnnouncement
from services.kap_service import (
    get_company_kap_announcements,
    get_recent_kap_announcements,
    refresh_company_kap_disclosures,
)

router = APIRouter(redirect_slashes=False)

@router.get("/recent", response_model=List[KAPAnnouncement])
async def get_recent_kap_announcements_endpoint():
    """
    Get recent KAP announcements for all companies
    """
    announcements = await get_recent_kap_announcements()
    return announcements

@router.get("/{ticker}", response_model=List[KAPAnnouncement])
async def get_kap_announcements(
    ticker: str,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0, le=10000),
    disclosure_class: Optional[str] = Query(None),
    disclosure_type: Optional[str] = Query(None),
):
    """
    Get KAP announcements for a specific company
    """
    announcements = await get_company_kap_announcements(
        ticker.upper(),
        limit=limit,
        skip=skip,
        disclosure_class=disclosure_class,
        disclosure_type=disclosure_type,
    )
    if not announcements:
        raise HTTPException(status_code=404, detail=f"No KAP announcements found for company {ticker}")
    return announcements

@router.post("/{ticker}/refresh")
async def refresh_kap_announcements(
    ticker: str,
    limit: int = Query(50, ge=1, le=200),
    disclosure_class: Optional[str] = Query(None),
    disclosure_type: Optional[str] = Query(None),
):
    count = await refresh_company_kap_disclosures(
        ticker=ticker.upper(),
        limit=limit,
        disclosure_class=disclosure_class,
        disclosure_type=disclosure_type,
    )
    return {"ticker": ticker.upper(), "refreshed": count}