#!/usr/bin/env python3
"""Aggiorna sitemap-sito.xml con le pagine pubbliche e gli articoli del blog di nutrizionistaspina.it.

La fonte è la sitemap generata dal database del sito (funzione «sitemap» su Supabase).
Search Console accetta questo file perché app.nutrizionistaspina.it fa parte della
proprietà di dominio nutrizionistaspina.it.

Regole:
- il file si riscrive solo se la fonte è valida (XML corretto, solo indirizzi del sito,
  tutte le pagine fisse presenti); altrimenti lo script esce con errore e il file resta com'è;
- gli articoli tengono la data che dà il database;
- le pagine fisse tengono la data già scritta nel file (la fonte mette sempre la data di oggi,
  che farebbe cambiare il file ogni giorno senza motivo); una pagina nuova prende la data di oggi.

Uso: python3 sitemap.py [percorso del file]   (predefinito: sitemap-sito.xml)
"""
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date

SOURCE = "https://uqpijskisejctcltmpdv.supabase.co/functions/v1/sitemap"
SITE = "https://nutrizionistaspina.it/"
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
# Pagine fisse che devono esserci sempre; «prenota» si aggiunge anche se la fonte non la elenca.
REQUIRED = ["", "chi-sono", "percorsi", "blog", "contatti"]
EXTRA = ["prenota"]


def fetch(url: str, tries: int = 3) -> str:
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                return r.read().decode("utf-8")
        except Exception as e:  # rete o server: riprova
            last = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"sitemap non raggiungibile: {last}")


def parse(xml_text: str) -> list[tuple[str, str]]:
    root = ET.fromstring(xml_text)
    out = []
    for u in root.findall("s:url", NS):
        loc = (u.findtext("s:loc", default="", namespaces=NS) or "").strip()
        mod = (u.findtext("s:lastmod", default="", namespaces=NS) or "").strip()
        if loc:
            out.append((loc, mod))
    return out


def build(src_xml: str, existing_xml: str | None, today: str) -> str:
    src = parse(src_xml)
    if not src:
        raise ValueError("la fonte non contiene indirizzi")
    for loc, _ in src:
        if not loc.startswith(SITE):
            raise ValueError(f"indirizzo fuori dal sito: {loc}")
    locs = [l for l, _ in src]
    for p in REQUIRED:
        if SITE + p not in locs:
            raise ValueError(f"manca la pagina fissa /{p}")
    old = dict(parse(existing_xml)) if existing_xml else {}
    entries: list[tuple[str, str]] = []
    seen = set()
    for loc, mod in src + [(SITE + p, today) for p in EXTRA]:
        if loc in seen:
            continue
        seen.add(loc)
        is_post = loc.startswith(SITE + "blog/")
        if is_post:
            lastmod = mod or old.get(loc) or today
        else:
            lastmod = old.get(loc) or today
        entries.append((loc, lastmod))
    # pagine fisse prima, poi articoli dal più recente
    fixed = [e for e in entries if not e[0].startswith(SITE + "blog/")]
    posts = sorted((e for e in entries if e[0].startswith(SITE + "blog/")), key=lambda e: e[1], reverse=True)
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, mod in fixed + posts:
        lines.append(f"  <url><loc>{esc(loc)}</loc><lastmod>{esc(mod)}</lastmod></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "sitemap-sito.xml"
    try:
        existing = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        existing = None
    out = build(fetch(SOURCE), existing, date.today().isoformat())
    if out == existing:
        print("sitemap invariata")
        return 0
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    n = out.count("<url>")
    print(f"sitemap aggiornata: {n} indirizzi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
