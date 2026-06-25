// Brazilian plate helpers
// Mercosul: AAA0A00 (3 letters + 1 digit + 1 letter + 2 digits)
// Antiga:   AAA-0000 (3 letters + 4 digits, dash for display)

export function normalizePlate(input) {
  return (input || "").toUpperCase().replace(/[-\s]/g, "").trim();
}

export function detectPlateType(plate) {
  const p = normalizePlate(plate);
  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(p)) return "mercosul";
  if (/^[A-Z]{3}\d{4}$/.test(p)) return "antiga";
  return "";
}

export function formatPlate(plate) {
  const p = normalizePlate(plate);
  if (p.length >= 3) {
    return `${p.slice(0, 3)}-${p.slice(3)}`;
  }
  return p;
}

export function isValidPlate(plate) {
  return detectPlateType(plate) !== "";
}
