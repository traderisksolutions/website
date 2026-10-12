from engine.search_targets import TargetRules, market_for, pick_targets

RULES = TargetRules(
    topic_terms=["insurance", "cover", "policy", "work injury", "liability", "wica", "group benefits"],
    pillar_terms=["business insurance singapore"],
    brand_terms=["corp cover", "corpcover"],
    blog_base_path="/articles",
)


def row(q, page, impressions, position):
    return {"query": q, "page": page, "impressions": impressions, "position": position}


ROWS = [
    row("business insurance singapore", "https://corpcover.com/", 15, 44.6),                          # pillar head term: skip
    row("quota carrying sales meaning", "https://corpcover.com/articles/quota-x", 7, 9.4),            # off-topic: skip
    row("corp cover singapore", "https://corpcover.com/", 30, 1.0),                                   # brand: skip
    row("work injury compensation insurance for contractors", "https://corpcover.com/articles/guide", 5, 16.0),
    row("public liability policy excess", "https://corpcover.com/articles/liability-101", 4, 8.5),
    row("work injury compensation insurance", "https://corpcover.com/articles/work-injury-compensation-insurance", 4, 8.3),
    row("group benefits cover for staff jakarta", "https://corpcover.com/articles", 3, 22.0),
    row("fire policy", "https://corpcover.com/articles/x", 1, 12.0),                                  # too few impressions
    row("wica insurance", "https://corpcover.com/articles/y", 9, 4.0),                                # already page one
    row("marine cargo insurance claim", "https://corpcover.com/articles/z", 6, 70.0),                 # too far
    row("insurance", "https://corpcover.com/", 2, 47.5),                                              # short and far
]


def test_filters_and_ranking():
    write, refresh = pick_targets(ROWS, set(), 10, RULES)
    qs = [t.query for t in write]
    assert qs == ["work injury compensation insurance for contractors", "public liability policy excess", "group benefits cover for staff jakarta"]
    # an article already dedicated to the search is a refresh, not a new article
    assert [t.query for t in refresh] == ["work injury compensation insurance"]


def test_skips_recent_targets_and_limits():
    write, _ = pick_targets(ROWS, {"work injury compensation insurance for contractors"}, 1, RULES)
    assert [t.query for t in write] == ["public liability policy excess"]


def test_no_topic_terms_means_no_topic_filter():
    write, _ = pick_targets(ROWS, set(), 10, TargetRules(brand_terms=["corp cover"], blog_base_path="/articles"))
    assert "quota carrying sales meaning" in [t.query for t in write]


def test_market():
    assert market_for("group benefits cover for staff jakarta") == "ID"
    assert market_for("work injury insurance singapore") == "SG"
