"""
Checks WHY the AI assistant is not answering.  Works from backend\\ or backend\\app\\ :

    cd D:\\University-scheduler\\backend
    python test_llm.py            <- test the AI
    python test_llm.py --models   <- list the models your key can use
    python test_llm.py --find     <- test them and pick the FASTEST one for you
"""
import os
import re
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent if HERE.name.lower() == "app" else HERE      # the folder that holds .env
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "app"))
WAIT_SECONDS = int(os.getenv("TEST_LLM_WAIT", "75"))


def load_env(path):
    """Tiny .env reader (no extra package needed)."""
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


env_path = BACKEND / ".env"
print("Python   :", sys.executable)
print(".env file:", env_path, "->", "found" if env_path.is_file() else "NOT FOUND")
if env_path.is_file():
    load_env(env_path)
elif (BACKEND / ".env.txt").is_file():
    print("  !! I found '.env.txt'. Windows added .txt - rename it to exactly  .env")

provider = os.getenv("LLM_PROVIDER", "gemini").lower()
key_name = "OPENAI_API_KEY" if provider == "openai" else "GEMINI_API_KEY"
key = os.getenv(key_name, "")
print("Provider :", provider)
print(f"{key_name:<15}:", f"set ({len(key)} characters)" if key else "MISSING  <-- add this line to backend\\.env")
print("Model    :", os.getenv("OPENAI_MODEL" if provider == "openai" else "GEMINI_MODEL") or "(default list)")
if provider == "gemini" and key and len(key) != 39:
    print(f"Note     : Gemini keys are usually 39 characters (start with AIza); yours has {len(key)}.")
    print("           If the test says 'API key not valid', copy the key again - only the key, no extra text.")

if "--models" in sys.argv:
    print("\nModels your key can use:\n")
    try:
        from google import genai
        for m in genai.Client(api_key=key).models.list():
            acts = getattr(m, "supported_actions", None) or []
            if not acts or "generateContent" in acts:
                print("  ", str(m.name).replace("models/", ""))
        print("\nPut one of the 'flash' names in backend\\.env as  GEMINI_MODEL=<name>")
    except Exception as e:
        print("Could not list models:", e)
    sys.exit(0)

if "--find" in sys.argv:
    import requests
    BASE = "https://generativelanguage.googleapis.com/v1beta"
    HDR = {"x-goog-api-key": key}
    BAD = ("image", "tts", "live", "audio", "embed", "imagen", "veo", "robotics", "computer-use", "vision-only")
    print("\nLooking for the fastest model for your key (each test can take up to 40 seconds) ...\n", flush=True)
    try:
        r = requests.get(f"{BASE}/models", headers=HDR, params={"pageSize": 200}, timeout=30)
    except Exception as e:
        print("Could not reach Google:", e)
        sys.exit(1)
    if r.status_code != 200:
        print("Could not list models. HTTP", r.status_code, r.text[:200])
        sys.exit(1)
    names = []
    for m in r.json().get("models", []):
        n = m["name"].replace("models/", "")
        if "generateContent" in m.get("supportedGenerationMethods", []) and "flash" in n.lower() \
                and not any(b in n.lower() for b in BAD):
            names.append(n)
    names.sort(key=lambda n: ("preview" in n or "exp" in n, n))
    names = names[:8]
    if not names:
        print("No 'flash' models found for this key.")
        sys.exit(1)
    body = {"contents": [{"role": "user", "parts": [{"text": "Reply with exactly: AI OK"}]}],
            "generationConfig": {"maxOutputTokens": 200, "temperature": 0}}
    good = []
    for n in names:
        t0 = time.time()
        try:
            resp = requests.post(f"{BASE}/models/{n}:generateContent", headers=HDR, json=body, timeout=40)
            dt = time.time() - t0
            if resp.status_code == 200:
                print(f"  OK    {dt:5.1f}s  {n}", flush=True)
                good.append((dt, n))
            else:
                err = resp.json().get("error", {}).get("message", resp.text)[:80]
                print(f"  FAIL  {resp.status_code}    {n}  - {err}", flush=True)
        except Exception as e:
            print(f"  FAIL  {time.time() - t0:5.1f}s  {n}  - {type(e).__name__}", flush=True)
    print()
    if good:
        best = min(good)[1]
        print("Fastest working model:", best)
        print("Add this line to backend\\.env, save, and restart the backend:")
        print(f"     GEMINI_MODEL={best}")
    else:
        print("No model answered. The problem is the network or your Google account, not the code.")
        print("Try another network (phone hotspot) or create a new key in Google AI Studio.")
    sys.exit(0)

print(f"\nCalling the AI (I will wait up to {WAIT_SECONDS} seconds and then tell you what happened) ...\n", flush=True)

result = {}


def worker():
    try:
        import llm_client
        result["out"] = llm_client.generate("You are a connection test.", [], "Reply with exactly: AI OK")
    except Exception as e:                      # noqa: BLE001
        result["err"] = e


started = time.time()
th = threading.Thread(target=worker, daemon=True)
th.start()
th.join(WAIT_SECONDS)

if th.is_alive():
    print(f"NO ANSWER after {WAIT_SECONDS} seconds.\n")
    print("This means Python reaches Google very slowly or not at all. Try, in this order:")
    print("  1. Turn OFF any VPN / proxy, and pause antivirus web-shield for a minute.")
    print("  2. Switch network (for example your phone's hotspot) and run this test again.")
    print("  3. Run  python test_llm.py --models  and put a different 'flash' model in backend\\.env")
    print("     as  GEMINI_MODEL=<name>  (the current one may be very slow).")
    sys.stdout.flush()
    os._exit(1)

if "out" in result:
    print(f"AI replied: {result['out']}   (took {time.time() - started:.1f} seconds)")
    print("\nWORKING. Now restart the backend; the chat will use the AI.")
    sys.exit(0)

msg = str(result.get("err"))
low = msg.lower()
print("FAILED:", msg, "\n")
if "missing" in low and "key" in low:
    print("FIX: add the key to backend\\.env (no quotes, no spaces) and run this test again:")
    print("     GEMINI_API_KEY=your_key_here")
elif "no module named 'google'" in low or "no module named 'openai'" in low:
    print("FIX: run this in the SAME terminal:  pip install google-genai   (or: pip install openai)")
elif "api key not valid" in low or "api_key_invalid" in low or "permission_denied" in low or "incorrect api key" in low:
    print("FIX: the key is wrong or disabled. Create a new key in Google AI Studio and paste it again.")
elif "429" in low or "quota" in low or "resource_exhausted" in low:
    print("FIX: free quota is used up. Wait a few minutes, or use another key.")
elif "404" in low or "not found" in low or "no longer available" in low:
    hint = re.search(r"use models/([A-Za-z0-9._\-]+)", msg)
    if hint:
        print("FIX: Google retired that model and recommends a new one. Add this line to backend\\.env:")
        print(f"     GEMINI_MODEL={hint.group(1)}")
    else:
        print("FIX: that model is not available to your key. Run:  python test_llm.py --models")
        print("     then add one of the 'flash' names to backend\\.env as  GEMINI_MODEL=<name>")
elif "504" in low or "deadline_exceeded" in low:
    print("FIX: Google DID answer, but that model took too long (so the network is fine). Run:")
    print("         python test_llm.py --find")
    print("     It tests the available models and tells you which one is fast. Put it in backend\\.env")
    print("     as  GEMINI_MODEL=<name>  and restart the backend.")
elif any(w in low for w in ("timed out", "timeout", "taking too long", "connecterror",
                            "getaddrinfo", "name resolution", "ssl", "proxy", "connection")):
    print("FIX: Python cannot reach Google, or the model is too slow. Turn OFF any VPN, check the internet /")
    print("     firewall / antivirus, or try another network (your phone's hotspot). If it still fails, run")
    print("     python test_llm.py --models  and try a different 'flash' model in GEMINI_MODEL.")
elif "empty reply" in low:
    print("FIX: the model returned nothing. Run  python test_llm.py --models  and try another 'flash' model.")
else:
    print("FIX: copy this whole output and send it to me (hide your key).")