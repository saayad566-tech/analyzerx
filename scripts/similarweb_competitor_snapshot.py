import json
import sys
from pathlib import Path

sys.path.append('/opt/.manus/.sandbox-runtime')
from data_api import ApiClient

DOMAINS = ["screener.in", "tradingview.com", "moneycontrol.com"]


def main() -> None:
    client = ApiClient()
    output = {}
    for domain in DOMAINS:
        record = {"domain": domain}
        calls = {
            "global_rank": lambda: client.call_api("SimilarWeb/get_global_rank", path_params={"domain": domain}),
            "visits": lambda: client.call_api("SimilarWeb/get_visits_total", path_params={"domain": domain}, query={"country": "world", "granularity": "monthly", "start_date": "2026-05", "end_date": "2026-07"}),
            "traffic_sources": lambda: client.call_api("SimilarWeb/get_traffic_sources_desktop", path_params={"domain": domain}, query={"country": "world", "granularity": "monthly", "start_date": "2026-05", "end_date": "2026-07"}),
            "countries": lambda: client.call_api("SimilarWeb/get_total_traffic_by_country", path_params={"domain": domain}, query={"start_date": "2026-05", "end_date": "2026-07", "limit": "10"}),
        }
        for key, call in calls.items():
            try:
                record[key] = call()
            except Exception as exc:
                record[key] = {"status": "unavailable", "error": str(exc)}
        output[domain] = record
    target = Path(__file__).resolve().parents[1] / "docs" / "similarweb-competitor-snapshot.json"
    target.write_text(json.dumps(output, indent=2, default=str), encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
