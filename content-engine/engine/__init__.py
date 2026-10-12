"""TRS content engine: a staged multi-agent article generator for every
website the business owns (corpcover.com, benefixe.com, newsouthsea.com,
traderisksolutions.com.sg).

Each stage is one file under engine/agents; engine/pipeline.py runs them in
order, persists every stage's output, and can resume a run from the last
completed stage. No orchestration framework: the graph is a list.
"""
__version__ = "0.2.0"
