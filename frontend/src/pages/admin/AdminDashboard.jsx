import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import AuthLoginsPerMinuteLineChart from "../../features/admin/components/charts/AuthLoginsPerMinuteLineChart";
import AuditTopActionsBarChart from "../../features/admin/components/charts/AuditTopActionsBarChart";
import "./AdminDashboard.css";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/admin/overview");
      setData(res.data);
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load admin overview.";
      setError(msg);
      if (status === 401 || status === 403) {
        navigate("/not-authorized");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => {
    if (!data) {
      return {
        totalUsers: "—",
        totalLawyers: "—",
        verifiedLawyers: "—",
        pendingKYC: "—",
        totalBookings: "—",
      };
    }
    return {
      totalUsers: data.total_users,
      totalLawyers: data.total_lawyers,
      verifiedLawyers: data.verified_lawyers,
      pendingKYC: data.pending_kyc,
      totalBookings: data.total_bookings,
    };
  }, [data]);

  const recentBookings = data?.recent_bookings || [];
  const lawyers = data?.lawyers || [];

  return (
    <div className="admin-dashboard-page">
      <div className="diamond-pattern"></div>

      <main className="admin-dashboard-main">
        <div className="admin-dashboard-container">
          <section className="admin-overview-section">
            <div className="admin-overview-card">
              <h1 className="admin-overview-title">Admin Dashboard</h1>
              <h2 className="admin-overview-subtitle">Case Management Overview</h2>
              <p className="admin-overview-description">
                Track platform activity, review verifications, and monitor operational status at a glance.
              </p>
            </div>
          </section>

          {error && (
            <div className="admin-error-banner">
              {error}
            </div>
          )}

          <section className="admin-metrics-grid">
            {[
              {
                icon: "👥",
                value: metrics.totalUsers,
                label: "Total Users",
                detail: `${metrics.totalLawyers} lawyers`,
              },
              {
                icon: "⚖️",
                value: metrics.totalLawyers,
                label: "Total Lawyers",
                detail: `${metrics.verifiedLawyers} verified`,
              },
              {
                icon: "⏳",
                value: metrics.pendingKYC,
                label: "Pending KYC",
                detail: "Review now →",
              },
              {
                icon: "📅",
                value: metrics.totalBookings,
                label: "Total Bookings",
                detail: "",
              },
            ].map((card, idx) => (
              <div key={idx} className="admin-metric-card">
                <div className="metric-icon">{card.icon}</div>
                <div className="metric-content">
                  <div className="metric-value">
                    {loading ? "…" : card.value}
                  </div>
                  <div className="metric-label">{card.label}</div>
                  <div className="metric-detail">{card.detail}</div>
                </div>
              </div>
            ))}
          </section>

          <section className="admin-charts-grid">
            <AuthLoginsPerMinuteLineChart />
            <AuditTopActionsBarChart />
          </section>

          <section className="admin-kyc-banner">
            <div className="kyc-banner-icon">⏳</div>
            <div className="kyc-banner-content">
              <h3 className="kyc-banner-title">
                {loading ? "…" : metrics.pendingKYC} Pending KYC Verification
              </h3>
              <p className="kyc-banner-description">
                Review and approve lawyer registrations to maintain platform quality.
              </p>
            </div>
            <a href="/admin/kyc-approval" className="btn btn-primary kyc-review-btn">
              Review KYC →
            </a>
          </section>

          <section className="admin-content-grid">
            <div className="admin-content-card">
              <div className="content-card-header">
                <span className="content-card-icon">⭐</span>
                <h3 className="content-card-title">Recent Bookings</h3>
              </div>
              <div className="content-card-body">
                {loading && <div className="booking-item skeleton">Loading...</div>}
                {!loading && recentBookings.length === 0 && (
                  <div className="no-kyc-data">No recent bookings.</div>
                )}
                {!loading &&
                  recentBookings.map((booking) => (
                    <div key={booking.id} className="booking-item">
                      <div className="booking-info">
                        <span className="booking-lawyer">
                          {booking.client_name || "Client"}
                        </span>
                        <span className="booking-date">
                          {booking.scheduled_at
                            ? new Date(booking.scheduled_at).toLocaleString()
                            : "Unscheduled"}
                        </span>
                      </div>
                      <span className={`booking-status ${booking.status || "pending"}`}>
                        {booking.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="admin-content-card">
              <div className="content-card-header">
                <span className="content-card-icon">⭐</span>
                <h3 className="content-card-title">Lawyers Overview</h3>
              </div>
              <div className="content-card-body">
                {loading && <div className="lawyer-item skeleton">Loading...</div>}
                {!loading && lawyers.length === 0 && (
                  <div className="no-kyc-data">No lawyers found.</div>
                )}
                {!loading &&
                  lawyers.map((lawyer) => (
                    <div key={lawyer.user_id} className="lawyer-item">
                      <div className="lawyer-avatar-small">
                        {(lawyer.full_name || "L")[0]}
                      </div>
                      <div className="lawyer-info-small">
                        <span className="lawyer-name-small">{lawyer.full_name}</span>
                        <span className="lawyer-spec-small">{lawyer.specialization}</span>
                      </div>
                      {lawyer.is_verified ? (
                        <span className="lawyer-status-icon verified-icon">✓</span>
                      ) : (
                        <span className="lawyer-status-icon pending-icon">⏳</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </section>

          <section className="admin-bottom-cards">
            <a href="/admin/kyc-approval" className="admin-feature-card">
              <div className="feature-card-icon">⏳</div>
              <h4 className="feature-card-title">KYC Approval</h4>
              <p className="feature-card-description">
                Review and approve lawyer verifications.
              </p>
            </a>

            <a href="/admin/audit-log" className="admin-feature-card">
              <div className="feature-card-icon">📄</div>
              <h4 className="feature-card-title">Audit Log</h4>
              <p className="feature-card-description">
                View system activity and changes.
              </p>
            </a>

            <div className="admin-feature-card">
              <div className="feature-card-icon">👥</div>
              <h4 className="feature-card-title">Platform Stats</h4>
              <ul className="feature-card-list">
                <li>{loading ? "…" : `${metrics.totalLawyers} registered lawyers`}</li>
                <li>{loading ? "…" : `${metrics.totalBookings} total bookings`}</li>
                <li>{loading ? "…" : `${metrics.verifiedLawyers} verified lawyers`}</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
