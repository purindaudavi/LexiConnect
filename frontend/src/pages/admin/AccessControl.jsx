
import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import "./AccessControl.css";

const tabs = [
  { id: "roles", label: "Roles & Permissions" },
  { id: "users", label: "Users" },
  { id: "catalog", label: "System Capabilities" },
];

const defaultRoleForm = {
  name: "",
  description: "",
  is_system: false,
};

const AccessControl = () => {
  const [activeTab, setActiveTab] = useState("roles");
  const [modules, setModules] = useState([]);
  const [privileges, setPrivileges] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [roleForm, setRoleForm] = useState(defaultRoleForm);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [selectedRoleDescription, setSelectedRoleDescription] = useState("");
  const [selectedRoleIsSystem, setSelectedRoleIsSystem] = useState(false);
  const [rolePrivilegeKeys, setRolePrivilegeKeys] = useState([]);
  const [initialRolePrivilegeKeys, setInitialRolePrivilegeKeys] = useState([]);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);

  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(12);
  const [userList, setUserList] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [userEffectivePrivileges, setUserEffectivePrivileges] = useState([]);
  const [userGrantOverrides, setUserGrantOverrides] = useState([]);
  const [userDenyOverrides, setUserDenyOverrides] = useState([]);
  const [showOverrides, setShowOverrides] = useState(false);
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [overrideKey, setOverrideKey] = useState("");
  const [overrideEffect, setOverrideEffect] = useState("grant");

  const privilegeMap = useMemo(() => {
    const map = new Map();
    privileges.forEach((priv) => map.set(priv.key, priv));
    return map;
  }, [privileges]);

  const privilegesByModule = useMemo(() => {
    const grouped = new Map();
    modules.forEach((module) => grouped.set(module.id, []));
    privileges.forEach((priv) => {
      if (!grouped.has(priv.module_id)) grouped.set(priv.module_id, []);
      grouped.get(priv.module_id).push(priv);
    });
    const ordered = [];
    modules.forEach((module) => {
      ordered.push({
        module,
        privileges: (grouped.get(module.id) || []).sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      });
    });
    return ordered;
  }, [modules, privileges]);

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesQuery =
        !query ||
        role.name.toLowerCase().includes(query) ||
        (role.description || "").toLowerCase().includes(query);
      const matchesFilter =
        roleFilter === "all" ||
        (roleFilter === "system" && role.is_system) ||
        (roleFilter === "custom" && !role.is_system);
      return matchesQuery && matchesFilter;
    });
  }, [roles, roleSearch, roleFilter]);

  const hasUnsavedPrivileges = useMemo(() => {
    if (!selectedRoleId) return false;
    if (rolePrivilegeKeys.length !== initialRolePrivilegeKeys.length) return true;
    const initialSet = new Set(initialRolePrivilegeKeys);
    return rolePrivilegeKeys.some((key) => !initialSet.has(key));
  }, [selectedRoleId, rolePrivilegeKeys, initialRolePrivilegeKeys]);
  const loadCoreData = async () => {
    setLoading(true);
    setError("");
    try {
      const [modulesRes, privilegesRes, rolesRes] = await Promise.all([
        api.get("/admin/access-control/modules"),
        api.get("/admin/access-control/privileges"),
        api.get("/admin/access-control/roles"),
      ]);
      setModules(modulesRes.data || []);
      setPrivileges(privilegesRes.data || []);
      setRoles(rolesRes.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load access control data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (nextPage = userPage, nextSize = userPageSize) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/admin/access-control/users", {
        params: {
          search: userSearch || undefined,
          page: nextPage,
          page_size: nextSize,
        },
      });
      setUserList(data?.items || []);
      setUserTotal(data?.total || 0);
      setUserPage(data?.page || nextPage);
      setUserPageSize(data?.page_size || nextSize);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load users.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoreData();
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      loadUsers(1, userPageSize);
    }
  }, [activeTab, userPageSize]);

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || null,
        is_system: Boolean(roleForm.is_system),
      };
      const { data } = await api.post("/admin/access-control/roles", payload);
      setRoles((prev) => [...prev, data]);
      setRoleForm(defaultRoleForm);
      setShowCreateRole(false);
      setSuccess("Role created.");
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to create role.";
      setError(message);
    }
  };

  const selectRole = async (role) => {
    setSelectedRoleId(role.id);
    setSelectedRoleName(role.name);
    setSelectedRoleDescription(role.description || "");
    setSelectedRoleIsSystem(Boolean(role.is_system));
    setError("");
    setSuccess("");
    try {
      const { data } = await api.get(`/admin/access-control/roles/${role.id}/privileges`);
      setRolePrivilegeKeys(data || []);
      setInitialRolePrivilegeKeys(data || []);
      setExpandedModules(new Set());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load role privileges.";
      setError(message);
    }
  };

  const handleSaveRoleMeta = async () => {
    if (!selectedRoleId) return;
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: selectedRoleIsSystem ? undefined : selectedRoleName.trim(),
        description: selectedRoleDescription.trim() || null,
      };
      const { data } = await api.put(`/admin/access-control/roles/${selectedRoleId}`, payload);
      setRoles((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      setSuccess("Role details updated.");
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to update role.";
      setError(message);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRoleId) return;
    if (selectedRoleIsSystem) return;
    if (!window.confirm("Delete this role? Users assigned to it will lose access.")) return;
    setError("");
    setSuccess("");
    try {
      await api.delete(`/admin/access-control/roles/${selectedRoleId}`);
      setRoles((prev) => prev.filter((r) => r.id !== selectedRoleId));
      setSelectedRoleId(null);
      setRolePrivilegeKeys([]);
      setInitialRolePrivilegeKeys([]);
      setSuccess("Role deleted.");
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to delete role.";
      setError(message);
    }
  };

  const toggleModule = (moduleId) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  const handleTogglePrivilege = (privilegeKey) => {
    setRolePrivilegeKeys((prev) =>
      prev.includes(privilegeKey) ? prev.filter((k) => k !== privilegeKey) : [...prev, privilegeKey]
    );
  };

  const handleBulkAction = (moduleId, action) => {
    if (!selectedRoleId) return;
    setBulkAction({ moduleId, action });
  };

  const confirmBulkAction = () => {
    if (!bulkAction) return;
    const { moduleId, action } = bulkAction;
    const modulePrivs = privilegesByModule.find((group) => group.module.id === moduleId);
    if (!modulePrivs) {
      setBulkAction(null);
      return;
    }
    const keys = modulePrivs.privileges.map((priv) => priv.key);
    setRolePrivilegeKeys((prev) => {
      const set = new Set(prev);
      if (action === "enable") {
        keys.forEach((key) => set.add(key));
      } else {
        keys.forEach((key) => set.delete(key));
      }
      return Array.from(set);
    });
    setBulkAction(null);
  };

  const handleSaveRolePrivileges = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = { privilege_keys: rolePrivilegeKeys };
      const { data } = await api.put(
        `/admin/access-control/roles/${selectedRoleId}/privileges`,
        payload
      );
      const updatedKeys = data || rolePrivilegeKeys;
      setRolePrivilegeKeys(updatedKeys);
      setInitialRolePrivilegeKeys(updatedKeys);
      setSuccess("Role permissions updated.");
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to update role permissions.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetRolePrivileges = () => {
    setRolePrivilegeKeys(initialRolePrivilegeKeys);
  };
  const handleUserSelect = async (user) => {
    setSelectedUser(user);
    setShowOverrides(false);
    setShowAddOverride(false);
    setError("");
    setSuccess("");
    try {
      const [rolesRes, effectiveRes, overridesRes] = await Promise.all([
        api.get(`/admin/access-control/users/${user.id}/roles`),
        api.get(`/admin/access-control/users/${user.id}/privileges/effective`),
        api.get(`/admin/access-control/users/${user.id}/privileges/overrides`),
      ]);
      setUserRoles(rolesRes.data || []);
      setUserEffectivePrivileges(effectiveRes.data || []);
      const overrides = overridesRes.data || [];
      setUserGrantOverrides(overrides.filter((o) => o.effect === "grant").map((o) => o.privilege_key));
      setUserDenyOverrides(overrides.filter((o) => o.effect === "deny").map((o) => o.privilege_key));
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load user access.";
      setError(message);
    }
  };

  const handleSaveUserRoles = async () => {
    if (!selectedUser) return;
    if (!window.confirm("Update this user's roles? Access changes apply immediately.")) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = { role_names: userRoles };
      const { data } = await api.put(`/admin/access-control/users/${selectedUser.id}/roles`, payload);
      setUserRoles(data || []);
      const effectiveRes = await api.get(
        `/admin/access-control/users/${selectedUser.id}/privileges/effective`
      );
      setUserEffectivePrivileges(effectiveRes.data || []);
      setSuccess("User roles updated.");
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to update user roles.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOverrides = async () => {
    if (!selectedUser) return;
    if (
      !window.confirm(
        "Apply advanced overrides? Grants and denies override role permissions immediately."
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        grants: userGrantOverrides,
        denies: userDenyOverrides,
      };
      const { data } = await api.put(
        `/admin/access-control/users/${selectedUser.id}/privileges/overrides`,
        payload
      );
      const grants = data.filter((o) => o.effect === "grant").map((o) => o.privilege_key);
      const denies = data.filter((o) => o.effect === "deny").map((o) => o.privilege_key);
      setUserGrantOverrides(grants);
      setUserDenyOverrides(denies);
      const effectiveRes = await api.get(
        `/admin/access-control/users/${selectedUser.id}/privileges/effective`
      );
      setUserEffectivePrivileges(effectiveRes.data || []);
      setSuccess("Overrides saved.");
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to update overrides.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddOverride = () => {
    if (!overrideKey) return;
    if (overrideEffect === "grant") {
      setUserGrantOverrides((prev) => [...new Set([...prev, overrideKey])]);
      setUserDenyOverrides((prev) => prev.filter((key) => key !== overrideKey));
    } else {
      setUserDenyOverrides((prev) => [...new Set([...prev, overrideKey])]);
      setUserGrantOverrides((prev) => prev.filter((key) => key !== overrideKey));
    }
    setOverrideKey("");
    setShowAddOverride(false);
  };

  const removeOverride = (key, effect) => {
    if (effect === "grant") {
      setUserGrantOverrides((prev) => prev.filter((k) => k !== key));
    } else {
      setUserDenyOverrides((prev) => prev.filter((k) => k !== key));
    }
  };

  const userPageCount = Math.max(1, Math.ceil(userTotal / userPageSize));

  const lastUpdatedLabel = lastUpdated
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(lastUpdated)
    : "--";

  const catalogSearchResults = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    if (!query) return privilegesByModule;
    return privilegesByModule
      .map(({ module, privileges: modulePrivs }) => {
        const filteredPrivs = modulePrivs.filter((priv) => {
          return (
            priv.name.toLowerCase().includes(query) ||
            (priv.description || "").toLowerCase().includes(query) ||
            priv.key.toLowerCase().includes(query) ||
            module.name.toLowerCase().includes(query) ||
            (module.description || "").toLowerCase().includes(query)
          );
        });
        return { module, privileges: filteredPrivs };
      })
      .filter(({ privileges: modulePrivs }) => modulePrivs.length > 0);
  }, [privilegesByModule, roleSearch]);
  return (
    <div className="access-control-page">
      <main className="access-control-main">
        <header className="access-control-header">
          <div>
            <h1 className="access-control-title">Access Control</h1>
            <p className="access-control-subtitle">
              Fine-tune roles, audit permissions, and keep access policies current across the platform.
            </p>
          </div>
          <div className="access-control-meta">
            <span>Last updated</span>
            <strong>{lastUpdatedLabel}</strong>
          </div>
        </header>

        {error && <div className="access-control-alert error">{error}</div>}
        {success && <div className="access-control-alert success">{success}</div>}

        <nav className="access-control-tabs" role="tablist" aria-label="Access control sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`access-control-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {loading && <div className="access-control-loading">Loading access control data...</div>}

        {!loading && activeTab === "roles" && (
          <div className="access-control-roles-layout">
            <section className="access-control-panel">
              <div className="panel-header">
                <div>
                  <h2>Roles</h2>
                  <span className="panel-subtitle">Search, filter, and create new roles.</span>
                </div>
                <button
                  type="button"
                  className="access-control-btn primary"
                  onClick={() => setShowCreateRole((prev) => !prev)}
                >
                  {showCreateRole ? "Close" : "Create Role"}
                </button>
              </div>

              <div className="panel-controls">
                <label>
                  Search roles
                  <input
                    value={roleSearch}
                    onChange={(e) => setRoleSearch(e.target.value)}
                    placeholder="Name or description"
                  />
                </label>
                <label>
                  Filter
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                    <option value="all">All roles</option>
                    <option value="system">System</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              </div>

              <div className="access-control-list">
                {filteredRoles.map((role) => (
                  <button
                    type="button"
                    key={role.id}
                    className={`access-control-list-item select ${
                      selectedRoleId === role.id ? "active" : ""
                    }`}
                    onClick={() => selectRole(role)}
                  >
                    <div>
                      <div className="access-control-list-title">{role.name}</div>
                      <div className="access-control-list-meta">
                        {role.is_system ? "System role" : "Custom role"}
                      </div>
                    </div>
                    <div className="access-control-list-desc">{role.description || "-"}</div>
                  </button>
                ))}
                {!filteredRoles.length && <div className="access-control-empty">No roles found.</div>}
              </div>

              {showCreateRole && (
                <form onSubmit={handleCreateRole} className="access-control-form">
                  <div className="divider-label">Create Role</div>
                  <label>
                    Name
                    <input
                      value={roleForm.name}
                      onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      rows={2}
                      value={roleForm.description}
                      onChange={(e) =>
                        setRoleForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={roleForm.is_system}
                      onChange={(e) =>
                        setRoleForm((prev) => ({ ...prev, is_system: e.target.checked }))
                      }
                    />
                    System role
                  </label>
                  <button type="submit" className="access-control-btn primary">
                    Create role
                  </button>
                </form>
              )}
            </section>

            <section className="access-control-panel">
              {!selectedRoleId ? (
                <div className="access-control-empty">
                  Select a role to view permissions and descriptions.
                </div>
              ) : (
                <div className="role-permissions">
                  <div className="panel-header">
                    <div>
                      <h2>Permissions</h2>
                      <span className="panel-subtitle">
                        Toggle permissions by module. Save when ready.
                      </span>
                    </div>
                  </div>

                  <div className="permissions-list">
                    {privilegesByModule.map(({ module, privileges: modulePrivs }) => {
                      const enabledCount = modulePrivs.filter((priv) =>
                        rolePrivilegeKeys.includes(priv.key)
                      ).length;
                      const totalCount = modulePrivs.length;
                      const isOpen = expandedModules.has(module.id);
                      return (
                        <div key={module.id} className="permission-accordion">
                          <button
                            type="button"
                            className="accordion-header"
                            onClick={() => toggleModule(module.id)}
                            aria-expanded={isOpen}
                          >
                            <div>
                              <div className="module-title">{module.name}</div>
                              <div className="module-desc">{module.description || "-"}</div>
                            </div>
                            <div className="module-count">
                              Enabled {enabledCount} / {totalCount}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="accordion-body">
                              <div className="module-actions">
                                <button
                                  type="button"
                                  className="access-control-btn secondary"
                                  onClick={() => handleBulkAction(module.id, "enable")}
                                >
                                  Enable all
                                </button>
                                <button
                                  type="button"
                                  className="access-control-btn ghost"
                                  onClick={() => handleBulkAction(module.id, "disable")}
                                >
                                  Disable all
                                </button>
                              </div>
                              <div className="permission-list">
                                {modulePrivs.map((priv) => (
                                  <div key={priv.id} className="permission-row">
                                    <div>
                                      <div className="permission-name">
                                        {priv.name}
                                        <span className="permission-key" title={priv.key}>
                                          {priv.key}
                                        </span>
                                      </div>
                                      <div className="permission-desc">{priv.description || "-"}</div>
                                    </div>
                                    <label className="toggle">
                                      <input
                                        type="checkbox"
                                        checked={rolePrivilegeKeys.includes(priv.key)}
                                        onChange={() => handleTogglePrivilege(priv.key)}
                                        disabled={saving}
                                      />
                                      <span className="toggle-slider" />
                                    </label>
                                  </div>
                                ))}
                                {!modulePrivs.length && (
                                  <div className="access-control-empty small">No privileges listed.</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {hasUnsavedPrivileges && (
                    <div className="unsaved-bar" role="status">
                      <span>Unsaved changes</span>
                      <div className="unsaved-actions">
                        <button
                          type="button"
                          className="access-control-btn ghost"
                          onClick={handleResetRolePrivileges}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="access-control-btn primary"
                          onClick={handleSaveRolePrivileges}
                          disabled={saving}
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
            <section className="access-control-panel">
              {!selectedRoleId ? (
                <div className="access-control-empty">
                  Select a role to edit details and audit notes.
                </div>
              ) : (
                <div className="role-details">
                  <div className="panel-header">
                    <div>
                      <h2>Role details</h2>
                      <span className="panel-subtitle">Edit metadata and review governance notes.</span>
                    </div>
                  </div>

                  <div className="role-meta-grid">
                    <label>
                      Role name
                      <input
                        value={selectedRoleName}
                        disabled={selectedRoleIsSystem}
                        onChange={(e) => setSelectedRoleName(e.target.value)}
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        rows={2}
                        value={selectedRoleDescription}
                        onChange={(e) => setSelectedRoleDescription(e.target.value)}
                      />
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={selectedRoleIsSystem} disabled />
                      System role
                    </label>
                  </div>

                  <button
                    type="button"
                    className="access-control-btn secondary"
                    onClick={handleSaveRoleMeta}
                    disabled={saving}
                  >
                    Save role details
                  </button>

                  <div className="danger-zone">
                    <h3>Danger zone</h3>
                    <p>Deleting a role immediately removes access from assigned users.</p>
                    <button
                      type="button"
                      className="access-control-btn danger"
                      onClick={handleDeleteRole}
                      disabled={selectedRoleIsSystem}
                    >
                      Delete role
                    </button>
                  </div>

                  <div className="audit-hints">
                    <h3>Audit hints</h3>
                    <ul>
                      <li>Review access logs after permission changes.</li>
                      <li>Prefer least-privilege defaults for new roles.</li>
                      <li>Document any emergency access grants.</li>
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {!loading && activeTab === "users" && (
          <div className="access-control-users-layout">
            <section className="access-control-panel">
              <div className="panel-header">
                <div>
                  <h2>Users</h2>
                  <span className="panel-subtitle">Search and assign roles.</span>
                </div>
              </div>

              <div className="panel-controls">
                <label>
                  Search
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <label>
                  Page size
                  <select
                    value={userPageSize}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setUserPageSize(next);
                      setUserPage(1);
                      loadUsers(1, next);
                    }}
                  >
                    {[10, 12, 20, 30].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="access-control-btn primary"
                  onClick={() => loadUsers(1, userPageSize)}
                >
                  Search
                </button>
              </div>

              <div className="access-control-list">
                {userList.map((user) => (
                  <button
                    type="button"
                    key={user.id}
                    className={`access-control-list-item select ${
                      selectedUser?.id === user.id ? "active" : ""
                    }`}
                    onClick={() => handleUserSelect(user)}
                  >
                    <div>
                      <div className="access-control-list-title">{user.full_name}</div>
                      <div className="access-control-list-meta">{user.email}</div>
                    </div>
                    <div className="access-control-list-desc">{user.role}</div>
                  </button>
                ))}
                {!userList.length && <div className="access-control-empty">No users found.</div>}
              </div>

              <div className="pagination-row">
                <button
                  type="button"
                  disabled={userPage <= 1}
                  onClick={() => loadUsers(userPage - 1, userPageSize)}
                >
                  Prev
                </button>
                <span>
                  Page {userPage} of {userPageCount}
                </span>
                <button
                  type="button"
                  disabled={userPage >= userPageCount}
                  onClick={() => loadUsers(userPage + 1, userPageSize)}
                >
                  Next
                </button>
              </div>
            </section>

            <section className="access-control-panel">
              {!selectedUser ? (
                <div className="access-control-empty">
                  Select a user to view roles and permissions.
                </div>
              ) : (
                <div className="user-detail">
                  <div className="panel-header">
                    <div>
                      <h2>{selectedUser.full_name}</h2>
                      <span className="panel-subtitle">{selectedUser.email}</span>
                    </div>
                  </div>

                  <div className="user-section">
                    <div className="panel-title">Roles</div>
                    <div className="checkbox-grid">
                      {roles.map((role) => (
                        <label key={role.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={userRoles.includes(role.name)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setUserRoles((prev) => {
                                if (checked) return [...new Set([...prev, role.name])];
                                return prev.filter((r) => r !== role.name);
                              });
                            }}
                          />
                          <span>
                            <strong>{role.name}</strong>
                            <span className="muted">
                              {role.is_system ? "System role" : "Custom role"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="access-control-btn primary"
                      onClick={handleSaveUserRoles}
                      disabled={saving}
                    >
                      Save roles
                    </button>
                  </div>

                  <div className="user-section">
                    <div className="panel-title">Effective privileges</div>
                    <div className="chip-list">
                      {userEffectivePrivileges.map((key) => {
                        const priv = privilegeMap.get(key);
                        return (
                          <span key={key} className="chip" title={key}>
                            {priv?.name || key}
                          </span>
                        );
                      })}
                      {!userEffectivePrivileges.length && (
                        <div className="access-control-empty small">No privileges assigned.</div>
                      )}
                    </div>
                  </div>

                  <div className="user-section">
                    <div className="section-row">
                      <div>
                        <div className="panel-title">Overrides</div>
                        <p className="panel-subtitle">Targeted grants or denies for this user.</p>
                      </div>
                      <button
                        type="button"
                        className="access-control-btn secondary"
                        onClick={() => setShowOverrides((prev) => !prev)}
                      >
                        {showOverrides ? "Hide" : "Manage"}
                      </button>
                    </div>

                    {showOverrides && (
                      <div className="override-panel">
                        <div className="override-actions">
                          <button
                            type="button"
                            className="access-control-btn secondary"
                            onClick={() => setShowAddOverride(true)}
                          >
                            Add override
                          </button>
                          <button
                            type="button"
                            className="access-control-btn danger"
                            onClick={handleSaveOverrides}
                            disabled={saving}
                          >
                            Save overrides
                          </button>
                        </div>

                        <div className="override-group">
                          <div className="panel-title">Granted</div>
                          <div className="chip-list">
                            {userGrantOverrides.map((key) => (
                              <button
                                key={key}
                                type="button"
                                className="chip removable"
                                onClick={() => removeOverride(key, "grant")}
                                title="Remove grant"
                              >
                                {privilegeMap.get(key)?.name || key}
                                <span aria-hidden>×</span>
                              </button>
                            ))}
                            {!userGrantOverrides.length && (
                              <div className="access-control-empty small">No grants.</div>
                            )}
                          </div>
                        </div>

                        <div className="override-group">
                          <div className="panel-title">Denied</div>
                          <div className="chip-list">
                            {userDenyOverrides.map((key) => (
                              <button
                                key={key}
                                type="button"
                                className="chip removable danger"
                                onClick={() => removeOverride(key, "deny")}
                                title="Remove deny"
                              >
                                {privilegeMap.get(key)?.name || key}
                                <span aria-hidden>×</span>
                              </button>
                            ))}
                            {!userDenyOverrides.length && (
                              <div className="access-control-empty small">No denies.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
        {!loading && activeTab === "catalog" && (
          <section className="access-control-panel">
            <div className="panel-header">
              <div>
                <h2>Catalog</h2>
                <span className="panel-subtitle">
                  Read-only view of modules and privileges configured in the system.
                </span>
              </div>
            </div>

            <div className="panel-controls">
              <label>
                Search catalog
                <input
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="Module, privilege, or key"
                />
              </label>
            </div>

            <div className="catalog-grid">
              {catalogSearchResults.map(({ module, privileges: modulePrivs }) => (
                <div key={module.id} className="catalog-card">
                  <div className="module-title">{module.name}</div>
                  <div className="module-desc">{module.description || "-"}</div>
                  <div className="capability-list">
                    {modulePrivs.map((priv) => (
                      <div key={priv.id} className="capability-item">
                        <div className="permission-name">
                          {priv.name}
                          <span className="permission-key" title={priv.key}>
                            {priv.key}
                          </span>
                        </div>
                        <div className="permission-desc">{priv.description || "-"}</div>
                      </div>
                    ))}
                    {!modulePrivs.length && (
                      <div className="access-control-empty small">No privileges listed.</div>
                    )}
                  </div>
                </div>
              ))}
              {!catalogSearchResults.length && (
                <div className="access-control-empty">No modules match that search.</div>
              )}
            </div>
          </section>
        )}
      </main>

      {bulkAction && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Confirm bulk change</h3>
            <p>
              {bulkAction.action === "enable"
                ? "Enable all permissions in this module?"
                : "Disable all permissions in this module?"}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="access-control-btn ghost"
                onClick={() => setBulkAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="access-control-btn primary"
                onClick={confirmBulkAction}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddOverride && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Add override</h3>
            <label>
              Privilege
              <select value={overrideKey} onChange={(e) => setOverrideKey(e.target.value)}>
                <option value="">Select a privilege</option>
                {privileges.map((priv) => (
                  <option key={priv.id} value={priv.key}>
                    {priv.name} ({priv.key})
                  </option>
                ))}
              </select>
            </label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  name="override-effect"
                  value="grant"
                  checked={overrideEffect === "grant"}
                  onChange={() => setOverrideEffect("grant")}
                />
                Grant
              </label>
              <label>
                <input
                  type="radio"
                  name="override-effect"
                  value="deny"
                  checked={overrideEffect === "deny"}
                  onChange={() => setOverrideEffect("deny")}
                />
                Deny
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="access-control-btn ghost"
                onClick={() => setShowAddOverride(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="access-control-btn primary"
                onClick={handleAddOverride}
                disabled={!overrideKey}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessControl;
