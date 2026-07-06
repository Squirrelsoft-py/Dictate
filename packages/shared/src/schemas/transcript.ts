import { z } from 'zod';

export const WordSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
});
export type Word = z.infer<typeof WordSchema>;

export const SegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  speaker: z.string(),
  words: z.array(WordSchema).optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const SpeakerTurnSchema = z.object({
  start: z.number(),
  end: z.number(),
  speaker: z.string(),
});
export type SpeakerTurn = z.infer<typeof SpeakerTurnSchema>;

export const SpeakerSchema = z.object({
  id: z.string(),
  originalLabel: z.string(),
  customName: z.string().nullable().optional(),
  suggestedName: z.string().nullable().optional(),
  confirmed: z.boolean().optional(),
});
export type Speaker = z.infer<typeof SpeakerSchema>;

export const TranscriptSchema = z.object({
  language: z.string(),
  fullText: z.string(),
  segments: z.array(SegmentSchema),
  speakers: z.array(SpeakerSchema),
});
export type Transcript = z.infer<typeof TranscriptSchema>;