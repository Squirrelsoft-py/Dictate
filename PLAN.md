# Dictate — Plan & Idea

A Plaude-inspired self-hosted web app: upload an MP3 of a meeting, lecture, talk, or conversation, get a speaker-attributed transcript plus structured notes (summary, key points, action items, decisions, chapters, highlighted passages).

---

## 1. Goals & non-goals

### Goals
- Upload an audio file (MP3, WAV, M4A up to 2 GB / 12 h) and receive:
  - Full speaker-diarized transcript (who said what, with timestamps)
  - Short summary
  - List of key points
  - Action items (with owner)
  - Decisions made
  - Topic chapters with timestamps
  - Highlighted important passages
- Self-hostable via Docker Compose, fully local ML via sidecars by default
- Works with any OpenAI-compatible LLM endpoint (OpenAI, MiniMax, Ollama, Groq, OpenRouter, Together, LocalAI, vLLM, LM Studio…) plus Anthropic natively
- Multi-user with email/password auth
- Plaude-style clean aesthetic UI
- Built and shipped via CI/CD to GHCR

### Non-goals (v1)
- PDF export (Markdown only in v1)
- Real-time mic recording in browser
- Notion / Obsidian sync
- Mobile-native apps
- Mobile-optimized responsive beyond readable
- Speaker enrollment (no voiceprint matching — names come from LLM context or manual)

---

## 2. Decisions (locked)

| Area | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turbo |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui (restyled) |
| Backend | Hono + Better-Auth |
| Worker | BullMQ on Redis |
| DB | SQLite + Drizzle ORM |
| Storage | Local Docker volume |
| Auth | Email/password (Better-Auth) |
| LLM providers | OpenAI-compatible (covers OpenAI, MiniMax, Ollama, Groq, OpenRouter, Together, LocalAI, vLLM…) + Anthropic native |
| ASR providers | `local` (onerahmet sidecar), OpenAI Whisper, Groq, Deepgram, AssemblyAI, any OpenAI-compatible `/audio/transcriptions` |
| Diarization | `local` (bundled in onerahmet), Deepgram, AssemblyAI, `none` |
| Default ASR | `local` (via onerahmet sidecar, large-v3 + pyannote) |
| Cloud fallback | Optional, per-upload override allowed |
| Progress UX | Server-Sent Events (Redis pub/sub → API → SSE) |
| Exports | Markdown only in v1 (PDF deferred) |
| Admin config | Env vars set defaults; user picks provider + model per upload |
| CI/CD | GitHub Actions → GHCR, multi-arch amd64+arm64 |
| Limits | 2 GB / 12 h, auto language detect |
| Extras | Speaker rename (LLM-suggest + manual), tags/folders |
| No in-repo ML | All AI via HTTPS to external endpoints or user-configured sidecars |

---

## 3. Architecture

```
Browser
  └─▶ Next.js (apps/web, :3000)
        └─▶ Hono API (apps/api, :3001)
              ├─▶ SQLite  (./data/dictate.db)
              ├─▶ Volume  (./data/uploads/<id>.<ext>)
              ├─▶ Redis ──▶ BullMQ Worker (apps/worker)
              │               │ all calls go OUT via HTTPS
              │               ├─▶ ASR provider         (LOCAL_ASR_ENDPOINT default)
              │               ├─▶ Diarization provider (bundled or separate)
              │               └─▶ LLM provider         (any openai-compat + Anthropic)
              └─▶ Redis pub/sub → SSE progress to browser
```

**Local-first, cloud-optional.** No ML ships in our images. Default deployment is fully self-hosted via sidecars; cloud is a per-upload fallback.

---

## 4. UI / visual language (Plaude-inspired)

- Background off-white `#FAFAF7`, text charcoal `#1A1A1A`, single accent `#FF6B35`
- Dark mode: deep gray `#1C1C1E`, not pure black
- Inter for UI chrome, Source Serif Pro for long-form transcript
- 720px reading column for transcript / notes, generous whitespace, soft borders
- shadcn primitives restyled; lucide icons; subtle fade/slide motion (no bouncy springs)

### Screens
1. **Sign in / Sign up** — split layout, single accent CTA
2. **Library** — left rail (tags tree, All/Recent/Starred), card list with status pills
3. **Upload modal** — drag-drop zone, provider/model dropdowns, live stage progress (Upload → Transcribe → Identify speakers → Summarize → Done)
4. **Transcript view** (centerpiece)
   - Top bar: title (editable), metadata, action bar (Export ▼, Rename, Tag, Delete)
   - Two columns desktop / stacked mobile:
     - Left sticky: Notes panel — Summary, Key Points, Action Items, Decisions, Topics (LLM-chaptered)
     - Right: Transcript with speaker color chips, inline rename on click, time-stamped segments, highlighted passages, collapsible topic sections
5. **Tags manager** — modal CRUD
6. **Settings** — per-user model defaults (fall back to admin defaults)

---

## 5. Data model (Drizzle / SQLite)

```
users              id, email, password_hash, name, created_at
sessions           id, user_id, expires_at          (Better-Auth)
uploads            id, user_id, filename, size_bytes, mime,
                   duration_sec, storage_path, status, progress_json,
                   asr_provider, asr_model,
                   diarization_provider,
                   llm_provider, llm_model,
                   error, created_at, completed_at
transcripts        id, upload_id, language, full_text,
                   segments_json, speakers_json
notes              id, upload_id, summary, key_points_json,
                   action_items_json, decisions_json,
                   chapters_json, highlighted_ranges_json,
                   llm_model, created_at
tags               id, user_id, name, color
upload_tags        upload_id, tag_id
speaker_labels     id, upload_id, original_label, custom_name,
                   suggested_name, confirmed
settings           key, value          (per-user prefs)
```

`segments_json` shape: `Array<{ start: number, end: number, text: string, speaker: string, words?: Array<{ start, end, text }> }>`

---

## 6. Provider abstraction

```ts
// packages/shared/src/providers/types.ts
interface ProviderBase {
  id: string;
  displayName: string;
  configSchema: ZodSchema;
}

interface ASRProvider extends ProviderBase {
  transcribe(input: {
    filePath: string;
    mime: string;
    language?: string;
  }): Promise<{
    language: string;
    segments: Segment[];
    turns?: SpeakerTurn[];   // local, deepgram, assemblyai populate this
  }>;
}

interface DiarizationProvider extends ProviderBase {
  diarize(input: {
    filePath: string;
    mime: string;
    speakers?: number;
  }): Promise<{
    turns: Array<{ start: number; end: number; speaker: string }>;
  }>;
}

interface LLMProvider extends ProviderBase {
  complete(input: {
    system: string;
    user: string;
    json: boolean;
    model?: string;
    maxTokens?: number;
  }): Promise<string>;
}
```

Factory in `packages/shared` registers implementations by id; `apps/worker` reads provider id from the job payload.

### ASR provider matrix
| ID | Backend | Returns speaker turns? |
|---|---|---|
| `local` | onerahmet/whisper-asr-webservice at `LOCAL_ASR_ENDPOINT` | yes (pyannote diarization) |
| `openai-whisper` | OpenAI Whisper API | no (pair with diarization) |
| `groq` | Groq Whisper | no (pair with diarization) |
| `deepgram` | Deepgram Nova | yes |
| `assemblyai` | AssemblyAI | yes |
| `openai-compatible` | Any `/audio/transcriptions` endpoint | depends |

### Diarization provider matrix
| ID | Backend |
|---|---|
| `local` | onerahmet sidecar (same call as ASR) |
| `deepgram` | Deepgram Nova |
| `assemblyai` | AssemblyAI |
| `none` | Skip — single speaker |

### LLM provider matrix
| ID | Backend |
|---|---|
| `openai-compat` | Any `POST {baseURL}/v1/chat/completions` — OpenAI, MiniMax, Ollama, Groq, OpenRouter, Together, LocalAI, vLLM, LM Studio… |
| `openai` | OpenAI Chat Completions (native SDK) |
| `anthropic` | Anthropic Messages API (native SDK) |

---

## 7. Job pipeline

```
queued
  └─ transcribing    → ASR provider → segments + word timestamps
       └─ diarizing  → diarization provider → speaker turns
            └─ aligning → overlap-match turns with ASR segments → assign speaker to each segment
                 └─ naming → LLM suggests real names/roles from context
                      └─ summarizing → LLM → structured JSON (Zod-validated)
                           └─ done
```

- Worker writes `uploads.status` + `progress_json` per stage
- Publishes stage events to Redis channel `job:<id>:progress`
- API subscribes and forwards via SSE to the browser
- Failures: BullMQ retry (3 attempts, exponential), dead-letter on exhaustion

### Alignment algorithm
For each ASR segment `[s_start, s_end)`:
- Find all speaker turns `T` where `t.start < s_end && t.end > s_start`
- Pick the turn with maximum overlap → assign that speaker
- If no overlap, fall back to nearest preceding turn

### LLM prompt contract (structured JSON)
Single request asking for strict JSON:
```json
{
  "summary": "2–3 sentence overview",
  "key_points": ["…", "…"],
  "action_items": [{ "text": "…", "owner": "Speaker 2" }],
  "decisions": ["…"],
  "chapters": [{ "title": "…", "start": 132.4, "end": 415.0 }],
  "highlights": [{ "start": 200.1, "end": 220.5, "reason": "key moment" }]
}
```
Zod-parse the response; on parse failure, retry once with "return strict JSON only" reinforcement. If still failing, store partial result with `error` set.

### Speaker naming pass
After alignment, small LLM call: *"Given this transcript with speakers labelled Speaker 1/2/3, suggest a real name or role for each (e.g. 'Professor', 'Host', 'Dr. Lee')."* Results go to `speaker_labels.suggested_name`. User confirms with one click or types their own — `speaker_labels.custom_name` + `confirmed`.

---

## 8. Repo layout

```
dictate/
├── apps/
│   ├── web/                  Next.js 14 App Router
│   ├── api/                  Hono + Better-Auth
│   └── worker/               BullMQ worker
├── packages/
│   └── shared/               types, Zod schemas, provider interfaces, prompts
├── docker/
│   ├── web.Dockerfile
│   ├── api.Dockerfile
│   ├── worker.Dockerfile
│   ├── docker-compose.yml           # slim (cloud or remote sidecar)
│   └── docker-compose.local.yml     # extends, adds onerahmet sidecar
├── .github/workflows/
│   ├── ci.yml                lint + typecheck + test
│   └── docker.yml            buildx multi-arch → GHCR
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── PLAN.md                   this file
└── README.md
```

Single-language monorepo (TypeScript everywhere), three small Docker images for our code. The optional local ASR sidecar image is `onerahmet/whisper-asr-webservice`.

---

## 9. docker-compose.yml (single, all-in-one)

```yaml
services:
  web, api, worker, redis, asr  # all defined together
volumes:
  dictate_data, redis_data, asr_models
```

One compose file brings up the whole stack including the `onerahmet/whisper-asr-webservice` sidecar. GPU passthrough declared on the `asr` service (silently ignored on hosts without an NVIDIA runtime). Override anything in `.env`.

Usage:
- `docker compose -f docker/docker-compose.yml up -d` — full self-hosted
- Edit `.env` to switch defaults to cloud (`ADMIN_*_PROVIDER=openai-whisper` etc.) — the asr sidecar still runs but is unused
- Edit `LOCAL_ASR_ENDPOINT` to point at a remote onerahmet host

---

## 10. .env.example

```env
# ─── Local sidecar (onerahmet/whisper-asr-webservice) ──────────────
LOCAL_ASR_ENDPOINT=http://asr:9000

# ─── Admin provider defaults (overridable per upload) ────────────
ADMIN_ASR_PROVIDER=local              # local | openai-whisper | groq | deepgram | assemblyai | openai-compatible
ADMIN_DIARIZATION_PROVIDER=local      # local | deepgram | assemblyai | none
ADMIN_LLM_PROVIDER=openai-compat      # openai-compat | openai | anthropic

# ─── Cloud provider keys ──────────────────────────────────────────
OPENAI_API_KEY=
GROQ_API_KEY=
DEEPGRAM_API_KEY=
ASSEMBLYAI_API_KEY=
ANTHROPIC_API_KEY=

# ─── OpenAI-compatible endpoint (MiniMax, Ollama, OpenRouter, etc.)
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_MODEL=

# ─── Auth ────────────────────────────────────────────────────────
BETTER_AUTH_SECRET=                   # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000

# ─── Storage ─────────────────────────────────────────────────────
DATA_DIR=/data
UPLOAD_MAX_BYTES=2147483648            # 2 GB
UPLOAD_RETENTION_DAYS=0                # 0 = keep forever

# ─── Worker ──────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379
```

---

## 11. CI/CD

### `.github/workflows/ci.yml` (PRs)
1. Setup pnpm
2. `pnpm install --frozen-lockfile`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. Cache Turbo build outputs

### `.github/workflows/docker.yml` (push to main + tags)
1. QEMU + Buildx setup
2. Build `web`, `api`, `worker` for `linux/amd64,linux/arm64`
3. Tags:
   - `latest` on main
   - `sha-<short>` on every push
   - `vX.Y.Z` on semver tags
4. Push to `ghcr.io/<org>/dictate-{web,api,worker}`
5. Layer cache: `type=gha`

Each Dockerfile:
- Multi-stage: `node:22-alpine` builder → runner
- Non-root user (`node`)
- `dumb-init` PID 1
- Healthcheck per app

---

## 12. Implementation phases (~12 working days)

| # | Phase | Time |
|---|---|---|
| P0 | Scaffold: pnpm + Turbo + three apps + both compose files | 0.5 d |
| P1 | Drizzle schema + migrations, Better-Auth, login/register | 1 d |
| P2 | Chunked upload endpoint, validation, enqueue | 1 d |
| P3 | Worker + ASR providers (local sidecar first, then OpenAI/Groq/Deepgram/AssemblyAI/openai-compat) | 1.5 d |
| P4 | Diarization providers + alignment util | 1 d |
| P5 | LLM providers (openai-compat, openai, anthropic) + structured prompt + speaker-name pass | 1.5 d |
| P6 | Library + upload modal + SSE progress | 1.5 d |
| P7 | Transcript + notes UI (rename, highlights, chapters) | 2 d |
| P8 | Markdown export + tags CRUD + filter | 1 d |
| P9 | Polish: retries, errors, rate limits, retention | 1 d |
| P10 | CI/CD: lint/typecheck/test on PR, buildx → GHCR on main | 0.5 d |
| P11 | Docs: README, .env.example walkthrough, screenshots | 0.5 d |

---

## 13. Quickstart (target experience)

```bash
# Fully self-hosted (recommended):
docker compose -f docker-compose.local.yml up -d
open http://localhost:3000
# sign up → upload MP3 → watch progress → explore transcript & notes

# Cloud or remote-sidecar:
docker compose -f docker-compose.yml up -d
# edit .env: set LOCAL_ASR_ENDPOINT (remote onerahmet host)
# or leave empty + set OPENAI_API_KEY etc. for cloud
```

---

## 14. Open ideas / nice-to-haves (post-v1)

- PDF export (Puppeteer)
- Browser mic recording (MediaRecorder)
- Real-time streaming transcript (WebSocket)
- Notion / Obsidian sync
- Mobile-responsive polish
- Speaker voiceprint enrollment
- Speaker count hint (ask user up-front to improve diarization quality)
- Custom prompt templates per use case (lecture vs meeting vs interview)
- i18n of the UI
- Rate limiting per user
- Usage analytics dashboard