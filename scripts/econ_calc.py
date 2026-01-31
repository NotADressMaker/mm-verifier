#!/usr/bin/env python3
import argparse
import json
from dataclasses import asdict, dataclass

SLASH_FRACTION = 0.50
DEFAULT_P_DETECT = 0.33


@dataclass
class EconResult:
    job_value: float
    num_verifiers: int
    quorum: int
    stake_per_verifier: float
    ladder_multiplier: float
    bribe_budget: float
    slash_fraction: float
    p_detect: float
    per_verifier_reward: float
    per_verifier_slash: float
    bribe_threshold_per_verifier: float
    total_bribe_threshold: float
    ladder_total_bond: float
    attack_cost_min: float
    attack_cost_max: float
    recommended_min_stake: float
    attack_feasible: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="MMV economic security parameter calculator",
    )
    parser.add_argument("--job-value", type=float, required=True, help="Job value in ETH/WETH")
    parser.add_argument("--num-verifiers", type=int, required=True, help="Total verifiers")
    parser.add_argument("--quorum", type=int, required=True, help="Quorum needed for collusion")
    parser.add_argument(
        "--stake-per-verifier",
        type=float,
        required=True,
        help="Stake/bond at risk per verifier (ETH/WETH)",
    )
    parser.add_argument(
        "--ladder-multiplier",
        type=float,
        required=True,
        help="Appeal ladder multiplier (use 1.0 for fixed bonds)",
    )
    parser.add_argument("--bribe-budget", type=float, required=True, help="Attacker bribe budget")
    parser.add_argument(
        "--p-detect",
        type=float,
        default=DEFAULT_P_DETECT,
        help="Probability of detection (default: 0.33)",
    )
    return parser.parse_args()


def compute(args: argparse.Namespace) -> EconResult:
    if args.quorum > args.num_verifiers:
        raise ValueError("quorum cannot exceed num_verifiers")

    per_verifier_reward = args.job_value / args.num_verifiers
    per_verifier_slash = args.stake_per_verifier * SLASH_FRACTION
    bribe_threshold_per_verifier = max(per_verifier_reward, per_verifier_slash)
    total_bribe_threshold = bribe_threshold_per_verifier * args.quorum

    # Simple ladder estimate: base bond + N appeals scaled by multiplier (L1-L3)
    ladder_total_bond = args.stake_per_verifier * (
        1 + args.ladder_multiplier + (args.ladder_multiplier ** 2)
    )

    attack_cost_min = total_bribe_threshold
    attack_cost_max = total_bribe_threshold + ladder_total_bond

    recommended_min_stake = max(
        args.stake_per_verifier,
        (args.job_value / args.quorum) / (args.p_detect * SLASH_FRACTION),
    )

    return EconResult(
        job_value=args.job_value,
        num_verifiers=args.num_verifiers,
        quorum=args.quorum,
        stake_per_verifier=args.stake_per_verifier,
        ladder_multiplier=args.ladder_multiplier,
        bribe_budget=args.bribe_budget,
        slash_fraction=SLASH_FRACTION,
        p_detect=args.p_detect,
        per_verifier_reward=per_verifier_reward,
        per_verifier_slash=per_verifier_slash,
        bribe_threshold_per_verifier=bribe_threshold_per_verifier,
        total_bribe_threshold=total_bribe_threshold,
        ladder_total_bond=ladder_total_bond,
        attack_cost_min=attack_cost_min,
        attack_cost_max=attack_cost_max,
        recommended_min_stake=recommended_min_stake,
        attack_feasible=args.bribe_budget >= total_bribe_threshold,
    )


def main() -> None:
    args = parse_args()
    result = compute(args)

    print("\nMMV Economic Security Calculator\n" + "-" * 36)
    print(f"Job value:                 {result.job_value:.4f}")
    print(f"Verifiers / quorum:        {result.num_verifiers} / {result.quorum}")
    print(f"Stake per verifier:        {result.stake_per_verifier:.4f}")
    print(f"Slash fraction:            {result.slash_fraction:.2f}")
    print(f"Detection probability:     {result.p_detect:.2f}")
    print(f"Per-verifier reward (V/N): {result.per_verifier_reward:.4f}")
    print(f"Per-verifier slash (σ*s):  {result.per_verifier_slash:.4f}")
    print(f"Bribe threshold/verifier:  {result.bribe_threshold_per_verifier:.4f}")
    print(f"Total bribe threshold:     {result.total_bribe_threshold:.4f}")
    print(f"Dispute ladder bond est.:  {result.ladder_total_bond:.4f}")
    print(f"Attack cost range:         {result.attack_cost_min:.4f} – {result.attack_cost_max:.4f}")
    print(f"Recommended min stake:     {result.recommended_min_stake:.4f}")
    print(f"Bribe budget:              {result.bribe_budget:.4f}")
    print(f"Attack feasible?           {result.attack_feasible}")

    print("\nJSON output")
    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
