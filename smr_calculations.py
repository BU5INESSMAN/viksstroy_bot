"""Canonical validation and Decimal arithmetic for SMR reports."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

MONEY_STEP = Decimal("0.01")
QUANTITY_STEP = Decimal("0.001")
MAX_QUANTITY = Decimal("1000000000")
MAX_HOURS_PER_ROW = Decimal("24")


class SmrNumberError(ValueError):
    """A user supplied an invalid SMR quantity or monetary value."""


def decimal_value(value, *, field: str, maximum: Decimal | None = None) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    try:
        number = Decimal(str(value).replace(",", "."))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise SmrNumberError(f"{field}: некорректное число") from exc
    if not number.is_finite():
        raise SmrNumberError(f"{field}: число должно быть конечным")
    if number < 0:
        raise SmrNumberError(f"{field}: значение не может быть отрицательным")
    limit = maximum if maximum is not None else MAX_QUANTITY
    if number > limit:
        raise SmrNumberError(f"{field}: значение превышает допустимый предел")
    return number.quantize(QUANTITY_STEP, rounding=ROUND_HALF_UP)


def money_value(value, *, field: str = "Сумма") -> Decimal:
    return decimal_value(value, field=field, maximum=MAX_QUANTITY).quantize(
        MONEY_STEP, rounding=ROUND_HALF_UP
    )


def calculate_smr_totals(plan_rows: list[dict], extra_rows: list[dict], hours_rows: list[dict]) -> dict:
    salary_total = Decimal("0")
    price_total = Decimal("0")

    def add_rows(rows, salary_key, price_key):
        nonlocal salary_total, price_total
        for row in rows:
            volume = decimal_value(row.get("volume"), field="Объём")
            salary_total += volume * money_value(row.get(salary_key), field="Расценка ЗП")
            price_total += volume * money_value(row.get(price_key), field="Цена")

    add_rows(plan_rows, "current_salary", "current_price")
    add_rows(extra_rows, "salary", "price")
    hours = sum(
        (decimal_value(row.get("hours"), field="Часы", maximum=MAX_HOURS_PER_ROW) for row in hours_rows),
        Decimal("0"),
    )
    return {
        "hours": float(hours.quantize(QUANTITY_STEP, rounding=ROUND_HALF_UP)),
        "salary": float(salary_total.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)),
        "price": float(price_total.quantize(MONEY_STEP, rounding=ROUND_HALF_UP)),
    }
