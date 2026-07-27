# Same Python as CI, so the image runs what the tests ran on.
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies. CPU-only PyTorch: the default Linux wheel pulls
# ~2 GB of NVIDIA CUDA libraries, and this image never runs on a GPU (the local
# MiniLM model runs on the CPU).
RUN pip install --no-cache-dir -r requirements.txt \
    --extra-index-url https://download.pytorch.org/whl/cpu

# spaCy model for Presidio. Every PII type we redact (email, phone, card, SSN,
# passport, IBAN, IP) is found by Presidio's pattern recognizers, not the
# language model, so the small model does the job of the 560 MB one.
RUN python -m spacy download en_core_web_sm

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]