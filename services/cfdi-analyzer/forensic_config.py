"""Visible, versioned thresholds for deterministic forensic analysis."""
from __future__ import annotations

from decimal import Decimal


ENGINE_VERSION = "ramrod-forensic-1.0.0"

# Maximum number of directed bank-transfer edges examined for a return cycle.
MAX_CYCLE_HOPS = 4
# A return flow must preserve at least this share after legitimate processing noise.
FLOW_RATIO_MIN = Decimal("0.70")
# A candidate split must occur in this many calendar days to share a procurement context.
BURST_WINDOW_DAYS = 31
# Require several purchases before treating sub-limit repetition as a lead.
MIN_SPLIT_COUNT = 3
# Cited amounts must be within the official two-percent reconciliation allowance.
AMOUNT_TOLERANCE = Decimal("0.02")
# Similar amounts are compared within this relative tolerance for splitting analysis.
SIMILAR_AMOUNT_TOLERANCE = Decimal("0.08")
# A vendor must have this many invoices before concentration becomes a candidate lead.
MIN_VENDOR_INVOICES = 2
# One clear bank transfer must connect a company payment to an employee-linked vendor.
MIN_KICKBACK_FLOW_RATIO = Decimal("0.70")
# Revenue mismatches require a material difference rather than rounding noise.
REVENUE_MISMATCH_TOLERANCE = Decimal("0.02")


def snapshot() -> dict[str, object]:
    return {
        "engine_version": ENGINE_VERSION,
        "max_cycle_hops": MAX_CYCLE_HOPS,
        "flow_ratio_min": FLOW_RATIO_MIN,
        "burst_window_days": BURST_WINDOW_DAYS,
        "min_split_count": MIN_SPLIT_COUNT,
        "amount_tolerance": AMOUNT_TOLERANCE,
        "similar_amount_tolerance": SIMILAR_AMOUNT_TOLERANCE,
        "min_vendor_invoices": MIN_VENDOR_INVOICES,
        "min_kickback_flow_ratio": MIN_KICKBACK_FLOW_RATIO,
        "revenue_mismatch_tolerance": REVENUE_MISMATCH_TOLERANCE,
    }