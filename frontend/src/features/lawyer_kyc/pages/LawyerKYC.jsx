import { useState, useEffect } from "react";
import { submitKyc, getMyKyc } from "../services/lawyerKyc.service";
import "../../../pages/lawyer-ui.css";

function LawyerKYC() {
  const [kycStatus, setKycStatus] = useState("not_submitted");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    nic_number: "",
    bar_council_id: "",
    address: "",
    contact_number: "",
    bar_certificate_url: "",
  });

  useEffect(() => {
    const fetchMyKyc = async () => {
      try {
        const res = await getMyKyc();
        if (res?.data?.status) setKycStatus(res.data.status);
      } catch {
        setKycStatus("not_submitted");
      }
    };
    fetchMyKyc();
  }, []);

  const isPending = kycStatus === "pending";
  const isApproved = kycStatus === "approved";
  const isRejected = kycStatus === "rejected";

  const statusText = {
    not_submitted: "Please submit your KYC documents to become a verified lawyer.",
    pending: "Your KYC is under review.",
    approved: "Your KYC has been approved.",
    rejected: "Your KYC was rejected. Please resubmit.",
  }[kycStatus];

  const statusHelperText = {
    not_submitted: "",
    pending: "We are verifying your submitted documents. This usually takes 1-2 business days.",
    approved: "",
    rejected: "",
  }[kycStatus];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await submitKyc(form);
      setKycStatus("pending");
    } catch (err) {
      console.error(err);
      setError("Failed to submit KYC. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = () => setKycStatus("not_submitted");

  return (
    <div className="">
      <div className="lc-card">
        <div className="lc-header">
          <div className="lc-icon">KYC</div>
          <div>
            <h1 className="lc-title">KYC Status</h1>
            <p className="lc-subtitle">Your verification status</p>
          </div>
        </div>

        <div className={`lc-status-banner ${kycStatus}`}>
          <div className="lc-status-icon">
            {kycStatus === "pending" && "P"}
            {kycStatus === "approved" && "OK"}
            {kycStatus === "rejected" && "X"}
            {kycStatus === "not_submitted" && "!"}
          </div>
          <div className="lc-status-text">
            <div className="lc-status-title">{statusText}</div>
            {statusHelperText && (
              <p className="lc-status-desc">{statusHelperText}</p>
            )}
          </div>
          <span className={`lc-chip ${kycStatus.replace("_", "-")}`}>
            {kycStatus === "not_submitted" ? "Not Submitted" : kycStatus.charAt(0).toUpperCase() + kycStatus.slice(1)}
          </span>
        </div>

        {!isApproved && (
          <>
            <h2 className="lc-title" style={{ marginBottom: "1.5rem", fontSize: "1.25rem" }}>
              Submit KYC Information
            </h2>

            <form onSubmit={handleSubmit} className="availability-form">
              {error && (
                <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
                  {error}
                </div>
              )}
              {isRejected && (
                <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
                  Your KYC was rejected. Please review and resubmit your details.
                </div>
              )}

              <div className="lc-form-grid">
                <div className="form-group">
                  <label htmlFor="full_name" className="form-label">
                    Full Name <span className="required-star">*</span>
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={form.full_name}
                    onChange={handleChange}
                    disabled={isPending || submitting}
                    placeholder="As per Bar Council registration"
                    className="lc-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="nic_number" className="form-label">
                    NIC Number <span className="required-star">*</span>
                  </label>
                  <input
                    type="text"
                    id="nic_number"
                    name="nic_number"
                    value={form.nic_number}
                    onChange={handleChange}
                    disabled={isPending || submitting}
                    placeholder="e.g., 199012345678"
                    className="lc-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bar_council_id" className="form-label">
                    Bar Council ID <span className="required-star">*</span>
                  </label>
                  <input
                    type="text"
                    id="bar_council_id"
                    name="bar_council_id"
                    value={form.bar_council_id}
                    onChange={handleChange}
                    disabled={isPending || submitting}
                    placeholder="Your Bar Council registration number"
                    className="lc-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact_number" className="form-label">
                    Contact Number <span className="required-star">*</span>
                  </label>
                  <input
                    type="text"
                    id="contact_number"
                    name="contact_number"
                    value={form.contact_number}
                    onChange={handleChange}
                    disabled={isPending || submitting}
                    placeholder="e.g., +94 77 123 4567"
                    className="lc-input"
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="address" className="form-label">
                    Address <span className="required-star">*</span>
                  </label>
                  <textarea
                    id="address"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    disabled={isPending || submitting}
                    placeholder="Your registered address"
                    className="lc-textarea"
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="bar_certificate_url" className="form-label">
                    Bar Council Certificate URL <span className="required-star">*</span>
                  </label>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <input
                      type="text"
                      id="bar_certificate_url"
                      name="bar_certificate_url"
                    value={form.bar_certificate_url}
                    onChange={handleChange}
                    disabled={isPending || submitting}
                    placeholder="Upload your certificate and paste the URL here"
                    className="lc-input"
                    style={{ flex: 1 }}
                    required
                  />
                  <button
                    type="button"
                    className="lc-primary-btn"
                    style={{ width: "auto", minWidth: "120px" }}
                    disabled={isPending || submitting}
                    onClick={() => {}}
                  >
                    Upload
                  </button>
                </div>
                  <div className="field-hint" style={{ marginTop: "0.5rem" }}>
                    Please ensure the certificate is clear and all text is readable
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
                {isRejected && (
                  <button
                    type="button"
                    className="availability-danger-btn"
                    onClick={handleResubmit}
                  >
                    Start Over
                  </button>
                )}
                <button
                  type="submit"
                  className="lc-primary-btn"
                  disabled={isPending || submitting}
                >
                  {submitting ? "Submitting..." : "Submit for Verification"}
                </button>
              </div>
            </form>
          </>
        )}

        {isApproved && (
          <div className="alert alert-success" style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "1.1rem", fontWeight: 650, marginBottom: "0.5rem" }}>
              KYC Approved
            </div>
            <p>Your KYC has been approved. No further action is required.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LawyerKYC;