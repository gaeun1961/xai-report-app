"""Unit checks for routers/label_suggest.py's gating and parsing logic.
No network calls: the Gemini client is swapped for a fake, so this runs the
same with or without GEMINI_API_KEY set. Run: python test_label_suggest.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "routers"))
import label_suggest  # noqa: E402


class _FakeModels:
    def __init__(self, text):
        self._text = text

    def generate_content(self, **kwargs):
        return type("R", (), {"text": self._text})()


class _FakeClient:
    def __init__(self, text):
        self.models = _FakeModels(text)


def test_skips_non_numeric_raw_values_without_calling_client():
    # word-like values already read fine — must never reach the network. No
    # fake client installed here on purpose: a real client() call would blow
    # up (no GEMINI_API_KEY in CI) if the gate didn't short-circuit first.
    assert label_suggest.suggest_value_labels("Churn", "Yes", "No", ["gender"]) is None


def test_parses_two_line_response():
    orig = label_suggest._client_or_none
    label_suggest._client_or_none = lambda: _FakeClient(
        "양성: 심장질환 있음\n음성: 심장질환 없음"
    )
    label_suggest._cache.clear()
    try:
        result = label_suggest.suggest_value_labels(
            "HeartDisease", "1", "0", ["Age", "Sex"]
        )
    finally:
        label_suggest._client_or_none = orig
    assert result == ("심장질환 있음", "심장질환 없음"), result


def test_caches_by_target_column_and_raw_values():
    calls = []
    orig = label_suggest._client_or_none

    def fake_client():
        calls.append(1)
        return _FakeClient("양성: a\n음성: b")

    label_suggest._client_or_none = fake_client
    label_suggest._cache.clear()
    try:
        label_suggest.suggest_value_labels("X", "1", "0", [])
        label_suggest.suggest_value_labels("X", "1", "0", [])
    finally:
        label_suggest._client_or_none = orig
    assert len(calls) == 1, "second call with the same key should hit the cache"


def test_malformed_response_yields_no_suggestion():
    orig = label_suggest._client_or_none
    label_suggest._client_or_none = lambda: _FakeClient("모르겠어요")
    label_suggest._cache.clear()
    try:
        result = label_suggest.suggest_value_labels("Y", "1", "0", [])
    finally:
        label_suggest._client_or_none = orig
    assert result is None


def test_no_api_key_yields_no_suggestion_without_raising():
    orig = label_suggest._client_or_none
    label_suggest._client_or_none = lambda: None
    label_suggest._cache.clear()
    try:
        result = label_suggest.suggest_value_labels("Z", "1", "0", [])
    finally:
        label_suggest._client_or_none = orig
    assert result is None


def test_glossary_parses_one_line_per_column():
    orig = label_suggest._client_or_none
    label_suggest._client_or_none = lambda: _FakeClient(
        "Age: 나이\nChestPainType: 흉통 유형"
    )
    label_suggest._glossary_cache.clear()
    try:
        result = label_suggest.suggest_column_glossary(
            ["Age", "ChestPainType"], {"Age": [40, 49], "ChestPainType": ["ATA", "NAP"]}
        )
    finally:
        label_suggest._client_or_none = orig
    assert result == {"Age": "나이", "ChestPainType": "흉통 유형"}, result


def test_glossary_drops_hallucinated_column_names():
    orig = label_suggest._client_or_none
    label_suggest._client_or_none = lambda: _FakeClient(
        "Age: 나이\nNotAColumn: 이건 없는 컬럼이에요"
    )
    label_suggest._glossary_cache.clear()
    try:
        result = label_suggest.suggest_column_glossary(["Age"], {})
    finally:
        label_suggest._client_or_none = orig
    assert result == {"Age": "나이"}, result


def test_glossary_caches_by_column_set_regardless_of_order():
    calls = []
    orig = label_suggest._client_or_none

    def fake_client():
        calls.append(1)
        return _FakeClient("Age: 나이\nSex: 성별")

    label_suggest._client_or_none = fake_client
    label_suggest._glossary_cache.clear()
    try:
        label_suggest.suggest_column_glossary(["Age", "Sex"], {})
        label_suggest.suggest_column_glossary(["Sex", "Age"], {})
    finally:
        label_suggest._client_or_none = orig
    assert len(calls) == 1, "same column set in a different order should hit the cache"


def test_glossary_no_columns_yields_no_suggestion():
    assert label_suggest.suggest_column_glossary([], {}) is None


class _FlakyModels:
    def __init__(self, fail_times, code=503):
        self.calls = []
        self._left = fail_times
        self._code = code

    def generate_content(self, model, contents):
        from google.genai import errors

        self.calls.append(model)
        if self._left > 0:
            self._left -= 1
            raise errors.ServerError(self._code, {"error": {"code": self._code, "message": "busy"}})
        return type("R", (), {"text": "양성: 있음" + chr(10) + "음성: 없음"})()


def _run_with_flaky(fail_times, code=503):
    orig_client, orig_sleep = label_suggest._client_or_none, label_suggest._sleep
    flaky = _FlakyModels(fail_times, code)
    client = type("C", (), {"models": flaky})()
    label_suggest._client_or_none = lambda: client
    label_suggest._sleep = lambda s: None
    label_suggest._cache.clear()
    try:
        result = label_suggest.suggest_value_labels("F", "1", "0", [])
    finally:
        label_suggest._client_or_none, label_suggest._sleep = orig_client, orig_sleep
    return result, flaky.calls


def test_retries_on_503_then_succeeds():
    result, calls = _run_with_flaky(2)
    assert result == ("있음", "없음"), result
    # two 503s on the main model, third (final) attempt goes to the fallback
    assert calls == [label_suggest.MODEL, label_suggest.MODEL, label_suggest.FALLBACK_MODEL], calls


def test_gives_up_after_all_attempts_fail():
    result, calls = _run_with_flaky(99)
    assert result is None and len(calls) == 3, (result, calls)


def test_does_not_retry_non_retryable_errors():
    result, calls = _run_with_flaky(99, code=400)
    assert result is None and len(calls) == 1, (result, calls)


if __name__ == "__main__":
    test_skips_non_numeric_raw_values_without_calling_client()
    test_parses_two_line_response()
    test_caches_by_target_column_and_raw_values()
    test_malformed_response_yields_no_suggestion()
    test_no_api_key_yields_no_suggestion_without_raising()
    test_glossary_parses_one_line_per_column()
    test_glossary_drops_hallucinated_column_names()
    test_glossary_caches_by_column_set_regardless_of_order()
    test_glossary_no_columns_yields_no_suggestion()
    test_retries_on_503_then_succeeds()
    test_gives_up_after_all_attempts_fail()
    test_does_not_retry_non_retryable_errors()
    print("ok")
