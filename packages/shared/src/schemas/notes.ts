import { z } from 'zod';

export const KeyPointSchema = z.string();
export type KeyPoint = z.infer<typeof KeyPointSchema>;

export const ActionItemSchema = z.object({
  text: z.string(),
  owner: z.string().nullable().optional(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const DecisionSchema = z.string();
export type Decision = z.infer<typeof DecisionSchema>;

export const ChapterSchema = z.object({
  title: z.string(),
  start: z.number(),
  end: z.number(),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const HighlightSchema = z.object({
  start: z.number(),
  end: z.number(),
  reason: z.string(),
});
export type Highlight = z.infer<typeof HighlightSchema>;

export const NotesSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(KeyPointSchema),
  actionItems: z.array(ActionItemSchema),
  decisions: z.array(DecisionSchema),
  chapters: z.array(ChapterSchema),
  highlights: z.array(HighlightSchema),
});
export type Notes = z.infer<typeof NotesSchema>;

export const SpeakerNameSuggestionSchema = z.record(z.string(), z.string());
export type SpeakerNameSuggestion = z.infer<typeof SpeakerNameSuggestionSchema>;