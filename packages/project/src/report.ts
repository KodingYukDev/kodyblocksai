/** Pengumpul temuan validasi/konversi. */
import type { ProjectIssue } from "./types";

export class IssueReport {
  readonly issues: ProjectIssue[] = [];
  /** Batas jumlah temuan yang disimpan agar file jahat tidak membuat laporan raksasa. */
  private readonly max: number;
  private dropped = 0;

  constructor(max = 500) {
    this.max = max;
  }

  error(code: string, path: string, message: string): void {
    this.push({ severity: "error", code, path, message });
  }

  warn(code: string, path: string, message: string): void {
    this.push({ severity: "warning", code, path, message });
  }

  get hasErrors(): boolean {
    return this.issues.some((i) => i.severity === "error");
  }

  get errors(): ProjectIssue[] {
    return this.issues.filter((i) => i.severity === "error");
  }

  get warnings(): ProjectIssue[] {
    return this.issues.filter((i) => i.severity === "warning");
  }

  /** Jumlah temuan yang tidak disimpan karena melewati batas. */
  get droppedCount(): number {
    return this.dropped;
  }

  private push(issue: ProjectIssue): void {
    if (this.issues.length >= this.max) {
      // Error tetap dicatat dengan menimpa peringatan terakhir agar status gagal tidak hilang.
      if (issue.severity === "error" && !this.hasErrors) this.issues[this.issues.length - 1] = issue;
      this.dropped++;
      return;
    }
    this.issues.push(issue);
  }
}

/** Ringkasan satu baris per temuan, untuk pesan error/peringatan di UI. */
export function formatIssue(issue: ProjectIssue): string {
  return `${issue.path}: ${issue.message} [${issue.code}]`;
}
