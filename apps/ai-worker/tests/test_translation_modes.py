from vocalis_worker.translation.modes import apply_translation_mode


def test_literal_mode_is_unchanged() -> None:
    assert apply_translation_mode("hello world", "literal") == "hello world"


def test_natural_mode_capitalizes() -> None:
    assert apply_translation_mode("hello world", "natural") == "Hello world"


def test_singable_mode_trims_fillers() -> None:
    out = apply_translation_mode("just hold on to the night", "singable", source_text="stay")
    assert "just" not in out.lower().split()
