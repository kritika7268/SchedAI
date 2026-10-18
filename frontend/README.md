# SchedAI - Student AI Assistant (setup)

## 1. Install (backend)
    pip install google-genai tzdata
    (OpenAI instead of Gemini?  pip install openai)

## 2. backend/.env   (never commit this file, never put keys in frontend)
    LLM_PROVIDER=gemini
    GEMINI_API_KEY=your_key_here

## 3. Copy files
    backend/app/student_assistant_data.py
    backend/app/llm_client.py
    backend/app/ai_assistant.py
    frontend/src/components/StudentChatbot.jsx   (same folder as RoleLayout.jsx)

## 4. main.py  (add near the other include_router lines)
    from app.ai_assistant import router as ai_assistant_router
    app.include_router(ai_assistant_router)

## 5. RoleLayout.jsx
    import StudentChatbot from "./StudentChatbot";
    ...
    inside <div className="role-shell"> after </main>:
    {role === "student" && <StudentChatbot />}