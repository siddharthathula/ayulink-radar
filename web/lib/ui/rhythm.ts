import modelJson from "@/public/model/rhythm_model.json";
import samplesJson from "@/public/model/samples.json";
import type { Person } from "@/lib/engine/types";
import type { RhythmModel } from "@/lib/engine/rhythm";
import {
  extractRhythmFeatures,
  rhythmProbability,
  topContributions,
} from "@/lib/engine/rhythm";

export interface RhythmSample {
  id: string;
  label: number;
  rr: number[];
}

export const rhythmModel = modelJson as unknown as RhythmModel;
export const rhythmSamples = samplesJson as RhythmSample[];

export const sampleById = new Map(
  rhythmSamples.map((sample) => [sample.id, sample]),
);

export const sampleProbabilityById = new Map(
  rhythmSamples.map((sample) => [
    sample.id,
    rhythmProbability(sample.rr, rhythmModel),
  ]),
);

/** Rhythm flags for simulated people. Only people linked to a sample can flag. */
export function demoRhythmFlags(people: Person[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const person of people) {
    if (!person.rhythmSampleId) continue;
    const probability = sampleProbabilityById.get(person.rhythmSampleId);
    if (probability !== undefined && probability >= rhythmModel.threshold) {
      flags[person.id] = true;
    }
  }
  return flags;
}

export { extractRhythmFeatures, rhythmProbability, topContributions };
