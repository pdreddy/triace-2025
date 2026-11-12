"""Pure ladder policy; call these from API transactions, never from the browser."""
from datetime import datetime, timedelta, timezone

CENTRAL = "America/Chicago"

def eligible_range(rank: int, consecutive_wins: int, player_count: int) -> range:
    if rank <= 3:
        return range(max(1, rank - 3), min(player_count, rank + 3) + 1)
    # Ranks are numbered from 1 at the top. Two wins unlock any higher rank.
    lower_bound = 1 if consecutive_wins >= 2 else max(1, rank - 3)
    return range(lower_bound, rank)

def can_challenge(rank, target_rank, wins, player_count):
    return target_rank in eligible_range(rank, wins, player_count) and target_rank != rank

def response_deadline(created_at):
    return created_at + timedelta(hours=48)

def is_late(submitted_at, sunday_deadline, approved_extension=None):
    return submitted_at > (approved_extension or sunday_deadline)

def point_award(won, successful_challenge=False, successful_defense=False, upset=False, late=False, walkover=False):
    if not won: return 1
    points = 3
    if not late:
        points += int(successful_challenge) + int(successful_defense) + int(upset)
    return points

def decline_penalty(prior_valid_declines):
    return 0 if prior_valid_declines == 0 else -2

def should_drop_for_declines(valid_declines): return valid_declines >= 2

def is_inactive(last_played_at, now):
    return last_played_at is None or now - last_played_at >= timedelta(days=14)
