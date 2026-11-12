from datetime import datetime, timedelta, timezone
from app.rules import *

def test_standard_range_and_top_defense():
    assert can_challenge(8,5,0,16)
    assert not can_challenge(8,4,0,16)
    assert can_challenge(2,5,0,16)
def test_two_wins_unlock_extended_range(): assert can_challenge(8,1,2,16)
def test_48_hour_expiry():
    start=datetime.now(timezone.utc); assert response_deadline(start)==start+timedelta(hours=48)
def test_late_points_only_and_extension():
    sunday=datetime.now(timezone.utc); submitted=sunday+timedelta(minutes=1)
    assert is_late(submitted,sunday); assert not is_late(submitted,sunday,submitted+timedelta(days=1))
    assert point_award(True,True,True,True,late=True)==3
def test_rematch_and_decline_and_inactivity():
    assert decline_penalty(0)==0 and decline_penalty(1)==-2
    assert should_drop_for_declines(2)
    assert is_inactive(datetime.now(timezone.utc)-timedelta(days=14),datetime.now(timezone.utc))
