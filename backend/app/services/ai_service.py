"""AI service — calls OpenRouter LLM with live exchange context."""

import logging
from decimal import Decimal

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI | None:
    global _client
    if _client is not None:
        return _client
    if not settings.OPENROUTER_API_KEY:
        return None
    _client = AsyncOpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url=settings.OPENROUTER_BASE_URL,
    )
    return _client


SYSTEM_PROMPT = (
    "You are TradeOff AI, the built-in trading assistant for the TradeOff crypto "
    "exchange simulator. You help users understand their portfolio, interpret market "
    "data, explain order types, and discuss risk management.\n\n"
    "Rules:\n"
    "- Be concise (2-4 paragraphs max).\n"
    "- Use numbers and data when available.\n"
    "- Never give specific buy/sell recommendations or financial advice.\n"
    "- Remind users this is a simulator when relevant.\n"
    "- Format with markdown for readability.\n"
)


def _format_decimal(v) -> str:
    if isinstance(v, Decimal):
        return f"{v:,.8f}".rstrip("0").rstrip(".")
    return str(v)


def _build_market_context(tickers: list[dict]) -> str:
    if not tickers:
        return ""
    lines = ["## Live Market Data"]
    for t in tickers[:10]:
        lines.append(
            f"- **{t['symbol']}**: ${_format_decimal(t.get('price', 0))} "
            f"(24h: {t.get('change_pct', '?')}%, vol: ${_format_decimal(t.get('volume', 0))})"
        )
    return "\n".join(lines)


def _build_portfolio_context(holdings: list[dict]) -> str:
    if not holdings:
        return ""
    lines = ["## User Portfolio"]
    total = sum(float(h.get("value_usdt", 0)) for h in holdings)
    for h in holdings:
        val = float(h.get("value_usdt", 0))
        pct = (val / total * 100) if total > 0 else 0
        lines.append(
            f"- **{h['asset']}**: {_format_decimal(h.get('available', 0))} "
            f"(≈${val:,.2f}, {pct:.1f}%)"
        )
    lines.append(f"- **Total**: ${total:,.2f}")
    return "\n".join(lines)


async def chat(
    message: str,
    tickers: list[dict] | None = None,
    holdings: list[dict] | None = None,
) -> str:
    client = _get_client()
    if client is None:
        return _fallback_chat(message)

    context_parts = []
    if tickers:
        context_parts.append(_build_market_context(tickers))
    if holdings:
        context_parts.append(_build_portfolio_context(holdings))
    context = "\n\n".join(context_parts)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context:
        messages.append({"role": "system", "content": f"Current exchange data:\n\n{context}"})
    messages.append({"role": "user", "content": message})

    try:
        resp = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=messages,
            max_tokens=settings.AI_MAX_TOKENS,
            temperature=0.7,
        )
        return resp.choices[0].message.content or "I couldn't generate a response."
    except Exception:
        logger.exception("OpenRouter chat call failed")
        return _fallback_chat(message)


async def portfolio_analysis(
    holdings: list[dict],
    tickers: list[dict] | None = None,
) -> dict:
    client = _get_client()
    if client is None:
        return _fallback_portfolio()

    context = _build_portfolio_context(holdings)
    if tickers:
        context += "\n\n" + _build_market_context(tickers)

    prompt = (
        "Analyze this portfolio. Return a JSON object with exactly these keys:\n"
        '- "summary": 1-2 sentence overview\n'
        '- "recommendations": array of 3-4 actionable bullet points\n'
        '- "risk_score": one of HIGH, MODERATE, LOW\n'
        '- "market_outlook": one of BULLISH, NEUTRAL, BEARISH\n'
        "Respond with ONLY the JSON, no markdown fences."
    )

    try:
        resp = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": f"Current exchange data:\n\n{context}"},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0.4,
        )
        import json
        text = resp.choices[0].message.content or ""
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)
    except Exception:
        logger.exception("OpenRouter portfolio analysis failed")
        return _fallback_portfolio()


async def market_summary(
    pair: str,
    ticker: dict | None = None,
    recent_trades: list[dict] | None = None,
) -> dict:
    client = _get_client()
    if client is None:
        return _fallback_market(pair)

    context_parts = [f"Pair: {pair}"]
    if ticker:
        context_parts.append(
            f"Price: ${_format_decimal(ticker.get('price', 0))}, "
            f"24h Change: {ticker.get('change_pct', '?')}%, "
            f"24h Volume: ${_format_decimal(ticker.get('volume', 0))}, "
            f"24h High: ${_format_decimal(ticker.get('high', 0))}, "
            f"24h Low: ${_format_decimal(ticker.get('low', 0))}"
        )
    if recent_trades:
        buys = sum(1 for t in recent_trades if t.get("side") == "BUY")
        sells = len(recent_trades) - buys
        context_parts.append(f"Recent trades: {buys} buys, {sells} sells out of {len(recent_trades)}")

    prompt = (
        f"Give a market summary for {pair}. Return a JSON object with exactly these keys:\n"
        '- "summary": 2-3 sentence analysis\n'
        '- "sentiment": one of BULLISH, NEUTRAL, BEARISH\n'
        '- "technical_indicators": object with keys rsi, macd, support, resistance (string values)\n'
        "Respond with ONLY the JSON, no markdown fences."
    )

    try:
        resp = await client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": "\n".join(context_parts)},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0.4,
        )
        import json
        text = resp.choices[0].message.content or ""
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        result = json.loads(text)
        result["pair"] = pair
        return result
    except Exception:
        logger.exception("OpenRouter market summary failed")
        return _fallback_market(pair)


def _fallback_chat(message: str) -> str:
    lower = message.lower()
    if "portfolio" in lower:
        return (
            "To analyze your portfolio, check the Portfolio dashboard for real-time P&L, "
            "allocation, and performance. I can provide deeper analysis when the AI backend "
            "is connected."
        )
    if any(w in lower for w in ("market", "btc", "bitcoin", "price")):
        return (
            "For live market data, check the Markets page. Key things to watch: volume trends, "
            "support/resistance levels, and the order book depth for your trading pair."
        )
    if "risk" in lower:
        return (
            "Risk management essentials: (1) Never risk more than 1-2% per trade. "
            "(2) Always use stop-losses. (3) Diversify across assets. "
            "(4) Keep reserve capital in stablecoins."
        )
    return (
        "I'm your AI Trading Assistant. I can help with portfolio analysis, market summaries, "
        "trade explanations, and risk management. Ask me anything about your trading!"
    )


def _fallback_portfolio() -> dict:
    return {
        "summary": "Portfolio analysis unavailable — AI service offline.",
        "recommendations": [
            "Maintain diversification across assets",
            "Set stop-losses on volatile positions",
            "Keep reserve capital for opportunities",
        ],
        "risk_score": "MODERATE",
        "market_outlook": "NEUTRAL",
    }


def _fallback_market(pair: str) -> dict:
    return {
        "pair": pair,
        "summary": f"Market summary for {pair} unavailable — AI service offline.",
        "sentiment": "NEUTRAL",
        "technical_indicators": {
            "rsi": "—",
            "macd": "—",
            "support": "—",
            "resistance": "—",
        },
    }
