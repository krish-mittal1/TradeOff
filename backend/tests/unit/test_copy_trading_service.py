from decimal import Decimal

from app.services.copy_trading_service import calculate_copy_quantity, floor_to_step, is_copy_order


def test_floor_to_step_rounds_down_to_pair_step():
    assert floor_to_step(Decimal("0.123456"), Decimal("0.001")) == Decimal("0.123")


def test_calculate_copy_quantity_scales_and_caps_by_max_position():
    quantity = calculate_copy_quantity(
        leader_quantity=Decimal("2"),
        leader_price=Decimal("100"),
        allocation_percentage=Decimal("50"),
        max_position_size=Decimal("25"),
        min_qty=Decimal("0.01"),
        max_qty=Decimal("10"),
        min_notional=Decimal("1"),
        step_size=Decimal("0.01"),
    )
    assert quantity == Decimal("0.25")


def test_calculate_copy_quantity_skips_when_below_min_notional():
    quantity = calculate_copy_quantity(
        leader_quantity=Decimal("1"),
        leader_price=Decimal("10"),
        allocation_percentage=Decimal("5"),
        max_position_size=None,
        min_qty=Decimal("0.01"),
        max_qty=Decimal("10"),
        min_notional=Decimal("1"),
        step_size=Decimal("0.01"),
    )
    assert quantity is None


def test_copy_order_client_ids_are_detected():
    assert is_copy_order("copy:leader:relation")
    assert not is_copy_order("manual-order")
    assert not is_copy_order(None)
