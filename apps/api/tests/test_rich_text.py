"""UX-03: imported job descriptions keep their structure (paragraphs, headings,
bullet lists) as plain text, instead of one flattened 4,000-character line."""

from app.domains.jobs.aggregators.base import BaseAggregator

clean = BaseAggregator.clean_rich_text


def test_html_blocks_become_lines_and_lists_become_bullets():
    src = (
        "<p>We build tools.</p><h3>THE ROLE</h3><p>You will:</p>"
        "<ul><li>Design <b>APIs</b></li><li>Ship &amp; support</li></ul><br>Apply today!"
    )
    assert clean(src) == "We build tools.\n\nTHE ROLE\n\nYou will:\n\n- Design APIs\n- Ship & support\n\nApply today!"


def test_plain_text_sources_keep_their_line_breaks():
    assert clean("Line one\r\n\r\n\r\nLine   two\n- a\n- b") == "Line one\n\nLine two\n- a\n- b"


def test_no_markup_survives_and_scripts_are_dropped():
    out = clean('<div onclick="x()">Hi<script>alert(1)</script><style>p{}</style> there</div>')
    assert out == "Hi there"
    # Escaped text stays text (the UI renders it as characters, never markup).
    assert clean("<p>a &lt;b&gt; c</p>") == "a <b> c"


def test_mojibake_and_entities_are_repaired():
    assert clean("<p>CafÃ© &eacute;quipe</p>") == "Café équipe"


def test_empty():
    assert clean(None) == "" and clean("   ") == ""
