"""
SchedAI - llm_client.py
One function that talks to Gemini (default) or OpenAI.
Keys are read ONLY from environment variables (backend/.env):
    LLM_PROVIDER=gemini            # or: openai
    GEMINI_API_KEY=...             # model override: GEMINI_MODEL (default gemini-2.5-flash)
    OPENAI_API_KEY=...             # model override: OPENAI_MODEL (default gpt-4o-mini)
"""

import os


def generate(system: str, history: list, message: str) -> str:
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()

    if provider == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        msgs = [{"role": "system", "content": system}]
        msgs += [{"role": h["role"], "content": h["content"]} for h in history]
        msgs.append({"role": "user", "content": message})
        r = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=msgs, temperature=0.2, max_tokens=600)
        return r.choices[0].message.content.strip()

    from google import genai
    from google.genai import types
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    contents = [
        types.Content(role="model" if h["role"] == "assistant" else "user",
                      parts=[types.Part(text=h["content"])])
        for h in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    r = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=system, temperature=0.2, max_output_tokens=600))
    return (r.text or "").strip()