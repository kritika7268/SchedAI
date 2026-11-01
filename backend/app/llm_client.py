"""
SchedAI - llm_client.py
One function that talks to Gemini (default) or OpenAI.
Keys are read ONLY from environment variables (backend/.env):
    LLM_PROVIDER=gemini            # or: openai
    GEMINI_API_KEY=...             # optional model override: GEMINI_MODEL
    OPENAI_API_KEY=...             # optional model override: OPENAI_MODEL (default gpt-4o-mini)

If a Gemini model name is not available for your key, the next one in the list is tried.
"""

import os
import re
import time

# a blocked network must not make the chat wait forever
CALL_TIMEOUT_SECONDS = 20          # one request
DEADLINE_SECONDS = float(os.getenv("LLM_DEADLINE_SECONDS", "25"))   # all models together

# Google retires models from time to time. Newest first; the first one that works is remembered.
GEMINI_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"]
_WORKING_MODEL = None        # remembered after the first success, so later chats do not retry dead models


def _looks_like_auth_error(msg: str) -> bool:
    low = msg.lower()
    return any(k in low for k in ("api key not valid", "api_key_invalid", "permission_denied",
                                  "unauthenticated", "invalid api key", "incorrect api key"))


def _gemini(system, history, message):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is missing. Add it to backend/.env and restart the backend.")
    from google import genai
    from google.genai import types

    try:
        client = genai.Client(
            api_key=key, http_options=types.HttpOptions(timeout=CALL_TIMEOUT_SECONDS * 1000))
    except Exception:                                   # older / newer library without this option
        client = genai.Client(api_key=key)
    started = time.time()
    contents = [
        types.Content(role="model" if h["role"] == "assistant" else "user",
                      parts=[types.Part(text=h["content"])])
        for h in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))

    global _WORKING_MODEL
    first = os.getenv("GEMINI_MODEL")
    queue = [m for m in [_WORKING_MODEL, first] + GEMINI_MODELS if m]
    tried, errors = set(), []
    while queue:
        model = queue.pop(0)
        if model in tried:
            continue
        tried.add(model)
        if errors and time.time() - started > DEADLINE_SECONDS:
            errors.append("stopped: taking too long (is the internet / firewall / VPN blocking Google?)")
            break
        try:
            cfg = dict(system_instruction=system, temperature=0.2, max_output_tokens=3000)
            # 2.5 "flash" models spend output tokens on hidden thinking -> turn it off so replies are not empty
            if "2.5" in model and "pro" not in model:
                cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
            r = client.models.generate_content(
                model=model, contents=contents, config=types.GenerateContentConfig(**cfg))
            text = (r.text or "").strip()
            if text:
                _WORKING_MODEL = model
                return text
            errors.append(f"{model}: empty reply")
        except Exception as e:
            msg = str(e).replace(key, "***")
            errors.append(f"{model}: {msg[:300]}")
            if _looks_like_auth_error(msg):
                break                                  # another model will not fix a bad key
            # Google's error text names the replacement model: "... update your code to use models/XYZ"
            m = re.search(r"use models/([A-Za-z0-9._\-]+)", msg)
            if m and m.group(1) not in tried:
                queue.insert(0, m.group(1))
    raise RuntimeError(" | ".join(errors))


def _openai(system, history, message):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is missing. Add it to backend/.env and restart the backend.")
    from openai import OpenAI

    client = OpenAI(api_key=key, timeout=CALL_TIMEOUT_SECONDS)
    msgs = [{"role": "system", "content": system}]
    msgs += [{"role": h["role"], "content": h["content"]} for h in history]
    msgs.append({"role": "user", "content": message})
    r = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=msgs, temperature=0.2, max_tokens=800)
    text = (r.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("OpenAI returned an empty reply")
    return text


def generate(system: str, history: list, message: str) -> str:
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    return _openai(system, history, message) if provider == "openai" else _gemini(system, history, message)