"""Blockchain service for on-chain trade settlement on Ethereum (Sepolia testnet)."""

import asyncio
import json
import logging
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_LOCAL_ABI_DIR = Path(__file__).resolve().parent.parent.parent.parent / "blockchain" / "abi"
_DOCKER_ABI_DIR = Path("/blockchain/abi")
_LOCAL_DEPLOYMENT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "blockchain" / "deployments"
_DOCKER_DEPLOYMENT_DIR = Path("/blockchain/deployments")

_ABI_DIR = _DOCKER_ABI_DIR if _DOCKER_ABI_DIR.exists() else _LOCAL_ABI_DIR
_DEPLOYMENT_DIR = _DOCKER_DEPLOYMENT_DIR if _DOCKER_DEPLOYMENT_DIR.exists() else _LOCAL_DEPLOYMENT_DIR


def _load_abi(name: str) -> list:
    path = _ABI_DIR / f"{name}.json"
    if not path.exists():
        logger.warning("ABI file not found: %s — blockchain features disabled", path)
        return []
    with open(path) as f:
        return json.load(f)


def _load_deployment(network: str = "sepolia") -> dict:
    path = _DEPLOYMENT_DIR / f"{network}.json"
    if not path.exists():
        for p in _DEPLOYMENT_DIR.glob("*.json"):
            with open(p) as f:
                return json.load(f)
        return {}
    with open(path) as f:
        return json.load(f)


class BlockchainService:
    def __init__(self):
        self._web3 = None
        self._settlement_contract = None
        self._token_contract = None
        self._deployer_account = None
        self._initialized = False
        self._network = settings.BLOCKCHAIN_NETWORK
        self._rpc_url = settings.SEPOLIA_RPC_URL

    def _ensure_init(self):
        if self._initialized:
            return self._web3 is not None
        self._initialized = True
        try:
            from web3 import Web3

            if not self._rpc_url:
                logger.info("No SEPOLIA_RPC_URL set — blockchain settlement disabled")
                return False

            self._web3 = Web3(Web3.HTTPProvider(self._rpc_url))
            if not self._web3.is_connected():
                logger.warning("Cannot connect to Ethereum node at %s", self._rpc_url)
                self._web3 = None
                return False

            deployment = _load_deployment(self._network)
            if not deployment:
                logger.warning("No deployment found — run blockchain deploy script first")
                self._web3 = None
                return False

            settlement_abi = _load_abi("TradeSettlement")
            token_abi = _load_abi("TradeOffToken")
            if not settlement_abi:
                self._web3 = None
                return False

            self._settlement_contract = self._web3.eth.contract(
                address=Web3.to_checksum_address(deployment["settlementAddress"]),
                abi=settlement_abi,
            )
            if token_abi and deployment.get("tokenAddress"):
                self._token_contract = self._web3.eth.contract(
                    address=Web3.to_checksum_address(deployment["tokenAddress"]),
                    abi=token_abi,
                )

            deployer_key = settings.DEPLOYER_PRIVATE_KEY
            if deployer_key:
                self._deployer_account = self._web3.eth.account.from_key(deployer_key)
                logger.info(
                    "Blockchain service initialized — network=%s deployer=%s",
                    self._network,
                    self._deployer_account.address,
                )
            else:
                logger.info("Blockchain read-only mode (no DEPLOYER_PRIVATE_KEY)")

            return True
        except ImportError:
            logger.info("web3 not installed — blockchain features disabled")
            return False
        except Exception:
            logger.exception("Failed to initialize blockchain service")
            self._web3 = None
            return False

    @property
    def is_available(self) -> bool:
        return self._ensure_init()

    @property
    def can_write(self) -> bool:
        return self.is_available and self._deployer_account is not None

    def get_status(self) -> dict:
        if not self.is_available:
            return {"enabled": False, "network": self._network}
        deployment = _load_deployment(self._network)
        chain_id = self._web3.eth.chain_id
        return {
            "enabled": True,
            "network": self._network,
            "chain_id": chain_id,
            "settlement_contract": deployment.get("settlementAddress", ""),
            "token_contract": deployment.get("tokenAddress", ""),
            "deployer": self._deployer_account.address if self._deployer_account else None,
            "can_write": self.can_write,
        }

    async def settle_trade_on_chain(
        self,
        trade_id: str,
        trader_address: str,
        pair: str,
        side: str,
        price: int,
        quantity: int,
    ) -> dict | None:
        if not self.can_write:
            return None
        try:
            from web3 import Web3

            trade_id_bytes = Web3.keccak(text=trade_id)
            trader = Web3.to_checksum_address(trader_address)

            def _send():
                tx = self._settlement_contract.functions.settleTrade(
                    trade_id_bytes, trader, pair, side, price, quantity
                ).build_transaction({
                    "from": self._deployer_account.address,
                    "nonce": self._web3.eth.get_transaction_count(self._deployer_account.address),
                    "gas": 200_000,
                    "gasPrice": self._web3.eth.gas_price,
                    "chainId": self._web3.eth.chain_id,
                })
                signed = self._web3.eth.account.sign_transaction(tx, self._deployer_account.key)
                tx_hash = self._web3.eth.send_raw_transaction(signed.raw_transaction)
                receipt = self._web3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
                return tx_hash, receipt

            tx_hash, receipt = await asyncio.to_thread(_send)

            explorer = self._get_explorer_url()
            return {
                "tx_hash": tx_hash.hex(),
                "block_number": receipt["blockNumber"],
                "gas_used": receipt["gasUsed"],
                "status": "confirmed" if receipt["status"] == 1 else "failed",
                "explorer_url": f"{explorer}/tx/0x{tx_hash.hex()}" if explorer else None,
            }
        except Exception:
            logger.exception("Failed to settle trade on-chain: %s", trade_id)
            return None

    async def verify_trade(self, trade_id: str) -> dict:
        if not self.is_available:
            return {"verified": False, "reason": "blockchain_unavailable"}
        try:
            from web3 import Web3

            trade_id_bytes = Web3.keccak(text=trade_id)

            def _read():
                exists = self._settlement_contract.functions.verifyTrade(trade_id_bytes).call()
                if not exists:
                    return None
                return self._settlement_contract.functions.getSettlement(trade_id_bytes).call()

            result = await asyncio.to_thread(_read)
            if result is None:
                return {"verified": False, "reason": "not_found"}

            trader, pair, side, price, quantity, timestamp = result
            explorer = self._get_explorer_url()
            return {
                "verified": True,
                "trade_id": trade_id,
                "trader": trader,
                "pair": pair,
                "side": side,
                "price": price,
                "quantity": quantity,
                "settled_at": timestamp,
                "contract": self._settlement_contract.address,
                "explorer_url": f"{explorer}/address/{self._settlement_contract.address}" if explorer else None,
            }
        except Exception:
            logger.exception("Failed to verify trade: %s", trade_id)
            return {"verified": False, "reason": "error"}

    async def get_token_balance(self, address: str) -> dict:
        if not self.is_available or not self._token_contract:
            return {"balance": "0", "symbol": "TFO"}
        try:
            from web3 import Web3

            addr = Web3.to_checksum_address(address)

            def _read():
                balance = self._token_contract.functions.balanceOf(addr).call()
                decimals = self._token_contract.functions.decimals().call()
                return balance, decimals

            balance, decimals = await asyncio.to_thread(_read)
            human_balance = balance / (10 ** decimals)
            return {
                "balance": str(human_balance),
                "balance_wei": str(balance),
                "symbol": "TFO",
                "decimals": decimals,
                "token_address": self._token_contract.address,
            }
        except Exception:
            logger.exception("Failed to get token balance for %s", address)
            return {"balance": "0", "symbol": "TFO"}

    async def faucet_tokens(self, address: str) -> dict | None:
        """Mint 1000 TFO tokens to the given address (owner calls mint)."""
        if not self.can_write or not self._token_contract:
            return None
        try:
            from web3 import Web3

            addr = Web3.to_checksum_address(address)
            amount = 1000 * 10**18

            def _send():
                tx = self._token_contract.functions.mint(addr, amount).build_transaction({
                    "from": self._deployer_account.address,
                    "nonce": self._web3.eth.get_transaction_count(self._deployer_account.address),
                    "gas": 100_000,
                    "gasPrice": self._web3.eth.gas_price,
                    "chainId": self._web3.eth.chain_id,
                })
                signed = self._web3.eth.account.sign_transaction(tx, self._deployer_account.key)
                tx_hash = self._web3.eth.send_raw_transaction(signed.raw_transaction)
                receipt = self._web3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
                return tx_hash, receipt

            tx_hash, receipt = await asyncio.to_thread(_send)
            explorer = self._get_explorer_url()
            return {
                "tx_hash": tx_hash.hex(),
                "status": "confirmed" if receipt["status"] == 1 else "failed",
                "tokens_claimed": "1000",
                "symbol": "TFO",
                "explorer_url": f"{explorer}/tx/0x{tx_hash.hex()}" if explorer else None,
            }
        except Exception:
            logger.exception("Faucet claim failed for %s", address)
            return None

    async def get_total_settlements(self) -> int:
        if not self.is_available:
            return 0
        try:
            return await asyncio.to_thread(
                self._settlement_contract.functions.totalSettlements().call
            )
        except Exception:
            return 0

    def _get_explorer_url(self) -> str:
        explorers = {
            "sepolia": "https://sepolia.etherscan.io",
            "mainnet": "https://etherscan.io",
            "localhost": "",
            "hardhat": "",
        }
        return explorers.get(self._network, "")


blockchain_service = BlockchainService()
