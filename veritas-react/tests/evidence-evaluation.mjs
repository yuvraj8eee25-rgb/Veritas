// Frozen passages and reference labels. Provider classifications in this suite are fixtures.
export const referenceCases = [
  {
    id: "fever-62037",
    origin: "https://fever.ai/dataset/fever.html",
    claim: "Oliver Reed was a film actor.",
    reference: "supports",
    expected: "insufficient",
    outcome: "actor",
    page: {
      url: "https://en.wikipedia.org/wiki/Oliver_Reed",
      title: "Oliver Reed",
      text: "Robert Oliver Reed (13 February 1938 – 2 May 1999) was an English actor,",
    },
    interpretation: "The excerpt identifies Oliver Reed as an actor. It does not independently document his film career.",
    humanReview: "The frozen current excerpt is shorter than the annotated Wikipedia evidence set. Verify the film-specific evidence and primary provenance in live retrieval.",
  },
  {
    id: "fever-paper-fiji",
    origin: "https://aclanthology.org/N18-1074/",
    claim: "Fiji’s largest island is Kauai.",
    reference: "contradicts",
    expected: "insufficient",
    outcome: "Kauai",
    page: {
      url: "https://aclanthology.org/N18-1074.pdf",
      title: "FEVER paper, introductory example",
      text: "Kauai is the oldest Hawaiian Island.",
    },
    interpretation: "The example places Kauai in Hawaii. The excerpt does not identify Fiji’s largest island.",
    humanReview: "The geographical inference needs review. Retrieve a primary record for each geographical assertion for a directional result.",
  },
  {
    id: "fever-137637",
    origin: "https://fever.ai/dataset/fever.html",
    claim: "Henri Christophe is recognized for building a palace in Milot.",
    reference: "insufficient",
    expected: "insufficient",
    outcome: "palace",
    page: null,
    humanReview: "The published example includes no supporting passage. This tests abstention on that snapshot, not the truth of the historical claim.",
  },
];

export const synthetic = {
  claim: "Urban trees reduce heat-related illness during summer.",
  outcome: "heat-related illness",
  positive: "Our randomized controlled trial found that urban trees reduced heat-related illness during summer.",
  positive2: "A separate randomized controlled trial found fewer cases of heat-related illness during summer where urban trees were planted.",
  negative: "Our randomized controlled trial found no reduction in heat-related illness during summer where urban trees were planted.",
  proxy: "A randomized controlled trial found that urban trees lowered street surface temperatures during summer.",
  observational: "Our survey found an association between urban trees and heat-related illness during summer.",
};
