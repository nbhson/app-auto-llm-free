#!/usr/bin/env python3
"""
Sync freellms.org providers/models -> data/ + models.yaml
Usage: python scripts/sync-freellms.py
"""
import json, pathlib, re, urllib.request, time, sys

PROVIDERS_URL = "https://freellms.org/providers/"
MODELS_URL = "https://freellms.org/models/"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode()

def extract_ld_json(html):
    import re, json
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
    for b in blocks:
        try:
            data = json.loads(b)
            if data.get("@type")=="ItemList":
                return data
        except: pass
    return None

def main():
    print("Fetching providers...")
    p_html = fetch(PROVIDERS_URL)
    p_data = extract_ld_json(p_html)
    if not p_data: print("No providers ItemList"); sys.exit(1)
    providers = [el["item"] for el in p_data["itemListElement"]]
    print(f" Providers: {len(providers)}")

    # Parse provider rows for tier/caps
    rows = re.findall(r'<tr class="provider-row".*?</tr>', p_html, re.S)
    meta=[]
    for r in rows:
        name=re.search(r'class="provider-name".*?>([^<]+)</a>', r)
        href=re.search(r'href="/providers/([^"]+)"', r)
        caps=re.search(r'data-caps="([^"]+)"', r)
        tier_type=re.search(r'data-tier-type="([^"]+)"', r)
        meta.append({
            "name":name.group(1).strip() if name else "",
            "slug":href.group(1) if href else "",
            "tier_type":tier_type.group(1) if tier_type else "",
            "caps":caps.group(1).split(",") if caps else [],
            "noCard":"data-nocard=\"1\"" in r,
            "noPhone":"data-nophone=\"1\"" in r,
        })
    # Merge
    for prov in providers:
        slug = prov["url"].split("/")[-1]
        m = next((x for x in meta if x["slug"]==slug), {})
        prov.update(m)

    print("Fetching models...")
    m_html = fetch(MODELS_URL)
    m_data = extract_ld_json(m_html)
    models = [el["item"] for el in m_data["itemListElement"]] if m_data else []
    print(f" Models: {len(models)}")

    # Parse model rows for free flag etc
    m_rows = re.findall(r'<tr class="model-row".*?</tr>', m_html, re.S)
    parsed=[]
    for r in m_rows:
        try:
            parsed.append({
                "name":re.search(r'data-name="([^"]+)"',r).group(1),
                "provider":re.search(r'data-provider="([^"]+)"',r).group(1),
                "slug":re.search(r'data-provider-slug="([^"]+)"',r).group(1),
                "context":re.search(r'data-context="([^"]+)"',r).group(1),
                "tier_type":re.search(r'data-tier-type="([^"]+)"',r).group(1),
                "verified":"data-verified=\"1\"" in r,
                "free":"data-free=\"1\"" in r,
                "nocard":"data-nocard=\"1\"" in r,
                "modality":re.search(r'data-modality="([^"]+)"',r).group(1).split(",") if re.search(r'data-modality="([^"]+)"',r) else [],
                "score":re.search(r'data-score="([^"]+)"',r).group(1) if re.search(r'data-score="([^"]+)"',r) else "0",
                "limit":re.findall(r'<td class="mono small"[^>]*>([^<]+)</td>',r)[0].strip() if re.findall(r'<td class="mono small"[^>]*>([^<]+)</td>',r) else "",
            })
        except Exception as e: print("parse err",e)

    free_models=[x for x in parsed if x["free"]]
    print(f" Free models: {len(free_models)}")

    pathlib.Path("data").mkdir(exist_ok=True)
    # Save providers enriched
    # Count free per provider
    from collections import Counter
    cnt=Counter([x["provider"] for x in free_models])
    for prov in providers:
        prov["free_models"]=cnt.get(prov["name"],0)
        prov["total_models"]=len([x for x in parsed if x["provider"]==prov["name"]])
    # Overwrite slugs for consistency with registry
    pathlib.Path("data/freellms-providers.json").write_text(json.dumps(providers, indent=2, ensure_ascii=False))
    pathlib.Path("data/freellms-models-free.json").write_text(json.dumps(sorted(free_models, key=lambda x: int(x["score"] or 0), reverse=True), indent=2, ensure_ascii=False))
    print("Saved data/")

    # Generate models.yaml
    def q(s):
        if any(c in s for c in " :#{}[]&,*?|-<>!=@`"):
            return f'"{s}"'
        return s
    with open("models.yaml","w") as f:
        f.write(f"# Auto-generated from freellms.org — {len(free_models)} free models\n")
        f.write(f"# Source: data/freellms-models-free.json\n")
        f.write("models:\n")
        for m in sorted(free_models, key=lambda x: int(x["score"] or 0), reverse=True):
            caps=", ".join(m["modality"])
            full_id=f"{m['slug']}/{m['name']}"
            f.write(f"  - id: {q(full_id)}\n")
            f.write(f"    display_name: {q(m['name'])}\n")
            f.write(f"    provider: {m['slug']}\n")
            f.write(f"    context_length: {m['context']}\n")
            f.write(f"    score: {int(m['score']) if m['score'].isdigit() else 0}\n")
            f.write(f"    tier: {m['tier_type']}\n")
            f.write(f"    verified: {str(m['verified']).lower()}\n")
            f.write(f"    no_card: {str(m['nocard']).lower()}\n")
            if caps: f.write(f"    capabilities: [{caps}]\n")
            if m["limit"]: f.write(f"    limit: {q(m['limit'])}\n")
    print(f"Wrote models.yaml with {len(free_models)} models")

if __name__=="__main__":
    main()
