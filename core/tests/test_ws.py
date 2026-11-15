import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import login

API = "/api/v1"


def test_websocket_requires_valid_token(client):
    for url in ("/ws/v1/events", "/ws/v1/events?token=zly"):
        with client.websocket_connect(url) as websocket:
            with pytest.raises(WebSocketDisconnect) as closed:
                websocket.receive_json()
        assert closed.value.code == 4401


def test_unknown_channel_is_rejected(client):
    with client.websocket_connect(f"/ws/v1/nieznany?token={login(client)}") as websocket:
        with pytest.raises(WebSocketDisconnect) as closed:
            websocket.receive_json()
    assert closed.value.code == 4404


def test_events_channel_receives_created_event(client, admin):
    with client.websocket_connect(f"/ws/v1/events?token={login(client)}") as websocket:
        assert websocket.receive_json()["type"] == "connected"
        created = client.post(
            f"{API}/events",
            json={"category": "restart", "title": "Restart urządzenia", "source": "Router"},
            headers=admin,
        ).json()
        message = websocket.receive_json()
    assert message["type"] == "event.created" and message["timestamp"].endswith("Z")
    assert message["data"] == created


def test_alarm_and_arming_changes_are_broadcast(client, admin, viewer):
    # Token API tylko do odczytu również może słuchać kanałów.
    viewer_token = viewer["Authorization"].removeprefix("Bearer ")
    with (
        client.websocket_connect(f"/ws/v1/alarms?token={viewer_token}") as alarms,
        client.websocket_connect(f"/ws/v1/events?token={viewer_token}") as events,
    ):
        alarms.receive_json(), events.receive_json()
        alarm = client.post(
            f"{API}/alarms",
            json={
                "title": "Zalanie",
                "severity": "critical",
                "source": {"type": "sensor", "name": "Łazienka"},
            },
            headers=admin,
        ).json()
        created = alarms.receive_json()
        assert created["type"] == "alarm.created" and created["data"] == alarm
        assert events.receive_json()["data"]["category"] == "alarm"

        client.post(f"{API}/alarms/{alarm['id']}/acknowledge", headers=admin)
        updated = alarms.receive_json()
        assert updated["type"] == "alarm.updated" and updated["data"]["status"] == "acknowledged"

        client.put(f"{API}/alarms/arming", json={"mode": "armed_home"}, headers=admin)
        arming = alarms.receive_json()
        assert arming["type"] == "arming.changed" and arming["data"]["mode"] == "armed_home"


def test_camera_and_sensor_updates_reach_their_channels(client, admin):
    token = login(client)
    camera = client.post(f"{API}/cameras", json={"name": "Kamera", "streamName": "k1"}, headers=admin).json()
    sensor = client.post(f"{API}/sensors", json={"name": "Dym", "type": "smoke"}, headers=admin).json()
    with (
        client.websocket_connect(f"/ws/v1/cameras?token={token}") as cameras,
        client.websocket_connect(f"/ws/v1/alarms?token={token}") as alarms,
        client.websocket_connect(f"/ws/v1/system?token={token}") as system,
    ):
        cameras.receive_json(), alarms.receive_json(), system.receive_json()

        client.patch(f"{API}/cameras/{camera['id']}", json={"status": "online"}, headers=admin)
        message = cameras.receive_json()
        assert message["type"] == "camera.updated" and message["data"]["status"] == "online"

        client.post(f"{API}/sensors/{sensor['id']}/reading", json={"state": "triggered"}, headers=admin)
        assert [alarms.receive_json()["type"] for _ in range(2)] == ["sensor.updated", "alarm.created"]

        client.post(f"{API}/network/devices", json={"name": "Switch", "ipAddress": "10.0.0.2"}, headers=admin)
        assert system.receive_json()["type"] == "network.created"


def test_failed_request_publishes_nothing(client, admin):
    client.post(f"{API}/cameras", json={"name": "A", "streamName": "dup"}, headers=admin)
    with client.websocket_connect(f"/ws/v1/cameras?token={login(client)}") as cameras:
        cameras.receive_json()
        assert (
            client.post(f"{API}/cameras", json={"name": "B", "streamName": "dup"}, headers=admin).status_code
            == 409
        )
        client.post(f"{API}/cameras", json={"name": "C", "streamName": "ok"}, headers=admin)
        # Pierwszy komunikat dotyczy kamery C – odrzucone żądanie niczego nie rozgłosiło.
        assert cameras.receive_json()["data"]["name"] == "C"
