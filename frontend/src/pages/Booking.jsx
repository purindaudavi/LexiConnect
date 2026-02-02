import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createBooking,
  getLawyerServicePackages,
} from "../services/bookings";
import { getMyCases, createCase as createCaseApi } from "../features/cases/services/cases.service";
import {
  getChecklistStatus,
  getCaseChecklistAnswers,
  saveCaseChecklistAnswer,
  getRequiredTemplates,
} from "../features/checklist/services/checklist.service";
import api from "../services/api";

const steps = [
  { id: 1, label: "Case" },
  { id: 2, label: "Service" },
  { id: 3, label: "Schedule" },
  { id: 4, label: "Confirm" },
];

const Stepper = ({ currentStep }) => (
  <div className="flex flex-wrap items-center gap-3">
    {steps.map((item, idx) => {
      const isActive = currentStep >= item.id;
      return (
        <div key={item.id} className="flex items-center gap-3">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border ${
              isActive
                ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                : "bg-slate-900 text-slate-400 border-slate-700"
            }`}
          >
            {item.id}
          </div>
          <div className={`text-sm ${isActive ? "text-white" : "text-slate-400"}`}>
            {item.label}
          </div>
          {idx < steps.length - 1 && (
            <div className="h-px w-8 bg-slate-700 hidden sm:block" aria-hidden="true" />
          )}
        </div>
      );
    })}
  </div>
);

const formatRating = (value) => {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return num.toFixed(1);
};

const formatLocation = (city, district) => {
  const parts = [city, district].filter(Boolean);
  return parts.length ? parts.join(", ") : "Location not set";
};

const parseAnswerBool = (value) => {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "yes", "1", "checked", "done"].includes(normalized);
};

const parseMinutes = (value) => {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map((v) => Number(v));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const formatMinutes = (total) => {
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const formatTimeLabel = (value) => {
  if (!value) return "";
  try {
    const [h, m] = value.split(":").map(Number);
    const date = new Date();
    date.setHours(h || 0, m || 0, 0, 0);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
};

const formatDateLabel = (value) => {
  if (!value) return "Date";
  try {
    const date = new Date(value);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
};

const dedupeSlots = (slots, date) => {
  const sorted = [...slots].sort((a, b) => {
    const aTime = new Date(a.start).getTime();
    const bTime = new Date(b.start).getTime();
    return aTime - bTime;
  });
  const map = new Map();
  for (const slot of sorted) {
    const localStart = toLocalTime(slot.start);
    const key = `${slot.branch_id || "none"}-${slot.start}`;
    if (map.has(key)) continue;
    map.set(key, slot);
  }
  return Array.from(map.values());
};

const toLocalTime = (isoValue) => {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const SlotRail = ({
  date,
  slots,
  selectedSlot,
  onSelect,
  enforceNoGaps,
  requiredStartTime,
  durationMinutes,
}) => {
  const railRef = useRef(null);
  const scrollBy = (delta) => {
    if (!railRef.current) return;
    railRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-white font-semibold">{formatDateLabel(date)}</div>
          <div className="text-xs text-slate-400">{slots.length} slot(s)</div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-320)}
            className="h-8 w-8 rounded-full border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            aria-label="Scroll left"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(320)}
            className="h-8 w-8 rounded-full border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      </div>
      {slots.length === 0 ? (
        <div className="text-xs text-slate-400">No slots</div>
      ) : (
        <div
          ref={railRef}
          className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
        >
          {slots.map((slot) => {
            const isSelected =
              selectedSlot &&
              selectedSlot.date === slot.date &&
              selectedSlot.start_time === slot.start_time &&
              selectedSlot.end_time === slot.end_time;
            const violatesGapRule =
              enforceNoGaps && requiredStartTime && slot.start_time !== requiredStartTime && !isSelected;
            const isDisabled =
              slot.is_blackout === true || slot.is_available === false || violatesGapRule;
            const branchLabel = slot.branch_name || slot.location || "Location not available";
            return (
              <button
                type="button"
                key={slot.uiKey}
                onClick={() => {
                  if (isDisabled) return;
                  onSelect(slot);
                }}
                disabled={isDisabled}
                title={branchLabel}
                className={`snap-start w-[240px] h-[120px] rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-amber-500 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
                    : "border-slate-700 bg-slate-950 hover:border-slate-500 hover:-translate-y-0.5 hover:shadow-lg"
                } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-semibold text-white">
                    {formatTimeLabel(slot.start_time)}
                  </div>
                  <div className="text-[11px] font-semibold text-amber-200 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    {durationMinutes} min
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-300 truncate max-w-full">
                  {branchLabel}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 truncate max-w-full">
                  Arrive by {formatTimeLabel(slot.arrive_by)}
                </div>
                <div className="mt-2 text-xs font-semibold text-amber-200">
                  {isDisabled ? "Unavailable" : isSelected ? "Selected" : "Select"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function Booking() {
  const { lawyerId } = useParams();
  const navigate = useNavigate();

  const prefilledLawyerId = useMemo(() => {
    const n = Number(lawyerId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [lawyerId]);

  const [lawyerField, setLawyerField] = useState(
    prefilledLawyerId ? String(prefilledLawyerId) : ""
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [packagesCount, setPackagesCount] = useState(0);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [newCase, setNewCase] = useState({
    title: "",
    category: "",
    district: "",
    public_summary: "",
    private_summary: "",
  });
  const [checklistStatus, setChecklistStatus] = useState(null);
  const [checklistError, setChecklistError] = useState("");
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [checklistAnswers, setChecklistAnswers] = useState([]);
  const [checklistChecked, setChecklistChecked] = useState({});
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [checklistSaveMessage, setChecklistSaveMessage] = useState("");
  const [checklistSaveTone, setChecklistSaveTone] = useState("neutral");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotRangeFrom, setSlotRangeFrom] = useState("");
  const [slotRangeTo, setSlotRangeTo] = useState("");
  const [lawyerSummary, setLawyerSummary] = useState(null);
  const [lawyerSummaryLoading, setLawyerSummaryLoading] = useState(false);
  const isDev = import.meta?.env?.DEV ?? false;

  const selectedService = useMemo(
    () => services.find((svc) => svc.id === selectedServiceId),
    [services, selectedServiceId]
  );

  const [usedDurationFallback, setUsedDurationFallback] = useState(false);

  const durationMinutes = useMemo(() => {
    const duration =
      selectedService?.duration ??
      selectedService?.duration_minutes ??
      selectedService?.durationMinutes;
    const parsed = Number(duration);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return selectedService ? 30 : null;
  }, [selectedService]);

  useEffect(() => {
    if (!selectedService) {
      setUsedDurationFallback(false);
      return;
    }
    setUsedDurationFallback(durationMinutes === 30 && !selectedService?.duration && !selectedService?.duration_minutes && !selectedService?.durationMinutes);
  }, [selectedService, durationMinutes]);

  const allowMultipleSessions = useMemo(() => {
    const raw =
      selectedService?.session_count ??
      selectedService?.sessions_count ??
      selectedService?.sessions;
    return Number.isFinite(Number(raw)) && Number(raw) > 1;
  }, [selectedService]);

  const requiredNextStart = allowMultipleSessions && selectedSlot ? selectedSlot.end_time : null;

  const derivedSlotsByDate = useMemo(() => {
    if (!availableSlots.length) return {};
    const grouped = {};

    for (const day of availableSlots) {
      const date = day.date;
      const deduped = dedupeSlots(day.slots || [], date);
      const daySlots = deduped.map((slot) => {
        const start = slot.start;
        const end = slot.end;
        const localStart = toLocalTime(start);
        const localEnd = toLocalTime(end);
        const startMin = parseMinutes(localStart);
        const arriveBy = startMin != null ? formatMinutes(Math.max(0, startMin - 10)) : "";
        return {
          ...slot,
          date,
          start_time: localStart,
          end_time: localEnd,
          arrive_by: arriveBy,
          uiKey: `${slot.branch_id || "none"}-${slot.start}`,
        };
      });

      daySlots.sort((a, b) => {
        const aMin = parseMinutes(a.start_time) ?? 0;
        const bMin = parseMinutes(b.start_time) ?? 0;
        return aMin - bMin;
      });

      if (daySlots.length) grouped[date] = daySlots;
    }

    return grouped;
  }, [availableSlots]);

  useEffect(() => {
    if (!isDev) return;
    console.debug("[booking] durationMinutes", durationMinutes, selectedService);
  }, [durationMinutes, selectedService, isDev]);

  useEffect(() => {
    if (!isDev) return;
    console.debug("[booking] availability windows", availableSlots);
  }, [availableSlots, isDev]);

  useEffect(() => {
    if (!selectedBranchId) {
      setSelectedSlot(null);
      setScheduledAt("");
      return;
    }
    setSelectedSlot(null);
    setScheduledAt("");
  }, [selectedBranchId]);

  useEffect(() => {
    if (!isDev) return;
    const total = Object.values(derivedSlotsByDate).reduce((sum, slots) => sum + slots.length, 0);
    console.debug("[booking] generated slots", total);
    console.debug("[booking] slots render condition", {
      slotsLoading,
      availabilityCount: availableSlots.length,
      derivedDates: Object.keys(derivedSlotsByDate).length,
    });
  }, [derivedSlotsByDate, availableSlots.length, slotsLoading, isDev]);

  useEffect(() => {
    const loadCases = async () => {
      try {
        const data = await getMyCases();
        setCases(data || []);
      } catch {
        // ignore silently; error shown on submit if needed
      }
    };
    loadCases();
  }, []);

  const answerByTemplate = useMemo(() => {
    const map = new Map();
    for (const answer of checklistAnswers || []) {
      map.set(answer.template_id, answer);
    }
    return map;
  }, [checklistAnswers]);

  const requiredItems = useMemo(
    () =>
      (checklistItems || []).filter((item) =>
        item.required === undefined && item.is_required === undefined
          ? true
          : Boolean(item.required ?? item.is_required)
      ),
    [checklistItems]
  );
  const totalRequired = requiredItems.length;
  const completedRequired = requiredItems.filter((item) => checklistChecked[item.id]).length;
  const missingRequired = requiredItems.filter((item) => !checklistChecked[item.id]);
  const isChecklistRequired = totalRequired > 0;
  const isChecklistComplete = !isChecklistRequired || completedRequired === totalRequired;

  const hasChecklistChanges = useMemo(
    () =>
      (checklistItems || []).some((item) => {
        const saved = parseAnswerBool(answerByTemplate.get(item.id)?.answer_text);
        return saved !== Boolean(checklistChecked[item.id]);
      }),
    [checklistItems, checklistChecked, answerByTemplate]
  );

  // Load checklist when case + service are selected
  useEffect(() => {
    const fetchChecklist = async () => {
      setChecklistStatus(null);
      setChecklistError("");
      setChecklistItems([]);
      setChecklistAnswers([]);
      setChecklistChecked({});
      if (!selectedCaseId || !selectedServiceId) return;

      setChecklistLoading(true);
      try {
        const [status, answers, templates] = await Promise.all([
          getChecklistStatus(selectedCaseId, selectedServiceId),
          getCaseChecklistAnswers(selectedCaseId),
          getRequiredTemplates(selectedServiceId),
        ]);

        const items = templates || [];
        const answersList = answers || [];
        const nextChecked = {};
        for (const item of items) {
          const answer = answersList.find((a) => a.template_id === item.id);
          nextChecked[item.id] = parseAnswerBool(answer?.answer_text);
        }

        setChecklistStatus(status);
        setChecklistAnswers(answersList);
      setChecklistItems(items);
      setChecklistChecked(nextChecked);
      setChecklistOpen(items.length > 0);
    } catch (err) {
        if (err?.response?.status === 422) {
          setChecklistError("Complete checklist before booking.");
        } else {
          setChecklistError(
            err?.response?.data?.detail ||
              err?.response?.data?.message ||
              "Failed to load checklist."
          );
        }
      } finally {
        setChecklistLoading(false);
      }
    };
    fetchChecklist();
  }, [selectedCaseId, selectedServiceId]);

  const handleChecklistSave = async () => {
    if (!selectedCaseId || !selectedServiceId) return;
    setChecklistSaving(true);
    setChecklistError("");
    setChecklistSaveMessage("");
    setChecklistSaveTone("neutral");
    try {
      const updates = (checklistItems || [])
        .filter((item) => {
          const saved = parseAnswerBool(answerByTemplate.get(item.id)?.answer_text);
          return saved !== Boolean(checklistChecked[item.id]);
        })
        .map((item) =>
          saveCaseChecklistAnswer(selectedCaseId, {
            template_id: item.id,
            answer_text: checklistChecked[item.id] ? "true" : "false",
            document_id: null,
          })
        );

      const updatedRows = updates.length ? await Promise.all(updates) : [];
      if (updatedRows.length) {
        setChecklistAnswers((prev) => {
          const map = new Map();
          for (const answer of prev || []) map.set(answer.template_id, answer);
          for (const row of updatedRows) map.set(row.template_id, row);
          return Array.from(map.values());
        });
      }

      const status = await getChecklistStatus(selectedCaseId, selectedServiceId);
      setChecklistStatus(status);
      setChecklistSaveMessage("Checklist saved.");
      setChecklistSaveTone("success");
    } catch (err) {
      setChecklistError(
        err?.response?.data?.detail || err?.response?.data?.message || "Failed to save checklist."
      );
      setChecklistSaveMessage("Failed to save checklist.");
      setChecklistSaveTone("error");
    } finally {
      setChecklistSaving(false);
    }
  };

  // Default slot range (today -> +14 days)
  useEffect(() => {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const future = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const to = future.toISOString().slice(0, 10);
    setSlotRangeFrom(from);
    setSlotRangeTo(to);
  }, []);

  useEffect(() => {
    const loadServices = async () => {
      const userId = prefilledLawyerId || Number(lawyerField);
      if (!userId || Number.isNaN(userId)) return;
      try {
        const data = await getLawyerServicePackages(userId);
        setServices(data || []);
        setPackagesCount((data || []).length);
        console.debug("[booking] packages debug", {
          routeParam: userId,
          resolvedLawyerId: userId,
          packagesCount: (data || []).length,
        });
      } catch (err) {
        setServices([]);
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Failed to load service packages.";
        setError(message);
        setPackagesCount(0);
      }
    };
    loadServices();
  }, [prefilledLawyerId, lawyerField]);

  useEffect(() => {
    const loadBranches = async () => {
      const userId = prefilledLawyerId || Number(lawyerField);
      if (!userId || Number.isNaN(userId)) return;
      setBranchesLoading(true);
      setBranchesError("");
      try {
        const { data } = await api.get(`/lawyers/${userId}/branches`);
        const list = Array.isArray(data) ? data : [];
        setBranches(list);
        if (!selectedBranchId && list.length === 1) {
          setSelectedBranchId(list[0].id);
        }
      } catch (err) {
        setBranches([]);
        setBranchesError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            "Failed to load locations."
        );
      } finally {
        setBranchesLoading(false);
      }
    };
    loadBranches();
  }, [prefilledLawyerId, lawyerField]);

  useEffect(() => {
    if (!selectedBranchId) return;
    const exists = branches.some((b) => b.id === selectedBranchId);
    if (!exists) {
      setSelectedBranchId(null);
    }
  }, [branches, selectedBranchId]);

  useEffect(() => {
    const loadLawyerSummary = async () => {
      const targetId = prefilledLawyerId || Number(lawyerField);
      if (!targetId || Number.isNaN(targetId)) {
        setLawyerSummary(null);
        return;
      }
      setLawyerSummaryLoading(true);
      try {
        const res = await api.get(`/lawyers/${targetId}/profile`);
        setLawyerSummary(res.data || null);
      } catch {
        setLawyerSummary(null);
      } finally {
        setLawyerSummaryLoading(false);
      }
    };
    loadLawyerSummary();
  }, [prefilledLawyerId, lawyerField]);

  // Load available slots when step 3 is reached and lawyer is resolved
  useEffect(() => {
    const fetchSlots = async () => {
      setSlotsError("");
      setAvailableSlots([]);
      setSlotsLoading(true);
      try {
        const lawyerParam =
          prefilledLawyerId || (lawyerField ? Number(lawyerField) : null);
        if (!lawyerParam || !slotRangeFrom || !selectedServiceId || !selectedBranchId) {
          setSlotsLoading(false);
          return;
        }
        const url =
          `/api/bookings/available-slots?lawyer_user_id=${lawyerParam}` +
          `&branch_id=${selectedBranchId}` +
          `&service_package_id=${selectedServiceId}` +
          `&start_date=${slotRangeFrom}` +
          `&days=14` +
          ``;
        const { data } = await api.get(url);
        setAvailableSlots(Array.isArray(data) ? data : []);
      } catch (err) {
        setSlotsError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            "Failed to load available slots."
        );
      } finally {
        setSlotsLoading(false);
      }
    };
    if (step >= 3) {
      fetchSlots();
    }
  }, [
    step,
    prefilledLawyerId,
    lawyerField,
    slotRangeFrom,
    selectedServiceId,
    selectedBranchId,
    slotsRefreshKey,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const resolvedLawyerId = prefilledLawyerId || Number(lawyerField);
    if (!resolvedLawyerId || Number.isNaN(resolvedLawyerId)) {
      setError("Please provide a valid lawyer ID.");
      return;
    }

    if (!selectedCaseId) {
      setError("Please select a case.");
      return;
    }

    if (!selectedServiceId) {
      setError("Please choose a service package.");
      return;
    }

    if (!selectedBranchId) {
      setError("Please choose a location.");
      return;
    }

    if (!scheduledAt) {
      setError("Please choose a date and time.");
      return;
    }

    const payload = {
      lawyer_id: resolvedLawyerId,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      note: note.trim() || undefined,
      service_package_id: selectedServiceId,
      branch_id: selectedBranchId ?? selectedSlot?.branch_id ?? undefined,
      case_id: selectedCaseId,
    };

      try {
        setLoading(true);
        const created = await createBooking(payload);
        setSlotsRefreshKey((prev) => prev + 1);
        const bookingId = created?.id;
        if (bookingId) {
          navigate(`/client/bookings/${bookingId}/intake`);
        } else {
        navigate("/client/manage-bookings");
      }
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Booking failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full px-6 py-8 text-white">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">Book an Appointment</h1>
        <p className="text-slate-400">
          Select a case, package, and available slot to confirm your booking.
        </p>
        <Stepper currentStep={step} />
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="text-sm text-slate-400">Lawyer</div>
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-lg p-3">
            <div className="flex-1">
              {lawyerSummaryLoading && (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-40 bg-slate-800 rounded" />
                  <div className="h-3 w-56 bg-slate-800 rounded" />
                  <div className="h-3 w-32 bg-slate-800 rounded" />
                </div>
              )}
              {!lawyerSummaryLoading && lawyerSummary && (
                <div className="space-y-1">
                  <div className="text-white font-semibold">
                    {lawyerSummary.name || "Lawyer"}
                  </div>
                  <div className="text-sm text-slate-400">
                    {lawyerSummary.specialization || "General Practice"}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatLocation(lawyerSummary.city, lawyerSummary.district)}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-300 mt-2">
                    {lawyerSummary.rating != null && (
                      <span className="text-amber-200 font-semibold">
                        {formatRating(lawyerSummary.rating)} rating
                      </span>
                    )}
                    {lawyerSummary.service_packages &&
                      lawyerSummary.service_packages.length > 0 && (
                        <span>
                          Starting at LKR{" "}
                          {Number(lawyerSummary.service_packages[0]?.price || 0).toFixed(0)}
                        </span>
                      )}
                  </div>
                </div>
              )}
              {!lawyerSummaryLoading && !lawyerSummary && (
                <div className="text-slate-400 text-sm">
                  Enter a valid lawyer ID to load details.
                </div>
              )}
            </div>
            {!prefilledLawyerId && (
              <input
                type="number"
                min="1"
                value={lawyerField}
                onChange={(e) => setLawyerField(e.target.value)}
                className="w-32 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="e.g. 12"
                required
              />
            )}
          </div>
        </section>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-amber-200 font-semibold">Step 1 - Select Case</div>
            <button
              type="button"
              onClick={() => setShowCaseModal(true)}
              className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 text-sm hover:bg-emerald-500/20"
            >
              Create New Case
            </button>
          </div>
          <div className="space-y-2">
            <select
              value={selectedCaseId || ""}
              onChange={(e) => setSelectedCaseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Select a case</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} - {c.title}
                </option>
              ))}
            </select>
            {cases.length === 0 && (
              <div className="text-slate-400 text-sm">
                No cases yet. Create one to continue.
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!selectedCaseId) {
                  setError("Please select a case.");
                  return;
                }
                setStep(2);
                setError("");
              }}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-semibold"
            >
              Next
            </button>
          </div>
        </section>

        {step >= 2 && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="text-sm text-amber-200 font-semibold">Step 2 - Choose Service</div>
            <div className="space-y-3">
              {services.length === 0 && (
                <div className="text-slate-400 text-sm">
                  No service packages found for this lawyer.
                </div>
              )}
              {services.map((svc) => (
                <label
                  key={svc.id}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 cursor-pointer transition ${
                    selectedServiceId === svc.id
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-slate-700 bg-slate-900 hover:border-slate-500"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-white font-semibold">{svc.name}</div>
                    <div className="text-slate-400 text-sm">{svc.description}</div>
                    <div className="text-slate-300 text-sm">
                      LKR {svc.price_lkr} - {svc.duration_minutes} mins
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="service_package"
                    checked={selectedServiceId === svc.id}
                    onChange={() => setSelectedServiceId(svc.id)}
                    className="mt-1"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!selectedCaseId) {
                    setError("Please select a case.");
                    return;
                  }
                  if (!selectedServiceId) {
                    setError("Please choose a service package.");
                    return;
                  }
                  setStep(3);
                  setError("");
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-semibold"
              >
                Next
              </button>
            </div>
          </section>
        )}

        {step >= 3 && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="text-sm text-amber-200 font-semibold">Step 3 - Choose Date & Time</div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Choose a location</label>
                {branchesLoading && (
                  <div className="text-sm text-slate-400">Loading locations...</div>
                )}
                {branchesError && (
                  <div className="text-sm text-red-200 border border-red-700 bg-red-900/30 rounded-lg p-3">
                    {branchesError}
                  </div>
                )}
                {!branchesLoading && !branchesError && branches.length === 0 && (
                  <div className="text-sm text-slate-400">
                    No locations available.
                  </div>
                )}
                {!branchesLoading && branches.length > 0 && (
                  <select
                    value={selectedBranchId || ""}
                    onChange={(e) =>
                      setSelectedBranchId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Select a location</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} - {b.address}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="text-sm text-slate-300">
                Available times
              </div>
              {usedDurationFallback && (
                <div className="text-xs text-amber-200">
                  Service duration not provided. Defaulting to 30 minutes.
                </div>
              )}
              {!selectedServiceId && (
                <div className="text-sm text-slate-400">
                  Select a service to see available times.
                </div>
              )}
              {selectedServiceId && !selectedBranchId && branches.length > 0 && (
                <div className="text-sm text-slate-400">
                  Select a location to see available times.
                </div>
              )}
              {selectedServiceId && selectedBranchId && slotsLoading && (
                <div className="grid grid-cols-1 gap-3">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div
                      key={`slot-skeleton-${idx}`}
                      className="h-20 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse"
                    />
                  ))}
                </div>
              )}
              {selectedServiceId && selectedBranchId && slotsError && (
                <div className="text-sm text-red-200 border border-red-700 bg-red-900/30 rounded-lg p-3">
                  {slotsError}
                </div>
              )}
              {selectedServiceId &&
                selectedBranchId &&
                !slotsLoading &&
                !slotsError &&
                Object.keys(derivedSlotsByDate).length === 0 && (
                  <div className="text-sm text-slate-400">
                    No slots available. Try a different service or adjust the date range.
                  </div>
                )}

              {selectedServiceId && selectedBranchId && !slotsLoading && Object.keys(derivedSlotsByDate).length > 0 && (
                <div className="space-y-3">
                  {Object.entries(derivedSlotsByDate)
                    .sort(([a], [b]) => (a > b ? 1 : -1))
                    .map(([date, slots]) => (
                      <SlotRail
                        key={date}
                        date={date}
                        slots={slots}
                        selectedSlot={selectedSlot}
                        enforceNoGaps={allowMultipleSessions}
                        requiredStartTime={requiredNextStart}
                        durationMinutes={durationMinutes}
                        onSelect={(slot) => {
                          const sameSlot =
                            selectedSlot &&
                            selectedSlot.date === slot.date &&
                            selectedSlot.start_time === slot.start_time &&
                            selectedSlot.end_time === slot.end_time;
                          if (sameSlot) {
                            setSelectedSlot(null);
                            setScheduledAt("");
                            return;
                          }
                          setSelectedSlot(slot);
                          setScheduledAt(slot.start);
                        }}
                      />
                    ))}
                </div>
              )}
              {allowMultipleSessions && requiredNextStart && (
                <div className="text-xs text-amber-200">
                  Next available must start at {formatTimeLabel(requiredNextStart)}.
                </div>
              )}

              <input
                id="scheduled_at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-slate-400" htmlFor="note">
                Note (optional)
              </label>
              <textarea
                id="note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                placeholder="Share any context for the lawyer..."
              />
            </div>

            <div className="border border-slate-800 rounded-xl p-4 bg-slate-900 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Checklist</div>
                  {isChecklistRequired ? (
                    <div className="text-xs text-slate-400">
                      {completedRequired}/{totalRequired} completed
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">
                      No checklist required for this booking.
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isChecklistRequired && (
                    <button
                      type="button"
                      onClick={() => setChecklistOpen((prev) => !prev)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-200 hover:bg-slate-700"
                    >
                      {checklistOpen ? "Hide checklist" : "View checklist"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleChecklistSave}
                    disabled={
                      checklistSaving ||
                      checklistLoading ||
                      !hasChecklistChanges ||
                      !isChecklistRequired
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-900 disabled:opacity-60 text-white text-xs"
                  >
                    {checklistSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              {checklistLoading && <div className="text-slate-300 text-sm">Loading checklist...</div>}
              {checklistError && (
                <div className="text-sm text-red-300 border border-red-700 bg-red-900/30 rounded-lg p-3">
                  {checklistError}
                </div>
              )}
              {!checklistLoading && checklistSaveMessage && (
                <div
                  className={`text-xs rounded-lg px-3 py-2 border ${
                    checklistSaveTone === "success"
                      ? "text-emerald-200 border-emerald-500/40 bg-emerald-900/20"
                      : checklistSaveTone === "error"
                        ? "text-red-200 border-red-500/40 bg-red-900/20"
                        : "text-slate-300 border-slate-700 bg-slate-900/50"
                  }`}
                >
                  {checklistSaveMessage}
                </div>
              )}

              {!checklistLoading && !isChecklistRequired && (
                <div className="text-sm text-slate-400">
                  No checklist required for this booking.
                </div>
              )}

              {!checklistLoading && checklistOpen && checklistItems.length > 0 && (
                <div className="space-y-2">
                  {checklistItems.map((item) => {
                    const isRequired = item.required ?? item.is_required;
                    return (
                      <label
                        key={item.id}
                        className="flex items-start gap-3 border border-slate-800 rounded-lg p-3 bg-slate-950/60"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(checklistChecked[item.id])}
                          onChange={(e) =>
                            setChecklistChecked((prev) => ({
                              ...prev,
                              [item.id]: e.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm text-white font-semibold">
                            {item.question || item.title || `Checklist Item #${item.id}`}
                          </div>
                          {item.helper_text && (
                            <div className="text-xs text-slate-400 mt-1">{item.helper_text}</div>
                          )}
                          {isRequired && (
                            <div className="text-[11px] text-amber-200 mt-1">Required</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {isChecklistRequired && isChecklistComplete && !checklistLoading && (
                  <div className="text-sm text-emerald-200 border border-emerald-600/50 bg-emerald-900/30 rounded-lg p-3">
                    Checklist complete. Booking unlocked.
                  </div>
                )}

              {isChecklistRequired && missingRequired.length > 0 && (
                <div className="text-sm text-amber-200 border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 space-y-2">
                  <div className="font-semibold text-amber-100">Complete required items to book.</div>
                  <div className="text-amber-100 text-xs">Missing required items:</div>
                  <ul className="list-disc list-inside text-xs text-amber-100 space-y-1">
                    {missingRequired.map((item) => (
                      <li key={item.id}>{item.title || item.question || "Untitled item"}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3 py-2 text-sm text-slate-300 hover:text-white"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  checklistLoading ||
                  (isChecklistRequired && !isChecklistComplete)
                }
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}
      </form>

      {showCaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-white">Create New Case</div>
              <button
                onClick={() => setShowCaseModal(false)}
                className="text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              <input
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="Title"
                value={newCase.title}
                onChange={(e) => setNewCase((p) => ({ ...p, title: e.target.value }))}
              />
              <input
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="Category"
                value={newCase.category}
                onChange={(e) => setNewCase((p) => ({ ...p, category: e.target.value }))}
              />
              <input
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="District"
                value={newCase.district}
                onChange={(e) => setNewCase((p) => ({ ...p, district: e.target.value }))}
              />
              <textarea
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="Public summary"
                rows={3}
                value={newCase.public_summary}
                onChange={(e) =>
                  setNewCase((p) => ({ ...p, public_summary: e.target.value }))
                }
              />
              <textarea
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                placeholder="Private summary (optional)"
                rows={3}
                value={newCase.private_summary}
                onChange={(e) =>
                  setNewCase((p) => ({ ...p, private_summary: e.target.value }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCaseModal(false)}
                className="px-3 py-2 text-sm text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    const created = await createCaseApi(newCase);
                    setCases((prev) => [created, ...prev]);
                    setSelectedCaseId(created.id);
                    setShowCaseModal(false);
                    setStep(2);
                    setError("");
                  } catch (err) {
                    const detail = err?.response?.data?.detail;
                    let message = "Failed to create case.";
                    if (Array.isArray(detail)) {
                      message = detail
                        .map((d) => d?.msg || d?.message || (typeof d === "string" ? d : JSON.stringify(d)))
                        .join("; ");
                    } else if (typeof detail === "string") {
                      message = detail;
                    }
                    setError(message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm"
              >
                Save Case
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
