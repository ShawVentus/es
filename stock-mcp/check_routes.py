from fastapi import FastAPI
from src.server.app import create_app

app = create_app()
for route in app.routes:
    print(getattr(route, "path", route))
