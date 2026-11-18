from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.blockchain import check_payment, verify_payment
from app.config import (
    PAYMENT_CHAIN_ID,
    PAYMENT_CHAIN_NAME,
    PAYMENT_CONFIRMATIONS,
    PAYMENT_CREDITS,
    PAYMENT_ENABLED,
    PAYMENT_EXPLORER_URL,
    PAYMENT_PRICE_WEI,
    PAYMENT_PUBLIC_RPC_URL,
    PAYMENT_RECEIVER_ADDRESS,
    PAYMENT_SCAN_BLOCKS,
)
from app.database import get_db
from app.repository import (
    credit_payment,
    get_credits,
    get_last_transaction,
    get_transaction,
)
from app.services import (
    normalize_transaction_hash,
    normalize_wallet_address,
)

router = APIRouter(prefix="/api", tags=["payments"])


class PaymentRequest(BaseModel):
    wallet_address: str
    transaction_hash: str


def wei_to_eth(value):
    amount = Decimal(value) / Decimal(10**18)
    text = format(amount, "f").rstrip("0").rstrip(".")
    return text or "0"


def payment_config():
    return {
        "enabled": PAYMENT_ENABLED,
        "chain_id": PAYMENT_CHAIN_ID,
        "chain_name": PAYMENT_CHAIN_NAME,
        "receiver": PAYMENT_RECEIVER_ADDRESS,
        "price_wei": str(PAYMENT_PRICE_WEI),
        "price_eth": wei_to_eth(PAYMENT_PRICE_WEI),
        "credits": PAYMENT_CREDITS,
        "confirmations": PAYMENT_CONFIRMATIONS,
        "explorer_url": PAYMENT_EXPLORER_URL,
        "public_rpc_url": PAYMENT_PUBLIC_RPC_URL,
    }


@router.get("/payments/config")
def get_payment_config():
    return payment_config()


@router.get("/wallet/{wallet_address}")
def get_wallet_info(wallet_address: str, db=Depends(get_db)):
    address = normalize_wallet_address(wallet_address)
    last_transaction = get_last_transaction(db, address)

    return {
        "wallet_address": address,
        "credits": get_credits(db, address),
        "price_wei": str(PAYMENT_PRICE_WEI),
        "package_credits": PAYMENT_CREDITS,
        "last_transaction_hash": last_transaction.transaction_hash
        if last_transaction
        else None,
    }


@router.post("/payments/verify")
def payment_verify(request: PaymentRequest, db=Depends(get_db)):
    if not PAYMENT_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Payments are disabled",
        )

    address = normalize_wallet_address(request.wallet_address)
    transaction_hash = normalize_transaction_hash(request.transaction_hash)
    existing = get_transaction(db, transaction_hash)

    if existing is not None:
        if existing.wallet_address == address:
            return {
                "status": "already_processed",
                "credits": get_credits(db, address),
                "transaction_hash": transaction_hash,
            }

        raise HTTPException(
            status_code=409,
            detail="Transaction already used by another wallet",
        )

    result = verify_payment(transaction_hash, address)

    if result.get("pending"):
        return JSONResponse(
            status_code=202,
            content={
                "status": "pending",
                "transaction_hash": transaction_hash,
                "confirmations": result.get("confirmations", 0),
                "required": result.get(
                    "required",
                    PAYMENT_CONFIRMATIONS,
                ),
                "message": result.get(
                    "error",
                    "Transaction is not confirmed yet",
                ),
            },
        )

    if result.get("not_found"):
        raise HTTPException(
            status_code=404,
            detail=result.get("error", "Transaction not found"),
        )

    if result.get("rpc_error") or result.get("config_error"):
        raise HTTPException(
            status_code=503,
            detail=result.get("error", "Ethereum RPC is unavailable"),
        )

    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Payment verification failed"),
        )

    transaction, credits = credit_payment(
        db,
        transaction_hash,
        address,
        PAYMENT_CREDITS,
        result["amount_wei"],
        result["block_number"],
        PAYMENT_CHAIN_ID,
    )

    if transaction is None:
        raise HTTPException(
            status_code=500,
            detail="Failed to save payment",
        )

    if transaction.wallet_address != address:
        raise HTTPException(
            status_code=409,
            detail="Transaction already used by another wallet",
        )

    return {
        "status": "credited",
        "credits": credits,
        "transaction_hash": transaction_hash,
        "amount_wei": result["amount_wei"],
        "block_number": result["block_number"],
    }


@router.post("/payments/check/{wallet_address}")
def payment_check(wallet_address: str, db=Depends(get_db)):
    if not PAYMENT_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Payments are disabled",
        )

    address = normalize_wallet_address(wallet_address)
    result = check_payment(address, PAYMENT_SCAN_BLOCKS)

    if result.get("rpc_error") or result.get("config_error"):
        raise HTTPException(
            status_code=503,
            detail=result.get("error", "Ethereum RPC is unavailable"),
        )

    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Payment check failed"),
        )

    credited = []

    for payment in result.get("payments", []):
        transaction_hash = payment["transaction_hash"]
        existing = get_transaction(db, transaction_hash)

        if existing is not None:
            continue

        transaction, _ = credit_payment(
            db,
            transaction_hash,
            address,
            PAYMENT_CREDITS,
            payment["amount_wei"],
            payment["block_number"],
            PAYMENT_CHAIN_ID,
        )

        if transaction is not None and transaction.wallet_address == address:
            credited.append(transaction_hash)

    if not credited:
        pending = result.get("pending", [])

        if pending:
            first = pending[0]

            return JSONResponse(
                status_code=202,
                content={
                    "status": "pending",
                    "credits": get_credits(db, address),
                    "pending": pending,
                    "confirmations": first.get("confirmations", 0),
                    "required": first.get(
                        "required",
                        PAYMENT_CONFIRMATIONS,
                    ),
                    "message": first.get(
                        "message",
                        "Payment is not confirmed yet",
                    ),
                },
            )

        raise HTTPException(
            status_code=404,
            detail="New payment not found",
        )

    return {
        "status": "credited",
        "credits": get_credits(db, address),
        "transactions": credited,
    }
