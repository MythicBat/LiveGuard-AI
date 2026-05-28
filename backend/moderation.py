import re


TOXIC_KEYWORDS = {
    "idiot": 25,
    "stupid": 25,
    "loser": 30,
    "trash": 20,
    "hate": 35,
    "shut up": 25,
}

THREAT_KEYWORDS = {
    "kill": 60,
    "die": 50,
    "hurt you": 55,
    "attack": 45,
}

SCAM_KEYWORDS = {
    "free money": 40,
    "click this": 30,
    "giveaway": 20,
    "crypto": 25,
    "investment": 20,
    "send money": 45,
    "scam": 35,
}

SPAM_PATTERNS = [
    r"(.)\1{5,}",          # repeated letters e.g. loooool
    r"https?://",          # links
    r"www\.",              # links
    r"[A-Z]{10,}",         # long uppercase text
]


def detect_keywords(text, keyword_map, category):
    score = 0
    flags = []

    lower_text = text.lower()

    for word, weight in keyword_map.items():
        if word in lower_text:
            score += weight
            flags.append(category + ":" + word)

    return score, flags


def detect_spam_patterns(text):
    score = 0
    flags = []

    for pattern in SPAM_PATTERNS:
        if re.search(pattern, text):
            score += 15
            flags.append("spam_pattern")

    if len(text) > 180:
        score += 10
        flags.append("long_message")

    if text.isupper() and len(text) > 10:
        score += 15
        flags.append("shouting")

    return score, flags


def classify_category(flags):
    if any(flag.startswith("threat") for flag in flags):
        return "Threat"
    if any(flag.startswith("scam") for flag in flags):
        return "Scam / Spam"
    if any(flag.startswith("toxic") for flag in flags):
        return "Harassment"
    if "spam_pattern" in flags or "shouting" in flags:
        return "Spam"
    return "Safe"


def analyse_message(text: str):
    total_score = 0
    all_flags = []

    toxic_score, toxic_flags = detect_keywords(
        text, TOXIC_KEYWORDS, "toxic"
    )

    threat_score, threat_flags = detect_keywords(
        text, THREAT_KEYWORDS, "threat"
    )

    scam_score, scam_flags = detect_keywords(
        text, SCAM_KEYWORDS, "scam"
    )

    spam_score, spam_flags = detect_spam_patterns(text)

    total_score += toxic_score + threat_score + scam_score + spam_score
    all_flags.extend(toxic_flags + threat_flags + scam_flags + spam_flags)

    risk_score = min(total_score, 100)

    if risk_score >= 70:
        severity = "high"
    elif risk_score >= 35:
        severity = "medium"
    elif risk_score > 0:
        severity = "low"
    else:
        severity = "safe"

    category = classify_category(all_flags)

    return {
        "risk_score": risk_score,
        "severity": severity,
        "category": category,
        "flags": all_flags,
        "is_flagged": risk_score >= 35,
    }