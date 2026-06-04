import re
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from ai_moderator import analyse_with_ai

sentiment_analyzer = SentimentIntensityAnalyzer()

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
    r"(.)\1{5,}",
    r"https?://",
    r"www\.",
    r"[A-Z]{10,}",
]

def detect_negative_sentiment(text):
    sentiment = sentiment_analyzer.polarity_scores(text)
    compound = sentiment["compound"]

    if compound <= -0.7:
        return 35, ["negative_sentiment:high"]
    elif compound <= -0.4:
        return 20, ["negative_sentiment:medium"]
    elif compound <= -0.2:
        return 10, ["negative_sentiment:low"]

    return 0, []


def detect_keywords(text, keyword_map, category):
    score = 0
    flags = []
    lower_text = text.lower()

    for word, weight in keyword_map.items():
        if word in lower_text:
            score += weight
            flags.append(f"{category}:{word}")

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
    
    if any(flag.startswith("negative_sentiment") for flag in flags):
        return "Harassment"
    
    if "spam_pattern" in flags or "shouting" in flags:
        return "Spam"
    return "Safe"


def build_ai_assistant(category, risk_score, flags):
    if category == "Threat":
        return {
            "ai_explanation": "The message contains language that may imply physical harm or intimidation.",
            "recommended_action": "ban" if risk_score >= 70 else "mute",
            "confidence": min(95, risk_score + 20),
            "policy_reason": "Potential violent threat or harmful intent.",
        }

    if category == "Harassment":
        return {
            "ai_explanation": "The message appears to target another user with insulting or abusive language.",
            "recommended_action": "warn" if risk_score < 60 else "mute",
            "confidence": min(90, risk_score + 15),
            "policy_reason": "Harassment or personal attack.",
        }

    if category == "Scam / Spam":
        return {
            "ai_explanation": "The message contains promotional or suspicious wording commonly associated with scams or spam.",
            "recommended_action": "mute" if risk_score < 70 else "ban",
            "confidence": min(92, risk_score + 15),
            "policy_reason": "Spam, scam, or suspicious promotional content.",
        }

    if category == "Spam":
        return {
            "ai_explanation": "The message shows spam-like behaviour such as excessive capitalization, links, or repeated characters.",
            "recommended_action": "warn",
            "confidence": min(85, risk_score + 10),
            "policy_reason": "Low-quality or disruptive chat behaviour.",
        }

    return {
        "ai_explanation": "No clear safety violation was detected.",
        "recommended_action": "none",
        "confidence": 98,
        "policy_reason": "Message appears safe.",
    }


def rule_based_analyse_message(text: str):
    total_score = 0
    all_flags = []
    sentiment_score, sentiment_flags = detect_negative_sentiment(text)

    toxic_score, toxic_flags = detect_keywords(text, TOXIC_KEYWORDS, "toxic")
    threat_score, threat_flags = detect_keywords(text, THREAT_KEYWORDS, "threat")
    scam_score, scam_flags = detect_keywords(text, SCAM_KEYWORDS, "scam")
    spam_score, spam_flags = detect_spam_patterns(text)

    total_score += toxic_score + threat_score + scam_score + spam_score + sentiment_score
    all_flags.extend(toxic_flags + threat_flags + scam_flags + spam_flags + sentiment_flags)

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
    ai_result = build_ai_assistant(category, risk_score, all_flags)

    return {
        "risk_score": risk_score,
        "severity": severity,
        "category": category,
        "flags": all_flags,
        "is_flagged": risk_score >= 35,
        **ai_result,
    }

def analyse_message(text: str):
    ai_result = analyse_with_ai(text)

    if ai_result:
        return ai_result
    
    return rule_based_analyse_message(text)