from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase): pass
class Season(Base):
    __tablename__='seasons'
    id: Mapped[str]=mapped_column(String,primary_key=True); name: Mapped[str]=mapped_column(String)
    status: Mapped[str]=mapped_column(String,default='active'); rules: Mapped[dict]=mapped_column(JSON)
class Player(Base):
    __tablename__='players'
    id: Mapped[str]=mapped_column(String,primary_key=True); name: Mapped[str]=mapped_column(String); utr: Mapped[float]
    eligible: Mapped[bool]=mapped_column(default=True); last_played_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
class LadderEntry(Base):
    __tablename__='ladder_entries'; __table_args__=(UniqueConstraint('season_id','rank'),)
    id: Mapped[int]=mapped_column(primary_key=True); season_id: Mapped[str]=mapped_column(ForeignKey('seasons.id'))
    player_id: Mapped[str]=mapped_column(ForeignKey('players.id')); rank: Mapped[int]; points: Mapped[int]=mapped_column(default=0)
    consecutive_wins: Mapped[int]=mapped_column(default=0)
class Challenge(Base):
    __tablename__='challenges'
    id: Mapped[str]=mapped_column(String,primary_key=True); season_id: Mapped[str]=mapped_column(ForeignKey('seasons.id'))
    challenger_id: Mapped[str]=mapped_column(ForeignKey('players.id')); opponent_id: Mapped[str]=mapped_column(ForeignKey('players.id'))
    status: Mapped[str]=mapped_column(String); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
    respond_by: Mapped[datetime]=mapped_column(DateTime(timezone=True)); rules_snapshot: Mapped[dict]=mapped_column(JSON)
class AuditLog(Base):
    __tablename__='audit_log'
    id: Mapped[int]=mapped_column(primary_key=True); actor_id: Mapped[str]=mapped_column(String); action: Mapped[str]=mapped_column(String)
    entity_type: Mapped[str]=mapped_column(String); entity_id: Mapped[str]=mapped_column(String); before: Mapped[dict|None]=mapped_column(JSON)
    after: Mapped[dict|None]=mapped_column(JSON); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
