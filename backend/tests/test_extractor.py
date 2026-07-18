from __future__ import annotations

from app.extractor import _extract_images, _extract_static


def test_extract_static_html_to_markdown():
    body = b"""
    <html><head><title>Example title</title></head>
    <body><main><article><h1>Heading</h1><p>This is a sufficiently useful article body for extraction.</p></article></main></body></html>
    """
    title, content, images = _extract_static(body, "https://example.com/post", "text/html")
    assert title == "Example title"
    assert "Heading" in content
    assert "useful article body" in content
    assert images == []


def test_extract_images_normalizes_relative_urls():
    source = '<img src="/cover.png"><img src="https://cdn.example.com/a.jpg">'
    assert _extract_images(source, "https://example.com/post") == [
        "https://example.com/cover.png",
        "https://cdn.example.com/a.jpg",
    ]
