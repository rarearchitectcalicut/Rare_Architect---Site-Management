// Counts remain server-owned. Missing/invalid values are not presented as zero.
export function metricCount(value) {
  if (!["number", "string"].includes(typeof value) || value === "" || typeof value === "string" && !value.trim()) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function approvalSeries(tasks) {
  return [
    { label: "Approved", value: metricCount(tasks.approved), tone: "mint", status: "APPROVED" },
    { label: "Pending approval", value: metricCount(tasks.pending_approval), tone: "butter", status: "PENDING" },
    { label: "Rejected", value: metricCount(tasks.rejected), tone: "blush", status: "REJECTED" },
  ];
}
