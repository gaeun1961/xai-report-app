import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.analyze import router as analyze_router

app = FastAPI(title="XAI Report Backend")

# ALLOWED_ORIGINS env var: comma-separated extra origins (e.g. production
# Vercel URL). Local dev origin and Vercel preview URLs for this project are
# always allowed.
extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", *extra_origins],
    allow_origin_regex=r"https://xai-report.*\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(analyze_router)


@app.get("/health")
def health():
    return {"status": "ok"}
