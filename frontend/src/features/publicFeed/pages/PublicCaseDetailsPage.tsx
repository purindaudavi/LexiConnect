import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, MapPin, MessageCircle, ThumbsDown, ThumbsUp } from "lucide-react";

import {
  fetchPublicCaseById,
  fetchPublicCaseComments,
} from "../services/publicFeedApi";
import {
  createCaseComment,
  createCaseReply,
  voteComment,
  removeVote,
} from "../../caseComments/services/caseCommentsApi";
import AuthRequiredModal from "../../../components/AuthRequiredModal";
import useRequireAuth from "../../../hooks/useRequireAuth";
import { isLoggedIn } from "../../../utils/auth";

type CommentNode = {
  id: number;
  case_id: number;
  parent_id?: number | null;
  content: string;
  created_at: string;
  author_id: number;
  author_display_name: string;
  author_name?: string | null;
  author_role: string;
  score: number;
  my_vote: number;
  user_vote: number;
  reply_count: number;
  replies?: CommentNode[];
};

type PublicCaseDetailsPageProps = {
  backTo?: string;
  showAuthModalForGuests?: boolean;
};

const buildCommentTree = (items: CommentNode[]): CommentNode[] => {
  const nodes = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  items.forEach((item) => {
    nodes.set(item.id, { ...item, replies: item.replies || [] });
  });

  nodes.forEach((node) => {
    const parentId = node.parent_id;
    if (parentId && nodes.has(parentId)) {
      const parent = nodes.get(parentId)!;
      parent.replies = parent.replies || [];
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortTree = (list: CommentNode[]) => {
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    list.forEach((child) => {
      if (child.replies && child.replies.length > 0) {
        sortTree(child.replies);
      }
    });
  };

  sortTree(roots);
  return roots;
};

const normalizeComments = (data: any): CommentNode[] => {
  const items: CommentNode[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : [];
  if (items.some((item) => Array.isArray(item?.replies) && item.replies.length >= 0)) {
    return items;
  }
  return buildCommentTree(items);
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
};

const roleLabel = (role?: string) => (role?.toLowerCase() === "lawyer" ? "Lawyer" : "Client");

type CommentCardProps = {
  comment: CommentNode;
  depth?: number;
  loggedIn: boolean;
  activeReplyId: number | null;
  replyText: string;
  onReplyClick: (commentId: number, e?: React.MouseEvent<HTMLButtonElement>) => void;
  onVote: (commentId: number, vote: 1 | -1, e?: React.MouseEvent<HTMLButtonElement>) => void;
  onRemoveVote: (commentId: number, e?: React.MouseEvent<HTMLButtonElement>) => void;
  onReplyTextChange: (value: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (commentId: number) => void;
};

const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  depth = 0,
  loggedIn,
  activeReplyId,
  replyText,
  onReplyClick,
  onVote,
  onRemoveVote,
  onReplyTextChange,
  onCancelReply,
  onSubmitReply,
}) => {
  const isLawyer = comment.author_role?.toLowerCase() === "lawyer";
  const displayName = comment.author_name || comment.author_display_name;
  const upvoteActive = comment.my_vote === 1;
  const downvoteActive = comment.my_vote === -1;
  const votesDisabled = !loggedIn;
  return (
    <div className={`space-y-3 ${depth > 0 ? "ml-4 border-l border-slate-800 pl-4" : ""}`}>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-white">
              {displayName}
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full border ${
                isLawyer
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  : "border-slate-700 bg-slate-800 text-slate-300"
              }`}
            >
              {roleLabel(comment.author_role)}
            </span>
          </div>
          <div className="text-xs text-slate-500">{formatDate(comment.created_at)}</div>
        </div>
        <div className="mt-3 text-sm text-slate-200">{comment.content}</div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>{comment.score} score</span>
          <button
            type="button"
            onClick={(e) => onReplyClick(comment.id, e)}
            aria-disabled={!loggedIn}
            className={`text-amber-200 hover:text-amber-100 ${
              !loggedIn ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            Reply
          </button>
          <button
            type="button"
            onClick={(e) =>
              upvoteActive
                ? onRemoveVote(comment.id, e)
                : onVote(comment.id, 1, e)
            }
            aria-disabled={votesDisabled}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
              upvoteActive
                ? "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            } ${votesDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <ThumbsUp className="w-3 h-3" />
            Upvote
          </button>
          <button
            type="button"
            onClick={(e) =>
              downvoteActive
                ? onRemoveVote(comment.id, e)
                : onVote(comment.id, -1, e)
            }
            aria-disabled={votesDisabled}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
              downvoteActive
                ? "text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.35)]"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            } ${votesDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <ThumbsDown className="w-3 h-3" />
            Downvote
          </button>
        </div>

          {activeReplyId === comment.id && loggedIn && (
            <div className="mt-4 space-y-2">
              <textarea
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-200 focus:outline-none"
                placeholder="Write a reply..."
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSubmitReply(comment.id)}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  Post reply
                </button>
                <button
                  type="button"
                  onClick={onCancelReply}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-3">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              loggedIn={loggedIn}
              activeReplyId={activeReplyId}
              replyText={replyText}
              onReplyClick={onReplyClick}
              onVote={onVote}
              onRemoveVote={onRemoveVote}
              onReplyTextChange={onReplyTextChange}
              onCancelReply={onCancelReply}
              onSubmitReply={onSubmitReply}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function PublicCaseDetailsPage({
  backTo = "/",
  showAuthModalForGuests = true,
}: PublicCaseDetailsPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { requireAuth, modalOpen, closeModal } = useRequireAuth();

  const [caseDetail, setCaseDetail] = useState<any>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState("");
  const [commentsError, setCommentsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "top">("newest");
  const [activeReplyId, setActiveReplyId] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [newCommentText, setNewCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [authKey, setAuthKey] = useState(
    localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      ""
  );

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const detail = await fetchPublicCaseById(Number(id));
      setCaseDetail(detail || null);
    } catch (err) {
      setError("Unable to load public case details.");
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    if (!id) return;
    setCommentsLoading(true);
    setCommentsError("");
    try {
      const commentData = await fetchPublicCaseComments(Number(id), { sort: sortMode });
      const normalized = normalizeComments(commentData);
      if (import.meta.env.DEV) {
        console.debug("[PublicCaseComments] raw response", commentData);
        console.debug("[PublicCaseComments] normalized count", normalized.length);
      }
      setComments(normalized);
    } catch (err) {
      setCommentsError("Unable to load comments.");
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sortMode]);

  useEffect(() => {
    const onStorage = () => {
      setLoggedIn(isLoggedIn());
      setAuthKey(
        localStorage.getItem("access_token") ||
          localStorage.getItem("token") ||
          localStorage.getItem("authToken") ||
          ""
      );
    };
    const onFocus = () => onStorage();
    onStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    const role = (localStorage.getItem("role") || "").toLowerCase();
    if (backTo && backTo !== "/") {
      navigate(backTo);
      return;
    }
    if (loggedIn && role === "client") {
      navigate("/client/dashboard");
      return;
    }
    if (loggedIn && role === "lawyer") {
      navigate("/lawyer/dashboard");
      return;
    }
    navigate("/");
  };

  const handleCloseModal = () => {
    closeModal();
    setLoggedIn(isLoggedIn());
    setAuthKey(
      localStorage.getItem("access_token") ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken") ||
        ""
    );
  };

  const handleAuthRequired = () => {
    if (showAuthModalForGuests) {
      requireAuth();
    }
  };

  const handleReplyClick = (commentId: number) => {
    if (!loggedIn) {
      handleAuthRequired();
      return;
    }
    setActiveReplyId(commentId);
    setReplyDrafts((prev) => ({ ...prev, [commentId]: prev[commentId] || "" }));
  };

  const updateTree = (
    nodes: CommentNode[],
    commentId: number,
    updater: (node: CommentNode) => CommentNode
  ): CommentNode[] => {
    return nodes.map((node) => {
      if (node.id === commentId) return updater(node);
      if (node.replies && node.replies.length > 0) {
        return { ...node, replies: updateTree(node.replies, commentId, updater) };
      }
      return node;
    });
  };

  const handleVote = async (commentId: number, vote: 1 | -1, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!loggedIn) {
      handleAuthRequired();
      return;
    }
    try {
      setActionError("");
      setComments((prev) =>
        updateTree(prev, commentId, (node) => {
          const prevVote = node.my_vote || 0;
          const nextVote = vote;
          const scoreDelta = nextVote - prevVote;
          return {
            ...node,
            my_vote: nextVote,
            score: node.score + scoreDelta,
          };
        })
      );
      await voteComment(commentId, vote);
    } catch (err: any) {
      setActionError("Unable to update vote. Please try again.");
      if (err?.isAuthRequired) {
        handleAuthRequired();
      }
      await loadComments();
    }
  };

  const handleRemoveVote = async (commentId: number, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!loggedIn) {
      handleAuthRequired();
      return;
    }
    try {
      setActionError("");
      setComments((prev) =>
        updateTree(prev, commentId, (node) => {
          const prevVote = node.my_vote || 0;
          return {
            ...node,
            my_vote: 0,
            score: node.score - prevVote,
          };
        })
      );
      await removeVote(commentId);
    } catch (err: any) {
      setActionError("Unable to update vote. Please try again.");
      if (err?.isAuthRequired) {
        handleAuthRequired();
      }
      await loadComments();
    }
  };

  const submitReply = async (parentId: number) => {
    if (!loggedIn) {
      handleAuthRequired();
      return;
    }
    const draft = (replyDrafts[parentId] || "").trim();
    if (draft.length < 2) return;
    try {
      setActionError("");
      if (posting) return;
      setPosting(true);
      const created = await createCaseReply(Number(id), {
        content: draft,
        parent_id: parentId,
      });
      if (created) {
        setComments((prev) => {
          const addReply = (nodes: CommentNode[]): CommentNode[] =>
            nodes.map((node) => {
              if (node.id === parentId) {
                return {
                  ...node,
                  replies: [{ ...created, replies: [] }, ...(node.replies || [])],
                  reply_count: (node.reply_count || 0) + 1,
                };
              }
              if (node.replies && node.replies.length > 0) {
                return { ...node, replies: addReply(node.replies) };
              }
              return node;
            });
          return addReply(prev);
        });
      }
      setActiveReplyId(null);
      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[parentId];
        return next;
      });
      await loadComments();
    } catch (err: any) {
      setActionError("Unable to post comment. Please try again.");
      if (err?.isAuthRequired) {
        handleAuthRequired();
      }
    } finally {
      setPosting(false);
    }
  };

  const submitNewComment = async () => {
    if (!loggedIn) {
      handleAuthRequired();
      return;
    }
    if (newCommentText.trim().length < 2) return;
    try {
      setActionError("");
      if (posting) return;
      setPosting(true);
      const created = await createCaseComment(Number(id), { content: newCommentText.trim() });
      if (created) {
        setComments((prev) => [{ ...created, replies: [] }, ...prev]);
      }
      setNewCommentText("");
      await loadComments();
    } catch (err: any) {
      setActionError("Unable to post reply. Please try again.");
      if (err?.isAuthRequired) {
        handleAuthRequired();
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-amber-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {loading ? (
          <div className="text-slate-400 text-sm">Loading case...</div>
        ) : error ? (
          <div className="text-red-300 text-sm">{error}</div>
        ) : !caseDetail ? (
          <div className="text-slate-400 text-sm">Case not found.</div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-3">
              <div className="text-2xl font-bold">{caseDetail.title}</div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {caseDetail.district || "—"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {caseDetail.specialization_name || caseDetail.category || "—"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  {caseDetail.comment_count || 0} comments
                </span>
              </div>
              <div className="text-xs text-slate-500">{formatDate(caseDetail.created_at)}</div>
              <div className="text-sm text-slate-200">{caseDetail.summary_public}</div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-lg font-semibold">Discussion</div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Sort by</span>
                  <select
                    value={sortMode}
                    onChange={(e) =>
                      setSortMode(e.target.value as "newest" | "oldest" | "top")
                    }
                    className="rounded-md bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="top">Top</option>
                  </select>
                </div>
                {!loggedIn && (
                  <div className="text-xs text-slate-500">Login to reply or vote.</div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <>
                  <textarea
                    value={newCommentText}
                    onChange={(e) => {
                      if (!loggedIn) return;
                      setNewCommentText(e.target.value);
                    }}
                    onFocus={() => {
                      if (!loggedIn) handleAuthRequired();
                    }}
                    onClick={() => {
                      if (!loggedIn) handleAuthRequired();
                    }}
                    readOnly={!loggedIn}
                    rows={3}
                    className={`w-full rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-200 focus:outline-none ${
                      !loggedIn ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                    placeholder={
                      loggedIn
                        ? "Share your thoughts on this case..."
                        : "Login to comment on this case..."
                    }
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!loggedIn) {
                          handleAuthRequired();
                          return;
                        }
                        submitNewComment();
                      }}
                      aria-disabled={!loggedIn || posting}
                      className={`px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold ${
                        !loggedIn || posting ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                    >
                      {posting ? "Posting..." : "Post comment"}
                    </button>
                    <span className="text-xs text-slate-500">
                      Minimum 2 characters.
                    </span>
                  </div>
                  {!loggedIn && !showAuthModalForGuests && (
                    <div className="text-xs text-slate-500">Login required to comment.</div>
                  )}
                </>
              </div>
              {actionError && (
                <div className="text-xs text-red-300">{actionError}</div>
              )}
              {commentsLoading ? (
                <div className="text-sm text-slate-400">Loading comments...</div>
              ) : commentsError ? (
                <div className="text-sm text-red-300">{commentsError}</div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-slate-400">No comments yet.</div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <CommentCard
                      key={comment.id}
                      comment={comment}
                      loggedIn={loggedIn}
                      activeReplyId={activeReplyId}
                      replyText={replyDrafts[comment.id] || ""}
                      onReplyClick={handleReplyClick}
                      onVote={handleVote}
                      onRemoveVote={handleRemoveVote}
                      onReplyTextChange={(value) =>
                        setReplyDrafts((prev) => ({ ...prev, [comment.id]: value }))
                      }
                      onCancelReply={() => {
                        setActiveReplyId(null);
                        setReplyDrafts((prev) => {
                          const next = { ...prev };
                          delete next[comment.id];
                          return next;
                        });
                      }}
                      onSubmitReply={submitReply}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AuthRequiredModal
        open={showAuthModalForGuests && modalOpen}
        onClose={handleCloseModal}
        title="Please login to participate"
        message="Login or register to reply and vote on public case discussions."
        onLogin={() => {
          handleCloseModal();
          navigate("/login");
        }}
        onRegister={() => {
          handleCloseModal();
          navigate("/register");
        }}
      />
    </div>
  );
}
