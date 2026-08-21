export interface IFormulaBlock {
  name: string;
  expr: string;
  /** Base inputs declared in the same ```formula block (имя: число). */
  inputs: Record<string, number>;
  line: number;
}

export interface IFormulaResult {
  name: string;
  expr: string;
  value: number | null;
  error: string | null;
  /** 1-based line of the ```formula block start in the document. */
  line?: number;
}

export interface IEvaluationContext {
  [varName: string]: number;
}

export interface IEvaluationReport {
  results: Map<string, IFormulaResult>;
  errors: string[];
}
