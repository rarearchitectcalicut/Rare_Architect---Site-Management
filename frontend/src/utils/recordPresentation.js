const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export const isRecordId = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isRecordIdField = (key) => /(^ids?$|^uuids?$|_ids?$|_uuids?$)/i.test(key) || /[a-z](Id|Ids|Uuid|UUID)$/.test(key) || isRecordId(key);
export const recordEntries = (value) => Object.entries(value || {}).filter(([key]) => !isRecordIdField(key));

// Only use for generated audit context and technical errors, never editable content.
export function withoutRecordIds(value) {
  return typeof value === "string" ? value.replace(uuid, "record") : value;
}

export function recordDisplayText(value) {
  if (value === null || value === undefined || value === "") return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (isRecordId(value)) return "Linked record";
  if (Array.isArray(value)) return value.length ? value.map(recordDisplayText).join("\n") : "None";
  if (typeof value === "object") {
    const entries = recordEntries(value);
    return entries.length ? entries.map(([key, item]) => `${key.replaceAll("_", " ")}: ${recordDisplayText(item)}`).join("\n") : "No additional details";
  }
  return String(value);
}
