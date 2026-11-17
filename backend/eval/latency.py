"""Measure end-to-end answer latency (and optionally indexing time) against the running API.

Run inside the backend container, with at least one PDF uploaded:
    docker compose exec backend python -m eval.latency
    docker compose exec backend python -m eval.latency --upload my.pdf   # PDF placed in backend/

Questions are sent one at a time with a pause between them, so the Gemini free
tier's per-minute limit isn't what gets measured.
"""
import argparse
import statistics
import sys
import time
from pathlib import Path

import httpx

DEFAULT_QUESTIONS = [
    "What is this document about?",
    "Summarize the main points in three bullets.",
    "What are the key numbers or dates mentioned?",
    "Who is the intended audience?",
    "What problem does the document describe?",
    "What conclusions does it reach?",
    "List any definitions the document gives.",
    "What does the first page cover?",
    "Are there any recommendations? What are they?",
    "What is mentioned about risks or limitations?",
]


def pct(values, p):
    """Nearest-rank percentile (p in 0-100)."""
    s = sorted(values)
    k = max(0, min(len(s) - 1, round(p / 100 * len(s) + 0.5) - 1))
    return s[k]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("-n", type=int, default=10, help="number of questions to send (max 10 built in)")
    ap.add_argument("--pause", type=float, default=4.0, help="seconds between questions")
    ap.add_argument("--upload", help="PDF to upload first; its indexing time is measured")
    args = ap.parse_args()

    client = httpx.Client(base_url=args.base_url, timeout=120)

    if args.upload:
        path = Path(args.upload)
        if not path.is_file():
            print(f"File not found: {path}. Put the PDF in the backend/ folder and pass its name.")
            return 1
        start = time.perf_counter()
        with path.open("rb") as f:
            r = client.post("/api/upload", files={"file": (path.name, f, "application/pdf")})
        took = time.perf_counter() - start
        if r.status_code != 200:
            print(f"Upload failed ({r.status_code}): {r.text[:300]}")
            return 1
        from pypdf import PdfReader
        pages = len(PdfReader(str(path)).pages)
        print(f"\nIndexed {path.name}: {pages} pages -> {r.json()['chunks']} chunks in {took:.1f} s")

    docs = client.get("/api/documents").json()["count"]
    if docs == 0:
        print("No documents uploaded yet. Upload a PDF in the app (or use --upload) and run again.")
        return 1

    questions = DEFAULT_QUESTIONS[: max(1, min(args.n, len(DEFAULT_QUESTIONS)))]
    times, errors, with_sources = [], 0, 0
    print(f"\nSending {len(questions)} questions over {docs} document(s)...\n")
    for i, q in enumerate(questions, 1):
        start = time.perf_counter()
        r = client.post("/api/query", json={"question": q})
        took = time.perf_counter() - start
        ok = r.status_code == 200 and "rate limit" not in r.json().get("answer", "").lower()
        if ok:
            times.append(took)
            with_sources += bool(r.json().get("sources"))
        else:
            errors += 1
        print(f"  {i:>2}. {took:5.2f} s  {'ok ' if ok else 'ERR'}  {q}")
        if i < len(questions):
            time.sleep(args.pause)

    print("\n" + "-" * 60)
    if times:
        print(f"  answered            : {len(times)}/{len(questions)}  (errors: {errors})")
        print(f"  with citations      : {with_sources}/{len(times)}")
        print(f"  latency p50         : {statistics.median(times):.2f} s")
        print(f"  latency p95         : {pct(times, 95):.2f} s")
        print(f"  latency max         : {max(times):.2f} s")
    else:
        print("  No successful answers. Check GEMINI_API_KEY and the backend logs.")
    print()
    return 0 if times else 1


if __name__ == "__main__":
    sys.exit(main())
