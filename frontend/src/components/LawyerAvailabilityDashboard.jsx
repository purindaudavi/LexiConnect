import React, { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Plus,
  Trash2,
  Info,
  CheckCircle,
  AlertCircle,
  Save,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/material_blue.css";

import api from "../services/api"; // axios client
import AvailabilityWizard from "./AvailabilityWizard";

const LawyerAvailabilityDashboard = () => {
  const navigate = useNavigate();

  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const [timeSlots, setTimeSlots] = useState({
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  });

  const [blackoutDates, setBlackoutDates] = useState([]);
  const [branches, setBranches] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  const [stats, setStats] = useState({ activeBlackouts: 0, dailyCapacity: 0 });

  // Preview slots (next 14 days)
  const [slotPreview, setSlotPreview] = useState([]);
  const [previewFrom, setPreviewFrom] = useState("");
  const [previewTo, setPreviewTo] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Wizard modal
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const [newBlackout, setNewBlackout] = useState({
    date: "",
    availability: "Full Day",
    startTime: "09:00",
    endTime: "17:00",
    reason: "",
  });

  // ---------- helpers ----------
  const fromApiTime = (timeStr) => {
    if (!timeStr) return "";
    const match = String(timeStr).match(/(\d{2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}`;
    return timeStr;
  };

  const toApiTime = (timeStr) => {
    if (!timeStr) return timeStr;
    const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
    if (!match) return timeStr;
    const hours = String(match[1]).padStart(2, "0");
    const minutes = String(match[2]).padStart(2, "0");
    return `${hours}:${minutes}:00`;
  };

  const parseDay = (v) => {
    if (typeof v === "string") {
      const s = v.trim();
      // Handles "MONDAY" or "monday"
      const normalized = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      // If backend returns "MONDAY", normalized becomes "Monday"
      return normalized;
    }
    if (typeof v === "number") {
      const map = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      return map[v % 7];
    }
    return "Monday";
  };

  const isSlotValid = (slot) => {
    if (!slot.branchId) return false;
    if (!slot.startTime || !slot.endTime) return false;

    const toMinutes = (val) => {
      const m = String(val).match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };

    const startM = toMinutes(slot.startTime);
    const endM = toMinutes(slot.endTime);
    if (startM === null || endM === null) return false;
    if (endM <= startM) return false;

    if (!slot.maxBookings || slot.maxBookings < 1) return false;

    return true;
  };

  // ---------- load ----------
  const loadAvailabilityData = async () => {
    try {
      setLoading(true);
      setError(null);

      let bundle;

      // Try combined endpoint first
      try {
        const { data } = await api.get("/api/lawyer-availability/me", {
          params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
        });
        bundle = data || {};
      } catch (e) {
        // Fallback: load individually
        const [weeklyRes, branchesRes, blackoutRes] = await Promise.all([
          api.get("/api/lawyer-availability/weekly", {
            params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
          }),
          api.get("/api/lawyer-availability/branches", {
            params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
          }),
          api.get("/api/lawyer-availability/blackout", {
            params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
          }),
        ]);

        bundle = {
          weekly: weeklyRes.data || [],
          branches: branchesRes.data || [],
          blackouts: blackoutRes.data || [],
        };
      }

      const weekly = Array.isArray(bundle.weekly) ? bundle.weekly : [];
      const blackouts = Array.isArray(bundle.blackouts) ? bundle.blackouts : [];
      const branchList = Array.isArray(bundle.branches) ? bundle.branches : [];

      setBranches(branchList);

      const transformedSlots = {};
      weekDays.forEach((day) => {
        transformedSlots[day] = weekly
          .filter((slot) => parseDay(slot.day_of_week) === day)
          .map((slot) => ({
            id: slot.id,
            startTime: fromApiTime(slot.start_time),
            endTime: fromApiTime(slot.end_time),
            branchId: slot.branch_id,
            branch: branchList.find((b) => b.id === slot.branch_id)?.name || "",
            maxBookings: slot.max_bookings ?? 0,
            isUnsaved: false,
          }));
      });

      const transformedBlackouts = blackouts.map((b) => ({
        id: b.id,
        date: b.date, // keep ISO yyyy-mm-dd if backend gives that
        availability: "Full Day",
        startTime: "",
        endTime: "",
        reason: b.reason || "",
      }));

      setTimeSlots(transformedSlots);
      setBlackoutDates(transformedBlackouts);

      setStats({
        activeBlackouts: transformedBlackouts.length,
        dailyCapacity: weekly.reduce((sum, s) => sum + (s.max_bookings || 0), 0),
      });
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate("/not-authorized");
        return;
      }
      setError(err?.response?.data?.detail || err?.message || "Failed to load availability");
    } finally {
      setLoading(false);
    }
  };

  // ---------- preview slots ----------
  const fetchSlotPreview = async (fromDate, toDate) => {
    if (!fromDate || !toDate) return;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const { data } = await api.get("/api/lawyer-availability/slots", {
        params: {
          from_date: fromDate,
          to_date: toDate,
          ...(currentUserId ? { lawyer_user_id: currentUserId } : {}),
        },
      });
      setSlotPreview(data || []);
    } catch (err) {
      setPreviewError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Failed to load upcoming slots"
      );
      setSlotPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ---------- slots CRUD ----------
  const addTimeSlot = (day) => {
    const newSlot = {
      id: `new-${Date.now()}`,
      startTime: "09:00",
      endTime: "17:00",
      branch: "",
      branchId: null,
      maxBookings: 5,
      isUnsaved: true,
    };
    setTimeSlots((prev) => ({ ...prev, [day]: [...prev[day], newSlot] }));
  };

  const updateSlot = (day, slotId, field, value) => {
    setTimeSlots((prev) => ({
      ...prev,
      [day]: prev[day].map((slot) =>
        slot.id === slotId ? { ...slot, [field]: value, isUnsaved: true } : slot
      ),
    }));
  };

  const saveTimeSlot = async (day, slot) => {
    const slotKey = `${day}-${slot.id}`;
    try {
      setSaving((p) => ({ ...p, [slotKey]: true }));
      setError(null);

      if (!isSlotValid(slot)) {
        setError(
          "Please select a branch, set valid times, and ensure end time is after start time (max >= 1)."
        );
        return;
      }

      const payload = {
        day_of_week: day.toUpperCase(),
        start_time: toApiTime(slot.startTime),
        end_time: toApiTime(slot.endTime),
        branch_id: slot.branchId,
        max_bookings: slot.maxBookings,
        is_active: true,
      };

      let saved;
      if (slot.id && !String(slot.id).startsWith("new-")) {
        saved = await api.patch(`/api/lawyer-availability/weekly/${slot.id}`, payload, {
          params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
        });
      } else {
        saved = await api.post("/api/lawyer-availability/weekly", payload, {
          params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
        });
      }

      setTimeSlots((prev) => ({
        ...prev,
        [day]: prev[day].map((s) =>
          s.id === slot.id
            ? {
                ...s,
                id: saved.data.id,
                startTime: fromApiTime(saved.data.start_time),
                endTime: fromApiTime(saved.data.end_time),
                branchId: saved.data.branch_id,
                isUnsaved: false,
              }
            : s
        ),
      }));

      setSuccess("Time slot saved successfully!");
      setTimeout(() => setSuccess(null), 2500);

      await loadAvailabilityData();
      fetchSlotPreview(previewFrom, previewTo);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate("/not-authorized");
        return;
      }
      setError(err?.response?.data?.detail || err?.message || "Failed to save slot");
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[slotKey];
        return next;
      });
    }
  };

  const deleteTimeSlot = async (day, slotId) => {
    if (String(slotId).startsWith("new-")) {
      setTimeSlots((prev) => ({ ...prev, [day]: prev[day].filter((s) => s.id !== slotId) }));
      return;
    }
    try {
      setSaving((p) => ({ ...p, [`delete-${slotId}`]: true }));
      setError(null);

      await api.delete(`/api/lawyer-availability/weekly/${slotId}`);

      setTimeSlots((prev) => ({ ...prev, [day]: prev[day].filter((s) => s.id !== slotId) }));

      setSuccess("Time slot deleted successfully!");
      setTimeout(() => setSuccess(null), 2500);

      await loadAvailabilityData();
      fetchSlotPreview(previewFrom, previewTo);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate("/not-authorized");
        return;
      }
      setError(err?.response?.data?.detail || err?.message || "Failed to delete slot");
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[`delete-${slotId}`];
        return next;
      });
    }
  };

  // ---------- blackout CRUD ----------
  const addBlackoutDate = async () => {
    if (!newBlackout.date) {
      setError("Please select a date");
      return;
    }
    try {
      setSaving((p) => ({ ...p, blackout: true }));
      setError(null);

      const payload = {
        date: newBlackout.date,
        reason: newBlackout.reason || null,
      };

      const { data } = await api.post("/api/lawyer-availability/blackout", payload, {
        params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
      });

      setBlackoutDates((prev) => [
        ...prev,
        {
          id: data.id,
          date: data.date,
          availability: "Full Day",
          startTime: "",
          endTime: "",
          reason: data.reason || "",
        },
      ]);

      setNewBlackout({
        date: "",
        availability: "Full Day",
        startTime: "09:00",
        endTime: "17:00",
        reason: "",
      });

      setSuccess("Blackout date added successfully!");
      setTimeout(() => setSuccess(null), 2500);

      await loadAvailabilityData();
      fetchSlotPreview(previewFrom, previewTo);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate("/not-authorized");
        return;
      }
      setError(err?.response?.data?.detail || err?.message || "Failed to add blackout");
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next.blackout;
        return next;
      });
    }
  };

  const deleteBlackoutDate = async (id) => {
    try {
      setSaving((p) => ({ ...p, [`delete-blackout-${id}`]: true }));
      setError(null);

      await api.delete(`/api/lawyer-availability/blackout/${id}`, {
        params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
      });

      setBlackoutDates((prev) => prev.filter((b) => b.id !== id));

      setSuccess("Blackout date deleted successfully!");
      setTimeout(() => setSuccess(null), 2500);

      await loadAvailabilityData();
      fetchSlotPreview(previewFrom, previewTo);
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate("/not-authorized");
        return;
      }
      setError(err?.response?.data?.detail || err?.message || "Failed to delete blackout");
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[`delete-blackout-${id}`];
        return next;
      });
    }
  };

  // Cancel a specific day from preview (creates blackout)
  const cancelDay = async (dateStr) => {
    const key = `cancel-${dateStr}`;
    try {
      setSaving((p) => ({ ...p, [key]: true }));
      setError(null);

      await api.post(
        "/api/lawyer-availability/blackout",
        {
          date: dateStr,
          reason: "Cancelled via calendar",
        },
        {
          params: currentUserId ? { lawyer_user_id: currentUserId } : undefined,
        }
      );

      setSuccess("Day cancelled");
      setTimeout(() => setSuccess(null), 2500);

      fetchSlotPreview(previewFrom, previewTo);
      await loadAvailabilityData();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.message || "Failed to cancel day");
    } finally {
      setSaving((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  // ---------- stats ----------
  const getTotalWeeklyHours = () => {
    let totalMinutes = 0;
    Object.values(timeSlots).forEach((slots) => {
      slots.forEach((slot) => {
        const m1 = String(slot.startTime).match(/(\d{1,2}):(\d{2})/);
        const m2 = String(slot.endTime).match(/(\d{1,2}):(\d{2})/);
        if (m1 && m2) {
          const s = parseInt(m1[1], 10) * 60 + parseInt(m1[2], 10);
          const e = parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10);
          if (e > s) totalMinutes += e - s;
        }
      });
    });
    return Math.round((totalMinutes / 60) * 10) / 10;
  };

  const getTotalDailyCapacity = () =>
    stats.dailyCapacity ||
    Object.values(timeSlots).reduce(
      (total, slots) =>
        total + slots.reduce((dayTotal, slot) => dayTotal + (slot.maxBookings || 0), 0),
      0
    );

  // ---------- effects ----------
  useEffect(() => {
    const fetchCurrentUserId = async () => {
      try {
        const { data } = await api.get("/users/me");
        setCurrentUserId(data?.id ?? null);
      } catch (_) {
        setCurrentUserId(null);
      }
    };

    fetchCurrentUserId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentUserId === null) return;
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const toDate = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const to = toDate.toISOString().slice(0, 10);
    setPreviewFrom(from);
    setPreviewTo(to);
    loadAvailabilityData();
    fetchSlotPreview(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // ---------- icons as components ----------
  const TrashIcon = () => <Trash2 className="w-4 h-4" />;
  const PlusIcon = () => <Plus className="w-4 h-4" />;
  const ClockIcon = () => <Clock className="w-4 h-4" />;
  const MapPinIcon = () => <MapPin className="w-4 h-4" />;
  const UsersIcon = () => <Users className="w-4 h-4" />;
  const CalendarIcon = () => <Calendar className="w-5 h-5" />;
  const CheckCircleIcon = () => <CheckCircle className="w-5 h-5" />;
  const InfoIcon = () => <Info className="w-5 h-5" />;
  const AlertCircleIcon = () => <AlertCircle className="w-5 h-5" />;
  const SaveIcon = () => <Save className="w-4 h-4" />;
  const XIcon = () => <X className="w-4 h-4" />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      {success && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-start space-x-3">
              <CheckCircleIcon />
              <div className="flex-1">
                <h4 className="text-green-800 font-semibold">Success</h4>
                <p className="text-green-700 text-sm mt-1">{success}</p>
              </div>
              <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
                <XIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-4 left-4 z-50 max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-start space-x-3">
              <AlertCircleIcon />
              <div className="flex-1">
                <h4 className="text-red-800 font-semibold">Error</h4>
                <p className="text-red-700 text-sm mt-1">{String(error)}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                <XIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manage Availability</h1>
            <p className="text-slate-600 text-sm">
              Set your weekly consultation schedule and manage unavailable dates.
            </p>
          </div>

          <button
            onClick={() => setIsWizardOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm"
          >
            <PlusIcon />
            <span className="text-sm font-semibold">Add new availability (Wizard)</span>
          </button>
        </div>
      </div>

      <div className="flex">
        <main className="flex-1 p-8">
          <div className="max-w-5xl mx-auto">
            {/* Weekly schedule */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-slate-900">Weekly Consultation Schedule</h2>
                <div className="flex items-center space-x-2 text-sm text-slate-500">
                  <CalendarIcon />
                  <span>Auto-recurring weekly</span>
                </div>
              </div>

              {!loading && branches.length === 0 && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  No branches found. Add a branch first to save availability.
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-slate-600">Loading availability...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {weekDays.map((day) => (
                    <div key={day} className="border-b border-slate-100 pb-6 last:border-b-0">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-semibold text-slate-900">{day}</h3>
                          {timeSlots[day].length > 0 && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                              {timeSlots[day].length} slot{timeSlots[day].length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => addTimeSlot(day)}
                          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm"
                        >
                          <PlusIcon />
                          <span className="text-sm font-semibold">Add Time Slot</span>
                        </button>
                      </div>

                      {timeSlots[day].length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                          <p className="text-slate-500">No availability set for {day}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {timeSlots[day].map((slot) => (
                            <div
                              key={slot.id}
                              className="flex items-center space-x-4 p-5 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200"
                            >
                              {/* time */}
                              <div className="flex items-center space-x-3 flex-1">
                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <ClockIcon />
                                </div>
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="time"
                                    value={slot.startTime}
                                    onChange={(e) => updateSlot(day, slot.id, "startTime", e.target.value)}
                                    className="w-28 px-3 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <span className="text-slate-400 font-medium">-</span>
                                  <input
                                    type="time"
                                    value={slot.endTime}
                                    onChange={(e) => updateSlot(day, slot.id, "endTime", e.target.value)}
                                    className="w-28 px-3 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              </div>

                              {/* branch */}
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <MapPinIcon />
                                </div>
                                <select
                                  value={slot.branchId || ""}
                                  onChange={(e) => {
                                    const branchId = parseInt(e.target.value, 10) || null;
                                    const branch = branches.find((b) => b.id === branchId);
                                    updateSlot(day, slot.id, "branch", branch?.name || "");
                                    updateSlot(day, slot.id, "branchId", branchId);
                                  }}
                                  className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">Select branch</option>
                                  {branches.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                      {branch.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* max bookings */}
                              <div className="flex items-center space-x-3">
                                <div className="p-2 bg-white rounded-lg shadow-sm">
                                  <UsersIcon />
                                </div>
                                <input
                                  type="number"
                                  value={slot.maxBookings}
                                  min="1"
                                  onChange={(e) =>
                                    updateSlot(day, slot.id, "maxBookings", parseInt(e.target.value, 10) || 0)
                                  }
                                  className="w-20 px-3 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-600 font-medium">max</span>
                              </div>

                              {/* save button */}
                              {slot.isUnsaved && (
                                <button
                                  onClick={() => saveTimeSlot(day, slot)}
                                  disabled={saving[`${day}-${slot.id}`] || !isSlotValid(slot)}
                                  className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={!slot.branchId ? "Please select a branch" : "Save time slot"}
                                >
                                  {saving[`${day}-${slot.id}`] ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <>
                                      <SaveIcon />
                                      <span>Save</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {/* delete */}
                              <button
                                onClick={() => deleteTimeSlot(day, slot.id)}
                                disabled={saving[`delete-${slot.id}`]}
                                className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {saving[`delete-${slot.id}`] ? (
                                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <TrashIcon />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming slots */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Upcoming Slots (Next 14 Days)</h2>
                  <p className="text-slate-600 text-sm">Generated from your weekly availability.</p>
                </div>
                {previewError && <div className="text-sm text-red-500">{previewError}</div>}
              </div>

              {previewLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
                  Loading upcoming slots...
                </div>
              ) : slotPreview.length === 0 ? (
                <div className="text-slate-500 text-sm">No upcoming slots in this range.</div>
              ) : (
                Object.entries(
                  slotPreview.reduce((acc, slot) => {
                    const d = slot.date;
                    acc[d] = acc[d] || [];
                    acc[d].push(slot);
                    return acc;
                  }, {})
                ).map(([d, slotsForDay]) => {
                  const dateLabel = new Date(d + "T00:00:00");
                  const niceDate = isNaN(dateLabel.getTime())
                    ? d
                    : `${dateLabel.toLocaleDateString()} (${dateLabel.toLocaleDateString(undefined, {
                        weekday: "long",
                      })})`;

                  const isBlackoutDay = slotsForDay.every((s) => s.is_blackout);
                  const cancelKey = `cancel-${d}`;
                  const canceling = !!saving[cancelKey];

                  return (
                    <div key={d} className="mb-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-slate-900 font-semibold">{niceDate}</div>
                        <button
                          type="button"
                          disabled={isBlackoutDay || canceling}
                          onClick={() => cancelDay(d)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                            isBlackoutDay
                              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                              : "bg-red-600 text-white hover:bg-red-700"
                          }`}
                        >
                          {isBlackoutDay ? "Cancelled" : canceling ? "Cancelling..." : "Cancel this day"}
                        </button>
                      </div>

                      <div className="space-y-2">
                        {slotsForDay.map((slot, idx) => (
                          <div
                            key={`${d}-${idx}`}
                            className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3"
                          >
                            <div className="text-sm text-slate-800 font-semibold">
                              {fromApiTime(slot.start_time)} - {fromApiTime(slot.end_time)}
                            </div>
                            <div className="text-sm text-slate-500">{slot.branch_name || "No branch"}</div>
                            {slot.is_blackout && (
                              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-600 font-semibold">
                                BLACKOUT
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Blackout Dates */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-slate-900">Blackout Dates</h2>
                <div className="flex items-center space-x-2 text-sm text-amber-600">
                  <AlertCircleIcon />
                  <span>Overrides weekly schedule</span>
                </div>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 mb-8 border border-amber-200">
                <h3 className="font-semibold text-slate-900 mb-6">Add New Blackout Date</h3>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
                    <div className="relative">
                      <Flatpickr
                        value={newBlackout.date ? new Date(newBlackout.date) : null}
                        onChange={(dates) =>
                          setNewBlackout((p) => ({
                            ...p,
                            date: dates && dates[0] ? dates[0].toISOString().split("T")[0] : "",
                          }))
                        }
                        options={{
                          dateFormat: "d/m/Y",
                          allowInput: true,
                          disableMobile: true,
                        }}
                        className="w-full px-4 py-2 pl-10 text-sm font-medium bg-white border border-slate-300 text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="dd/mm/yyyy"
                      />
                      <div className="absolute left-3 top-2.5 text-slate-400">
                        <CalendarIcon />
                      </div>
                    </div>
                  </div>

                  <div className="col-span-5">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Reason (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Court session, Annual leave"
                      value={newBlackout.reason}
                      onChange={(e) => setNewBlackout((p) => ({ ...p, reason: e.target.value }))}
                      className="w-full px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="col-span-3 flex items-end">
                    <button
                      onClick={addBlackoutDate}
                      disabled={saving.blackout}
                      className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all font-semibold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving.blackout ? "Adding..." : "Add Blackout"}
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-slate-600">Loading blackout dates...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {blackoutDates.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                      <p className="text-slate-500">No blackout dates set</p>
                    </div>
                  ) : (
                    blackoutDates.map((blackout) => (
                      <div
                        key={blackout.id}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-xl border border-red-200"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <CalendarIcon />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{blackout.date}</div>
                            <div className="text-sm text-slate-600">
                              Full Day{blackout.reason ? ` • ${blackout.reason}` : ""}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => deleteBlackoutDate(blackout.id)}
                          disabled={saving[`delete-blackout-${blackout.id}`]}
                          className="p-3 text-red-500 hover:bg-red-100 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving[`delete-blackout-${blackout.id}`] ? (
                            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <TrashIcon />
                          )}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-80 bg-white border-l border-slate-200 p-6 hidden lg:block">
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6">How It Works</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CalendarIcon />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Weekly Schedule</h4>
                  <p className="text-sm text-slate-600">Set your regular availability patterns</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircleIcon />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Auto-Recurring</h4>
                  <p className="text-sm text-slate-600">Schedule repeats weekly automatically</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <AlertCircleIcon />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Blackout Priority</h4>
                  <p className="text-sm text-slate-600">Blackout dates override weekly schedule</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Current Status</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                <div>
                  <div className="text-sm text-slate-600 font-medium">Total Weekly Hours</div>
                  <div className="text-xl font-bold text-slate-900">{getTotalWeeklyHours()} hrs</div>
                </div>
                <div className="p-3 bg-white rounded-lg shadow-sm">
                  <ClockIcon />
                </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                <div>
                  <div className="text-sm text-slate-600 font-medium">Active Blackouts</div>
                  <div className="text-xl font-bold text-slate-900">
                    {stats.activeBlackouts || blackoutDates.length}
                  </div>
                </div>
                <div className="p-3 bg-white rounded-lg shadow-sm">
                  <AlertCircleIcon />
                </div>
              </div>

              <div className="flex justify-between items-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                <div>
                  <div className="text-sm text-slate-600 font-medium">Daily Capacity</div>
                  <div className="text-xl font-bold text-slate-900">{getTotalDailyCapacity()} clients</div>
                </div>
                <div className="p-3 bg-white rounded-lg shadow-sm">
                  <UsersIcon />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <InfoIcon />
              </div>
              <div>
                <h4 className="font-semibold text-purple-900 mb-2">Pro Tip</h4>
                <p className="text-sm text-purple-800 leading-relaxed">
                  Keep buffers between sessions to handle overruns and prep time.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Wizard modal */}
      <AvailabilityWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSaved={async () => {
          setIsWizardOpen(false);
          await loadAvailabilityData();
          fetchSlotPreview(previewFrom, previewTo);
          setSuccess("Availability added successfully!");
          setTimeout(() => setSuccess(null), 2500);
        }}
      />
    </div>
  );
};

export default LawyerAvailabilityDashboard;
