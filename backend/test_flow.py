import asyncio
import os
import sys

# Ensure backend folder is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db, AsyncSessionLocal
from models import Team, Round, Poll, Vote
from sqlalchemy import select

async def run_tests():
    print("=== 1. INITIALIZING DATABASE ===")
    await init_db()
    print("Database tables initialized successfully!")

    async with AsyncSessionLocal() as session:
        print("\n=== 2. CREATING TEAMS WITH 6-DIGIT CODES ===")
        import random
        code1 = f"{random.randint(100000, 999999)}"
        code2 = f"{random.randint(100000, 999999)}"
        code3 = f"{random.randint(100000, 999999)}"

        t1 = Team(name="Neon Ninjas", code=code1, is_active=True)
        t2 = Team(name="Pixel Pilots", code=code2, is_active=True)
        t3 = Team(name="Voxel Vipers", code=code3, is_active=True)

        session.add_all([t1, t2, t3])
        await session.commit()
        await session.refresh(t1)
        await session.refresh(t2)
        await session.refresh(t3)

        t1_id = t1.id
        t2_id = t2.id
        t3_id = t3.id
        t1_name = t1.name
        t2_name = t2.name
        t3_name = t3.name

        print(f"Team 1: {t1_name} (Code: #{t1.code}, ID: {t1_id})")
        print(f"Team 2: {t2_name} (Code: #{t2.code}, ID: {t2_id})")
        print(f"Team 3: {t3_name} (Code: #{t3.code}, ID: {t3_id})")

        print("\n=== 3. CREATING ROUND 1 AND POLL FOR TEAM 1 ===")
        r1 = Round(name="Round 1", max_score=10, is_current=True)
        session.add(r1)
        await session.commit()
        await session.refresh(r1)

        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        poll = Poll(
            round_id=r1.id,
            pitching_team_id=t1_id,
            duration_secs=30,
            started_at=now,
            ends_at=now + timedelta(seconds=30),
            is_active=True
        )
        session.add(poll)
        await session.commit()
        await session.refresh(poll)
        poll_id = poll.id
        print(f"Poll #{poll_id} started for pitching team: {t1_name}")

        print("\n=== 4. TESTING ONE-MEMBER-PER-TEAM ENFORCEMENT ===")
        # Team 2 votes score 9
        v1 = Vote(poll_id=poll_id, voter_team_id=t2_id, score=9)
        session.add(v1)
        await session.commit()
        print(f"Vote 1 cast by Team '{t2_name}' (Score: 9/10) - SUCCESS!")

        # Second member from Team 2 tries to vote (must fail)
        v2 = Vote(poll_id=poll_id, voter_team_id=t2_id, score=8)
        session.add(v2)
        try:
            await session.commit()
            print("ERROR: Duplicate vote was incorrectly allowed!")
            sys.exit(1)
        except Exception:
            await session.rollback()
            print("SUCCESS: Duplicate vote from same team was BLOCKED by UniqueConstraint as required!")

        # Team 3 votes score 7
        v3 = Vote(poll_id=poll_id, voter_team_id=t3_id, score=7)
        session.add(v3)
        await session.commit()
        print(f"Vote 2 cast by Team '{t3_name}' (Score: 7/10) - SUCCESS!")

        print("\n=== 5. TESTING AVERAGE SCORE CALCULATION ===")
        res = await session.execute(select(Vote).where(Vote.poll_id == poll_id))
        all_votes = res.scalars().all()
        scores = [v.score for v in all_votes]
        avg = sum(scores) / len(scores)
        print(f"Total votes recorded: {len(scores)}")
        print(f"Scores: {scores}")
        print(f"Calculated Average: {avg:.2f} / 10 (Expected: 8.00)")
        assert avg == 8.0, "Average calculation mismatch!"

        print("\n=== 6. TESTING DELETE RESULT (FOR TESTS) ===")
        target_poll = await session.get(Poll, poll_id)
        await session.delete(target_poll)
        await session.commit()
        
        # Verify votes cascade deleted
        check_votes = await session.execute(select(Vote).where(Vote.poll_id == poll_id))
        remaining_votes = check_votes.scalars().all()
        print(f"Votes remaining after poll deletion: {len(remaining_votes)} (Expected: 0)")
        assert len(remaining_votes) == 0, "Votes were not deleted on poll cascade delete!"

        print("\n>>> ALL TESTS PASSED WITH 100% SUCCESS! <<<")

if __name__ == "__main__":
    asyncio.run(run_tests())
