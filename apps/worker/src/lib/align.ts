import type { Segment, SpeakerTurn } from '@dictate/shared/schemas';

export function assignSpeakersToSegments(
  segments: Segment[],
  turns: SpeakerTurn[],
): Segment[] {
  if (turns.length === 0) {
    return segments.map((s) => ({ ...s, speaker: s.speaker || 'Speaker 0' }));
  }

  const sortedTurns = [...turns].sort((a, b) => a.start - b.start);

  return segments.map((seg) => {
    if (seg.speaker && seg.speaker !== 'Speaker 0') {
      return seg;
    }
    const segMid = (seg.start + seg.end) / 2;
    let bestTurn: SpeakerTurn | null = null;
    let bestOverlap = 0;
    for (const t of sortedTurns) {
      const overlap = Math.min(seg.end, t.end) - Math.max(seg.start, t.start);
      if (overlap <= 0) continue;
      const turnMid = (t.start + t.end) / 2;
      const midDiff = Math.abs(segMid - turnMid);
      const score = overlap - midDiff * 0.001;
      if (score > bestOverlap) {
        bestOverlap = score;
        bestTurn = t;
      }
    }
    if (bestTurn) {
      return { ...seg, speaker: bestTurn.speaker };
    }
    const first = sortedTurns[0];
    if (!first) return { ...seg, speaker: 'Speaker 0' };
    let nearest = first;
    let nearestDist = Math.abs(segMid - (nearest.start + nearest.end) / 2);
    for (const t of sortedTurns) {
      const d = Math.abs(segMid - (t.start + t.end) / 2);
      if (d < nearestDist) {
        nearest = t;
        nearestDist = d;
      }
    }
    return { ...seg, speaker: nearest.speaker };
  });
}

export function uniqueSpeakers(segments: Segment[]): string[] {
  const set = new Set<string>();
  for (const s of segments) {
    if (s.speaker) set.add(s.speaker);
  }
  return Array.from(set).sort();
}