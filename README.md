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

`docker/docker-compose.yml` is **self-contained** — it pulls prebuilt images from GHCR by default, so no source code is needed. Works in Docker CLI, Dockge, Portainer, Cosmos, etc.

### Bare docker compose

```bash
git clone https://github.com/<your-org>/dictate
cd dictate/docker
cp .env.example .env
# Edit .env:
#   - Set BETTER_AUTH_SECRET  (run: openssl rand -hex 32)
#   - Add any cloud API keys you want as fallbacks (optional)
docker compose up -d
open http://localhost:3000
```

### Build from source

```bash
cd dictate/docker
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

`docker-compose.build.yml` is an override that adds `build:` blocks so the three Dictate images are compiled locally instead of pulled.

### Dockge / Portainer / Cosmos

The compose file is fully self-contained — every variable has a `${VAR:-default}` fallback, so the stack boots with no env file at all. Paste values into the stack's **Environment** field. The shipped `docker/.env` has defaults; copy it next to the compose file or edit `docker/.env.example` and rename to `.env`.

To pin a different image tag, set in `.env`:
```env
WEB_IMAGE=ghcr.io/squirrelsoft-py/dictate-web:v1.2.3
API_IMAGE=ghcr.io/squirrelsoft-py/dictate-api:v1.2.3
WORKER_IMAGE=ghcr.io/squirrelsoft-py/dictate-worker:v1.2.3
```

### Cloud-only (no local whisper)

Edit `.env`:
```env
ADMIN_ASR_PROVIDER=openai-whisper
ADMIN_DIARIZATION_PROVIDER=deepgram
ADMIN_LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ANTHROPIC_API_KEY=...   # only if ADMIN_LLM_PROVIDER=anthropic
```
Then `docker compose -f docker/docker-compose.yml up -d`.

### Remote sidecar on another machine

Edit `.env`:
```env
LOCAL_ASR_ENDPOINT=http://your-other-host:9000
```
Run onerahmet there once, and Dictate uses it remotely.

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

Everything lives in the single `.env` at the project root (copy from `.env.example`). Key groups:

| Group | Keys |
|---|---|
| Ports | `WEB_PORT`, `API_PORT`, `ASR_PORT` |
| Provider defaults | `ADMIN_ASR_PROVIDER`, `ADMIN_DIARIZATION_PROVIDER`, `ADMIN_LLM_PROVIDER` |
| Local Whisper sidecar | `LOCAL_ASR_ENDPOINT`, `ASR_MODEL`, `ASR_ENGINE`, `ASR_DIARIZATION` |
| Cloud keys | `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY` |
| OpenAI-compatible LLM | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL` |
| Auth | `BETTER_AUTH_SECRET` (generate with `openssl rand -hex 32`), `BETTER_AUTH_URL`, `WEB_ORIGIN` |
| Storage | `DATA_DIR`, `UPLOAD_MAX_BYTES`, `UPLOAD_RETENTION_DAYS` |
| Redis | `REDIS_URL` (defaults to bundled redis) |

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