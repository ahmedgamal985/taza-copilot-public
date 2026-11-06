# Run Taza Copilot locally with Ollama

**Zero cost per question.** With Ollama the AI model runs on your own computer or on AAI's own
server. There are no API bills, no keys, and no question ever leaves the machine (the page itself still loads map tiles from OpenStreetMap).
The only thing it needs is a computer strong enough for the model you pick.

The search over AAI's research and the exact quotes work exactly the same as with the cloud
providers: Taza finds the passages, the local model writes the answer, and every quote shown on
screen is the original sentence from the report.

## 1. Check your computer

| Model size | Computer it needs (roughly) | What to expect |
|---|---|---|
| 3–4B | 8 GB RAM, no graphics card needed | Fast but basic. Fine for testing. |
| 7–9B | 16 GB RAM, or a graphics card with 8 GB | Good answers in English and Russian. |
| 12–14B | Graphics card with 12–16 GB | Better reasoning and better Kazakh. |
| 27–32B | Graphics card with 24 GB, or a Mac with 32 GB+ | Close to cloud quality. |

These are rough figures for the usual 4-bit models. Without a graphics card everything still
works, just slower: a laptop can take a minute or more per answer with a 7–9B model.

## 2. Install Ollama

- **Windows / macOS:** download the installer from https://ollama.com/download and run it.
  Ollama then runs in the background (you will see its icon in the tray / menu bar).
- **Linux:**
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

Check it works:
```bash
ollama --version
```

## 3. Download a model

Pick a model that handles several languages well. Browse https://ollama.com/library for the
current list. For example:

```bash
ollama pull qwen3:8b
```

or, on a stronger machine:

```bash
ollama pull gemma3:12b
```

Model names and versions change over time, so check the library page for the newest ones.
List what you have installed with:

```bash
ollama list
```

Try it once from the terminal:

```bash
ollama run qwen3:8b "Say hello in Russian and Kazakh"
```

## 4. Connect Taza Copilot

In the `.env` file, set:

```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

Restart the platform (`npm start`), open the menu, choose **AI model**, select
**Ollama (local, free)** and press **Use this model**. Answers now show "free (local)".

## 5. Ollama on another machine (for example AAI's GPU server)

On the server, let Ollama accept connections from your network by setting the environment
variable `OLLAMA_HOST=0.0.0.0` before starting it, then point Taza at it:

```
OLLAMA_URL=http://<server-ip>:11434
```

Keep that port on a private network or behind a firewall: Ollama has no password of its own.

## Troubleshooting

- **"Ollama is not running on this server"**: start the Ollama app, or run `ollama serve`.
- **"No models installed yet"**: run `ollama pull <model>` (step 3).
- **Answers are slow**: use a smaller model, or a machine with a graphics card.
- **Weak answers in Kazakh**: small models struggle with Kazakh; use a 12B+ model, or a cloud provider for those questions.
