from types import SimpleNamespace

import pytest
from web3.exceptions import TransactionNotFound

import app.blockchain as blockchain

RECEIVER = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
SENDER = "0xAbCdEf0000000000000000000000000000000001"
TX_HASH = "0x" + "ab" * 32
PRICE = 2_000_000_000_000_000


class FakeTransaction(dict):
    def __init__(
        self,
        *,
        sender=SENDER,
        to=RECEIVER,
        value=PRICE,
        block_number=1,
        tx_hash=TX_HASH,
    ):
        super().__init__({"from": sender, "hash": tx_hash})
        self.to = to
        self.value = value
        self.blockNumber = block_number


class FakeReceipt:
    def __init__(self, status=1, block_number=1):
        self.status = status
        self.blockNumber = block_number


class FakeEth:
    def __init__(
        self,
        *,
        chain_id=31337,
        transaction=None,
        receipt=None,
        latest_block=10,
        transaction_error=None,
        receipt_error=None,
        block_error=None,
        block_number_error=None,
        blocks=None,
    ):
        self.chain_id = chain_id
        self._transaction = transaction
        self._receipt = receipt
        self._latest_block = latest_block
        self._transaction_error = transaction_error
        self._receipt_error = receipt_error
        self._block_error = block_error
        self._block_number_error = block_number_error
        self._blocks = blocks or {}

    def get_transaction(self, transaction_hash):
        if self._transaction_error:
            raise self._transaction_error
        return self._transaction

    def get_transaction_receipt(self, transaction_hash):
        if self._receipt_error:
            raise self._receipt_error
        return self._receipt

    @property
    def block_number(self):
        if self._block_number_error:
            raise self._block_number_error
        return self._latest_block

    def get_block(self, block_number, full_transactions=True):
        if self._block_error:
            raise self._block_error
        return self._blocks[block_number]


@pytest.fixture(autouse=True)
def default_config(monkeypatch):
    monkeypatch.setattr(blockchain, "PAYMENT_RECEIVER_ADDRESS", RECEIVER)
    monkeypatch.setattr(blockchain, "PAYMENT_CHAIN_ID", 31337)
    monkeypatch.setattr(blockchain, "PAYMENT_CONFIRMATIONS", 1)
    monkeypatch.setattr(blockchain, "PAYMENT_PRICE_WEI", PRICE)


def use_web3(monkeypatch, eth):
    monkeypatch.setattr(blockchain, "web3", SimpleNamespace(eth=eth))


def test_error_helpers():
    assert blockchain.rpc_error("down") == {
        "success": False,
        "rpc_error": True,
        "error": "down",
    }
    assert blockchain.config_error("bad") == {
        "success": False,
        "config_error": True,
        "error": "bad",
    }


def test_to_transaction_hash():
    assert blockchain.to_transaction_hash(" 0xABC ") == "0xabc"
    assert blockchain.to_transaction_hash(b"\x01\x02") == "0x0102"


def test_check_network_requires_receiver(monkeypatch):
    monkeypatch.setattr(blockchain, "PAYMENT_RECEIVER_ADDRESS", "")

    assert blockchain.check_network()["config_error"] is True


def test_check_network_rejects_invalid_receiver(monkeypatch):
    monkeypatch.setattr(blockchain, "PAYMENT_RECEIVER_ADDRESS", "not-an-address")

    assert blockchain.check_network()["error"] == "PAYMENT_RECEIVER_ADDRESS is invalid"


def test_check_network_handles_rpc_failure(monkeypatch):
    class BrokenChainEth:
        @property
        def chain_id(self):
            raise RuntimeError("rpc down")

    use_web3(monkeypatch, BrokenChainEth())

    result = blockchain.check_network()

    assert result["rpc_error"] is True
    assert "rpc down" in result["error"]


def test_check_network_rejects_wrong_chain(monkeypatch):
    use_web3(monkeypatch, FakeEth(chain_id=1))

    result = blockchain.check_network()

    assert result["rpc_error"] is True
    assert "does not match" in result["error"]


def test_check_network_success(monkeypatch):
    use_web3(monkeypatch, FakeEth())

    assert blockchain.check_network() is None


def test_verify_payment_returns_network_error(monkeypatch):
    monkeypatch.setattr(
        blockchain,
        "check_network",
        lambda: {"success": False, "rpc_error": True, "error": "down"},
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["rpc_error"] is True


def test_verify_payment_transaction_not_found(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(transaction_error=TransactionNotFound("missing")),
    )

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["not_found"] is True
    assert result["error"] == "Transaction not found"


def test_verify_payment_transaction_rpc_error(monkeypatch):
    use_web3(monkeypatch, FakeEth(transaction_error=RuntimeError("boom")))

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["rpc_error"] is True
    assert result["error"] == "boom"


def test_verify_payment_pending_transaction(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(transaction=FakeTransaction(block_number=None)),
    )

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["pending"] is True
    assert result["error"] == "Transaction is not mined yet"


def test_verify_payment_receipt_not_found(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(),
            receipt_error=TransactionNotFound("missing"),
        ),
    )

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["pending"] is True
    assert result["error"] == "Transaction receipt is not available yet"


def test_verify_payment_receipt_rpc_error(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(),
            receipt_error=RuntimeError("receipt boom"),
        ),
    )

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["rpc_error"] is True


def test_verify_payment_receipt_missing(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(transaction=FakeTransaction(), receipt=None),
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["pending"] is True


def test_verify_payment_failed_transaction(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(),
            receipt=FakeReceipt(status=0),
        ),
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["error"] == "Transaction failed"


def test_verify_payment_without_destination(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(to=None),
            receipt=FakeReceipt(),
        ),
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["error"] == (
        "Transaction has no destination"
    )


def test_verify_payment_wrong_receiver(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(to="0x" + "11" * 20),
            receipt=FakeReceipt(),
        ),
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["error"] == "Wrong receiver"


def test_verify_payment_wrong_sender(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(sender="0x" + "22" * 20),
            receipt=FakeReceipt(),
        ),
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["error"] == "Wrong sender"


def test_verify_payment_wrong_amount(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(value=1),
            receipt=FakeReceipt(),
        ),
    )

    assert blockchain.verify_payment(TX_HASH, SENDER)["error"] == "Wrong amount"


def test_verify_payment_block_number_error(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(),
            receipt=FakeReceipt(),
            block_number_error=RuntimeError("no blocks"),
        ),
    )

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["rpc_error"] is True
    assert result["error"] == "no blocks"


def test_verify_payment_not_enough_confirmations(monkeypatch):
    monkeypatch.setattr(blockchain, "PAYMENT_CONFIRMATIONS", 3)
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(),
            receipt=FakeReceipt(block_number=9),
            latest_block=10,
        ),
    )

    result = blockchain.verify_payment(TX_HASH, SENDER)

    assert result["pending"] is True
    assert result["confirmations"] == 2
    assert result["required"] == 3


def test_verify_payment_success(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(
            transaction=FakeTransaction(),
            receipt=FakeReceipt(block_number=5),
            latest_block=7,
        ),
    )

    result = blockchain.verify_payment(TX_HASH.upper(), SENDER)

    assert result == {
        "success": True,
        "transaction_hash": TX_HASH.upper(),
        "wallet_address": SENDER.lower(),
        "amount_wei": str(PRICE),
        "block_number": 5,
        "confirmations": 3,
    }


def test_check_payment_returns_network_error(monkeypatch):
    monkeypatch.setattr(
        blockchain,
        "check_network",
        lambda: {"success": False, "config_error": True, "error": "bad config"},
    )

    assert blockchain.check_payment(SENDER, 10)["config_error"] is True


def test_check_payment_block_number_error(monkeypatch):
    use_web3(monkeypatch, FakeEth(block_number_error=RuntimeError("rpc down")))

    assert blockchain.check_payment(SENDER, 10)["rpc_error"] is True


def test_check_payment_scans_blocks_and_splits_results(monkeypatch):
    matching = FakeTransaction(tx_hash="0x" + "aa" * 32)
    wrong_receiver = FakeTransaction(to="0x" + "11" * 20)
    wrong_sender = FakeTransaction(sender="0x" + "22" * 20)
    wrong_value = FakeTransaction(value=1)
    no_destination = FakeTransaction(to=None)

    blocks = {
        9: SimpleNamespace(
            transactions=[matching, wrong_receiver, wrong_sender, wrong_value, no_destination]
        ),
        10: SimpleNamespace(
            transactions=[FakeTransaction(tx_hash="0x" + "bb" * 32)]
        ),
    }
    use_web3(monkeypatch, FakeEth(latest_block=10, blocks=blocks))

    results = {
        "0x" + "aa" * 32: {
            "success": True,
            "transaction_hash": "0x" + "aa" * 32,
        },
        "0x" + "bb" * 32: {
            "pending": True,
            "confirmations": 0,
            "required": 1,
            "error": "Not enough confirmations",
        },
    }
    monkeypatch.setattr(
        blockchain,
        "verify_payment",
        lambda tx_hash, address: results[tx_hash],
    )

    result = blockchain.check_payment(SENDER, 2)

    assert result["success"] is True
    assert result["payments"] == [results["0x" + "aa" * 32]]
    assert result["pending"] == [
        {
            "transaction_hash": "0x" + "bb" * 32,
            "confirmations": 0,
            "required": 1,
            "message": "Not enough confirmations",
        }
    ]


def test_check_payment_handles_block_failure(monkeypatch):
    use_web3(
        monkeypatch,
        FakeEth(latest_block=10, block_error=RuntimeError("block failed")),
    )

    result = blockchain.check_payment(SENDER, 2)

    assert result["rpc_error"] is True
    assert result["error"] == "block failed"
