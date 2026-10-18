# Computer strategy: sources, principles and what the code does

This file records where the computer players' bidding and card play come from. Everything below is a summary in my own words. No text or images from any source are copied into the app; all on-screen tips, explanations and system cards are original wording.

Priority when sources disagree:
1. **bridgeplaybook.com**, the base that Neil chose.
2. **Byron Lund's books and BridgeBum**, the main modern references for refinements.
3. Simplified SAYC wherever the sources say nothing.

Other sources fill gaps only where they agree with these.

Code map:
- `src/systems.js`: bidding systems (parameters, convention toggles, reference cards).
- `src/bidding.js`: the data-driven bidding engine. It has two parts: a call interpreter, and decision rules that read the system parameters.
- `src/play.js`: card play.
- `src/tips.js`: learning-mode play tips.
- `src/bidding.js#suggest/feedback`: bidding tips.

---

## 1. bridgeplaybook.com (base)

Hub: https://bridgeplaybook.com/bridge-strategy/

Sub-pages used:
- [Opening leads](https://bridgeplaybook.com/bridge-strategy/opening-leads/)
- [Defensive signals](https://bridgeplaybook.com/bridge-strategy/defensive-signals/)
- [Declarer play tips](https://bridgeplaybook.com/bridge-strategy/declarer-play-tips/)
- [Finesse](https://bridgeplaybook.com/bridge-strategy/finesse-in-bridge/)
- [Intermediate tips](https://bridgeplaybook.com/bridge-strategy/intermediate-bridge-tips/)
- [Law of Total Tricks](https://bridgeplaybook.com/bridge-strategy/law-of-total-tricks/)
- [Losing Trick Count](https://bridgeplaybook.com/bridge-strategy/losing-trick-count/)
- [Card counting](https://bridgeplaybook.com/bridge-strategy/card-counting-in-bridge/)
- [Common beginner mistakes](https://bridgeplaybook.com/bridge-strategy/common-beginner-mistakes/)
- [Bidding cheat sheet](https://bridgeplaybook.com/bridge-bidding/bridge-bidding-cheat-sheet/)
- [Opening bids](https://bridgeplaybook.com/bridge-bidding/opening-bids/)
- [Responding to 1NT](https://bridgeplaybook.com/bridge-bidding/responding-to-1nt/)
- [Stayman](https://bridgeplaybook.com/bridge-conventions/stayman/)
- [Jacoby transfers](https://bridgeplaybook.com/bridge-conventions/jacoby-transfers/)
- [Blackwood](https://bridgeplaybook.com/bridge-conventions/blackwood/)
- [RKCB](https://bridgeplaybook.com/bridge-conventions/roman-key-card-blackwood/)
- [Takeout doubles](https://bridgeplaybook.com/bridge-conventions/takeout-doubles/)
- [Negative doubles](https://bridgeplaybook.com/bridge-conventions/negative-doubles/)
- [Michaels](https://bridgeplaybook.com/bridge-conventions/michaels-cuebid/)

### Summary of its principles, and status

| Area | Principle (paraphrased) | Status |
|---|---|---|
| Hand valuation | HCP 4-3-2-1; add shortness points once a trump fit is found; the Rule of 20 for borderline openings | Implemented (`hand.js`: `hcp`, `shortPts`, `rule20`) |
| Openings | 5-card majors, better minor, 1NT 15–17, 2NT 20–21, strong 2♣ 22+, weak twos with a good 6-card suit, pre-empts with 7 cards | Implemented (SAYC) |
| Responses | Raise partner's major with 3+ support (6–9 single, 10–12 limit), new suit forcing, 1NT 6–10, always show a 4-card major at the 1 level | Implemented |
| Over 1NT | Stayman with a 4-card major and invitational values; Jacoby transfers with any 5-card major; 2NT invite, 3NT game, 4NT quantitative | Implemented |
| Slams | Count combined points (33 small slam, 37 grand), check aces with Blackwood or key cards with RKCB | Implemented (Blackwood; RKCB 1430 where the system turns it on). Gerber: not implemented |
| Competition | Takeout double with opening values and shortness; overcalls with a good 5-card suit; negative doubles; Michaels | Implemented |
| LoTT | Compete to the level of your combined trump length | Implemented (caps competitive bidding; uses partner's expected length) |
| LTC | Count losers to judge raises | Partly implemented: opener's decision to raise further after a fit |
| Opening leads | Top of a sequence, fourth best from length, top of a doubleton, MUD from three small, partner's suit first, avoid leading an unsupported ace against a suit contract, singleton with trump entries, trump lead when dummy is short and declarer has two suits | Implemented (`openingLead`, `leadCardFrom`) |
| Signals | Attitude when partner leads (high encourages), count on declarer's lead (high-low = even), discards show attitude | Implemented for both computer play and the learning tips. Suit-preference: not implemented |
| Defence | Second hand low, third hand high, cover an honour with an honour | Implemented |
| Declarer | Count winners before trick one; draw trumps unless dummy's ruffs are needed; finesse only when the contract needs it; hold up in no-trumps; unblock (high card from the short hand first) | Implemented (`declarerLead`, `planRuff`, `cashFrom`, `leadSuitToWin`, hold-up) |
| Declarer | Danger hand / avoidance play; squeezes; endplays | Not implemented |
| Card counting | Track played cards and show-outs | Implemented, legitimately: the AI only sees its own hand, dummy after the lead, and played cards |

## 2. artofcards.in

Source: https://artofcards.in/blogs/post/bridge-strategies-and-tips

**What it adds:** a general-audience list of ten tips. It contains no system details or numbers, so it mostly confirms habits rather than adding rules:
1. Plan before playing to trick one: count sure winners, then look for long suits, finesses and timing.
2. Use the information from the auction.
3. Track the cards played, especially honours and trumps.
4. Manage trumps: draw them to protect winners, or delay to ruff losers.
5. Communicate through bids, leads and signals.
6. Learn defence.
7. Practise varied deals.
8. Watch experts.
9. Avoid overbidding, ignoring signals and rushing.
10. Practise regularly.

**What was implemented from it:**
- (1) is the declarer plan in the learning tips ("You need N tricks; sure winners …; losers …") and in the AI's sure-trick counting.
- (2) is the AI's use of auction inferences for leads and its partner model.
- (3) is the AI's played-card and show-out tracking.
- (4) is the AI's choice between ruffing first and drawing trumps (`planRuff`).
- (5) is the signal-meaning tips.
- (9) is the Law of Total Tricks cap and combined-point thresholds, which guard against overbidding.
- Tips 6–8 and 10 are advice to humans with no algorithmic content.

**Conflict:** on trumps, the page presents drawing early and delaying as a balanced choice, while bridgeplaybook's default is to draw trumps unless ruffs in dummy are needed. The code follows bridgeplaybook: draw by default, delay only when the ruff plan needs it.

## 3. bridgechamp.com: ten beginner books

Source: https://bridgechamp.com/blog/top-10-must-read-bridge-books-for-beginners/

I have not read these books. The table lists what the page says each one teaches, then the well-established principles each is commonly known for, and how the app uses them. No book text is used.

| Book | What the page says it covers | Established principles mapped | Used in the app |
|---|---|---|---|
| Eddie Kantar, *Bridge for Dummies* | Rules, valuation and bidding, declarer play, defence, etiquette and scoring, glossary | HCP valuation, counting winners, basic defence | Valuation; plan tips |
| Barbara Seagram & Marc Smith, *25 Bridge Conventions You Should Know* | Stayman, Jacoby transfers, Blackwood/Gerber, negative doubles, Michaels, Unusual 2NT, fourth suit forcing; basic to advanced | Standard meanings of these conventions | Stayman, transfers, Blackwood/RKCB, negative doubles, Michaels and Unusual 2NT as toggles. Gerber and fourth suit forcing not implemented |
| William S. Root, *The ABCs of Bridge* | Rules, valuation and bidding, declarer and defence, basic conventions, scoring | Standard American fundamentals | Beginner Standard American system |
| Audrey Grant, *Bridge Basics 1* | Mechanics, valuation, opening bids and responses, play, defence, partnership communication | Opening and response ranges; responder's 6–9 / 10–12 / 13+ bands | Response bands in all systems; Beginner card |
| Louis Watson, *Play of the Hand* | Planning, entries, long suits, finesses, endplays, suit combinations, counting and inference | Plan first, establish long suits, manage entries, finesse toward tenaces | Declarer plan; finesse and long-suit logic. Endplays not implemented |
| Andrew Kambites, *Improve Your Bridge at Home* | Self-study of valuation and bidding, play, defence, competition, partnership | Practise with feedback | The learning mode itself (hint, then feedback) |
| Victor Mollo & Nico Gardener, *Card Play Technique* | Counting and inference, timing, deception, squeezes, endplays, avoidance | Count the hand, timing of trump draws, avoidance | Counting and timing (ruff before drawing). Squeezes, endplays and deception not implemented |
| Albert Dormer, *The Complete Book of Bridge* | Standard American, Acol and Precision systems; play; slams; competition; partnership | That several systems exist with different ranges | Supports the multi-system design (SAYC, Acol, Precision) |
| Patty Tucker, *Beginning Bridge* | Mechanics, valuation and bidding, declarer and defence, basic conventions, scoring | Same fundamentals as above | Beginner system and tips |
| David Bird & Marc Smith, *Bridge Technique* series | Card play, defensive planning, trumps, eliminations/throw-ins, deception, safety plays, unblocking | Unblocking, trump technique, safety plays | Unblocking (cash high from the short hand); trump management. Safety plays and throw-ins not implemented |

## 4. Public-domain books (`sources/`, card play only)

Their bidding and scoring are outdated (auction bridge, pre-1930 scoring, the Club convention) and were **not** used. Card-play principles that agree with modern practice were taken:
- **Whitehead, *Contract Bridge Standards* (1929)** and *Conventions of Auction Bridge* (1914):
  - Fourth-best leads and the Rule of Eleven. The Rule of Eleven is implemented when third hand decides whether to play high.
  - Count your tricks before playing to the first trick (the declarer plan).
  - Hold up an ace in no-trumps to cut communications.
  - Lead toward the high card or tenace.
- **Milton Work, *Contract Bridge for All* (1930)** and *Auction of To-day* (1913):
  - The definition of a finesse, and the "lead toward the card you hope will win" principle (used in `leadSuitToWin`).
  - Unblocking: play the high card from the short holding first (used in `cashFrom` and in third-hand unblocks).
- **Elwell (1902/1904)** and **Vanderbilt (1929)**: consulted only for whist-era leads. Nothing was taken from them that the modern sources didn't already cover.

## 5. Byron Lund, Sundstrom, Master Point Press samples, BridgeBum (main modern references)

Private reference only. Nothing is copied into the app.
- **Byron Lund, *How to Play Winning Intermediate / Advanced / Expert Bridge*:**
  - Cover an honour with an honour (implemented).
  - The Rule of 7 for how often to hold up in no-trumps: 7 minus our combined cards in their suit. Implemented, capped at 2 hold-ups.
  - "Eight ever, nine never" for finesse versus drop with the queen missing (implemented).
  - The Rule of Eleven (implemented).
- **BridgeBum:**
  - [Standard leads](https://www.bridgebum.com/standard_leads.php): the lead table, including interior sequences. KJ10→J, K109→10, Q109→10, and AQJ/AJ10 against no-trumps only are implemented in `leadCardFrom`.
  - [SAYC](https://www.bridgebum.com/sayc.php): ranges.
  - [Negative double](https://www.bridgebum.com/negative_double.php): after 1m–(1♦), double shows both majors, and a 1-level major bid is natural. Implemented: the double now comes before a 1-level major bid.
  - [Responses to 2♣](https://www.bridgebum.com/responses_to_a_2c_opening_bid.php): 2♦ waiting (used).
  - [Attitude signals](https://www.bridgebum.com/attitude_signals.php) and [count signals](https://www.bridgebum.com/count_signals.php): standard carding (used).
  - [RKCB](https://www.bridgebum.com/roman_key_card_blackwood.php): 1430 responses (used).
- **James Sundstrom, *Beginner Bridge Lessons* (Princeton):** the Standard American beginner structure, which shaped the Beginner system's card.
- **Seagram & Smith samples (Master Point Press):** the takeout-double and overcall requirements agree with what is implemented.

---

## 6. Bidding systems

Each system is a parameter set plus convention toggles plus a reference card, defined in `src/systems.js`. The engine reads these parameters:
- `nt`, `nt2`: 1NT and 2NT ranges.
- `strong2C`: the strong 2♣ threshold.
- `majorLen`: 4- or 5-card majors.
- `minorStyle`.
- `weakSuits`: which weak twos are played.
- `twoOverOne`, `forcingNT`.
- `resp1NT`.
- `rebidNT1`, `rebidNT2`: opener's no-trump rebid ranges.
- `precision`, `sef`.

The same parameters drive both how a call is **interpreted** (the partner model, auction explanations and tips) and how it is **chosen**. Each partnership has its own system.

Convention toggles: Stayman, Jacoby transfers, Jacoby 2NT, RKCB 1430 (off means simple Blackwood), weak twos, negative doubles, Michaels, Unusual 2NT, splinters.

| System | Status | Summary | Public descriptions consulted |
|---|---|---|---|
| **SAYC** (default) | Shipped | 5-card majors, 1NT 15–17, 2♣ 22+, weak 2♦/2♥/2♠, 2NT 20–21, Jacoby 2NT, Stayman, transfers, negative doubles, Michaels, Unusual 2NT | ACBL SAYC booklet (public), [BridgeBum SAYC](https://www.bridgebum.com/sayc.php), bridgeplaybook cheat sheet |
| **2/1 Game Forcing** | Shipped | SAYC openings. Over 1♥/1♠, an unpassed hand's 2-level new suit is game forcing (13+) and the engine won't stop below game. 1NT response is forcing, 6–12. Splinters and RKCB on | [Wikipedia: 2/1 game forcing](https://en.wikipedia.org/wiki/2/1_game_forcing), BridgeBum |
| **Acol** | Shipped | 4-card majors (longest first; two 4-card suits: the lower), weak 1NT 12–14, 2♣ 23+, 2NT 20–22, weak twos. Balanced 15–16 rebids 1NT, 17–18 2NT, 19 3NT. Raises need 4-card support. 1NT response 6–9. Responder's game and invite thresholds adjust to the weak NT (2NT invite with 11) | [Wikipedia: Acol](https://en.wikipedia.org/wiki/Acol), Learn to Play Bridge Online (Acol vs SA) |
| **Precision Club** | Shipped (core) | 1♣ 16+ artificial. 1♦ 11–15, 2+ cards. 1M 5+. 1NT 13–15 (no 5-card major). 2♣ 6+ clubs. 2♦ short diamonds with both majors. 2NT 22–23. Over 1♣: 1♦ negative 0–7; positive suit bids 8+ with 5 cards are game forcing; 1NT 8–13; 2NT 14+. Opener's rebids after 1♣–1♦ are natural (1NT 16–18, 2NT 19–21) | [Wikipedia: Precision Club](https://en.wikipedia.org/wiki/Precision_Club) |
| **Standard French (SEF)** | **Beta** | 5-card majors, 1NT 15–17, 2♣ strong (20+ unbalanced), 2♦ game forcing 24+ with a 2♥ relay, weak 2♥/2♠ only. Later rounds follow the Standard American model, so it is marked beta | [Wikipedia: Standard French](https://en.wikipedia.org/wiki/Standard_French) |
| **Beginner Standard American** | Shipped | 5-card majors, 1NT 15–17, strong 2♣, 3-level pre-empts. Only Stayman, Blackwood and takeout doubles; no weak twos, transfers, Jacoby 2NT, negative doubles or Michaels | Sundstrom (Princeton), bridgeplaybook beginner pages |
| Polish Club | Not shipped | Not enough time to implement and test its multi-way 1♣ properly | — |
| Lebensohl, Gerber, fourth suit forcing, new minor forcing, suit-preference signals | Not shipped | — | — |

**Precision limitation:** after a positive response to 1♣, later rounds use the generic placement engine, which knows the auction is game forcing. They don't use Precision-specific relays.

**SEF limitation:** after the opening and the first relay, everything works like SAYC.

## 7. Learning mode (tips)

All tip text is generated from the engine's own annotations, in original wording.
- **Suggested bid:** at your turn, the engine computes what it would bid from your seat in your system. It explains the bid using the same interpreter that explains every call, plus a summary of your hand (HCP, shape, long suits). The hint is hidden behind "Show hint" so you can test yourself. Your choice is remembered.
- **Feedback:** if your call differs from the suggestion, you see what your system would have bid and what your call actually tells partner.
- **Tap any call** in the auction to see its meaning in the bidder's system.
- **Play tips:**
  - Opening-lead suggestions with the reason: top of sequence, fourth best, partner's suit, and so on.
  - For declarer, a plan: tricks needed, sure winners per suit, losers in the long-trump hand, and what to do next.
  - For defenders, the meaning of partner's last card: lead, attitude, count, or discard.
  - The suggested card can be revealed and is highlighted in the hand.
- **System card:** a per-system quick reference, available from the menu or by tapping the system chip in the header.
