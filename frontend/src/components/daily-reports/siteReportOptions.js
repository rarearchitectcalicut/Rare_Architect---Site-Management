export const workActivities = [
  ["Site preparation", "Site preparation carried out."], ["Excavation", "Excavation work carried out."],
  ["Foundation", "Foundation work carried out."], ["Concrete", "Concrete work carried out."],
  ["Blockwork", "Blockwork carried out."], ["Electrical", "Electrical work carried out."],
  ["Plumbing", "Plumbing work carried out."], ["Plastering", "Plastering work carried out."],
  ["Painting", "Painting work carried out."], ["Tiling", "Tiling work carried out."],
  ["Inspection", "Site inspection carried out."], ["Housekeeping", "Site cleaning and housekeeping carried out."],
];
export const materialNames = ["Cement", "Sand", "Aggregate", "Bricks", "Blocks", "Steel", "Timber", "Paint"];

// Toggle only the selected sentence. Handwritten details are never replaced.
export function toggleReportSentence(text, sentence) {
  const lines = text.split("\n");
  return lines.includes(sentence) ? lines.filter((line) => line !== sentence).join("\n") : [text, sentence].filter(Boolean).join("\n");
}
