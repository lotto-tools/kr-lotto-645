#!/usr/bin/env python3
"""
로또 6/45 회차 데이터 갱신 스크립트
------------------------------------------------
동행복권 공식 홈페이지의 회차 조회 API에서 새 회차를 받아
data/draws.json 과 data/draws.js 를 갱신합니다.

사용법:
    python3 tools/update_draws.py          # 새 회차만 추가
    python3 tools/update_draws.py --full   # 전체 회차를 다시 수집(1회~최신)

필요 환경: Python 3.8 이상, 인터넷 연결 (별도 패키지 없음)

.github/workflows/update.yml 이 매주 토요일 추첨이 끝난 뒤 이 스크립트를
실행합니다. 새 회차가 없으면 파일을 건드리지 않으므로 커밋도 생기지 않습니다.
수집 결과가 저장된 데이터보다 적으면(사이트 장애 등) 아무것도 쓰지 않고
종료 코드 2로 멈춰, 자동화가 데이터를 되돌리는 일을 막습니다.
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.request

BASE = "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd={}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  " (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.dhlottery.co.kr/lt645/result",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, "data", "draws.json")
JS_PATH = os.path.join(ROOT, "data", "draws.js")


def fetch_block(n, tries=4):
    """ n회차를 기준으로 앞뒤 10회차 묶음을 가져온다. """
    for t in range(tries):
        try:
            req = urllib.request.Request(BASE.format(n), headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.loads(r.read().decode("utf-8"))
            return (data.get("data") or {}).get("list") or []
        except Exception as e:  # noqa: BLE001
            print("  재시도 %s (%s)" % (n, e))
            time.sleep(1.5 * (t + 1))
    return []


def normalize(item):
    nums = sorted(int(item["tm%dWnNo" % i]) for i in range(1, 7))
    if len(set(nums)) != 6 or not all(1 <= x <= 45 for x in nums):
        raise ValueError("잘못된 번호: %s" % item)
    return {
        "r": int(item["ltEpsd"]),
        "d": datetime.datetime.strptime(item["ltRflYmd"], "%Y%m%d").strftime("%Y-%m-%d"),
        "n": nums,
        "b": int(item["bnsWnNo"]),
        "w": [int(item.get("rnk%dWnNope" % i) or 0) for i in range(1, 6)],
        "a": [int(item.get("rnk%dWnAmt" % i) or 0) for i in range(1, 6)],
        "s": int(item.get("wholEpsdSumNtslAmt") or 0),
    }


def collect_full():
    rounds = {}
    for n in range(1250, 0, -10):
        block = fetch_block(n)
        for it in block:
            rounds[int(it["ltEpsd"])] = normalize(it)
        print("  %d회차까지 확인 (누적 %d회)" % (n, len(rounds)), flush=True)
        time.sleep(0.15)
    if 1 not in rounds:
        for it in fetch_block(1):
            rounds[int(it["ltEpsd"])] = normalize(it)
    return rounds


def collect_new(last_round):
    rounds = {}
    probe = last_round + 10
    empty_streak = 0
    while empty_streak < 2:
        block = fetch_block(probe)
        new = [normalize(it) for it in block if int(it["ltEpsd"]) > last_round]
        for it in new:
            rounds[it["r"]] = it
        if new:
            empty_streak = 0
            probe = max(rounds) + 10
        else:
            empty_streak += 1
            probe += 10
        time.sleep(0.2)
        if probe - last_round > 60:
            break
    return rounds


def write(payload):
    payload["draws"].sort(key=lambda d: d["r"])
    draws = payload["draws"]
    meta = payload["meta"]
    meta.update({
        "collectedAt": datetime.date.today().isoformat(),
        "fromRound": draws[0]["r"],
        "toRound": draws[-1]["r"],
        "count": len(draws),
        "latestDate": draws[-1]["d"],
    })
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write("/* 동행복권 공식 데이터 사본 (file:// 로 열 때 사용하는 대체 로더용) */\n")
        f.write("window.LOTTO_DATA = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("저장 완료: %d회 ~ %d회 (%d회), 최신 추첨일 %s"
          % (meta["fromRound"], meta["toRound"], meta["count"], meta["latestDate"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="1회부터 전체 재수집")
    args = ap.parse_args()

    if args.full or not os.path.exists(JSON_PATH):
        print("전체 회차를 수집합니다...")
        rounds = collect_full()
        payload = {
            "meta": {
                "source": "동행복권 공식 홈페이지(dhlottery.co.kr)",
                "endpoint": "https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do",
                "collectedAt": datetime.date.today().isoformat(),
                "fromRound": 0, "toRound": 0, "count": 0, "latestDate": "",
                "fields": {
                    "r": "회차", "d": "추첨일", "n": "당첨번호 6개(오름차순)", "b": "보너스번호",
                    "w": "1~5등 당첨자 수", "a": "1~5등 1인당 당첨금(원)", "s": "해당 회차 판매액(원)",
                },
            },
            "draws": list(rounds.values()),
        }
        if not payload["draws"]:
            print("수집된 회차가 없습니다. 아무것도 쓰지 않습니다.")
            return 2
        write(payload)
        return 0

    with open(JSON_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    last = max(d["r"] for d in payload["draws"])
    before = len(payload["draws"])
    print("기존 최신 회차: %d회. 새 회차를 확인합니다..." % last)
    new = collect_new(last)
    if not new:
        print("새 회차가 없습니다. 이미 최신 상태이므로 파일을 건드리지 않습니다.")
        return 0
    existing = {d["r"]: d for d in payload["draws"]}
    existing.update(new)
    payload["draws"] = list(existing.values())
    if len(payload["draws"]) < before:
        print("수집 결과가 기존보다 적습니다(%d < %d). 쓰지 않고 멈춥니다."
              % (len(payload["draws"]), before))
        return 2
    print("새 회차 %d개 추가: %s" % (len(new), sorted(new)))
    write(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
