from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_root_describes_api_only_service() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["service"] == "StudyStudio Local Search Service"


def test_production_origin_can_request_private_network_access() -> None:
    response = client.options(
        "/api/web/search",
        headers={
            "Origin": "https://mengstudystudio.cn",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
            "Access-Control-Request-Private-Network": "true",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://mengstudystudio.cn"
    assert response.headers["access-control-allow-private-network"] == "true"


def test_unknown_browser_origin_is_rejected() -> None:
    response = client.get("/api/health", headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
