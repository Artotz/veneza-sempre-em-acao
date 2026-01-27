import { modelSuffix, sanitizeModelName } from "./machines";

const EXPECTED_CHASSIS_LENGTH = "1BZ750JACLD000138".length;

const normalizeChassis = (value: string) =>
  value.replace(/\s+/g, "").toUpperCase();

export function getChassisModelSegment(chassis: string): string | null {
  if (!chassis) return null;
  const cleanChassis = normalizeChassis(chassis);
  if (cleanChassis.length !== EXPECTED_CHASSIS_LENGTH) return null;
  return cleanChassis.slice(3, 7);
}

export function getModelSegment(model: string): string | null {
  const normalizedModel = sanitizeModelName(modelSuffix(model));
  if (!normalizedModel || normalizedModel.length < 4) return null;
  return normalizedModel.slice(0, 4);
}

export function findModelFromChassis(
  chassis: string,
  models: string[]
): string | null {
  const chassisSegment = getChassisModelSegment(chassis);
  if (!chassisSegment || models.length === 0) return null;
  const normalizedSegment = sanitizeModelName(chassisSegment);

  const exactMatch = models.find(
    (model) =>
      sanitizeModelName(modelSuffix(model)) === normalizedSegment
  );
  if (exactMatch) return exactMatch;

  const prefixMatch = models.find((model) =>
    sanitizeModelName(modelSuffix(model)).startsWith(normalizedSegment)
  );
  return prefixMatch ?? null;
}

export function validateChassis(model: string, chassis: string): boolean {
  if (!chassis) return false;

  const expectedModelSegment = getModelSegment(model);
  const chassisModelSegment = getChassisModelSegment(chassis);

  if (!chassisModelSegment) return true;
  if (!expectedModelSegment) return true;

  return chassisModelSegment !== expectedModelSegment;
}
