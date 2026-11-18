from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.database import Base


class BirdInfo(Base):
    __tablename__ = "bird_info"

    species = Column(String(100), primary_key=True)
    ukrainian = Column(String(100))
    scientific = Column(String(150))
    family = Column(String(100))
    habitat = Column(Text)
    range_text = Column("range", Text)
    diet = Column(Text)
    size = Column(Text)
    facts = Column(Text)
    status = Column(String(100))
    description = Column(Text)
    source = Column(String(255))


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    image_name = Column(String(255), nullable=False)
    stored_name = Column(String(255))
    predicted_species = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    top3 = Column(Text)
    analysis_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    description = Column(Text)
    source = Column(String(255))
    extra_info = Column(Text)


class WalletCredit(Base):
    __tablename__ = "wallet_credits"

    wallet_address = Column(String(42), primary_key=True)
    credits = Column(Integer, nullable=False, default=0)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class UsedTransaction(Base):
    __tablename__ = "used_transactions"

    transaction_hash = Column(String(66), primary_key=True)
    wallet_address = Column(String(42), nullable=False, index=True)
    credits = Column(Integer, nullable=False)
    amount_wei = Column(String(78), nullable=False)
    block_number = Column(Integer)
    chain_id = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
