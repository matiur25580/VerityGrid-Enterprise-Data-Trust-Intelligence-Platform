import { z } from "zod";

export type ContractField = { name: string; type: string; nullable?: boolean };
export type ContractDrift = {
  code: 'FIELD_REMOVED' | 'FIELD_TYPE_CHANGED' | 'NULLABILITY_RELAXED' | 'FIELD_ADDED';
  field: string;
  expected?: string;
  actual?: string;
  severity: 'BREAKING' | 'WARNING';
};

const normalizeType = (value: string) => value.trim().toUpperCase();

// Compare expected and observed fields, classifying schema drift according to the selected compatibility mode.
export function evaluateSchemaCompatibility(
  expected: ContractField[],
  actual: ContractField[],
  mode: 'BACKWARD' | 'STRICT',
): { status: 'COMPATIBLE' | 'WARNING' | 'INCOMPATIBLE'; drift: ContractDrift[] } {
  const drift: ContractDrift[] = [];
  const expectedByName = new Map(expected.map(field => [field.name, field]));
  const actualByName = new Map(actual.map(field => [field.name, field]));

  for (const field of expected) {
    const current = actualByName.get(field.name);
    if (!current) {
      drift.push({ code: 'FIELD_REMOVED', field: field.name, expected: field.type, severity: 'BREAKING' });
      continue;
    }
    if (normalizeType(current.type) !== normalizeType(field.type)) {
      drift.push({ code: 'FIELD_TYPE_CHANGED', field: field.name, expected: field.type, actual: current.type, severity: 'BREAKING' });
    }
    if (field.nullable === false && current.nullable === true) {
      drift.push({ code: 'NULLABILITY_RELAXED', field: field.name, expected: 'NOT NULL', actual: 'NULLABLE', severity: 'BREAKING' });
    }
  }

  for (const field of actual) {
    if (!expectedByName.has(field.name)) {
      drift.push({
        code: 'FIELD_ADDED',
        field: field.name,
        actual: field.type,
        severity: mode === 'STRICT' ? 'BREAKING' : 'WARNING',
      });
    }
  }

  const status = drift.some(item => item.severity === 'BREAKING')
    ? 'INCOMPATIBLE'
    : drift.length ? 'WARNING' : 'COMPATIBLE';
  return { status, drift };
}


export const contractStatusTransitions = {
  DRAFT: ["ACTIVE", "RETIRED"],
  ACTIVE: ["RETIRED"],
  RETIRED: [],
} as const;

export type ContractLifecycleStatus = keyof typeof contractStatusTransitions;

export function canTransitionContractStatus(from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(contractStatusTransitions, from)
    && (contractStatusTransitions[from as ContractLifecycleStatus] as readonly string[]).includes(to);
}


export const contractFieldsSchema = z.array(z.object({
  name: z.string().trim().min(1).max(128),
  type: z.string().trim().min(1).max(80),
  nullable: z.boolean().default(false),
})).max(500).superRefine((fields, context) => {
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    if (seen.has(field.name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "name"],
        message: `Duplicate field name: ${field.name}`,
      });
    }
    seen.add(field.name);
  });
});
