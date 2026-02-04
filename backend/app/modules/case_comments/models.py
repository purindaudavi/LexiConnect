from sqlalchemy import (
    Column,
    Integer,
    Text,
    DateTime,
    ForeignKey,
    SmallInteger,
    func,
    CheckConstraint,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class CaseComment(Base):
    __tablename__ = "case_comments"
    __table_args__ = (
        CheckConstraint("length(content) >= 2", name="ck_case_comments_content_len"),
        Index("ix_case_comments_case_id", "case_id"),
    )

    id = Column(Integer, primary_key=True)
    case_id = Column(
        Integer,
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_id = Column(
        Integer,
        ForeignKey("case_comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    parent = relationship("CaseComment", remote_side=[id], backref="replies")
    votes = relationship(
        "CaseCommentVote",
        back_populates="comment",
        cascade="all, delete-orphan",
    )


class CaseCommentVote(Base):
    __tablename__ = "case_comment_votes"
    __table_args__ = (
        CheckConstraint("vote in (1, -1)", name="ck_case_comment_votes_vote"),
        UniqueConstraint("comment_id", "user_id", name="uq_case_comment_votes_comment_user"),
        Index("ix_case_comment_votes_comment_id", "comment_id"),
    )

    id = Column(Integer, primary_key=True)
    comment_id = Column(
        Integer,
        ForeignKey("case_comments.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    vote = Column(SmallInteger, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    comment = relationship("CaseComment", back_populates="votes")
