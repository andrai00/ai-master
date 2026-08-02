export interface IFormulaBlock {
  name: string;
  expr: string;
  line: number;
}

export interface IFormulaResult {
  name: string;
  expr: string;
  value: number | null;
  error: string | null;
}

export interface IEvaluationContext {
  [varName: string]: number;
}

export interface IEvaluationReport {
  results: Map<string, IFormulaResult>;
  errors: string[];
}
