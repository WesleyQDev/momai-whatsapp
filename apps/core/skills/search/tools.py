import asyncio
from ddgs import DDGS
from langchain_core.tools import tool


def _sync_web_search(query: str, max_results: int = 3):
    """Sync wrapper for DDGS text search."""
    return DDGS(timeout=3).text(query, max_results=max_results)


def _sync_news_search(query: str, max_results: int = 3):
    """Sync wrapper for DDGS news search."""
    return DDGS(timeout=3).news(query, max_results=max_results)


@tool
async def web_search(query: str) -> str:
    """
    Search the internet for real-time information.

    Args:
        query: The search query string.

    Returns:
        A string with search results or a dict with result + extras.
    """
    try:
        results = await asyncio.to_thread(_sync_web_search, query)

        if not results:
            return {"result": "No results found.", "extras": None}

        formatted_results = []
        sources = []

        for item in results:
            title = item.get("title", "")
            link = item.get("href", "")
            snippet = item.get("body", "")

            formatted_results.append(f"- {title}: {snippet[:150]}...")
            sources.append({"url": link, "title": title, "snippet": snippet[:200]})

        result_text = "\n".join(formatted_results)

        return {"result": result_text, "extras": {"sources": sources}}
    except Exception as e:
        return {"result": f"Search error: {str(e)}", "extras": None}


@tool
async def news_search(query: str) -> str:
    """
    Search for recent news and current events.

    Args:
        query: The news search query.

    Returns:
        A string with news results or a dict with result + extras.
    """
    try:
        results = await asyncio.to_thread(_sync_news_search, query)

        if not results:
            return {"result": "No news found.", "extras": None}

        formatted_results = []
        sources = []

        for item in results:
            title = item.get("title", "")
            link = item.get("url", "")
            snippet = item.get("body", "")
            date = item.get("date", "")

            formatted_results.append(f"- {title} ({date}): {snippet[:150]}...")
            sources.append(
                {"url": link, "title": title, "snippet": f"{date} - {snippet[:180]}"}
            )

        result_text = "\n".join(formatted_results)

        return {
            "result": result_text,
            "extras": {
                "sources": sources,
                "snippets": [
                    {
                        "title": "Notícias Recentes",
                        "content": f"Encontradas {len(results)} notícias sobre '{query}'",
                        "icon": "📰",
                    }
                ],
            },
        }
    except Exception as e:
        return {"result": f"News search error: {str(e)}", "extras": None}

