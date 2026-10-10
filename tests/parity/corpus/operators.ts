/** Korpus Operators: casting angka/string, pembulatan, perbandingan, mathop, random dengan seed. */
import { b } from "../block-builder";
import type { ParityCase } from "../case-types";
import { BOOL_NODES, CAST_VALUES, CROSS_VALUES, cross, probeCase } from "./helpers";

const binary = (opcode: string, a: string, c: string) =>
  cross(CROSS_VALUES).map(([x, y]) => b(opcode, { [a]: x, [c]: y }));

const MATHOPS = ["abs", "floor", "ceiling", "sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "e ^", "10 ^"];
const MATHOP_VALUES: (string | number)[] = [0, 1, -1, 0.5, -4.7, 30, 45, 90, 180, 270, -90, 1e3, "abc", "Infinity", "-Infinity", 2, 100];

export function operatorCases(): ParityCase[] {
  return [
    probeCase("operators", "add", ["operator_add"], binary("operator_add", "NUM1", "NUM2")),
    probeCase("operators", "subtract", ["operator_subtract"], binary("operator_subtract", "NUM1", "NUM2")),
    probeCase("operators", "multiply", ["operator_multiply"], binary("operator_multiply", "NUM1", "NUM2")),
    probeCase("operators", "divide", ["operator_divide"], binary("operator_divide", "NUM1", "NUM2")),
    probeCase("operators", "mod", ["operator_mod"], [
      ...binary("operator_mod", "NUM1", "NUM2"),
      b("operator_mod", { NUM1: -7, NUM2: 3 }),
      b("operator_mod", { NUM1: 7, NUM2: -3 }),
      b("operator_mod", { NUM1: 5.5, NUM2: 2 }),
    ]),
    probeCase("operators", "gt", ["operator_gt"], binary("operator_gt", "OPERAND1", "OPERAND2")),
    probeCase("operators", "lt", ["operator_lt"], [
      ...binary("operator_lt", "OPERAND1", "OPERAND2"),
      b("operator_lt", { OPERAND1: "apple", OPERAND2: "Banana" }),
      b("operator_lt", { OPERAND1: "a", OPERAND2: "B" }),
    ]),
    probeCase("operators", "equals", ["operator_equals"], [
      ...binary("operator_equals", "OPERAND1", "OPERAND2"),
      b("operator_equals", { OPERAND1: "ABC", OPERAND2: "abc" }),
      b("operator_equals", { OPERAND1: "1.0", OPERAND2: "1" }),
      b("operator_equals", { OPERAND1: " ", OPERAND2: "0" }),
      b("operator_equals", { OPERAND1: "true", OPERAND2: b("operator_not") }),
      b("operator_equals", { OPERAND1: "NaN", OPERAND2: "nan" }),
    ]),
    probeCase(
      "operators",
      "and-or-not",
      ["operator_and", "operator_or", "operator_not"],
      [
        ...cross(BOOL_NODES()).map(([x, y]) => b("operator_and", { OPERAND1: x, OPERAND2: y })),
        ...cross(BOOL_NODES()).map(([x, y]) => b("operator_or", { OPERAND1: x, OPERAND2: y })),
        ...BOOL_NODES().map((x) => b("operator_not", { OPERAND: x })),
        b("operator_and"),
        b("operator_or"),
      ],
    ),
    probeCase("operators", "join", ["operator_join"], [
      ...binary("operator_join", "STRING1", "STRING2"),
      b("operator_join", { STRING1: b("operator_divide", { NUM1: 1, NUM2: 3 }), STRING2: "" }),
      b("operator_join", { STRING1: b("operator_add", { NUM1: 0.1, NUM2: 0.2 }), STRING2: "" }),
      b("operator_join", { STRING1: b("operator_not"), STRING2: "!" }),
    ]),
    probeCase("operators", "letter-of", ["operator_letter_of"], [
      ...[0, 1, 2, 3, 1.5, 2.6, -1, 99, "abc", "", "2"].map((i) => b("operator_letter_of", { LETTER: i, STRING: "kody" })),
      b("operator_letter_of", { LETTER: 1, STRING: 12.5 }),
      b("operator_letter_of", { LETTER: 1, STRING: "" }),
      b("operator_letter_of", { LETTER: 2, STRING: "😀x" }),
    ]),
    probeCase("operators", "length", ["operator_length"], [
      ...CAST_VALUES.map((v) => b("operator_length", { STRING: v })),
      b("operator_length", { STRING: "😀" }),
      b("operator_length", { STRING: b("operator_divide", { NUM1: 1, NUM2: 3 }) }),
    ]),
    probeCase("operators", "contains", ["operator_contains"], [
      ...binary("operator_contains", "STRING1", "STRING2"),
      b("operator_contains", { STRING1: "KodyBlocks", STRING2: "bLoC" }),
      b("operator_contains", { STRING1: "apple", STRING2: "" }),
    ]),
    probeCase("operators", "round", ["operator_round"], [
      ...CAST_VALUES.map((v) => b("operator_round", { NUM: v })),
      ...[2.5, -2.5, 0.49999999999999994, -0.5, 1e21 + 0.5].map((v) => b("operator_round", { NUM: v })),
    ]),
    probeCase(
      "operators",
      "mathop",
      ["operator_mathop"],
      MATHOPS.flatMap((op) => MATHOP_VALUES.map((v) => b("operator_mathop", { NUM: v }, { OPERATOR: op }))),
    ),
    probeCase(
      "operators",
      "random",
      ["operator_random"],
      [
        ...[[1, 10], [10, 1], [1, "10.0"], ["1.5", 3], [0, 0], [-5, 5], ["abc", 5], [1, 1e3], ["", ""], [0.1, 0.2]].map(
          ([x, y]) => b("operator_random", { FROM: x as string | number, TO: y as string | number }),
        ),
        ...Array.from({ length: 10 }, () => b("operator_random", { FROM: 1, TO: 100 })),
      ],
      { seed: 42 },
    ),
    probeCase("operators", "nested-precision", ["operator_add", "operator_multiply", "operator_divide"], [
      b("operator_add", { NUM1: b("operator_multiply", { NUM1: 0.1, NUM2: 3 }), NUM2: 0 }),
      b("operator_divide", { NUM1: 0, NUM2: 0 }),
      b("operator_divide", { NUM1: -1, NUM2: 0 }),
      b("operator_multiply", { NUM1: "Infinity", NUM2: 0 }),
      b("operator_subtract", { NUM1: "1e308", NUM2: "-1e308" }),
    ]),
  ];
}
