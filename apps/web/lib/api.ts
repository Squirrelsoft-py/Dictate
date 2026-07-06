const API_BASE = '/api';

export interface Upload {
  id: string;
  filename: string;
  sizeBytes: number;
  durationSec: number | null;
  status: string;
  starred: boolean;
  createdAt: string;
  completedAt: string | null;
  asrProvider: string;
  diarizationProvider: string;
  llmProvider: string;
  error: string | null;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker: string;
  words?: Array<{ start: number; end: number; text: string }>;
}

export interface Speaker {
  id: string;
  originalLabel: string;
  customName?: string | null;
  suggestedName?: string | null;
  confirmed?: boolean;
}

export interface Notes {
  summary: string;
  keyPoints: string[];
  actionItems: Array<{ text: string; owner?: string | null }>;
  decisions: string[];
  chapters: Array<{ title: string; start: number; end: number }>;
  highlights: Array<{ start: number; end: number; reason: string }>;
}

export interface UploadDetail {
  upload: Upload & {
    mime: string;
    progressJson: string | null;
    asrModel: string | null;
    llmModel: string | null;
  };
  transcript: {
    id: string;
    language: string;
    fullText: string;
    segmentsJson: string;
    speakersJson: string;
  } | null;
  notes: {
    id: string;
    summary: string;
    keyPointsJson: string;
    actionItemsJson: string;
    decisionsJson: string;
    chaptersJson: string;
    highlightsJson: string;
    llmModel: string | null;
  } | null;
  speakers: Array<{
    id: string;
    originalLabel: string;
    customName: string | null;
    suggestedName: string | null;
    confirmed: boolean;
  }>;
  tags: Array<{ id: string; name: string; color: string }>;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listUploads: (tag?: string) =>
    request<{ uploads: Upload[] }>(`/uploads${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
  getUpload: (id: string) => request<UploadDetail>(`/uploads/${id}`),
  deleteUpload: (id: string) => request<{ ok: true }>(`/uploads/${id}`, { method: 'DELETE' }),
  updateUpload: (id: string, patch: Partial<Pick<Upload, 'filename' | 'starred'>>) =>
    request<{ ok: true }>(`/uploads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  listTags: () => request<{ tags: Array<{ id: string; name: string; color: string }> }>(`/tags`),
  createTag: (name: string, color?: string) =>
    request<{ tag: { id: string; name: string; color: string } }>(`/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  deleteTag: (id: string) => request<{ ok: true }>(`/tags/${id}`, { method: 'DELETE' }),
  attachTag: (uploadId: string, tagId: string) =>
    request<{ ok: true }>(`/tags/${uploadId}/${tagId}`, { method: 'POST' }),
  detachTag: (uploadId: string, tagId: string) =>
    request<{ ok: true }>(`/tags/${uploadId}/${tagId}`, { method: 'DELETE' }),
  renameSpeaker: (uploadId: string, speakerId: string, customName: string) =>
    request<{ ok: true }>(`/speakers/${uploadId}/${speakerId}`, {
      method: 'PUT',
      body: JSON.stringify({ customName }),
    }),
  jobStatus: (id: string) =>
    request<{
      id: string;
      status: string;
      progressJson: string | null;
      error: string | null;
      completedAt: string | null;
    }>(`/jobs/${id}/status`),
  exportMarkdownUrl: (id: string) => `${API_BASE}/exports/${id}/markdown`,
};

export async function uploadFile(
  file: File,
  options: {
    asrProvider?: string;
    asrModel?: string;
    diarizationProvider?: string;
    llmProvider?: string;
    llmModel?: string;
    onProgress?: (pct: number) => void;
  } = {},
): Promise<{ id: string }> {
  const initRes = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      sizeBytes: file.size,
      mime: file.type || 'audio/mpeg',
      asrProvider: options.asrProvider,
      asrModel: options.asrModel,
      diarizationProvider: options.diarizationProvider,
      llmProvider: options.llmProvider,
      llmModel: options.llmModel,
    }),
  });
  if (!initRes.ok) throw new Error(`Init failed: ${initRes.status}`);
  const { id, uploadUrl } = await initRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${API_BASE.replace('/api', '')}${uploadUrl}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(file);
  });

  return { id };
}