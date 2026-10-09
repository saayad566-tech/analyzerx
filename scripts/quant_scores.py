"""Accounting-quality scores for source-normalized Indian equity statements.

The functions operate on already-normalized annual statement inputs. They do not
fetch data, infer missing values, or replace sector-specific accounting review.
All monetary inputs must use the same currency and scale within one observation.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Optional


Number = Optional[float]


def _finite(name: str, value: Number, *, allow_zero: bool = True) -> float:
    if value is None or not isfinite(value):
        raise ValueError(f"{name} is required and must be finite")
    if not allow_zero and value == 0:
        raise ValueError(f"{name} must be non-zero")
    return float(value)


def _ratio(name: str, numerator: Number, denominator: Number) -> float:
    return _finite(name, numerator) / _finite(f"{name} denominator", denominator, allow_zero=False)


def _change_signal(current: Number, prior: Number, *, higher_is_good: bool = True) -> int:
    current_value = _finite("current", current)
    prior_value = _finite("prior", prior)
    if higher_is_good:
        return int(current_value > prior_value)
    return int(current_value < prior_value)


@dataclass(frozen=True)
class PiotroskiYear:
    """Annual inputs for one issuer; values must be period-consistent."""

    net_income: float
    operating_cash_flow: float
    total_assets: float
    long_term_debt: float
    current_assets: float
    current_liabilities: float
    shares_outstanding: float
    gross_margin: float
    asset_turnover: float


@dataclass(frozen=True)
class PiotroskiResult:
    score: int
    signals: dict[str, int]


def piotroski_f_score(current: PiotroskiYear, prior: PiotroskiYear) -> PiotroskiResult:
    """Return Piotroski's nine-signal F-Score from two annual observations.

    Signals: positive ROA, positive CFO, improving ROA, CFO > net income,
    lower leverage, improving liquidity, no dilution, improving gross margin,
    and improving asset turnover. ROA is net income / average assets for the
    current period and net income / prior assets for the directional comparison.
    """
    for label, year in (("current", current), ("prior", prior)):
        for field, value in year.__dict__.items():
            _finite(f"{label}.{field}", value)
        if year.total_assets <= 0 or year.current_assets < 0 or year.current_liabilities <= 0:
            raise ValueError(f"{label} has invalid balance-sheet denominators")
        if year.shares_outstanding <= 0:
            raise ValueError(f"{label}.shares_outstanding must be positive")

    current_roa = current.net_income / ((current.total_assets + prior.total_assets) / 2)
    prior_roa = prior.net_income / prior.total_assets
    current_leverage = current.long_term_debt / current.total_assets
    prior_leverage = prior.long_term_debt / prior.total_assets
    current_liquidity = current.current_assets / current.current_liabilities
    prior_liquidity = prior.current_assets / prior.current_liabilities

    signals = {
        "positive_roa": int(current_roa > 0),
        "positive_cfo": int(current.operating_cash_flow > 0),
        "improving_roa": int(current_roa > prior_roa),
        "cash_flow_exceeds_net_income": int(current.operating_cash_flow > current.net_income),
        "lower_leverage": int(current_leverage < prior_leverage),
        "improving_liquidity": int(current_liquidity > prior_liquidity),
        "no_share_dilution": int(current.shares_outstanding <= prior.shares_outstanding),
        "improving_gross_margin": int(current.gross_margin > prior.gross_margin),
        "improving_asset_turnover": int(current.asset_turnover > prior.asset_turnover),
    }
    return PiotroskiResult(score=sum(signals.values()), signals=signals)


@dataclass(frozen=True)
class BeneishYear:
    sales: float
    receivables: float
    current_assets: float
    property_plant_equipment: float
    depreciation: float
    total_assets: float
    current_liabilities: float
    total_liabilities: float
    net_income: float
    operating_cash_flow: float
    selling_general_admin: float
    gross_profit: float


@dataclass(frozen=True)
class BeneishResult:
    m_score: float
    variables: dict[str, float]
    high_risk: bool


def beneish_m_score(current: BeneishYear, prior: BeneishYear) -> BeneishResult:
    """Compute the eight-variable Beneish M-Score.

    The common published specification is used:
    - DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA
    - M = -4.84 + 0.92 DSRI + 0.528 GMI + 0.404 AQI + 0.892 SGI
      + 0.115 DEPI - 0.172 SGAI + 4.679 TATA - 0.327 LVGI

    A score above -1.78 is a screening flag, not proof of fraud. The model is
    not suitable without adaptation for banks/NBFCs or non-comparable reporting.
    """
    for label, year in (("current", current), ("prior", prior)):
        for field, value in year.__dict__.items():
            _finite(f"{label}.{field}", value)
        if year.sales <= 0 or year.total_assets <= 0 or year.gross_profit <= 0:
            raise ValueError(f"{label} has invalid Beneish denominators")

    current_receivables_ratio = current.receivables / current.sales
    prior_receivables_ratio = prior.receivables / prior.sales
    current_gross_margin = current.gross_profit / current.sales
    prior_gross_margin = prior.gross_profit / prior.sales
    current_asset_quality = 1 - (current.current_assets + current.property_plant_equipment) / current.total_assets
    prior_asset_quality = 1 - (prior.current_assets + prior.property_plant_equipment) / prior.total_assets
    current_depi = current.depreciation / (current.depreciation + current.property_plant_equipment)
    prior_depi = prior.depreciation / (prior.depreciation + prior.property_plant_equipment)
    current_sgai = current.selling_general_admin / current.sales
    prior_sgai = prior.selling_general_admin / prior.sales
    current_lvgi = current.total_liabilities / current.total_assets
    prior_lvgi = prior.total_liabilities / prior.total_assets
    current_tata = (current.net_income - current.operating_cash_flow) / current.total_assets

    variables = {
        "DSRI": _ratio("DSRI", current_receivables_ratio, prior_receivables_ratio),
        "GMI": _ratio("GMI", prior_gross_margin, current_gross_margin),
        "AQI": _ratio("AQI", current_asset_quality, prior_asset_quality),
        "SGI": _ratio("SGI", current.sales, prior.sales),
        "DEPI": _ratio("DEPI", current_depi, prior_depi),
        "SGAI": _ratio("SGAI", current_sgai, prior_sgai),
        "LVGI": _ratio("LVGI", current_lvgi, prior_lvgi),
        "TATA": current_tata,
    }
    m_score = (
        -4.84
        + 0.920 * variables["DSRI"]
        + 0.528 * variables["GMI"]
        + 0.404 * variables["AQI"]
        + 0.892 * variables["SGI"]
        + 0.115 * variables["DEPI"]
        - 0.172 * variables["SGAI"]
        + 4.679 * variables["TATA"]
        - 0.327 * variables["LVGI"]
    )
    return BeneishResult(m_score=m_score, variables=variables, high_risk=m_score > -1.78)


def sloan_ratio(net_income: float, operating_cash_flow: float, average_total_assets: float) -> float:
    """Return the Sloan accrual ratio: (net income - CFO) / average assets."""
    assets = _finite("average_total_assets", average_total_assets, allow_zero=False)
    return (_finite("net_income", net_income) - _finite("operating_cash_flow", operating_cash_flow)) / assets
