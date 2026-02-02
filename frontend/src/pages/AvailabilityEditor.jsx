import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './availability-ui.css';
import WeeksStepper from '../components/WeeksStepper';

const steps = ['Day', 'Time', 'Location', 'Repeat', 'Review'];
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayPayload = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

const TimeField = ({ label, value, onChange, error }) => (
  <div className="time-field modern">
    <label className="time-label">{label}</label>
    <div className={`time-input-shell ${error ? 'has-error' : ''}`}>
      <svg
        className="time-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <input type="time" value={value} onChange={onChange} />
    </div>
    {error && <p className="field-error">{error}</p>}
  </div>
);

const AvailabilityEditor = () => {
  const navigate = useNavigate();
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    days: [],
    startTime: '',
    endTime: '',
    branchId: '',
    weeks: 4,
    repeatMode: 'weeks',
  });
  const [untilDate, setUntilDate] = useState('');
  const todayISO = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
  }, []);

  const weeksLimitISO = useMemo(() => {
    const weeksCount = Math.min(Math.max(parseInt(wizardData.weeks, 10) || 1, 1), 52);
    const start = new Date();
    const startUtc = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    const end = new Date(startUtc);
    end.setUTCDate(end.getUTCDate() + weeksCount * 7 - 1);
    return end.toISOString().slice(0, 10);
  }, [wizardData.weeks]);

  const openDatePicker = () => {
    if (endDateRef.current) {
      endDateRef.current.showPicker?.();
      endDateRef.current.focus();
    }
  };

  const [branches, setBranches] = useState([]);
  const [errors, setErrors] = useState({});
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [availabilities, setAvailabilities] = useState([]);
  const [blackouts, setBlackouts] = useState([]);
  const [loadingAvailabilities, setLoadingAvailabilities] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [cancelingSlotId, setCancelingSlotId] = useState(null);
  const [cancelledSlotKeys, setCancelledSlotKeys] = useState(() => new Set());
  const [cancelMessage, setCancelMessage] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  });
  const endDateRef = useRef(null);
  const defaultWizardData = {
    days: [],
    startTime: '',
    endTime: '',
    branchId: '',
    weeks: 4,
    repeatMode: 'weeks',
  };
  const [wizardDefaults] = useState(defaultWizardData);

  const getStoredToken = () =>
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  const withAuthConfig = (config = {}, onMissing) => {
    const token = getStoredToken();
    if (!token) {
      onMissing?.('Please login again');
      return null;
    }
    return {
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    };
  };

  const handleAuthFailure = (err, onAuthFail) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('token');
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('token');
      onAuthFail?.('Session expired');
      try {
        if (window?.location?.pathname !== '/login') {
          window.location.assign('/login');
        }
      } catch (_) {
        /* noop */
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    const fetchCurrentUserId = async () => {
      const authConfig = withAuthConfig();
      if (!authConfig) return;
      try {
        const { data } = await api.get('/users/me', authConfig);
        setCurrentUserId(data?.id ?? null);
      } catch (_) {
        setCurrentUserId(null);
      }
    };

    const fetchBranches = async () => {
      try {
        setLoadingBranches(true);
        const url = '/api/branches/me';
        console.log('[availability] fetching branches from', url, 'base', api.defaults.baseURL);
        const { data } = await api.get(url);
        setBranches(data || []);
      } catch (err) {
        const detail =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load branches';
        setErrors((prev) => ({ ...prev, branches: detail }));
        setBranches([]);
      }
      setLoadingBranches(false);
    };
    

    fetchCurrentUserId();
    fetchBranches();
    loadAvailabilityData();
  }, []);

  useEffect(() => {
    if (currentUserId === null) return;
    loadAvailabilityData();
  }, [currentUserId]);

  const loadAvailabilities = async () => {
    const authConfig = withAuthConfig({}, (msg) => setErrors((prev) => ({ ...prev, list: msg })));
    if (!authConfig) {
      setAvailabilities([]);
      return;
    }
    try {
      setLoadingAvailabilities(true);
      const { data } = await api.get('/api/lawyer-availability/weekly', {
        ...authConfig,
        params: {
          ...(authConfig.params || {}),
          ...(currentUserId ? { lawyer_user_id: currentUserId } : {}),
        },
      });
      console.log('[availability] fetched list', data?.length, data);
      const deduped = [];
      const seen = new Set();
      (data || []).forEach((row) => {
        const key =
          row.id ??
          `${row.lawyer_id}|${row.branch_id}|${row.day_of_week}|${row.start_time}|${row.end_time}|${row.location ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(row);
        }
      });
      console.log('[availability] deduped list', deduped.length, deduped);
      setAvailabilities(deduped);
    } catch (err) {
      if (handleAuthFailure(err, (msg) => setErrors((prev) => ({ ...prev, list: msg })))) return;
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load availability.';
      setErrors((prev) => ({ ...prev, list: detail }));
    } finally {
      setLoadingAvailabilities(false);
    }
  };

  const loadBlackouts = async () => {
    const authConfig = withAuthConfig({}, (msg) => setErrors((prev) => ({ ...prev, list: msg })));
    if (!authConfig) {
      setBlackouts([]);
      return;
    }
    try {
      const { data } = await api.get('/api/lawyer-availability/blackouts', {
        ...authConfig,
        params: {
          ...(authConfig.params || {}),
          ...(currentUserId ? { lawyer_user_id: currentUserId } : {}),
        },
      });
      setBlackouts(data || []);
    } catch (err) {
      if (handleAuthFailure(err, (msg) => setErrors((prev) => ({ ...prev, list: msg })))) return;
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load blackout days.';
      setErrors((prev) => ({ ...prev, list: detail }));
      setBlackouts([]);
    }
  };

  const loadAvailabilityData = async () => {
    await Promise.all([loadAvailabilities(), loadBlackouts()]);
  };

  const toggleDay = (day) => {
    setWizardData((prev) => {
      const exists = prev.days.includes(day);
      const days = exists ? prev.days.filter((d) => d !== day) : [...prev.days, day];
      return { ...prev, days };
    });
  };

  const canContinue = () => {
    if (wizardStep === 1) return wizardData.days.length > 0;
    if (wizardStep === 2) return wizardData.startTime && wizardData.endTime;
    if (wizardStep === 3) return wizardData.branchId !== '' && wizardData.branchId !== undefined && branches.length > 0;
    const needsEndDate = wizardData.repeatMode === 'until';
    if (wizardStep === 4 || wizardStep === 5) {
      return needsEndDate ? Boolean(untilDate) : wizardData.weeks > 0;
    }
    return true;
  };

  const nextStep = () => {
    if (!canContinue()) return;
    setWizardStep((s) => Math.min(5, s + 1));
  };

  const prevStep = () => setWizardStep((s) => Math.max(1, s - 1));

  const cancelAndBack = () => {
    setWizardStep(1);
    setWizardData({ ...wizardDefaults });
    // Snap to top to avoid any prior scroll positions
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const formatTimeToSeconds = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  };

  const saveAvailability = async () => {
    setSaveMessage('');
    setErrors((prev) => ({ ...prev, save: null }));

    if (wizardData.repeatMode === 'until' && !untilDate) {
      setErrors((prev) => ({ ...prev, save: 'Please select an end date' }));
      return;
    }

    if (!wizardData.branchId || wizardData.days.length === 0) {
      setErrors((prev) => ({ ...prev, save: 'Select at least one day and a branch before saving.' }));
      return;
    }

    const authConfig = withAuthConfig({}, (msg) => setErrors((prev) => ({ ...prev, save: msg })));
    if (!authConfig) return;

    const payloads = wizardData.days.map((day) => ({
      day_of_week: weekdayPayload[day] || day.toLowerCase(),
      start_time: formatTimeToSeconds(wizardData.startTime),
      end_time: formatTimeToSeconds(wizardData.endTime),
      branch_id: wizardData.branchId,
      max_bookings: 1,
      is_active: true,
    }));

    console.log('[availability] saving payloads', payloads);

    try {
      setSaving(true);
      for (const body of payloads) {
        const res = await api.post('/api/lawyer-availability/weekly', body, {
          ...authConfig,
          params: {
            ...(authConfig.params || {}),
            ...(currentUserId ? { lawyer_user_id: currentUserId } : {}),
          },
        });
        console.log('[availability] save success', res.status, res.data);
      }
      setSaveMessage('Availability saved successfully.');
      await loadAvailabilityData();
      setWizardStep(1);
      setWizardData({ ...wizardDefaults });
    } catch (err) {
      if (handleAuthFailure(err, (msg) => setErrors((prev) => ({ ...prev, save: msg })))) return;
      const status = err?.response?.status;
      const errorDetail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save availability.';
      console.error('[availability] save error', {
        url: err?.config?.url,
        status,
        detail: errorDetail,
        data: err?.config?.data,
      });
      setErrors((prev) => ({ ...prev, save: status ? `${status}: ${errorDetail}` : errorDetail }));
    } finally {
      setSaving(false);
    }
  };

  const slotKey = (slot, date) => {
    const idPart =
      slot?.id != null
        ? slot.id
        : `${slot?.branch_id ?? 'branchless'}-${slot?.start_time ?? slot?.startLabel ?? ''}-${slot?.end_time ?? slot?.endLabel ?? ''}`;
    return `${date || slot?.date || 'unknown'}|${idPart}`;
  };

  const cancelSlot = async (slot) => {
    const dateToCancel = slot?.date || selectedDate;
    if (!dateToCancel || !slot) {
      setCancelError('Select a slot to cancel.');
      return;
    }

    const key = slotKey(slot, dateToCancel);
    const startLabel = slot.startLabel || (slot.start_time || '').slice(0, 5) || '--:--';
    const endLabel = slot.endLabel || (slot.end_time || '').slice(0, 5) || '--:--';

    setCancelMessage('');
    setCancelError('');

    const authConfig = withAuthConfig({}, (msg) => setCancelError(msg));
    if (!authConfig) return;

    const payload = {
      date: dateToCancel,
      reason: 'Cancelled via dashboard',
    };

    try {
      setCancelingSlotId(slot.id ?? key);
      await api.post('/api/lawyer-availability/blackouts', payload, {
        ...authConfig,
        params: {
          ...(authConfig.params || {}),
          ...(currentUserId ? { lawyer_user_id: currentUserId } : {}),
        },
      });
      setCancelMessage(`Availability on ${dateToCancel} ${startLabel}–${endLabel} cancelled.`);
      setCancelledSlotKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setSelectedSlot(null);
    } catch (err) {
      if (handleAuthFailure(err, (msg) => setCancelError(msg))) return;
      if (err?.response?.status === 400) {
        // Slot already cancelled - remove it from display
        setCancelledSlotKeys((prev) => {
          const next = new Set(prev);
          next.add(key);
          return next;
        });
        setSelectedSlot(null);
        setCancelMessage('This slot is already cancelled.');
        return;
      }
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to cancel availability.';
      setCancelError(detail);
    } finally {
      setCancelingSlotId(null);
    }
  };

  const renderStepContent = () => {
    if (wizardStep === 1) {
      return (
        <>
          <h2 className="card-title">Which day are you available?</h2>
          <p className="card-subtitle">Choose one or more weekdays for this availability.</p>
          <div className="day-row">
            {weekdayLabels.map((day) => (
              <button
                key={day}
                type="button"
                className={`day-pill ${wizardData.days.includes(day) ? 'active' : ''}`}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
        </>
      );
    }

    if (wizardStep === 2) {
      return (
        <div className="time-step">
          <div className="time-step-head">
            <h2 className="time-step-title">What time are you available?</h2>
            <p className="time-step-subtitle">Clients will book appointments within this time range</p>
          </div>
          <div className="time-row modern-grid">
            <TimeField
              label="Start time"
              value={wizardData.startTime}
              onChange={(e) => setWizardData((p) => ({ ...p, startTime: e.target.value }))}
            />
            <TimeField
              label="End time"
              value={wizardData.endTime}
              onChange={(e) => setWizardData((p) => ({ ...p, endTime: e.target.value }))}
            />
          </div>
          {(errors.save || saveMessage) && (
            <div className={`inline-feedback ${errors.save ? 'error' : 'success'}`}>
              {errors.save || saveMessage}
            </div>
          )}
        </div>
      );
    }

    if (wizardStep === 3) {
      const options = branches;
      return (
        <>
          <h2 className="card-title">Choose a location</h2>
          <p className="card-subtitle">Pick where this availability applies.</p>
          <div className="location-row">
            {options.map((branch) => (
              <button
                key={branch.id ?? 'online'}
                type="button"
                className={`location-pill ${wizardData.branchId === branch.id ? 'active' : ''}`}
                onClick={() => setWizardData((p) => ({ ...p, branchId: branch.id != null ? Number(branch.id) : null }))}
              >
                <span className="location-name">{branch.name}</span>
                <span className="location-desc">
                  {[branch.address, branch.city, branch.district].filter(Boolean).join(', ') || '—'}
                </span>
              </button>
            ))}
            {loadingBranches && (
              <div className="location-empty">Loading branches...</div>
            )}
            {!loadingBranches && branches.length === 0 && (
              <div className="location-empty">
                No branches yet. Create a branch to set availability.
                <div className="location-actions">
                  <button
                    className="cta-btn small"
                    type="button"
                    onClick={() => navigate('/lawyer/branches')}
                  >
                    Create Branch
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      );
    }

    if (wizardStep === 4) {
      return (
        <div className="repeat-step">
          <div className="repeat-step-head">
            <h2 className="repeat-step-title">How often should this repeat?</h2>
            <p className="repeat-step-subtitle">Choose how long this recurring availability should continue.</p>
          </div>

          <div className="repeat-options-stack">
            <label className={`repeat-option-card ${wizardData.repeatMode === 'weeks' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="repeat"
                checked={wizardData.repeatMode === 'weeks'}
                onChange={() => setWizardData((p) => ({ ...p, repeatMode: 'weeks' }))}
              />
              <div className="repeat-option-main">
                <div className="repeat-radio" aria-hidden>
                  <div className="radio-dot" />
                </div>
                <div className="repeat-option-copy">
                  <div className="repeat-option-title">Repeat for a number of weeks</div>
                  <div className="repeat-option-subtitle">Set a specific number of weeks for this availability.</div>
                </div>
              </div>
              {wizardData.repeatMode === 'weeks' && (
                <div className="repeat-option-extra">
                  <WeeksStepper
                    value={wizardData.weeks}
                    min={1}
                    max={52}
                    onChange={(val) => setWizardData((p) => ({ ...p, weeks: val }))}
                  />
                </div>
              )}
            </label>

            <label className={`repeat-option-card ${wizardData.repeatMode === 'until' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="repeat"
                checked={wizardData.repeatMode === 'until'}
                onChange={() => setWizardData((p) => ({ ...p, repeatMode: 'until' }))}
              />
              <div className="repeat-option-main">
                <div className="repeat-radio" aria-hidden>
                  <div className="radio-dot" />
                </div>
                <div className="repeat-option-copy">
                  <div className="repeat-option-title">Every week until a specific date</div>
                  <div className="repeat-option-subtitle">
                    Set an end date for this recurring availability.
                  </div>
                </div>
              </div>
              {wizardData.repeatMode === 'until' && (
                <div className="repeat-option-extra">
                  <label className="inline-field">
                    <span>End date</span>
                    <div
                      className="date-input-shell"
                      onClick={openDatePicker}
                    >
                      <button
                        type="button"
                        className="date-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDatePicker();
                        }}
                      >
                        <svg
                          className="date-icon"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        >
                          <rect x="3" y="4" width="18" height="18" rx="3" ry="3" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </button>
                      <input
                        ref={endDateRef}
                        type="date"
                        value={untilDate}
                        min={todayISO}
                        onFocus={openDatePicker}
                        onChange={(e) => setUntilDate(e.target.value)}
                      />
                    </div>
                  </label>
                  {!untilDate && <p className="field-error" style={{ margin: '4px 0 0' }}>Please select an end date</p>}
                </div>
              )}
            </label>
          </div>
        </div>
      );
    }

    return (
      <>
        <h2 className="card-title">Review availability</h2>
        <p className="card-subtitle">Confirm before saving.</p>
        <div className="review-box">
          <div className="review-line">
            <strong>Days:</strong> {wizardData.days.join(', ') || '—'}
          </div>
          <div className="review-line">
            <strong>Time:</strong> {wizardData.startTime || '--:--'} – {wizardData.endTime || '--:--'}
          </div>
          <div className="review-line">
            <strong>Location:</strong> {wizardData.branchId === null ? 'Online Consultation' : wizardData.branchId || '—'}
          </div>
          <div className="review-line">
            <strong>Repeat:</strong> {wizardData.repeatMode === 'weeks' ? `${wizardData.weeks} weeks` : 'Until date'}
          </div>
        </div>
      </>
    );
  };

  const dayToIndex = (day) => {
    const map = {
      monday: 0,
      mon: 0,
      tuesday: 1,
      tue: 1,
      wednesday: 2,
      wed: 2,
      thursday: 3,
      thu: 3,
      friday: 4,
      fri: 4,
      saturday: 5,
      sat: 5,
      sunday: 6,
      sun: 6,
    };
    if (typeof day !== 'string') return null;
    return map[day.toLowerCase()] ?? null;
  };

  const parseMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  };

  const daysInMonth = (dateObj) => {
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  };

  const startDayOfMonth = (dateObj) => {
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth();
    return new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sun
  };

  const monthLabel = (dateObj) =>
    dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const blackoutDates = useMemo(() => new Set((blackouts || []).map((b) => b.date)), [blackouts]);

  const monthlyOccurrences = useMemo(() => {
    const totalDays = daysInMonth(viewDate);
    const occurrences = {};
    for (let d = 1; d <= totalDays; d += 1) {
      const current = new Date(Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), d));
      const weekday = current.getUTCDay(); // 0 sun
      const dateKey = current.toISOString().slice(0, 10);
      // Skip past dates - only show from today onwards
      if (dateKey < todayISO) continue;
      if (blackoutDates.has(dateKey)) continue;
      const matches = (availabilities || []).filter((slot) => {
        const dayName = (slot.day_of_week || slot.day || '').toLowerCase();
        // Direct mapping to JS weekday (0=Sun, 6=Sat)
        const dayMap = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
        const expectedWeekday = dayMap[dayName];
        if (expectedWeekday === undefined) return false;
        return expectedWeekday === weekday;
      });
      if (matches.length) {
        const daySlots = [];
        matches.forEach((m) => {
          const occurrence = {
            ...m,
            date: dateKey,
            startLabel: (m.start_time || '').slice(0, 5) || '--:--',
            endLabel: (m.end_time || '').slice(0, 5) || '--:--',
          };
          const occurrenceKey = slotKey(occurrence, dateKey);
          if (!cancelledSlotKeys.has(occurrenceKey)) {
            daySlots.push(occurrence);
          }
        });
        if (daySlots.length) {
          occurrences[dateKey] = daySlots;
        }
      }
    }
    return occurrences;
  }, [availabilities, viewDate, blackoutDates, cancelledSlotKeys, todayISO]);

  const filteredMonthlyOccurrences = useMemo(() => {
    // Always filter from today to the limit date
    const limitDate = wizardData.repeatMode === 'until' && untilDate ? untilDate : weeksLimitISO;
    if (wizardData.repeatMode === 'until' && !untilDate) return {};
    return Object.fromEntries(
      Object.entries(monthlyOccurrences).filter(([dateKey]) => dateKey >= todayISO && dateKey <= limitDate)
    );
  }, [monthlyOccurrences, wizardData.repeatMode, untilDate, weeksLimitISO, todayISO]);

  const getSlotsForDate = (date) => {
    if (!date) return [];
    const slots = filteredMonthlyOccurrences[date] || [];
    return slots.filter((s) => !cancelledSlotKeys.has(slotKey(s, date)));
  };

  useEffect(() => {
    if (!selectedDate) return;
    const slots = getSlotsForDate(selectedDate);
    if (!slots.length) {
      setSelectedSlot(null);
      return;
    }
    const stillExists = selectedSlot && slots.some((s) => s.id === selectedSlot.id);
    if (!stillExists) {
      setSelectedSlot(slots[0]);
    }
  }, [selectedDate, filteredMonthlyOccurrences, selectedSlot]);

  const calendarCells = () => {
    const totalDays = daysInMonth(viewDate);
    const startDay = startDayOfMonth(viewDate); // 0=Sun
    const cells = [];
    for (let i = 0; i < startDay; i += 1) {
      cells.push({ empty: true, key: `empty-${i}` });
    }
    for (let d = 1; d <= totalDays; d += 1) {
      const dateObj = new Date(Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), d));
      const iso = dateObj.toISOString().slice(0, 10);
      cells.push({ empty: false, day: d, iso, slots: filteredMonthlyOccurrences[iso] || [] });
    }
    // pad to full weeks (35 or 42 cells)
    while (cells.length % 7 !== 0) {
      cells.push({ empty: true, key: `pad-${cells.length}` });
    }
    return cells;
  };

  const cells = calendarCells();

  const isToday = (iso) => {
    const now = new Date();
    const todayIso = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
      .toISOString()
      .slice(0, 10);
    return iso === todayIso;
  };

  const handleChipClick = (slot, iso) => {
    setSelectedDate(iso);
    setSelectedSlot(slot);
  };

  const handleDateClick = (iso) => {
    if (selectedDate === iso) {
      setSelectedDate(null);
      setSelectedSlot(null);
      return;
    }
    setSelectedDate(iso);
    setSelectedSlot(null);
  };

  const isUntilModeMissingDate = wizardData.repeatMode === 'until' && !untilDate;

  return (
    <div className="availability-page availability-centered availability-dark">
      <div className="wizard-shell">
        <div className="page-header">
          <h1>Set Your Availability</h1>
          <p>Follow these simple steps to let clients book appointments with you</p>
        </div>

        <div className="wizard-stepper">
          {steps.map((label, idx) => {
            const stepNum = idx + 1;
            const status = wizardStep === stepNum ? 'active' : wizardStep > stepNum ? 'done' : 'idle';
            return (
              <div key={label} className="step-item">
                {idx !== 0 && <span className="step-line" />}
                <div className={`step-circle ${status}`}>{status === 'done' ? '✔' : stepNum}</div>
                <div className="step-label">{label}</div>
              </div>
            );
          })}
        </div>

        <div className="wizard-card main-card">
          {renderStepContent()}
          {wizardStep !== 2 && (errors.save || saveMessage) && (
            <div className={`inline-feedback ${errors.save ? 'error' : 'success'}`}>
              {errors.save || saveMessage}
            </div>
          )}
          <div className="card-actions">
            {wizardStep > 1 && (
              <button className="ghost-btn" type="button" onClick={prevStep}>
                Back
              </button>
            )}
            <div className="spacer" />
            <button
              className="cta-btn"
              type="button"
              disabled={!canContinue() || saving}
              onClick={wizardStep === 5 ? saveAvailability : nextStep}
            >
              {wizardStep === 5 ? (saving ? 'Saving...' : 'Save') : 'Next'}
            </button>
          </div>
        </div>

        <button className="cancel-link" type="button" onClick={cancelAndBack}>
          Cancel and go back
        </button>
      </div>

      <div className="wizard-shell">
        <div className="page-header">
          <h1>Your Scheduled Availability</h1>
          <p>Slots for your account are shown below.</p>
        </div>
        {saveMessage && <div className="inline-feedback success">{saveMessage}</div>}
        {errors.list && <div className="inline-feedback error">{errors.list}</div>}
        {loadingAvailabilities ? (
          <div className="location-empty">Loading availability...</div>
        ) : availabilities.length === 0 ? (
          <div className="location-empty">No availability yet. Add a new slot.</div>
        ) : (
          <div className="month-shell">
            <div className="month-card">
              <div className="month-header">
                <button
                  className="ghost-btn small"
                  type="button"
                  disabled={viewDate.getUTCFullYear() === 2026 && viewDate.getUTCMonth() === 0}
                  onClick={() => {
                    setViewDate((prev) => {
                      const newDate = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1));
                      // Don't go before January 2026
                      if (newDate.getUTCFullYear() < 2026) return prev;
                      return newDate;
                    });
                  }}
                >
                  ←
                </button>
                <div className="month-title">{monthLabel(viewDate)}</div>
                <button
                  className="ghost-btn small"
                  type="button"
                  onClick={() =>
                    setViewDate(
                      (prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1))
                    )
                  }
                >
                  →
                </button>
              </div>
              {isUntilModeMissingDate && (
                <div className="month-hint">Select an end date to preview schedule.</div>
              )}
              <div className="month-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="month-day-head">{d}</div>
                ))}
                {cells.map((cell, idx) => {
                  if (cell.empty) {
                    return <div key={cell.key || `empty-${idx}`} className="month-cell empty" />;
                  }
                  const isSelected = selectedDate === cell.iso;
                  const slots = cell.slots || [];
                  const chipLimit = 3;
                  const extraCount = Math.max(slots.length - chipLimit, 0);
                  return (
                    <div
                      key={cell.iso}
                      className={`month-cell ${isToday(cell.iso) ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleDateClick(cell.iso)}
                    >
                      <div className="month-date">{cell.day}</div>
                      <div className="month-chips">
                        {slots.slice(0, chipLimit).map((s, i) => (
                          <button
                            key={`${cell.iso}-chip-${i}`}
                            type="button"
                            className={`month-chip ${s.is_active ? '' : 'muted'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChipClick(s, cell.iso);
                            }}
                          >
                            {s.startLabel}–{s.endLabel}{s.branch_id ? ` · B${s.branch_id}` : ''}
                          </button>
                        ))}
                        {extraCount > 0 && <div className="month-chip more">+{extraCount} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedDate && getSlotsForDate(selectedDate).length > 0 && (
              <div className="month-popover">
                <div className="popover-head">
                  <div className="popover-title">Availability on {selectedDate}</div>
                  <div className="popover-actions">
                    <button className="ghost-btn small" type="button" onClick={() => { setSelectedDate(null); setSelectedSlot(null); }}>
                      Clear selection
                    </button>
                  </div>
                </div>
                {(cancelError || cancelMessage) && (
                  <div className={`inline-feedback ${cancelError ? 'error' : 'success'}`}>
                    {cancelError || cancelMessage}
                  </div>
                )}
                <div className="popover-list">
                  {getSlotsForDate(selectedDate).map((slot, idx) => {
                    const isSelectedSlot = selectedSlot && selectedSlot.id === slot.id && selectedSlot.date === slot.date;
                    const key = slotKey(slot, selectedDate);
                    const isCanceling = cancelingSlotId === (slot.id ?? key);
                    const isCancelled = cancelledSlotKeys.has(key);
                    return (
                      <div
                        key={`${selectedDate}-slot-${idx}`}
                        className={`popover-slot ${isSelectedSlot ? 'active' : ''}`}
                        onClick={() => handleChipClick(slot, selectedDate)}
                      >
                        <div className="popover-slot-body">
                          <div className="popover-slot-time">
                            {slot.startLabel} – {slot.endLabel}
                            {!slot.is_active && <span className="status-pill">Inactive</span>}
                            {isCancelled && <span className="status-pill">Cancelled</span>}
                          </div>
                          <div className="popover-slot-meta">
                            Branch #{slot.branch_id ?? '—'} · Max {slot.max_bookings ?? 1}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ghost-btn small danger"
                          disabled={isCanceling || isCancelled}
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelSlot(slot);
                          }}
                        >
                          {isCancelled ? 'Cancelled' : isCanceling ? 'Cancelling...' : 'Cancel slot'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailabilityEditor;
