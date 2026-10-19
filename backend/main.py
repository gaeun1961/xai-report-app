import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.analyze import router as analyze_router

# uvicorn only configures its own loggers; without this the per-request
# timing line (routers/analyze.py, INFO) never reaches Render's logs
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

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
