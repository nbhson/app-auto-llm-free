#!/usr/bin/env python3
"""Validate models catalog: models/ dir (split per provider) or legacy models.yaml.
Checks: unique ids, required fields, no duplicate YAML keys, tier values."""
import sys, re, glob, os
from collections import Counter

def arg_to_files(path):
    if os.path.isdir(path):
        return sorted(glob.glob(os.path.join(path, "*.yaml")))
    return [path]

paths = arg_to_files(sys.argv[1] if len(sys.argv) > 1 else "models")

errors = []
all_ids = []

for path in paths:
    if os.path.basename(path) == "index.yaml":
        continue
    text = open(path).read()

    # 1. detect duplicate keys inside a single model block (e.g. score twice)
    blocks = re.split(r'\n\s*-\s+id:\s*', "\n" + text)
    for idx, blk in enumerate(blocks[1:], 1):
        keys = re.findall(r'^\s{4}(\w+):', blk, re.M)
        dup = [k for k, c in Counter(keys).items() if c > 1]
        if dup:
            m = re.match(r'"([^"]+)"', blk)
            errors.append(f"{path} block {idx} ({m.group(1) if m else '?'}) duplicate keys: {dup}")

    # 2. required fields via yaml parse (when available)
    try:
        import yaml
        data = yaml.safe_load(text)
        models = (data or {}).get("models", []) or []
        if not models:
            errors.append(f"{path}: no models found")
        for m in models:
            all_ids.append(m.get("id"))
            for f in ["id", "provider", "display_name", "context_length", "score", "tier", "capabilities"]:
                if f not in m:
                    errors.append(f"{m.get('id','?')} missing {f}")
                    break
            if "score" in m and not (0 <= int(m["score"]) <= 100):
                errors.append(f"{m['id']} score out of range: {m['score']}")
            if m.get("tier") not in ("permanent", "quota", "custom", "live"):
                errors.append(f"{m.get('id')} invalid tier: {m.get('tier')}")
    except ImportError:
        # fallback regex: collect ids only
        all_ids.extend(re.findall(r'-\s+id:\s*"([^"]+)"', text))

# 3. duplicate ids across all files
dup_ids = [k for k, c in Counter(all_ids).items() if c > 1]
if dup_ids:
    errors.append(f"duplicate ids: {dup_ids[:5]}")

if errors:
    print("models INVALID:")
    for e in errors[:30]:
        print(" -", e)
    sys.exit(1)
print(f"models OK ({len(all_ids)} models, {len(paths)} files)")
