"""Seed the database with initial data for development and testing."""
import asyncio
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from app.db.session import async_session_factory
from app.models.user import User
from app.models.asset import Asset, TradingPair
from app.models.wallet import UserWallet
from app.utils.security import hash_password


async def seed():
    print("Seeding database with initial data...")
    
    async with async_session_factory() as db:
        # Check if already seeded
        result = await db.execute(select(Asset).limit(1))
        if result.scalar_one_or_none():
            print("Database already seeded, skipping.")
            return
        
        # Create assets
        assets = [
            Asset(id=uuid.uuid4(), symbol="BTC", name="Bitcoin", decimals=8, is_active=True,
                  min_withdrawal=Decimal("0.001"), max_withdrawal=Decimal("10"), withdrawal_fee=Decimal("0.0005"),
                  min_deposit=Decimal("0.0001"), deposit_confirmations=2),
            Asset(id=uuid.uuid4(), symbol="ETH", name="Ethereum", decimals=18, is_active=True,
                  min_withdrawal=Decimal("0.01"), max_withdrawal=Decimal("100"), withdrawal_fee=Decimal("0.005"),
                  min_deposit=Decimal("0.001"), deposit_confirmations=12),
            Asset(id=uuid.uuid4(), symbol="USDT", name="Tether", decimals=2, is_active=True,
                  min_withdrawal=Decimal("10"), max_withdrawal=Decimal("100000"), withdrawal_fee=Decimal("1"),
                  min_deposit=Decimal("1"), deposit_confirmations=1),
            Asset(id=uuid.uuid4(), symbol="SOL", name="Solana", decimals=9, is_active=True,
                  min_withdrawal=Decimal("0.1"), max_withdrawal=Decimal("1000"), withdrawal_fee=Decimal("0.01"),
                  min_deposit=Decimal("0.01"), deposit_confirmations=1),
            Asset(id=uuid.uuid4(), symbol="ADA", name="Cardano", decimals=6, is_active=True,
                  min_withdrawal=Decimal("1"), max_withdrawal=Decimal("100000"), withdrawal_fee=Decimal("0.5"),
                  min_deposit=Decimal("1"), deposit_confirmations=1),
        ]
        db.add_all(assets)
        await db.flush()
        
        btc_id = assets[0].id
        eth_id = assets[1].id
        usdt_id = assets[2].id
        sol_id = assets[3].id
        ada_id = assets[4].id
        
        print(f"Created {len(assets)} assets")
        
        # Create trading pairs
        pairs = [
            TradingPair(id=uuid.uuid4(), symbol="BTCUSDT", base_asset_id=btc_id, quote_asset_id=usdt_id,
                       base_precision=5, quote_precision=2, min_qty=Decimal("0.00001"), max_qty=Decimal("1000"),
                       min_notional=Decimal("10"), tick_size=Decimal("0.01"), step_size=Decimal("0.00001"),
                       maker_fee=Decimal("0.001"), taker_fee=Decimal("0.001"), is_active=True),
            TradingPair(id=uuid.uuid4(), symbol="ETHUSDT", base_asset_id=eth_id, quote_asset_id=usdt_id,
                       base_precision=4, quote_precision=2, min_qty=Decimal("0.0001"), max_qty=Decimal("10000"),
                       min_notional=Decimal("10"), tick_size=Decimal("0.01"), step_size=Decimal("0.0001"),
                       maker_fee=Decimal("0.001"), taker_fee=Decimal("0.001"), is_active=True),
            TradingPair(id=uuid.uuid4(), symbol="SOLUSDT", base_asset_id=sol_id, quote_asset_id=usdt_id,
                       base_precision=2, quote_precision=2, min_qty=Decimal("0.01"), max_qty=Decimal("100000"),
                       min_notional=Decimal("10"), tick_size=Decimal("0.01"), step_size=Decimal("0.01"),
                       maker_fee=Decimal("0.001"), taker_fee=Decimal("0.001"), is_active=True),
            TradingPair(id=uuid.uuid4(), symbol="ADAUSDT", base_asset_id=ada_id, quote_asset_id=usdt_id,
                       base_precision=1, quote_precision=4, min_qty=Decimal("1"), max_qty=Decimal("1000000"),
                       min_notional=Decimal("10"), tick_size=Decimal("0.0001"), step_size=Decimal("1"),
                       maker_fee=Decimal("0.001"), taker_fee=Decimal("0.001"), is_active=True),
        ]
        db.add_all(pairs)
        await db.flush()
        
        print(f"Created {len(pairs)} trading pairs")
        
        # Create demo users
        users = [
            User(id=uuid.uuid4(), email="trader1@cex.com", password_hash=hash_password("Password123!"),
                 display_name="Trader One", kyc_level=2, status="ACTIVE", referral_code="TRADER1"),
            User(id=uuid.uuid4(), email="trader2@cex.com", password_hash=hash_password("Password123!"),
                 display_name="Trader Two", kyc_level=1, status="ACTIVE", referral_code="TRADER2"),
            User(id=uuid.uuid4(), email="admin@cex.com", password_hash=hash_password("Admin123!"),
                 display_name="Admin", kyc_level=2, status="ACTIVE", role="admin", referral_code="ADMIN"),
        ]
        db.add_all(users)
        await db.flush()
        
        print(f"Created {len(users)} users")
        
        # Create wallets for demo users
        wallets = [
            # Trader 1 - rich
            UserWallet(user_id=users[0].id, asset_id=btc_id, available=Decimal("5.0"), locked=Decimal("0")),
            UserWallet(user_id=users[0].id, asset_id=eth_id, available=Decimal("50.0"), locked=Decimal("0")),
            UserWallet(user_id=users[0].id, asset_id=usdt_id, available=Decimal("50000.0"), locked=Decimal("0")),
            UserWallet(user_id=users[0].id, asset_id=sol_id, available=Decimal("500.0"), locked=Decimal("0")),
            # Trader 2 - moderate
            UserWallet(user_id=users[1].id, asset_id=btc_id, available=Decimal("0.5"), locked=Decimal("0")),
            UserWallet(user_id=users[1].id, asset_id=usdt_id, available=Decimal("5000.0"), locked=Decimal("0")),
            # Admin
            UserWallet(user_id=users[2].id, asset_id=usdt_id, available=Decimal("100000.0"), locked=Decimal("0")),
        ]
        db.add_all(wallets)
        
        print(f"Created {len(wallets)} wallets")
        print("\nDemo Credentials:")
        print("  trader1@cex.com / Password123! (Trader with funds)")
        print("  trader2@cex.com / Password123! (Trader with moderate funds)")
        print("  admin@cex.com / Admin123! (Admin)")
        print("\nSeed complete!")
        
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed())
