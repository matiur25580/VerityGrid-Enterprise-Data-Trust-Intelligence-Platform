import { describe, expect, it } from "vitest";
import { evaluateSchemaCompatibility } from "../src/lib/data-contract";

const baseline = [
  { name: "customer_id", type: "NUMBER", nullable: false },
  { name: "email", type: "STRING", nullable: true },
];

describe("data contract schema compatibility", () => {
  it("accepts an unchanged schema", () => {
    expect(evaluateSchemaCompatibility(baseline, baseline, "BACKWARD")).toEqual({ status: "COMPATIBLE", drift: [] });
  });

  it("flags removed fields, type changes and relaxed nullability as breaking", () => {
    const result = evaluateSchemaCompatibility(baseline, [
      { name: "customer_id", type: "STRING", nullable: true },
    ], "BACKWARD");
    expect(result.status).toBe("INCOMPATIBLE");
    expect(result.drift.map(item => item.code)).toEqual(expect.arrayContaining([
      "FIELD_TYPE_CHANGED", "NULLABILITY_RELAXED", "FIELD_REMOVED",
    ]));
  });

  it("treats additive fields as warnings in backward mode", () => {
    const result = evaluateSchemaCompatibility(baseline, [
      ...baseline, { name: "country", type: "STRING", nullable: true },
    ], "BACKWARD");
    expect(result.status).toBe("WARNING");
    expect(result.drift[0]?.code).toBe("FIELD_ADDED");
  });

  it("rejects additive fields in strict mode", () => {
    const result = evaluateSchemaCompatibility(baseline, [
      ...baseline, { name: "country", type: "STRING", nullable: true },
    ], "STRICT");
    expect(result.status).toBe("INCOMPATIBLE");
  });
});
