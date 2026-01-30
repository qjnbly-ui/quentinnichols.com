import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

load_dotenv()

# Config
MODEL = "llama-3.3-70b-versatile"  # or "llama-3.1-8b-instant"
DATA_DIR = Path("AI/site_text_data")
MAX_CONTEXT_TOKENS = 100_000  # safety cap (model supports larger)

API_KEY = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
if not API_KEY:
    raise RuntimeError("Missing API key. Set GROQ_API_KEY (or OPENAI_API_KEY) in your environment.")

client = Groq(api_key=API_KEY)


def load_site_context() -> str:
    context_chunks = []
    for file_path in sorted(DATA_DIR.glob("*.md")):
        content = file_path.read_text(encoding="utf-8")
        context_chunks.append(f"\n\n---\n\nFile: {file_path.name}\n{content}")

    context = "".join(context_chunks).strip()
    words = context.split()
    if len(words) > MAX_CONTEXT_TOKENS // 1.3:
        context = " ".join(words[: MAX_CONTEXT_TOKENS // 1.3]) + "\n\n[Context truncated for length]"
    return context


def build_system_prompt(site_context: str) -> str:
    return f"""You are an expert on Quentin Nichols' life, thoughts, photography, projects, and writings from his website quentinnichols.com.

Full site content (blog posts, about, photography, etc.):
{site_context}

Your role: Think deeply, connect ideas across posts, recall details accurately, and provide insightful, personal-feeling responses as if you know Quentin better than he remembers himself sometimes. Be reflective, honest, and encouraging. Use first-person insights only when quoting or paraphrasing his writing.

Answer questions based ONLY on this content unless asked otherwise. If something isn't covered, say so clearly."""


def main() -> None:
    site_context = load_site_context()
    system_prompt = build_system_prompt(site_context)

    print("AI ready! Your site context is loaded. Type 'exit' to quit.\n")
    messages = [{"role": "system", "content": system_prompt}]

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() in {"exit", "quit", "q"}:
            break

        messages.append({"role": "user", "content": user_input})
        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=2048,
                stream=False,
            )
        except Exception as exc:
            print(f"Error: {exc}")
            continue

        ai_reply = response.choices[0].message.content
        print("\nAI:", ai_reply, "\n")
        messages.append({"role": "assistant", "content": ai_reply})


if __name__ == "__main__":
    main()
