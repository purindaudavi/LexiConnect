import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import "./token-queue.css";

// ============== CONSTANTS ==============
const statusStyles = {
  pending: "bg-yellow-500/20 text-yellow-200 border-yellow-400/30",
  confirmed: "bg-blue-500/20 text-blue-200 border-blue-400/30",
  in_progress: "bg-amber-500/20 text-amber-200 border-amber-400/30",
  completed: "bg-emerald-500/20 text-emerald-200 border-emerald-400/30",
  cancelled: "bg-rose-500/20 text-rose-200 border-rose-400/30",
  no_show: "bg-red-500/20 text-red-200 border-red-400/30",
};

const statusLabels = {
  pending: "⏳ Will Come",
  confirmed: "✓ Confirmed",
  in_progress: "🔄 In Progress",
  completed: "✅ Completed",
  cancelled: "❌ Cancelled",
  no_show: "🚫 Not Come",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// ============== HELPER FUNCTIONS ==============
const normalizeStatus = (s) => {
  if (!s) return "pending";
  const lower = String(s).toLowerCase().replace(/-| /g, "_");
  if (lower === "no_show" || lower === "noshow" || lower === "not_come" || lower === "notcome") {
    return "no_show";
  }
  return ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"].includes(lower)
    ? lower
    : "pending";
};

const formatDateKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (t) => {
  if (!t) return "--:--";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const isUuid = (value) =>
  typeof value === "string" && value.includes("-");

// ============== DEMO DATA GENERATOR ==============
const buildDemoData = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentDay = today.getDate();
  const demoData = {};

  const clients = [
    { name: "Rajesh Kumar", email: "rajesh@email.com", phone: "+91 98765 43210", reason: "Property dispute consultation" },
    { name: "Priya Sharma", email: "priya@email.com", phone: "+91 87654 32109", reason: "Business contract review" },
    { name: "Amit Patel", email: "amit@email.com", phone: "+91 76543 21098", reason: "Family law matters" },
    { name: "Sunita Verma", email: "sunita@email.com", phone: "+91 65432 10987", reason: "Will preparation" },
    { name: "Vikram Singh", email: "vikram@email.com", phone: "+91 54321 09876", reason: "Criminal case inquiry" },
    { name: "Meera Reddy", email: "meera@email.com", phone: "+91 43210 98765", reason: "Divorce proceedings" },
    { name: "Karthik Iyer", email: "karthik@email.com", phone: "+91 32109 87654", reason: "IP registration" },
    { name: "Ananya Gupta", email: "ananya@email.com", phone: "+91 21098 76543", reason: "Employment dispute" },
  ];

  // Today's slots
  const todaySlots = [
    { id: "s1", start_time: "09:00", end_time: "10:00", location: "Main Office", max_bookings: 3 },
    { id: "s2", start_time: "10:00", end_time: "11:00", location: "Main Office", max_bookings: 3 },
    { id: "s3", start_time: "11:00", end_time: "12:00", location: "Branch A", max_bookings: 2 },
    { id: "s4", start_time: "14:00", end_time: "15:00", location: "Main Office", max_bookings: 3 },
    { id: "s5", start_time: "15:00", end_time: "16:00", location: "Main Office", max_bookings: 2 },
    { id: "s6", start_time: "16:00", end_time: "17:00", location: "Main Office", max_bookings: 2 },
  ];

  // Generate appointments for various days
  const daysToPopulate = [];
  for (let d = currentDay - 7; d <= currentDay + 14; d++) {
    if (d > 0 && d <= getDaysInMonth(year, month)) {
      if (Math.random() > 0.3) daysToPopulate.push(d);
    }
  }
  // Always include today
  if (!daysToPopulate.includes(currentDay)) {
    daysToPopulate.push(currentDay);
  }

  daysToPopulate.forEach((day) => {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isPast = day < currentDay;
    const isToday = day === currentDay;
    const numTokens = isToday ? 6 : Math.floor(Math.random() * 5) + 1;
    const tokens = [];
    
    const times = ["09:15", "09:45", "10:15", "10:45", "11:15", "14:15", "14:45", "15:15", "15:45", "16:15"];

    for (let i = 0; i < numTokens; i++) {
      const client = clients[i % clients.length];

      let status;
      if (isPast) {
        status = Math.random() > 0.2 ? "completed" : "no_show";
      } else if (isToday) {
        // For today, show varied statuses
        if (i === 0) status = "completed";
        else if (i === 1) status = "completed";
        else if (i === 2) status = "in_progress";
        else if (i === 3) status = "confirmed";
        else if (i === 4) status = "pending";
        else status = "pending";
      } else {
        status = Math.random() > 0.5 ? "confirmed" : "pending";
      }

      tokens.push({
        id: `demo-${dateKey}-${i + 1}`,
        token_number: i + 1,
        client_name: client.name,
        client_email: client.email,
        client_phone: client.phone,
        date: dateKey,
        time: times[i % times.length],
        reason: client.reason,
        status,
        slot_id: todaySlots[i % todaySlots.length].id,
        service_type: "Legal Consultation",
      });
    }

    demoData[dateKey] = { slots: todaySlots, tokens };
  });

  return demoData;
};

// ============== MAIN COMPONENT ==============
const TokenQueue = () => {
  const endpoint = import.meta.env.VITE_TOKEN_QUEUE_ENDPOINT || "/api/token-queue";
  const slotsEndpoint = `${endpoint}/slots`;

  // Calendar state
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(formatDateKey(today));

  // Data state
  const [allData, setAllData] = useState({}); // { dateKey: { slots: [], tokens: [] } }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  // UI state
  const [actionId, setActionId] = useState(null);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Form state
  const [formData, setFormData] = useState({
    token_number: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    time: "09:00",
    reason: "",
    status: "pending",
  });

  // Get data for selected date
  const selectedDateData = useMemo(() => {
    return allData[selectedDate] || { slots: [], tokens: [] };
  }, [allData, selectedDate]);

  // Filtered tokens based on search and status
  const filteredTokens = useMemo(() => {
    let tokens = selectedDateData.tokens || [];

    // Filter by status
    if (statusFilter !== "ALL") {
      tokens = tokens.filter((t) => normalizeStatus(t.status) === statusFilter);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tokens = tokens.filter((t) => {
        const haystack = [
          t.client_name,
          t.client_email,
          t.client_phone,
          t.reason,
          `#${t.token_number || t.id}`,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return tokens;
  }, [selectedDateData.tokens, statusFilter, searchQuery]);

  // Statistics for selected date
  const stats = useMemo(() => {
    const tokens = filteredTokens || [];
    const counts = { pending: 0, confirmed: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0 };
    tokens.forEach((t) => {
      const s = normalizeStatus(t.status);
      if (counts[s] !== undefined) counts[s]++;
    });
    const inProgress = tokens.find((t) => normalizeStatus(t.status) === "in_progress");
    return { total: tokens.length, ...counts, inProgress };
  }, [filteredTokens]);

  // Group tokens by slot time for slot-based view
  const tokensBySlot = useMemo(() => {
    const slots = selectedDateData.slots || [];
    const tokens = filteredTokens || [];
    const tokenIds = new Set(tokens.map((t) => t.id));

    return slots.map((slot) => {
      const slotTokens = (slot.bookings || []).filter((t) => tokenIds.has(t.id));
      return {
        ...slot,
        tokens: slotTokens,
      };
    });
  }, [selectedDateData.slots, filteredTokens]);

  // Count appointments per day for calendar display
  const appointmentCounts = useMemo(() => {
    const counts = {};
    Object.keys(allData).forEach((dateKey) => {
      const tokens = allData[dateKey]?.tokens || [];
      counts[dateKey] = tokens.length;
    });
    return counts;
  }, [allData]);

  // ============== API FUNCTIONS ==============
  const fetchQueue = async (dateStr) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.append("date", dateStr);
      const { data } = await api.get(`${slotsEndpoint}?${params.toString()}`);

      const slots = Array.isArray(data?.slots) ? data.slots : [];
      const tokens = slots.flatMap((slot) =>
        (slot.bookings || []).map((b) => ({
          ...b,
          status: normalizeStatus(b.status),
          client_name: b.client_name || `Client #${b.client_id}`,
          time: b.time_local,
          slot_id: slot.id,
        }))
      );

      const ordered = [...tokens].sort((a, b) => {
        const at = new Date(a.scheduled_at).getTime();
        const bt = new Date(b.scheduled_at).getTime();
        return at - bt;
      });
      const tokenNumberById = new Map();
      ordered.forEach((t, idx) => tokenNumberById.set(t.id, idx + 1));
      const tokensWithNumbers = tokens.map((t) => ({
        ...t,
        token_number: tokenNumberById.get(t.id) || t.token_number,
      }));
      const slotsWithNumbers = slots.map((slot) => ({
        ...slot,
        bookings: (slot.bookings || []).map((b) => ({
          ...b,
          status: normalizeStatus(b.status),
          client_name: b.client_name || `Client #${b.client_id}`,
          time: b.time_local,
          token_number: tokenNumberById.get(b.id) || b.token_number,
        })),
      }));

      if (import.meta.env.DEV) {
        console.log("[TokenQueue] date", dateStr, "slots", slots.length, "bookings", tokens.length);
        slots.forEach((slot) => {
          console.log(
            "[TokenQueue] slot",
            slot.start_time,
            "-",
            slot.end_time,
            "branch",
            slot.branch_id,
            "bookings",
            (slot.bookings || []).length
          );
        });
      }

      setAllData((prev) => ({
        ...prev,
        [dateStr]: { slots: slotsWithNumbers, tokens: tokensWithNumbers },
      }));
      setIsDemo(false);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  };

  const loadDemoData = () => {
    setAllData(buildDemoData());
    setIsDemo(true);
    setError("");
  };

  // Load data when date changes
  useEffect(() => {
    if (selectedDate && !isDemo) {
      fetchQueue(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ============== HANDLERS ==============
  const handleMonthChange = (delta) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const handleDateSelect = (day) => {
    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateKey);
    setSelectedToken(null);
  };

  const goToToday = () => {
    const t = new Date();
    setCurrentYear(t.getFullYear());
    setCurrentMonth(t.getMonth());
    setSelectedDate(formatDateKey(t));
  };

  const handleStatusChange = async (id, newStatus) => {
    if (isDemo) {
      setAllData((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((dateKey) => {
          updated[dateKey] = {
            ...updated[dateKey],
            tokens: updated[dateKey].tokens.map((t) =>
              t.id === id ? { ...t, status: newStatus } : t
            ),
          };
        });
        return updated;
      });
      return;
    }

    if (!isUuid(id)) {
      setError("Token queue actions are unavailable for booking-based view.");
      return;
    }

    setActionId(id);
    setError("");
    try {
      const { data } = await api.patch(`${endpoint}/${id}`, { status: newStatus });
      setAllData((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((dateKey) => {
          updated[dateKey] = {
            ...updated[dateKey],
            tokens: updated[dateKey].tokens.map((t) =>
              t.id === id ? { ...data, status: normalizeStatus(data.status) } : t
            ),
          };
        });
        return updated;
      });
    } catch (err) {
      setError(err?.response?.data?.detail || "Action failed");
    } finally {
      setActionId(null);
    }
  };

  const handleAddToken = async () => {
    if (!formData.client_name.trim()) {
      setError("Client name is required");
      return;
    }

    const tokenNumber = formData.token_number || (stats.total + 1);

    if (isDemo) {
      const newToken = {
        id: `demo-${selectedDate}-new-${Date.now()}`,
        token_number: parseInt(tokenNumber, 10),
        client_name: formData.client_name,
        client_email: formData.client_email,
        client_phone: formData.client_phone,
        date: selectedDate,
        time: formData.time,
        reason: formData.reason,
        status: formData.status,
        service_type: "Legal Consultation",
      };

      setAllData((prev) => ({
        ...prev,
        [selectedDate]: {
          slots: prev[selectedDate]?.slots || [],
          tokens: [...(prev[selectedDate]?.tokens || []), newToken],
        },
      }));
      setShowAddForm(false);
      resetForm();
      return;
    }

    try {
      const payload = {
        date: selectedDate,
        token_number: parseInt(tokenNumber, 10),
        time: formData.time,
        lawyer_id: 1,
        client_id: 1,
        reason: formData.reason,
        status: formData.status,
      };
      const { data } = await api.post(endpoint, payload);
      
      setAllData((prev) => ({
        ...prev,
        [selectedDate]: {
          slots: prev[selectedDate]?.slots || [],
          tokens: [
            ...(prev[selectedDate]?.tokens || []),
            { ...data, client_name: formData.client_name },
          ],
        },
      }));
      setShowAddForm(false);
      resetForm();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to add token");
    }
  };

  const resetForm = () => {
    setFormData({
      token_number: "",
      client_name: "",
      client_email: "",
      client_phone: "",
      time: "09:00",
      reason: "",
      status: "pending",
    });
  };

  // ============== RENDER HELPERS ==============
  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const todayKey = formatDateKey(new Date());
    const cells = [];

    // Empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-cell empty" />);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isToday = dateKey === todayKey;
      const isSelected = dateKey === selectedDate;
      const count = appointmentCounts[dateKey] || 0;
      const hasAppointments = count > 0;

      cells.push(
        <div
          key={day}
          onClick={() => handleDateSelect(day)}
          className={`calendar-cell day ${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${hasAppointments ? "has-appointments" : ""}`}
        >
          <span className="day-number">{day}</span>
          {hasAppointments && (
            <span className="appointment-count">{count}</span>
          )}
        </div>
      );
    }

    return cells;
  };

  const StatusBadge = ({ value }) => {
    const s = normalizeStatus(value);
    const cls = statusStyles[s] || statusStyles.pending;
    const label = statusLabels[s] || s.replace(/_/g, " ").toUpperCase();
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
        {label}
      </span>
    );
  };

  // ============== MAIN RENDER ==============
  return (
    <div className="token-queue-container pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Token Queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            Select a date from the calendar to view appointments
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => !isDemo && fetchQueue(selectedDate)}
            disabled={loading || isDemo}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              loading || isDemo
                ? "border-white/10 bg-white/5 text-slate-500 cursor-not-allowed"
                : "border-white/20 bg-white/10 text-slate-100 hover:bg-white/15"
            }`}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={loadDemoData}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors"
          >
            Load Demo
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Main Layout: Calendar + Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Calendar Section */}
        <div className="xl:col-span-4">
          <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 overflow-hidden">
            {/* Calendar Header */}
            <div className="px-4 py-4 border-b border-white/10 bg-slate-950/40">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => handleMonthChange(-1)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors"
                >
                  ◀
                </button>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white">
                    {MONTHS[currentMonth]} {currentYear}
                  </h3>
                </div>
                <button
                  onClick={() => handleMonthChange(1)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors"
                >
                  ▶
                </button>
              </div>
              <button
                onClick={goToToday}
                className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-medium border border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
              >
                Go to Today
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="p-4">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-slate-400 py-1">
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-1">
                {renderCalendar()}
              </div>
            </div>

            {/* Legend */}
            <div className="px-4 pb-4">
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-cyan-500/50"></span> Today
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-500/50"></span> Has appointments
                </span>
              </div>
            </div>
          </div>

          {/* Stats Card */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <h4 className="text-sm font-semibold text-slate-200 mb-3">
              📊 Booking Status Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="px-3 py-2 rounded-lg bg-slate-800/50">
                <div className="text-slate-400 text-xs">Total Bookings</div>
                <div className="text-white font-bold text-lg">{stats.total}</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-emerald-500/10">
                <div className="text-emerald-400 text-xs">✅ Completed</div>
                <div className="text-emerald-200 font-bold text-lg">{stats.completed}</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-amber-500/10">
                <div className="text-amber-400 text-xs">🔄 In Progress</div>
                <div className="text-amber-200 font-bold text-lg">{stats.in_progress}</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-yellow-500/10">
                <div className="text-yellow-400 text-xs">⏳ Will Come</div>
                <div className="text-yellow-200 font-bold text-lg">{stats.pending + stats.confirmed}</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-red-500/10 col-span-2">
                <div className="text-red-400 text-xs">🚫 Not Come</div>
                <div className="text-red-200 font-bold text-lg">{stats.no_show || 0}</div>
              </div>
            </div>
            {stats.inProgress && (
              <div className="mt-3 p-3 rounded-lg border border-amber-400/30 bg-amber-500/10">
                <div className="text-xs text-amber-300">🔄 Now Serving</div>
                <div className="text-amber-100 font-semibold">
                  #{stats.inProgress.token_number} - {stats.inProgress.client_name}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Queue Section - Slot Based View */}
        <div className="xl:col-span-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            {/* Queue Header */}
            <div className="px-5 py-4 border-b border-white/10 bg-slate-950/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    📋 Today's Slots & Bookings - {formatDateDisplay(selectedDate)}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {filteredTokens.length} booking{filteredTokens.length !== 1 ? "s" : ""} across {selectedDateData.slots?.length || 0} slots
                    {isDemo && <span className="ml-2 text-amber-300">(Demo Mode)</span>}
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Search by name, phone, reason..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-white/10 bg-slate-900/50 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-white/10 bg-slate-900/50 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="pending">⏳ Will Come</option>
                  <option value="confirmed">✓ Confirmed</option>
                  <option value="in_progress">🔄 In Progress</option>
                  <option value="completed">✅ Completed</option>
                  <option value="no_show">🚫 Not Come</option>
                  <option value="cancelled">❌ Cancelled</option>
                </select>
              </div>
            </div>

            {/* Slot-based Token List */}
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="animate-pulse">Loading slots and bookings...</div>
              </div>
            ) : tokensBySlot.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4">📭</div>
                <div className="text-slate-200 text-lg mb-2">No slots available for this date</div>
                <div className="text-slate-500 text-sm">
                  Try selecting a different date or load demo data
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {tokensBySlot.map((slot) => (
                  <div key={slot.id} className="slot-section">
                    {/* Slot Header */}
                    <div className="px-5 py-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-white/5">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
                            <span className="text-cyan-200 text-lg">🕐</span>
                          </div>
                          <div>
                            <div className="text-white font-semibold">
                              {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                            </div>
                            <div className="text-xs text-slate-400">
                              📍 {slot.location || "Main Office"}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${
                            slot.tokens.length >= (slot.max_bookings || 3)
                              ? "text-rose-300"
                              : slot.tokens.length > 0
                              ? "text-emerald-300"
                              : "text-slate-400"
                          }`}>
                            {slot.tokens.length} / {slot.max_bookings || 3} booked
                          </div>
                          {slot.tokens.length === 0 && (
                            <div className="text-xs text-slate-500">No bookings yet</div>
                          )}
                        </div>
                      </div>

                      {/* Slot Action Buttons */}
                      {slot.tokens.length > 0 && (
                        <div className="flex flex-wrap gap-2 pl-14">
                          <button
                            onClick={() => {
                              slot.tokens.forEach(t => handleStatusChange(t.id, "completed"));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                          >
                            ✅ Complete All
                          </button>
                          <button
                            onClick={() => {
                              slot.tokens.forEach(t => handleStatusChange(t.id, "in_progress"));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-400/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 transition-colors"
                          >
                            🔄 Ongoing
                          </button>
                          <button
                            onClick={() => {
                              slot.tokens.forEach(t => handleStatusChange(t.id, "no_show"));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25 transition-colors"
                          >
                            🚫 Not Done
                          </button>
                          <button
                            onClick={() => {
                              slot.tokens.forEach(t => handleStatusChange(t.id, "pending"));
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-yellow-400/30 bg-yellow-500/15 text-yellow-200 hover:bg-yellow-500/25 transition-colors"
                          >
                            ⏳ Reset
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bookings for this slot */}
                    {slot.tokens.length > 0 ? (
                      <div className="divide-y divide-white/5">
                        {slot.tokens.map((token) => {
                          const status = normalizeStatus(token.status);
                          const busy = actionId === token.id;
                          const isExpanded = selectedToken?.id === token.id;

                          const canConfirm = status === "pending";
                          const canServe = status === "confirmed" || status === "pending";
                          const canComplete = status === "in_progress";
                          const canNoShow = status === "pending" || status === "confirmed";
                          const canCancel = !["completed", "cancelled", "no_show"].includes(status);

                          return (
                            <div
                              key={token.id}
                              className={`px-5 py-4 hover:bg-white/5 transition-colors cursor-pointer ${
                                isExpanded ? "bg-white/10 border-l-4 border-l-cyan-400" : ""
                              }`}
                              onClick={() => setSelectedToken(isExpanded ? null : token)}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                  {/* Token Number Badge */}
                                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                                    status === "completed"
                                      ? "bg-emerald-500/20 border border-emerald-400/30"
                                      : status === "in_progress"
                                      ? "bg-amber-500/20 border border-amber-400/30"
                                      : status === "no_show"
                                      ? "bg-red-500/20 border border-red-400/30"
                                      : "bg-cyan-500/20 border border-cyan-400/30"
                                  }`}>
                                    <span className={`text-lg font-bold ${
                                      status === "completed"
                                        ? "text-emerald-200"
                                        : status === "in_progress"
                                        ? "text-amber-200"
                                        : status === "no_show"
                                        ? "text-red-200"
                                        : "text-cyan-200"
                                    }`}>
                                      #{token.token_number}
                                    </span>
                                  </div>

                                  {/* Client Info */}
                                  <div>
                                    <h4 className="text-base font-semibold text-white">
                                      {token.client_name}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-x-3 text-sm text-slate-400 mt-0.5">
                                      <span>⏰ {formatTime(token.time)}</span>
                                      {token.reason && (
                                        <span className="text-slate-500">• {token.reason}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Status Badge */}
                                <StatusBadge value={status} />
                              </div>

                              {/* Expanded Actions */}
                              {isExpanded && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                  <div className="flex flex-wrap gap-2">
                                    {canConfirm && (
                                      <button
                                        disabled={busy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(token.id, "confirmed");
                                        }}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-blue-400/30 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25 disabled:opacity-50"
                                      >
                                        {busy ? "..." : "✓ Confirm Booking"}
                                      </button>
                                    )}
                                    {canServe && (
                                      <button
                                        disabled={busy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(token.id, "in_progress");
                                        }}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-amber-400/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
                                      >
                                        {busy ? "..." : "🔄 Client Arrived - Start"}
                                      </button>
                                    )}
                                    {canComplete && (
                                      <button
                                        disabled={busy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(token.id, "completed");
                                        }}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                                      >
                                        {busy ? "..." : "✅ Completed"}
                                      </button>
                                    )}
                                    {canNoShow && (
                                      <button
                                        disabled={busy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(token.id, "no_show");
                                        }}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                                      >
                                        {busy ? "..." : "🚫 Not Come (No Show)"}
                                      </button>
                                    )}
                                    {canCancel && (
                                      <button
                                        disabled={busy}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(token.id, "cancelled");
                                        }}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold border border-rose-400/30 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
                                      >
                                        {busy ? "..." : "❌ Cancel"}
                                      </button>
                                    )}
                                  </div>
                                  {/* Contact Info */}
                                  {(token.client_email || token.client_phone) && (
                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 text-xs text-slate-400">
                                      {token.client_phone && <span>📞 {token.client_phone}</span>}
                                      {token.client_email && <span>✉️ {token.client_email}</span>}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-5 py-4 text-center text-slate-500 text-sm">
                        No bookings in this time slot
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Token Modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowAddForm(false)}
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-white mb-4">
              Add New Token for {formatDateDisplay(selectedDate).split(",")[0]}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Token # (auto)</label>
                  <input
                    type="number"
                    placeholder={`${stats.total + 1}`}
                    value={formData.token_number}
                    onChange={(e) => setFormData({ ...formData, token_number: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Time *</label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Client Name *</label>
                <input
                  type="text"
                  placeholder="Enter client name"
                  value={formData.client_name}
                  onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email</label>
                  <input
                    type="email"
                    placeholder="client@email.com"
                    value={formData.client_email}
                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Phone</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.client_phone}
                    onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reason for Visit</label>
                <input
                  type="text"
                  placeholder="Legal consultation, document review, etc."
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Initial Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleAddToken}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border border-emerald-400/30 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
              >
                Add Token
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenQueue;
