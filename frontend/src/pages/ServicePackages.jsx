import { useEffect, useState } from "react";
import "./lawyer-ui.css";

import {
  createServicePackage,
  deleteServicePackage,
  getMyServicePackages,
  updateServicePackage,
} from "../services/servicePackages";

function ServicePackages() {
  const [packages, setPackages] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    duration: "",
    active: true,
  });

  const loadPackages = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMyServicePackages();
      setPackages(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load service packages. Make sure you are logged in as Lawyer.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      price: "",
      duration: "",
      active: true,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      duration: Number(form.duration),
      active: Boolean(form.active),
    };

    try {
      if (editingId) {
        // For PATCH you can send only changed fields,
        // but sending full payload is fine if your backend accepts it.
        await updateServicePackage(editingId, payload);
      } else {
        await createServicePackage(payload);
      }

      resetForm();
      await loadPackages();
    } catch (err) {
      console.error(err);
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to save service package.";
      setError(message);
    }
  };

  const handleEdit = (pkg) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name || "",
      description: pkg.description || "",
      price: pkg.price?.toString?.() ?? "",
      duration: pkg.duration?.toString?.() ?? "",
      active: !!pkg.active,
    });
  };

  const handleDelete = async (id) => {
    const ok = confirm("Delete this service package?");
    if (!ok) return;

    setError("");
    try {
      await deleteServicePackage(id);
      await loadPackages();
    } catch (err) {
      console.error(err);
      setError("Failed to delete service package.");
    }
  };

  const handleCancel = () => resetForm();

  return (
    <div className="">
      <div className="lc-card">
        <div className="lc-header">
          <div className="lc-icon">SP</div>
          <div>
            <h1 className="lc-title">Service Packages</h1>
            <p className="lc-subtitle">Manage your service offerings</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="availability-form">
          <div className="lc-form-grid">
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="name" className="form-label">
                Package Name <span className="required-star">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g., Legal Consultation"
                className="lc-input"
                required
              />
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="description" className="form-label">
                Description <span className="required-star">*</span>
              </label>
              <input
                type="text"
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Brief description of the service"
                className="lc-input"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="price" className="form-label">
                Price (LKR) <span className="required-star">*</span>
              </label>
              <input
                type="number"
                id="price"
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="e.g., 1500"
                className="lc-input"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="duration" className="form-label">
                Duration (minutes) <span className="required-star">*</span>
              </label>
              <input
                type="number"
                id="duration"
                name="duration"
                value={form.duration}
                onChange={handleChange}
                placeholder="e.g., 60"
                className="lc-input"
                min="1"
                required
              />
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="active" className="form-label">
                Status
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", paddingTop: "0.5rem" }}>
                <div
                  className={`lc-toggle ${form.active ? "active" : ""}`}
                  onClick={() => setForm((p) => ({ ...p, active: !p.active }))}
                />
                <span style={{ fontSize: "0.9rem", color: "rgba(226, 232, 240, 0.78)" }}>Active</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
            {editingId && (
              <button type="button" className="availability-danger-btn" onClick={handleCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="lc-primary-btn">
              <span>+</span>
              {editingId ? "Save Changes" : "Add Package"}
            </button>
          </div>
        </form>

        <div className="lc-divider" />

        <div className="availability-section-header">
          <h2>Your Service Packages</h2>
          <p>Manage your existing service packages.</p>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="empty-state">
            <p>No service packages yet</p>
            <p className="empty-sub">Add your first service package to get started.</p>
            <button
              type="button"
              className="lc-primary-btn"
              style={{ marginTop: "1rem" }}
              onClick={() => {
                const el = document.getElementById("name");
                if (el) el.focus();
              }}
            >
              <span>+</span>
              Add First Package
            </button>
          </div>
        ) : (
          <div className="lc-card-grid">
            {packages.map((pkg) => (
              <div key={pkg.id} className="lc-card-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div className="lc-list-card-title" style={{ margin: 0 }}>{pkg.name}</div>
                  <span className={`lc-badge ${pkg.active ? "green" : "red"}`}>
                    {pkg.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="lc-list-card-meta" style={{ marginBottom: "1rem" }}>
                  {pkg.description || "No description provided."}
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <div className="lc-list-card-meta">
                    {pkg.duration} minutes
                  </div>
                </div>
                <div className="lc-list-card-meta" style={{ marginBottom: "1rem" }}>
                  Pricing will be discussed directly with the client.
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    className="lc-primary-btn"
                    style={{ flex: 1, height: "36px", fontSize: "0.85rem", padding: "0 1rem" }}
                    onClick={() => handleEdit(pkg)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="lc-icon-btn delete"
                    onClick={() => handleDelete(pkg.id)}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ServicePackages;
