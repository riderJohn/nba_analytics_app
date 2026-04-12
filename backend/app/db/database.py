from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL
from app.schemas.base import Base

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        
def init_db():
    """Initialize the database by creating necessary tables."""
    try:
        # Create tables based on SQLAlchemy models
        Base.metadata.create_all(bind = engine)
        
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")

