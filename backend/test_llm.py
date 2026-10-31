"""
Checks WHY the AI assistant is not answering.  Works from backend\\ or backend\\app\\ :

    cd D:\\University-scheduler\\backend
    python test_llm.py
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent if HERE.name.lower() == "app" else HERE      # the folder that holds .env
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "app"))


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
print("\nCalling the AI (wait up to ~30 seconds) ...\n")

try:
    import llm_client
    out = llm_client.generate("You are a connection test.", [], "Reply with exactly: AI OK")
    print("AI replied:", out)
    print("\nWORKING. Now restart the backend; the chat will use the AI.")
except Exception as e:
    msg = str(e)
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
    elif "404" in low or "not found" in low:
        print("FIX: that model is not available to your key. Add to backend\\.env:  GEMINI_MODEL=gemini-2.0-flash")
    elif any(w in low for w in ("timed out", "timeout", "taking too long", "connecterror", "getaddrinfo",
                                "name resolution", "ssl", "proxy", "connection")):
        print("FIX: Python cannot reach Google. Turn OFF any VPN, check the internet / firewall / antivirus,")
        print("     or try another network (for example your phone's hotspot), then run this test again.")
    elif "empty reply" in low:
        print("FIX: the model returned nothing. Add to backend\\.env:  GEMINI_MODEL=gemini-2.0-flash")
    else:
        print("FIX: check your internet connection / firewall / VPN, then run this test again.")