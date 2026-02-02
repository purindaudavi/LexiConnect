import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./lawyer-ui.css";

export default function LawyerDashboard() {
  const navigate = useNavigate();

  const [kpis, setKpis] = useState({
    pendingRequests: 0,
    incomingBookings: 0,
    tokenQueueToday: 0,
    kycStatus: "pending", // pending | approved | rejected | not_submitted
  });

  const [profile, setProfile] = useState({
    name: "Lawyer",
    email: "",
    phone: "",
    district: "",
    specialization: "",
    experienceYears: "",
    languages: "",
    avatarUrl: "",
    bio: "",
  });

  // Load minimal identity from localStorage (safe default)
  useEffect(() => {
    const email = localStorage.getItem("email") || "";
    const avatarUrl = localStorage.getItem("avatar") || "";

    setProfile((p) => ({
      ...p,
      email,
      avatarUrl,
      name: email ? email.split("@")[0] : p.name,
    }));

    // KPIs remain demo-safe for now (connect later)
    setKpis((p) => ({ ...p }));
  }, []);

  const kycLabel = useMemo(() => {
    const s = (kpis.kycStatus || "pending").toLowerCase();
    if (s === "approved") return { text: "Approved", cls: "approved" };
    if (s === "rejected") return { text: "Rejected", cls: "rejected" };
    if (s === "not_submitted") return { text: "Not Submitted", cls: "not-submitted" };
    return { text: "Pending", cls: "pending" };
  }, [kpis.kycStatus]);

  const initials = useMemo(() => {
    const base = (profile.name || profile.email || "Lawyer").trim();
    const parts = base.split(/\s+/);
    const a = parts[0]?.[0] || "L";
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return (a + b).toUpperCase();
  }, [profile.name, profile.email]);

  const profileCompletion = useMemo(() => {
    const fields = [
      !!profile.name,
      !!profile.email,
      !!profile.phone,
      !!profile.district,
      !!profile.specialization,
      !!profile.experienceYears,
      !!profile.languages,
      !!profile.bio,
      !!profile.avatarUrl,
    ];
    const done = fields.filter(Boolean).length;
    return Math.round((done / fields.length) * 100);
  }, [profile]);

  const topNextAction = useMemo(() => {
    if ((kpis.kycStatus || "").toLowerCase() !== "approved") {
      return {
        title: "Complete KYC verification",
        desc: "Verified lawyers gain higher trust and better visibility to clients.",
        cta: "Go to KYC",
        to: "/lawyer/kyc",
      };
    }
    if (profileCompletion < 80) {
      return {
        title: "Complete your public profile",
        desc: "A strong profile helps clients choose you faster.",
        cta: "Edit Profile",
        to: "/lawyer/profile/edit",
      };
    }
    return {
      title: "Review incoming bookings",
      desc: "Respond quickly to improve client satisfaction and conversion.",
      cta: "Open Incoming Bookings",
      to: "/lawyer/bookings/incoming",
    };
  }, [kpis.kycStatus, profileCompletion]);

  const onUploadPhoto = () => navigate("/lawyer/profile/edit");

  return (
    // ✅ Use the same wrapper that other lawyer pages use to avoid the “extra box”
    <div className="lc-page">
      <div className="lc-card">
        {/* Header */}
        <div className="dash-head compact">
          <div>
            <h1 className="dash-title">Lawyer Dashboard</h1>
            <p className="dash-subtitle">
              Manage cases, bookings, availability, and your professional presence.
            </p>
          </div>

          <div className="dash-head-actions">
            <button
              className="dash-action-btn primary"
              onClick={() => navigate("/lawyer/cases/feed")}
            >
              Open Case Feed
            </button>
            <button
              className="dash-action-btn"
              onClick={() => navigate("/lawyer/cases/requests")}
            >
              My Requests
            </button>
          </div>
        </div>

        {/* Layout */}
        <div className="dash-grid tidy">
          {/* LEFT */}
          <div className="dash-left">
            {/* KPI Row */}
            <div className="dash-kpis tidy">
              <div className="dash-kpi">
                <div className="dash-kpi-label">Pending Requests</div>
                <div className="dash-kpi-value">{kpis.pendingRequests}</div>
                <div className="dash-kpi-meta">Waiting for client approval</div>
              </div>

              <div className="dash-kpi">
                <div className="dash-kpi-label">Incoming Bookings</div>
                <div className="dash-kpi-value">{kpis.incomingBookings}</div>
                <div className="dash-kpi-meta">Need accept / reject</div>
              </div>

              <div className="dash-kpi">
                <div className="dash-kpi-label">Token Queue Today</div>
                <div className="dash-kpi-value">{kpis.tokenQueueToday}</div>
                <div className="dash-kpi-meta">Consultations for today</div>
              </div>

              <div className="dash-kpi">
                <div className="dash-kpi-label">KYC Status</div>
                <div className="dash-kpi-value">
                  <span className={`lc-chip ${kycLabel.cls}`}>{kycLabel.text}</span>
                </div>
                <div className="dash-kpi-meta">Verification & trust</div>
              </div>
            </div>

            {/* Today’s Work */}
            <div className="dash-section">
              <div className="dash-section-title">Today</div>
              <div className="dash-mini-card tidy">
                <div className="dash-mini-title">{topNextAction.title}</div>
                <div className="dash-mini-sub">{topNextAction.desc}</div>

                <div className="dash-inline-actions">
                  <button
                    className="dash-action-btn primary"
                    onClick={() => navigate(topNextAction.to)}
                  >
                    {topNextAction.cta}
                  </button>
                  <button
                    className="dash-action-btn"
                    onClick={() => navigate("/lawyer/cases/feed")}
                  >
                    Browse Case Feed
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="dash-section">
              <div className="dash-section-title">Quick Actions</div>

              <div className="dash-actions tidy">
                <button className="dash-tile" onClick={() => navigate("/lawyer/bookings/incoming")}>
                  <div className="dash-tile-title">Incoming Bookings</div>
                  <div className="dash-tile-sub">Accept / reject booking requests</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/availability")}>
                  <div className="dash-tile-title">Availability</div>
                  <div className="dash-tile-sub">Set weekly schedule</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/token-queue")}>
                  <div className="dash-tile-title">Token Queue</div>
                  <div className="dash-tile-sub">Manage walk-in consultations</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/branches")}>
                  <div className="dash-tile-title">Branches</div>
                  <div className="dash-tile-sub">Office locations & addresses</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/services")}>
                  <div className="dash-tile-title">Services</div>
                  <div className="dash-tile-sub">Practice services (fees discussed privately)</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/checklist")}>
                  <div className="dash-tile-title">Checklists</div>
                  <div className="dash-tile-sub">Case templates & steps</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/apprenticeship")}>
                  <div className="dash-tile-title">Apprenticeship</div>
                  <div className="dash-tile-sub">Assign tasks & review notes</div>
                </button>

                <button className="dash-tile" onClick={() => navigate("/lawyer/public-profile")}>
                  <div className="dash-tile-title">Public Profile</div>
                  <div className="dash-tile-sub">Preview what clients see</div>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="dash-right">
            {/* Profile Card */}
            <div className="dash-profile tidy">
              <div className="dash-profile-top">
                <div className="dash-avatar">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="avatar" />
                  ) : (
                    <div className="dash-avatar-fallback">{initials}</div>
                  )}
                </div>

                <div className="dash-profile-meta">
                  <div className="dash-profile-name">{profile.name || "Lawyer"}</div>
                  <div className="dash-profile-line">{profile.email || "No email set"}</div>
                  <div className="dash-profile-line">{profile.phone || "No phone set"}</div>
                </div>
              </div>

              <div className="dash-profile-hint">
                Profile completion: <b>{profileCompletion}%</b>
              </div>

              <div className="dash-profile-actions">
                <button
                  className="dash-action-btn primary"
                  onClick={() => navigate("/lawyer/profile/edit")}
                >
                  Edit Profile
                </button>
                <button
                  className="dash-action-btn"
                  onClick={() => navigate("/lawyer/public-profile")}
                >
                  View Public Profile
                </button>
                <button className="dash-action-btn" onClick={onUploadPhoto}>
                  Upload Photo
                </button>
              </div>

              <div className="dash-profile-hint">
                Tip: A complete profile improves trust and conversion.
              </div>
            </div>

            {/* Shortcuts */}
            <div className="dash-mini tidy">
              <div className="dash-section-title">Shortcuts</div>

              <div className="dash-mini-card tidy">
                <div className="dash-mini-title">Account Settings</div>
                <div className="dash-mini-sub">Password & preferences.</div>
                <button className="dash-action-btn" onClick={() => navigate("/lawyer/settings")}>
                  Open Settings
                </button>
              </div>

              <div className="dash-mini-card tidy" style={{ marginTop: 12 }}>
                <div className="dash-mini-title">KYC Verification</div>
                <div className="dash-mini-sub">Keep KYC updated for trust with clients.</div>
                <button className="dash-action-btn primary" onClick={() => navigate("/lawyer/kyc")}>
                  Go to KYC
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
