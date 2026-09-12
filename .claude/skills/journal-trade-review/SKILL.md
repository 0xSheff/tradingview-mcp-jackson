---
name: journal-trade-review
description: Write a trade's review into the trading-coach journal via trade_record_review in the compact six-section list format the trader reads — right / wrong / missing against the strategy rules, one cited instruction. Use in the evening review after the screenshots are verified, for every trade whether plan-match, addendum-only or off-plan.
---

# Trade Review → `trade_record_review`

`review_rubric_get` (server-authored) says **what** a review must contain: six sections, in
order, each saying something, the last one a single instruction cited from the strategy or
setup text. This skill says **how** it is written for this trader: as lists.

## Preconditions

- The trade is terminally enriched (screenshots verified per [[journal-screenshot-review]], or
  `trade_skip_enrichment` with a reason), the real stop is on file, and the match is known
  (`ingest_wait` / `trade_matches_list` / `setups_review`): plan-match, addendum-only, off-plan.
- You hold the strategy methodology and the setup description
  (`strategy_setup_description_get`), the plan item / addendum text, the verified notes, and
  the bars around the trade.

## Format — lists, never prose

Every section is 1–3 bullets, one line each, `·` between fields, ✓/✗ on the precondition
lines, `right:` / `wrong:` / `missing:` labels where the section judges. Numbers and level
names stay; narrative goes. The trader must see at a glance what was right and what was wrong.

```
setup:
- <setup type> · <plan item | addendum | off-plan: closest type + why> · <W/D story = regime>
- form: <event → entry: sweep/reclaim/tap, price, where in the zone>
preconditions_met:
- bias ✓ <story, invalidation intact>
- zone ✓ <alive, qualified by what>
- framed ✓ entry · stop · target · $risk ≤ cap
preconditions_missing:
- <precondition> ✗ <what was missing, with the level>
- management ✗ <BE / partial not done at level X, time>       ← or "- none of the setup's preconditions"
entry:
- right: <what fit the rules>
- wrong: <what did not — location, size, risk vs the plan>
exit:
- <type price time> · <the rule that fired, or the decision>
- right / missing: <re-entry, BE, partial, trail — per the strategy text>
instruction:
- <one thing> — «<quoted clause from the strategy or setup text>» · <the level / time it applied here>
```

## Judging

- **Same rules for every trade.** The strategy methodology and the setup preconditions judge
  the trade whether the matcher says plan-match, addendum-only or off-plan. Name the match on
  the first setup bullet, then judge by the rules.
- **Check the management rules on every trade, explicitly:** "First target-side level taken →
  break-even", the trail after a strong impulse, the V7 re-entry after a stop-out, the Friday
  liquidation as a normal end. When the setup line carries a `BE:` level, that is the level to
  check (W37 lesson: three trades held the full stop past T1).
- **Facts from the notes and the bars**, not from the coach note: highs/lows with times, the
  rung the entry sat on or missed, the stop against the LB extreme, the risk against the cap
  and against the plan's own $ figure.
- `tone`: `positive-recognition` when the rules were followed (a loss included);
  `constructive-challenge` when a rule was broken; `neutral-observation` otherwise.
  `author="external-agent"`.
- Calling `trade_record_review` again **replaces** the review — a wrong number is corrected
  that way, never by a second review.

## Never

- Never write the sections as paragraphs (trader feedback 2026-09-12).
- Never invent a rule: the instruction quotes the trader's own text, or says no rule covers
  the case and nothing else.
- Never put the analysis into `trade_add_explanation` — that channel is the trader's own
  words, and the retrospective clusters it.
