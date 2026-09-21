"""Best-effort Claude API guess at what a binary target column's raw values
mean (e.g. HeartDisease 1/0 -> "심장질환 있음"/"심장질환 없음"). Feeds straight
into export_report_json's existing positive_label/negative_label params, so
the guess pre-fills the same inline editor PR #77 already built (localStorage
override in web/lib/valueLabels.ts) - it's never treated as ground truth, and
a user edit still wins over it exactly like it wins over the "Column=raw"
fallback today.

Skipped without ever calling the API when:
- the raw values already read as words (Yes/No, male/female, ...) - only a
  bare numeric code like "1"/"0" is actually unclear enough to be worth a
  guess, which also keeps this from firing on every preset-shaped upload.
- ANTHROPIC_API_KEY isn't set (e.g. local dev, CI) - manual labeling still
  works exactly as before.
- the call itself fails for any reason (network, rate limit, bad output) -
  a suggestion is a nice-to-have, never a reason to fail the whole report.
"""
import os

import anthropic

MODEL = "claude-haiku-4-5"
MAX_CONTEXT_COLUMNS = 30

_cache: dict = {}
_client = None


def _client_or_none():
    global _client
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def _looks_numeric(raw) -> bool:
    try:
        float(raw)
        return True
    except (TypeError, ValueError):
        return False


def suggest_value_labels(target_column, positive_raw, negative_raw, other_columns):
    """(positive_label, negative_label) in Korean, or None if no suggestion
    is available. Cached in-process per (target_column, positive_raw,
    negative_raw) so re-analyzing the same target column doesn't re-spend."""
    if not (_looks_numeric(positive_raw) and _looks_numeric(negative_raw)):
        return None

    key = (target_column, str(positive_raw), str(negative_raw))
    if key in _cache:
        return _cache[key]

    client = _client_or_none()
    if client is None:
        return None

    other = ", ".join(list(other_columns)[:MAX_CONTEXT_COLUMNS])
    prompt = (
        f"이진분류 데이터셋의 타겟 컬럼명은 '{target_column}'이고, "
        f"양성 값은 '{positive_raw}', 음성 값은 '{negative_raw}'이에요. "
        f"참고용 다른 컬럼명: {other or '없음'}. "
        "각 값이 무슨 의미인지 아주 짧은 한국어 명사구로 추측해줘 "
        "(예: '생존', '이탈', '심장질환 있음'). "
        "다른 설명 없이 정확히 아래 두 줄만 출력해:\n"
        "양성: <추측>\n음성: <추측>"
    )

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if b.type == "text")
        pos_label = neg_label = None
        for line in text.splitlines():
            if line.startswith("양성:"):
                pos_label = line.split(":", 1)[1].strip()
            elif line.startswith("음성:"):
                neg_label = line.split(":", 1)[1].strip()
        if not pos_label or not neg_label:
            return None
        result = (pos_label, neg_label)
    except Exception:
        return None

    _cache[key] = result
    return result


def _demo():
    # word-like raw values never touch the network - nothing to guess
    assert suggest_value_labels("Churn", "Yes", "No", ["gender"]) is None
    assert not _looks_numeric("Yes") and not _looks_numeric(None)
    assert _looks_numeric("1") and _looks_numeric(0)
    print("label_suggest._demo: ok")


if __name__ == "__main__":
    _demo()
