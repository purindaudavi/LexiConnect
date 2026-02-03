import React, { useEffect, useState } from "react";
import { getCaseIntake, createCaseIntake, updateCaseIntake } from "../api/caseIntake";
import EmptyState from "./EmptyState";

const CaseIntakeSection: React.FC = () => {
  const caseId = 1;

  const [status, setStatus] = useState<string>("draft");
  const [answersJson, setAnswersJson] = useState<string>("{}");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exists, setExists] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const data = await getCaseIntake(caseId);
        if (!mounted) return;

        setExists(true);
        setStatus((data?.status as string) || "draft");

        // ✅ Backend returns answers_json
        const answers = data?.answers_json ?? {};

        try {
          setAnswersJson(JSON.stringify(answers, null, 2));
        } catch {
          setAnswersJson("{}");
        }
      } catch (err: any) {
        if (!mounted) return;

        if (err?.response?.status === 404) {
          // No intake yet for this case
          setExists(false);
          setStatus("draft");
          setAnswersJson("{}");
          setError(null);
        } else {
          setExists(false);
          setError(err?.response?.data?.detail || err?.message || "Failed to load intake");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [caseId]);

  const onSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let parsed: any;

      try {
        parsed = answersJson ? JSON.parse(answersJson) : {};
      } catch {
        setError("Answers must be valid JSON");
        setLoading(false);
        return;
      }

      // ✅ Send answers_json to backend
      const payload = { status, answers_json: parsed } as any;

      if (exists) {
        await updateCaseIntake(caseId, payload);
        setSuccess("Intake updated");
      } else {
        await createCaseIntake(caseId, payload);
        setExists(true);
        setSuccess("Intake created");
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Save failed");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Empty state: no intake exists (404), and we're not loading, and no error
  const showEmpty = !loading && !error && !exists;

  return (
    <div>
      <h2>Case Intake</h2>

      {loading && <div>Loading...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      {success && <div style={{ color: "green" }}>{success}</div>}

      {showEmpty && (
        <div style={{ marginTop: 12 }}>
          <EmptyState
            title="No intake submitted yet"
            description="This case does not have an intake form submission."
            actionText="Client can submit the intake from their dashboard. Lawyer can view it here after submission."
          />
        </div>
      )}

      {/* Only show the form if intake exists, or user is creating one */}
      <div style={{ marginTop: 12 }}>
        <label htmlFor="status">Status:&nbsp;</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">draft</option>
          <option value="submitted">submitted</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <label htmlFor="answers">Answers (JSON):</label>
        <br />
        <textarea
          id="answers"
          value={answersJson}
          onChange={(e) => setAnswersJson(e.target.value)}
          rows={12}
          cols={80}
          style={{ width: "100%", fontFamily: "monospace" }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button onClick={onSave} disabled={loading}>
          {exists ? "Save Changes" : "Create Intake"}
        </button>
      </div>
    </div>
  );
};

export default CaseIntakeSection;
