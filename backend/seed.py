# ─────────────────────────────────────────────
# seed.py
# One-time setup script to create the first
# auction and admin manager in the database.
#
# Run it ONCE before starting the app:
#   python seed.py
#
# Or with custom values:
#   python seed.py --username "Davide" --password "mypassword" --auction-name "Asta 2025"
# ─────────────────────────────────────────────

import asyncio
import argparse
import os
import sys

from database import init_db, AsyncSessionLocal
from models import Auction, Manager
from auth import hash_password


# ─────────────────────────────────────────────
# ARGUMENT PARSER
# Lets you customise the seed values from
# the command line without editing the file.
# ─────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Seed the Fantacalcio Asta database with an initial auction and admin manager."
    )
    parser.add_argument(
        "--username",
        type=str,
        default="admin",
        help="Admin manager username (default: admin)"
    )
    parser.add_argument(
        "--password",
        type=str,
        default="admin1234",
        help="Admin manager password (default: admin1234)"
    )
    parser.add_argument(
        "--auction-name",
        type=str,
        default="Asta Fantacalcio 2025",
        help="Name of the auction session (default: 'Asta Fantacalcio 2025')"
    )
    parser.add_argument(
        "--budget",
        type=int,
        default=500,
        help="Budget per team in fantamilioni (default: 500)"
    )
    parser.add_argument(
        "--timer",
        type=int,
        default=15,
        help="Bid countdown timer in seconds (default: 15)"
    )
    return parser.parse_args()


# ─────────────────────────────────────────────
# MAIN ASYNC FUNCTION
# ─────────────────────────────────────────────

async def main():
    args = parse_args()

    print("\n⚽  Fantacalcio Asta — Database Seeder")
    print("=" * 45)

    # ── Step 1: Ensure tables exist ───────────
    print("\n📦  Initialising database tables...")
    await init_db()
    print("    ✅  Tables ready.")

    async with AsyncSessionLocal() as db:

        # ── Step 2: Check if already seeded ───
        # If an auction already exists, we don't
        # want to create duplicates accidentally.
        from sqlalchemy.future import select

        existing_auction = await db.execute(select(Auction).limit(1))
        if existing_auction.scalar_one_or_none():
            print("\n⚠️   Database already contains an auction.")
            print("    To avoid duplicates, the seeder will not run again.")
            print("    If you want to reset, delete 'fantacalcio.db' and re-run.\n")
            sys.exit(0)

        # ── Step 3: Create the auction ────────
        print(f"\n🏆  Creating auction: '{args.auction_name}'...")
        auction = Auction(
            name=args.auction_name,
            budget_per_team=args.budget,
            timer_seconds=args.timer,
        )
        db.add(auction)
        # Flush to get the auction ID before creating the manager
        await db.flush()

        print(f"    ✅  Auction created — ID: {auction.id}")

        # ── Step 4: Create the admin manager ──
        print(f"\n👤  Creating admin manager: '{args.username}'...")
        admin = Manager(
            auction_id=auction.id,
            username=args.username,
            hashed_password=hash_password(args.password),
            is_admin=True,
            budget_remaining=args.budget,
        )
        db.add(admin)
        await db.commit()

        print(f"    ✅  Admin manager created.")

        # ── Step 5: Print summary ─────────────
        print("\n" + "=" * 45)
        print("  🎉  Seed completed successfully!")
        print("=" * 45)
        print(f"\n  Auction Name : {auction.name}")
        print(f"  Auction ID   : {auction.id}")
        print(f"  Budget/Team  : {args.budget} FM")
        print(f"  Timer        : {args.timer} seconds")
        print(f"\n  Admin User   : {args.username}")
        print(f"  Admin Pass   : {args.password}")

        print("\n" + "─" * 45)
        print("  🧪  Test your login with curl:")
        print("─" * 45)
        print(f"""
  curl -X POST http://localhost:8000/auth/login \\
    -H "Content-Type: application/x-www-form-urlencoded" \\
    -d "username={args.username}&password={args.password}"
""")

        print("─" * 45)
        print("  📖  Or open the interactive docs:")
        print("      http://localhost:8000/docs")
        print("─" * 45)

        # ── Step 6: .env reminder ─────────────
        if not os.path.exists(".env"):
            print("\n  ⚠️   No .env file found!")
            print("  Run this to generate a secret key:")
            print('  python -c "import secrets; print(secrets.token_hex(32))"')
            print("  Then create a .env file with:")
            print("  SECRET_KEY=your_generated_key_here\n")
        else:
            print("\n  ✅  .env file found — SECRET_KEY is set.\n")


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    asyncio.run(main())