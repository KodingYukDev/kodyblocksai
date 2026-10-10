/**
 * Primitive kategori Operators - port scratch-vm 4.8.102 src/blocks/scratch3_operators.js (BSD-3-Clause).
 * Semua argumen datang mentah dan di-cast di sini persis seperti scratch-vm.
 */
import type { BlockArgs, BlockPackage, BlockPackageFactory, IRuntime, PrimitiveFn } from "../types/runtime";
import { Cast } from "../util/cast";
import { getRuntimeRandom, MathUtil } from "../util/math-util";

/** operator_random; `random` di [0,1). */
export function randomBetween(from: unknown, to: unknown, random: () => number): number {
  const nFrom = Cast.toNumber(from);
  const nTo = Cast.toNumber(to);
  const low = nFrom <= nTo ? nFrom : nTo;
  const high = nFrom <= nTo ? nTo : nFrom;
  if (low === high) return low;
  // Kedua argumen "terlihat" bulat (tanpa titik) -> hasil bulat.
  if (Cast.isInt(from) && Cast.isInt(to)) {
    return low + Math.floor(random() * (high + 1 - low));
  }
  return random() * (high - low) + low;
}

export function letterOf(letter: unknown, string: unknown): string {
  const index = Cast.toNumber(letter) - 1;
  const str = Cast.toString(string);
  if (index < 0 || index >= str.length) return "";
  return str.charAt(index);
}

/** Modulo floored: hasil bertanda sama dengan pembagi. */
export function scratchMod(num1: unknown, num2: unknown): number {
  const n = Cast.toNumber(num1);
  const modulus = Cast.toNumber(num2);
  let result = n % modulus;
  if (result / modulus < 0) result += modulus;
  return result;
}

export function mathop(operatorArg: unknown, num: unknown): number {
  const operator = Cast.toString(operatorArg).toLowerCase();
  const n = Cast.toNumber(num);
  switch (operator) {
    case "abs":
      return Math.abs(n);
    case "floor":
      return Math.floor(n);
    case "ceiling":
      return Math.ceil(n);
    case "sqrt":
      return Math.sqrt(n);
    case "sin":
      return parseFloat(Math.sin((Math.PI * n) / 180).toFixed(10));
    case "cos":
      return parseFloat(Math.cos((Math.PI * n) / 180).toFixed(10));
    case "tan":
      return MathUtil.tan(n);
    case "asin":
      return (Math.asin(n) * 180) / Math.PI;
    case "acos":
      return (Math.acos(n) * 180) / Math.PI;
    case "atan":
      return (Math.atan(n) * 180) / Math.PI;
    case "ln":
      return Math.log(n);
    case "log":
      return Math.log(n) / Math.LN10;
    case "e ^":
      return Math.exp(n);
    case "10 ^":
      return Math.pow(10, n);
  }
  return 0;
}

export const createOperatorsBlocks: BlockPackageFactory = (runtime: IRuntime): BlockPackage => {
  const primitives: Record<string, PrimitiveFn> = {
    operator_add: (a: BlockArgs) => Cast.toNumber(a.NUM1) + Cast.toNumber(a.NUM2),
    operator_subtract: (a: BlockArgs) => Cast.toNumber(a.NUM1) - Cast.toNumber(a.NUM2),
    operator_multiply: (a: BlockArgs) => Cast.toNumber(a.NUM1) * Cast.toNumber(a.NUM2),
    operator_divide: (a: BlockArgs) => Cast.toNumber(a.NUM1) / Cast.toNumber(a.NUM2),
    operator_lt: (a: BlockArgs) => Cast.compare(a.OPERAND1, a.OPERAND2) < 0,
    operator_equals: (a: BlockArgs) => Cast.compare(a.OPERAND1, a.OPERAND2) === 0,
    operator_gt: (a: BlockArgs) => Cast.compare(a.OPERAND1, a.OPERAND2) > 0,
    operator_and: (a: BlockArgs) => Cast.toBoolean(a.OPERAND1) && Cast.toBoolean(a.OPERAND2),
    operator_or: (a: BlockArgs) => Cast.toBoolean(a.OPERAND1) || Cast.toBoolean(a.OPERAND2),
    operator_not: (a: BlockArgs) => !Cast.toBoolean(a.OPERAND),
    operator_random: (a: BlockArgs) => randomBetween(a.FROM, a.TO, getRuntimeRandom(runtime)),
    operator_join: (a: BlockArgs) => Cast.toString(a.STRING1) + Cast.toString(a.STRING2),
    operator_letter_of: (a: BlockArgs) => letterOf(a.LETTER, a.STRING),
    operator_length: (a: BlockArgs) => Cast.toString(a.STRING).length,
    operator_contains: (a: BlockArgs) =>
      Cast.toString(a.STRING1).toLowerCase().includes(Cast.toString(a.STRING2).toLowerCase()),
    operator_mod: (a: BlockArgs) => scratchMod(a.NUM1, a.NUM2),
    operator_round: (a: BlockArgs) => Math.round(Cast.toNumber(a.NUM)),
    operator_mathop: (a: BlockArgs) => mathop(a.OPERATOR, a.NUM),
  };
  return {
    getPrimitives: () => primitives,
    getHats: () => ({}),
    getMonitored: () => ({}),
  };
};
