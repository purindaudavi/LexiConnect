from datetime import datetime

from app.modules.availability.service import _generate_sequential_slots_for_window


def _dt(value: str):
    return datetime.fromisoformat(value)


def test_sequential_slot_after_chain_duration_15():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [
        (_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30")),
        (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T09:45:00+05:30")),
    ]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 15, 15)
    assert slots[0] == (_dt("2026-01-30T09:45:00+05:30"), _dt("2026-01-30T10:00:00+05:30"))


def test_sequential_slot_after_chain_duration_45():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [
        (_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30")),
        (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T09:45:00+05:30")),
    ]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 45, 15)
    assert slots[0] == (_dt("2026-01-30T09:45:00+05:30"), _dt("2026-01-30T10:30:00+05:30"))


def test_sequential_slot_no_bookings_returns_window_start():
    window_start = _dt("2026-01-31T09:00:00+05:30")
    window_end = _dt("2026-01-31T11:00:00+05:30")
    slots = _generate_sequential_slots_for_window(window_start, window_end, [], 15, 15)
    assert slots[0] == (_dt("2026-01-31T09:00:00+05:30"), _dt("2026-01-31T09:15:00+05:30"))
