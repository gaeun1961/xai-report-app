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
    print("ok")
