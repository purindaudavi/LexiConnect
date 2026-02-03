import React, { useEffect, useState } from "react";
import EmptyState from "./EmptyState";

import {
  listCaseDocuments,
  uploadCaseDocument,
  deleteCaseDocument,
} from "../api/caseDocuments";

const CaseDocumentsSection: React.FC = () => {
  const caseId = 1;

  const [docs, setDocs] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const normalizeList = (data: any): any[] => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await listCaseDocuments(caseId);
      setDocs(normalizeList(data));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadCaseDocument(caseId, file);
      setFile(null);
      setSuccess("Uploaded successfully");
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (docId: number) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteCaseDocument(caseId, docId);
      setSuccess("Deleted");
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Case Documents</h2>

      {loading && <div className="text-gray-300">Loading...</div>}
      {error && <div className="text-red-300 mb-2">{error}</div>}
      {success && <div className="text-green-300 mb-2">{success}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          onChange={(e) =>
            setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)
          }
          className="block text-sm text-gray-200"
        />

        <button
          onClick={onUpload}
          disabled={!file || loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
        >
          {loading ? "Uploading..." : "Upload"}
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {docs.map((d: any) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 bg-slate-900/40 border border-slate-700 rounded-md px-3 py-2"
          >
            <span className="text-sm text-gray-100 break-all">
              {d.filename || d.original_filename || d.stored_path || `Document ${d.id}`}
            </span>

            <button
              onClick={() => onDelete(d.id)}
              disabled={loading}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
            >
              Delete
            </button>
          </li>
        ))}

        {!loading && docs.length === 0 && (
          <li className="text-gray-300 text-sm">No documents</li>
        )}
      </ul>
    </div>
  );
};

export default CaseDocumentsSection;
