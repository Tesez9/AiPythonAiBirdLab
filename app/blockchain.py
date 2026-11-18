from web3 import Web3
from web3.exceptions import TransactionNotFound

from app.config import (
    ETH_RPC_URL,
    PAYMENT_CHAIN_ID,
    PAYMENT_CONFIRMATIONS,
    PAYMENT_PRICE_WEI,
    PAYMENT_RECEIVER_ADDRESS,
)

web3 = Web3(
    Web3.HTTPProvider(
        ETH_RPC_URL,
        request_kwargs={"timeout": 15},
    )
)


def rpc_error(message):
    return {
        "success": False,
        "rpc_error": True,
        "error": message,
    }


def config_error(message):
    return {
        "success": False,
        "config_error": True,
        "error": message,
    }


def to_transaction_hash(value):
    if isinstance(value, str):
        return value.strip().lower()

    return Web3.to_hex(value)


def check_network():
    if not PAYMENT_RECEIVER_ADDRESS:
        return config_error("PAYMENT_RECEIVER_ADDRESS is not configured")

    if not Web3.is_address(PAYMENT_RECEIVER_ADDRESS):
        return config_error("PAYMENT_RECEIVER_ADDRESS is invalid")

    try:
        chain_id = web3.eth.chain_id
    except Exception as error:
        return rpc_error(f"Ethereum RPC is unavailable: {error}")

    if chain_id != PAYMENT_CHAIN_ID:
        return rpc_error(
            f"RPC chain id {chain_id} does not match "
            f"PAYMENT_CHAIN_ID {PAYMENT_CHAIN_ID}"
        )

    return None


def verify_payment(transaction_hash, wallet_address):
    network_error = check_network()

    if network_error:
        return network_error

    try:
        transaction = web3.eth.get_transaction(transaction_hash)
    except TransactionNotFound:
        return {
            "success": False,
            "not_found": True,
            "error": "Transaction not found",
        }
    except Exception as error:
        return rpc_error(str(error))

    if transaction.blockNumber is None:
        return {
            "success": False,
            "pending": True,
            "error": "Transaction is not mined yet",
        }

    try:
        receipt = web3.eth.get_transaction_receipt(transaction_hash)
    except TransactionNotFound:
        return {
            "success": False,
            "pending": True,
            "error": "Transaction receipt is not available yet",
        }
    except Exception as error:
        return rpc_error(str(error))

    if receipt is None:
        return {
            "success": False,
            "pending": True,
            "error": "Transaction receipt is not available yet",
        }

    if int(receipt.status) != 1:
        return {
            "success": False,
            "error": "Transaction failed",
        }

    if not transaction.to:
        return {
            "success": False,
            "error": "Transaction has no destination",
        }

    if transaction.to.lower() != PAYMENT_RECEIVER_ADDRESS.lower():
        return {
            "success": False,
            "error": "Wrong receiver",
        }

    if transaction["from"].lower() != wallet_address.lower():
        return {
            "success": False,
            "error": "Wrong sender",
        }

    if int(transaction.value) != PAYMENT_PRICE_WEI:
        return {
            "success": False,
            "error": "Wrong amount",
        }

    try:
        latest_block = web3.eth.block_number
    except Exception as error:
        return rpc_error(str(error))

    confirmations = latest_block - receipt.blockNumber + 1

    if confirmations < PAYMENT_CONFIRMATIONS:
        return {
            "success": False,
            "pending": True,
            "confirmations": confirmations,
            "required": PAYMENT_CONFIRMATIONS,
            "error": "Not enough confirmations",
        }

    return {
        "success": True,
        "transaction_hash": transaction_hash,
        "wallet_address": wallet_address.lower(),
        "amount_wei": str(int(transaction.value)),
        "block_number": int(receipt.blockNumber),
        "confirmations": confirmations,
    }


def check_payment(wallet_address, blocks):
    network_error = check_network()

    if network_error:
        return network_error

    try:
        latest_block = web3.eth.block_number
    except Exception as error:
        return rpc_error(str(error))

    start_block = max(0, latest_block - max(1, blocks) + 1)
    payments = []
    pending = []

    try:
        for block_number in range(start_block, latest_block + 1):
            block = web3.eth.get_block(
                block_number,
                full_transactions=True,
            )

            for transaction in block.transactions:
                if not transaction.to:
                    continue

                if (
                    transaction.to.lower()
                    != PAYMENT_RECEIVER_ADDRESS.lower()
                ):
                    continue

                if (
                    transaction["from"].lower()
                    != wallet_address.lower()
                ):
                    continue

                if int(transaction.value) != PAYMENT_PRICE_WEI:
                    continue

                transaction_hash = to_transaction_hash(
                    transaction["hash"]
                )
                result = verify_payment(
                    transaction_hash,
                    wallet_address,
                )

                if result.get("success"):
                    payments.append(result)
                elif result.get("pending"):
                    pending.append(
                        {
                            "transaction_hash": transaction_hash,
                            "confirmations": result.get(
                                "confirmations",
                                0,
                            ),
                            "required": result.get(
                                "required",
                                PAYMENT_CONFIRMATIONS,
                            ),
                            "message": result.get(
                                "error",
                                "Transaction is not confirmed yet",
                            ),
                        }
                    )
    except Exception as error:
        return rpc_error(str(error))

    return {
        "success": True,
        "payments": payments,
        "pending": pending,
    }
