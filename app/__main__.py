# app/__main__.py
import os
import shutil

# My modules:
from app.scraping import *

# Clean up old __pycache__ folders before running the app
def clean_pycache():
    """Recursively delete all __pycache__ folders under app."""
    for root, dirs, _ in os.walk(os.path.dirname(__file__)):
        for d in dirs:
            if d == "__pycache__":
                shutil.rmtree(os.path.join(root, d))

def main():
    clean_pycache()
    print("App started")

if __name__ == "__main__":
    main()
