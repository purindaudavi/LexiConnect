from datetime import datetime, timezone

from app.modules.availability.service import _subtract_intervals, _get_timezone, _generate_sequential_slots_for_window


def _dt(value: str):
    return datetime.fromisoformat(value)


def test_subtract_intervals_no_overlap():
    avail = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T11:00:00+05:30"))]
    busy = [(_dt("2026-01-30T12:00:00+05:30"), _dt("2026-01-30T12:30:00+05:30"))]
    result = _subtract_intervals(avail, busy)
    assert result == avail


def test_subtract_intervals_partial_overlap():
    avail = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T11:00:00+05:30"))]
    busy = [(_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T10:00:00+05:30"))]
    result = _subtract_intervals(avail, busy)
    assert result == [
        (_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30")),
        (_dt("2026-01-30T10:00:00+05:30"), _dt("2026-01-30T11:00:00+05:30")),
    ]


def test_subtract_intervals_touching_boundary():
    avail = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T11:00:00+05:30"))]
    busy = [(_dt("2026-01-30T11:00:00+05:30"), _dt("2026-01-30T11:30:00+05:30"))]
    result = _subtract_intervals(avail, busy)
    assert result == avail


def test_subtract_intervals_multiple_busy():
    avail = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T12:00:00+05:30"))]
    busy = [
        (_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30")),
        (_dt("2026-01-30T10:00:00+05:30"), _dt("2026-01-30T10:30:00+05:30")),
        (_dt("2026-01-30T11:30:00+05:30"), _dt("2026-01-30T12:00:00+05:30")),
    ]
    result = _subtract_intervals(avail, busy)
    assert result == [
        (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T10:00:00+05:30")),
        (_dt("2026-01-30T10:30:00+05:30"), _dt("2026-01-30T11:30:00+05:30")),
    ]


def test_get_timezone_fallback_to_utc():
    tz = _get_timezone("Invalid/Timezone")
    assert tz == timezone.utc


def test_next_slot_after_first_booking_15_min():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30"))]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 15, 15)
    assert slots[0] == (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T09:45:00+05:30"))


def test_next_slot_after_first_booking_30_min():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30"))]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 30, 15)
    assert slots[0] == (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T10:00:00+05:30"))


def test_next_slot_after_long_booking_30_min():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T10:30:00+05:30"))]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 30, 15)
    assert slots[0] == (_dt("2026-01-30T10:30:00+05:30"), _dt("2026-01-30T11:00:00+05:30"))


def test_next_slot_empty_busy_starts_at_window_start():
    window_start = _dt("2026-02-02T09:00:00+05:30")
    window_end = _dt("2026-02-02T11:00:00+05:30")
    slots = _generate_sequential_slots_for_window(window_start, window_end, [], 15, 15)
    assert slots[0] == (_dt("2026-02-02T09:00:00+05:30"), _dt("2026-02-02T09:15:00+05:30"))


def test_gap_after_start_does_not_shift_earliest():
    window_start = _dt("2026-02-03T09:00:00+05:30")
    window_end = _dt("2026-02-03T11:00:00+05:30")
    busy = [(_dt("2026-02-03T10:00:00+05:30"), _dt("2026-02-03T10:30:00+05:30"))]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 15, 15)
    assert slots[0] == (_dt("2026-02-03T09:00:00+05:30"), _dt("2026-02-03T09:15:00+05:30"))


def test_chain_at_day_start_shifts_earliest():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [
        (_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30")),
        (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T09:45:00+05:30")),
    ]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 15, 15)
    assert slots[0] == (_dt("2026-01-30T09:45:00+05:30"), _dt("2026-01-30T10:00:00+05:30"))


def test_blocking_booking_removes_overlapping_slots():
    window_start = _dt("2026-01-30T09:00:00+05:30")
    window_end = _dt("2026-01-30T11:00:00+05:30")
    busy = [(_dt("2026-01-30T09:00:00+05:30"), _dt("2026-01-30T09:30:00+05:30"))]
    slots = _generate_sequential_slots_for_window(window_start, window_end, busy, 30, 15)
    # 09:00 and 09:15 are blocked; first slot should be 09:30
    assert slots[0] == (_dt("2026-01-30T09:30:00+05:30"), _dt("2026-01-30T10:00:00+05:30"))
