#!/usr/bin/env python3
"""Validate models.yaml: unique ids, required fields, no duplicate YAML keys."""
import sys, re
from collections import Counter

path = sys.argv[1] if len(sys.argv) > 1 else "models.yaml"
text = open(path).read()

# 1. detect duplicate keys inside a single model block (e.g. score twice)
blocks = re.split(r'\n\s*-\s+id:\s*', "\n" + text)
errors = []
for idx, blk in enumerate(blocks[1:], 1):
    keys = re.findall(r'^\s{4}(\w+):', blk, re.M)
    dup = [k for k, c in Counter(keys).items() if c > 1]
    if dup:
        m = re.match(r'"([^"]+)"', blk)
        errors.append(f"block {idx} ({m.group(1) if m else '?'}) duplicate keys: {dup}")

# 2. required fields via simple parse (no yaml dep)
try:
    import yaml
    data = yaml.safe_load(open(path))
    models = data.get("models", [])
    if not models:
        errors.append("no models found")
    ids = [m.get("id") for m in models]
    dup_ids = [k for k, c in Counter(ids).items() if c > 1]
    if dup_ids:
        errors.append(f"duplicate ids: {dup_ids[:5]}")
    for m in models:
        for f in ["id", "provider", "display_name", "context_length", "score", "tier", "capabilities"]:
            if f not in m:
                errors.append(f"{m.get('id','?')} missing {f}")
                break
        if "score" in m and not (0 <= int(m["score"]) <= 100):
            errors.append(f"{m['id']} score out of range: {m['score']}")
        if m.get("tier") not in ("permanent", "quota", "custom", "live"):
            errors.append(f"{m.get('id')} invalid tier: {m.get('tier')}")
except ImportError:
    print("pyyaml not installed, skipped schema check")

if errors:
    print("models.yaml INVALID:")
    for e in errors[:30]:
        print(" -", e)
    sys.exit(1)
print(f"models.yaml OK")
