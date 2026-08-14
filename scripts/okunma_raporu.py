"""KAP Okunma Raporu (S13 Faz 3) — clicks tablosundan okunma metrikleri.

Kullanım: python scripts/okunma_raporu.py [gun_sayisi]
Varsayılan: son 7 gün (clicked_at UTC).
"""
import json
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")
from apps.fetch.d1_client import D1Client

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 7
SINCE = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%d %H:%M:%S")

d1 = D1Client()
def q(sql):
    return d1.execute(sql).get("results") or []

print(f"=== KAP OKUNMA RAPORU (son {DAYS} gun, UTC {SINCE}) ===\n")

print("1) Kaynak dagilimi")
for r in q(f"""
    SELECT source, COUNT(*) c, COUNT(DISTINCT anon_id) kullanici
    FROM clicks WHERE clicked_at >= '{SINCE}' GROUP BY source ORDER BY c DESC
"""):
    print(f"   {r['source']:<12} {r['c']:>4} tik   {r['kullanici']:>3} kullanici")

print("\n2) Gun bazli")
for r in q(f"""
    SELECT substr(clicked_at,1,10) gun, COUNT(*) c FROM clicks
    WHERE clicked_at >= '{SINCE}' GROUP BY gun ORDER BY gun
"""):
    print(f"   {r['gun']}  {r['c']}")

print("\n3) En cok okunan bildirimler (feed_card+detail)")
for r in q(f"""
    SELECT c.disclosure_index, n.title, a.importance_score, a.category,
           COUNT(*) c
    FROM clicks c
    LEFT JOIN kap_notifications n ON n.disclosure_index = c.disclosure_index
    LEFT JOIN kap_analysis a ON a.disclosure_index = c.disclosure_index
    WHERE c.source IN ('feed_card','detail') AND c.clicked_at >= '{SINCE}'
    GROUP BY c.disclosure_index ORDER BY c DESC LIMIT 15
"""):
    print(f"   {r['c']:>3}x {r['disclosure_index']} skor={r['importance_score']} {r['category']:<20} {str(r['title'])[:45]}")

print("\n4) Skor bandina gore okunma (toplam tik / yayinlanan bildirim)")
for r in q(f"""
    SELECT CASE
             WHEN a.importance_score >= 8 THEN '8-10'
             WHEN a.importance_score >= 5 THEN '5-7'
             ELSE '1-4' END skor_bandi,
           SUM(CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END) tik,
           COUNT(*) yayin
    FROM kap_analysis a
    LEFT JOIN clicks c ON c.disclosure_index = a.disclosure_index
      AND c.clicked_at >= '{SINCE}'
    WHERE a.analyzed_at >= '{SINCE}'
    GROUP BY skor_bandi ORDER BY skor_bandi DESC
"""):
    oran = (r['tik'] / r['yayin'] * 100) if r['yayin'] else 0
    print(f"   skor {r['skor_bandi']}: {r['tik']:>3}/{r['yayin']:>4} tik (%{oran:.1f})")

print("\n5) Gun sonu sentez okunmasi")
for r in q(f"""
    SELECT clicked_at, source FROM clicks
    WHERE source = 'daily_view' AND clicked_at >= '{SINCE}' ORDER BY clicked_at
"""):
    print(f"   {r['clicked_at']}")

print("\nNot: kullanici sayisi anonim id bazli; veri toplanmaya devam ediyor.")