from transformers import pipeline

toxicity_classifier = pipeline(
    "text-classification",
    model="unitary/toxic-bert",
    top_k=None
)


def analyse_with_ai(text: str):
    try:
        results = toxicity_classifier(text)[0]

        scores = {
            item["label"].lower(): item["score"]
            for item in results
        }

        toxic_score = scores.get("toxic", 0)
        severe_toxic_score = scores.get("severe_toxic", 0)
        threat_score = scores.get("threat", 0)
        insult_score = scores.get("insult", 0)
        obscene_score = scores.get("obscene", 0)
        identity_hate_score = scores.get("identity_hate", 0)

        max_score = max(
            toxic_score,
            severe_toxic_score,
            threat_score,
            insult_score,
            obscene_score,
            identity_hate_score,
        )

        risk_score = round(max_score * 100)

        if threat_score >= 0.45:
            category = "Threat"
        elif insult_score >= 0.45 or toxic_score >= 0.55:
            category = "Harassment"
        elif obscene_score >= 0.45:
            category = "Harassment"
        elif identity_hate_score >= 0.45:
            category = "Hate / Identity Attack"
        else:
            category = "Safe"

        if risk_score >= 70:
            severity = "high"
        elif risk_score >= 40:
            severity = "medium"
        elif risk_score >= 20:
            severity = "low"
        else:
            severity = "safe"

        flags = [
            label
            for label, score in scores.items()
            if score >= 0.35
        ]

        if category == "Threat":
            recommended_action = "ban" if risk_score >= 70 else "mute"
            policy_reason = "Potential threat or violent language."
            explanation = "The AI model detected language that may imply harm, intimidation, or threat."
        elif category == "Harassment":
            recommended_action = "warn" if risk_score < 65 else "mute"
            policy_reason = "Harassment, insult, or abusive language."
            explanation = "The AI model detected language that may target or insult another person."
        elif category == "Hate / Identity Attack":
            recommended_action = "ban"
            policy_reason = "Potential identity-based abuse."
            explanation = "The AI model detected possible identity-based hateful or abusive language."
        else:
            recommended_action = "none"
            policy_reason = "Message appears safe."
            explanation = "The AI model did not detect a clear safety violation."

        return {
            "risk_score": risk_score,
            "severity": severity,
            "category": category,
            "flags": flags,
            "is_flagged": risk_score >= 40,
            "ai_explanation": explanation,
            "recommended_action": recommended_action,
            "confidence": risk_score if risk_score > 0 else 95,
            "policy_reason": policy_reason,
            "ai_model": "unitary/toxic-bert",
        }

    except Exception as error:
        print("AI moderation failed:", error)
        return None