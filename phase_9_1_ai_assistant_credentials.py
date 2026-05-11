#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
phase_9_1_ai_assistant_credentials.py — Phase 9.1
데스크탑 AI 비서 (ai_assistant.js) 의 fetch 호출에 credentials:"include" 추가.

문제:
  - PC 솔비 AI 비서 패널이 wake-word ("솔비야일하자") 후 다음 요청에 무한 "..." 대기.
  - chatStream() 의 /api/llm/chat/stream 및 fallback /api/llm/chat 호출이
    `credentials: "include"` 없이 fetch 됨.
  - wake-word 가 set 한 solbi_token 쿠키가 다음 요청에 안 따라가서
    cross-origin (GitHub Pages → Cloudtype) 환경에서 인증 실패.
  - IP 화이트리스트가 백업으로 있긴 하지만 프록시/CDN 통과 시 IP 가 바뀔 수 있음.

수정:
  Edit 1: chatStream 의 /api/llm/chat/stream fetch 에 credentials:"include" 추가
  Edit 2: chatStream 의 /api/llm/chat fallback fetch 에도 추가

⚠️ 사용 위치: scenergy-pathfinder repo (GitHub Pages)
  cd C:\\projects\\scenergy-pathfinder
  Copy-Item -Force C:\\kepco-rpa-api\\solar-server-staging\\scripts\\phase_9_1_ai_assistant_credentials.py .
  python phase_9_1_ai_assistant_credentials.py --check
  python phase_9_1_ai_assistant_credentials.py
"""

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
JS = ROOT / "ai_assistant.js"

MARKER_ALREADY = "Phase 9.1: credentials include"


# ============================================================================
# Edit 1: SSE streaming fetch
# ============================================================================
ANCHOR_1 = '''    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({
        message,
        history: state.history.slice(0, -1).slice(-MAX_HISTORY),
      }),
      signal: ctrl.signal,
    });'''

REPLACE_1 = '''    // Phase 9.1: credentials include — wake-word solbi_token 쿠키 전달 위해
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({
        message,
        history: state.history.slice(0, -1).slice(-MAX_HISTORY),
      }),
      signal: ctrl.signal,
      credentials: "include",
    });'''


# ============================================================================
# Edit 2: non-streaming fallback fetch
# ============================================================================
ANCHOR_2 = '''      const j = await fetch(API_BASE + "/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: state.history.slice(0, -1).slice(-MAX_HISTORY) }),
      }).then((r) => r.json());'''

REPLACE_2 = '''      // Phase 9.1: credentials include — fallback 도 동일하게 쿠키 전달
      const j = await fetch(API_BASE + "/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: state.history.slice(0, -1).slice(-MAX_HISTORY) }),
        credentials: "include",
      }).then((r) => r.json());'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not JS.exists():
        print(f"ERROR: {JS} 없음 — C:\\projects\\scenergy-pathfinder 에서 실행하세요")
        sys.exit(1)

    text = JS.read_text(encoding="utf-8")

    if MARKER_ALREADY in text:
        print(f"이미 적용됨 (marker '{MARKER_ALREADY}'). 종료.")
        sys.exit(0)

    edits = [
        ("Edit 1: SSE streaming fetch credentials", ANCHOR_1, REPLACE_1),
        ("Edit 2: non-streaming fallback fetch credentials", ANCHOR_2, REPLACE_2),
    ]

    missing = [n for n, a, _ in edits if a not in text]
    if missing:
        print("ERROR: anchor 누락:")
        for m in missing:
            print(f"  - {m}")
        sys.exit(2)

    if args.check:
        print("--check OK: anchor 2개 발견. 적용 시:")
        for n, _a, _ in edits:
            print(f"  ✓ {n}")
        sys.exit(0)

    bak = JS.with_suffix(".js.bak.before_phase_9_1")
    shutil.copy2(JS, bak)
    print(f"backup: {bak}")

    for name, anchor, new_text in edits:
        text = text.replace(anchor, new_text, 1)
        print(f"  applied: {name}")

    JS.write_text(text, encoding="utf-8")
    print(f"✅ Phase 9.1 적용 완료 ({JS})")


if __name__ == "__main__":
    main()
