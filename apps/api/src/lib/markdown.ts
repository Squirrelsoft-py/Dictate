interface MarkdownInput {
  filename: string;
  createdAt: Date | null;
  notes: {
    summary: string;
    keyPoints: string[];
    actionItems: Array<{ text: string; owner?: string | null }>;
    decisions: string[];
    chapters: Array<{ title: string; start: number; end: number }>;
    highlights: Array<{ start: number; end: number; reason: string }>;
  } | null;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker: string;
  }>;
  speakerLabels: Map<string, string>;
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTranscriptMarkdown(input: MarkdownInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.filename}`);
  lines.push('');
  if (input.createdAt) {
    lines.push(`*Recorded: ${input.createdAt.toISOString()}*`);
    lines.push('');
  }

  if (input.notes) {
    lines.push('## Summary');
    lines.push('');
    lines.push(input.notes.summary);
    lines.push('');

    if (input.notes.keyPoints.length > 0) {
      lines.push('## Key Points');
      lines.push('');
      for (const p of input.notes.keyPoints) lines.push(`- ${p}`);
      lines.push('');
    }

    if (input.notes.actionItems.length > 0) {
      lines.push('## Action Items');
      lines.push('');
      for (const a of input.notes.actionItems) {
        const owner = a.owner ? ` — *${a.owner}*` : '';
        lines.push(`- [ ] ${a.text}${owner}`);
      }
      lines.push('');
    }

    if (input.notes.decisions.length > 0) {
      lines.push('## Decisions');
      lines.push('');
      for (const d of input.notes.decisions) lines.push(`- ${d}`);
      lines.push('');
    }

    if (input.notes.chapters.length > 0) {
      lines.push('## Chapters');
      lines.push('');
      for (const ch of input.notes.chapters) {
        lines.push(`- **${fmtTime(ch.start)}** — ${ch.title}`);
      }
      lines.push('');
    }
  }

  lines.push('## Transcript');
  lines.push('');
  let currentSpeaker = '';
  for (const seg of input.segments) {
    const speaker = input.speakerLabels.get(seg.speaker) ?? seg.speaker;
    if (speaker !== currentSpeaker) {
      if (currentSpeaker !== '') lines.push('');
      lines.push(`### ${speaker}  `);
      currentSpeaker = speaker;
    }
    lines.push(`**${fmtTime(seg.start)}** ${seg.text}`);
  }
  lines.push('');
  return lines.join('\n');
}