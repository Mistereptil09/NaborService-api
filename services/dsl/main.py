# ============================================================
# dsl_service/main.py
# Responsabilité : API FastAPI — point d'entrée HTTP
# Ne contient aucune logique PLY ni MongoDB
# ============================================================

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator
from parser import parse

app = FastAPI(title="Nabor DSL Service", version="1.0.0")

ALLOWED_COLLECTIONS = {
    "messages",
    "listing_documents",
    "contracts",
    "event_documents",
    "incident_documents",
    "event_tickets",
}

class DSLRequest(BaseModel):
    query: str

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La requête ne peut pas être vide")
        if len(v) > 1000:
            raise ValueError("Requête trop longue (max 1000 caractères)")
        return v

@app.post("/parse")
def parse_query(req: DSLRequest):
    try:
        result = parse(req.query)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result["collection"] not in ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=403,
            detail=f"Collection '{result['collection']}' non autorisée"
        )

    return result

@app.get("/health")
def health():
    return {"status": "ok"}
