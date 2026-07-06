# Dictate

Self-hosted meeting & lecture transcription with speaker-aware notes. Plaude-style clean UI, local-first via Docker sidecars, any OpenAI-compatible LLM.

- Upload MP3 / WAV / M4A (up to 2 GB / 12 h)
- Speaker-attributed transcript with timestamps
- Auto-generated summary, key points, action items, decisions, topic chapters, highlighted passages
- Inline speaker renaming (LLM-suggested or manual)
- Markdown export
- Local-first: `onerahmet/whisper-asr-webservice` sidecar does ASR + pyannote diarization
- Pluggable: any OpenAI-compatible LLM (OpenAI, MiniMax, Ollama, Groq, OpenRouter, Together, LocalAI, vLLM, LM Studio…) + Anthropic native
- Multi-user with email/password auth
- Multi-arch Docker images (amd64 / arm64) built on push, published to GHCR

---

## Quickstart

### Fully self-hosted (recommended)

```bash
git clone https://github.com/<your-org>/dictate
cd dictate
cp .env.example .env
# Edit .env: set BETTER_AUTH_SECRET (`openssl rand -hex 32`),
# and any cloud keys if you want fallback options.
docker compose -f docker/docker-compose.yml -f docker/docker-compose.local.yml up -d
open http://localhost:3000
```

### Cloud or remote sidecar

```bash
docker compose -f docker/docker-compose.yml up -d
# Edit .env:
#   - LOCAL_ASR_ENDPOINT=http://your-remote-host:9000   (remote onerahmet)
#   - or leave empty and set OPENAI_API_KEY / DEEPGRAM_API_KEY etc.
```

---

## Architecture

```
Browser → Next.js (:3000) → Hono API (:3001) → SQLite + Redis → BullMQ Worker
                                                          ↓
                            ASR provider    (local sidecar | OpenAI | Groq | Deepgram | AssemblyAI | openai-compat)
                            Diarization     (bundled or separate)
                            LLM provider    (openai-compat | OpenAI | Anthropic)
```

---

## Configuration

All admin defaults come from env vars in `.env`. Users can override provider + model per upload.

| Variable | Default | Purpose |
|---|---|---|
| `LOCAL_ASR_ENDPOINT` | `http://asr:9000` | onerahmet/whisper-asr-webservice endpoint |
| `ADMIN_ASR_PROVIDER` | `local` | `local`, `openai-whisper`, `groq`, `deepgram`, `assemblyai`, `openai-compatible` |
| `ADMIN_DIARIZATION_PROVIDER` | `local` | `local`, `deepgram`, `assemblyai`, `none` |
| `ADMIN_LLM_PROVIDER` | `openai-compat` | `openai-compat`, `openai`, `anthropic` |
| `OPENAI_API_KEY` | | OpenAI |
| `GROQ_API_KEY` | | Groq |
| `DEEPGRAM_API_KEY` | | Deepgram |
| `ASSEMBLYAI_API_KEY` | | AssemblyAI |
| `ANTHROPIC_API_KEY` | | Anthropic |
| `OPENAI_COMPAT_BASE_URL` | | Any OpenAI Chat Completions endpoint |
| `OPENAI_COMPAT_API_KEY` | | |
| `OPENAI_COMPAT_MODEL` | | e.g. `gpt-4o-mini`, `llama3.1:70b`, etc. |
| `BETTER_AUTH_SECRET` | | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `http://localhost:3001` | |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS origin |
| `DATA_DIR` | `/data` | SQLite + uploads |
| `UPLOAD_MAX_BYTES` | `2147483648` | 2 GB |
| `REDIS_URL` | `redis://redis:6379` | |

---

## Development

```bash
# Install
pnpm install

# Run all apps in dev mode
pnpm dev

# Type-check
pnpm typecheck

# Build
pnpm build
```

Stack:
- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 15 (App Router) + Tailwind + shadcn-style primitives
- **API:** Hono + Better-Auth + Drizzle (SQLite)
- **Worker:** BullMQ
- **DB:** SQLite (`better-sqlite3`)

---

## CI/CD

- `.github/workflows/ci.yml` — lint + typecheck + build on PRs
- `.github/workflows/docker.yml` — multi-arch build → GHCR on push to main / tags

Images: `ghcr.io/<org>/dictate-{web,api,worker}` with tags `latest`, `sha-<short>`, semver.

---

## License

MIT