from fastapi import FastAPI

from app.api.routers import games, schedule, predict

app = FastAPI(name = "NBA Analytics App", version = "1.0.0")

app.include_router(games.router)
app.include_router(schedule.router)
app.include_router(predict.router)

@app.get("/")
def root():
    return {"message": "Welcome to the NBA Analytics App!"}

