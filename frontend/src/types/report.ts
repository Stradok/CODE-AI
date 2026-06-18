export interface Vulnerability {
  cve_id: string;
  vulnerability: string;
  exploitability: "Critical" | "High" | "Medium" | "Low";
  original_code: string;
  fixed_code: string;
  diff: string;
  verdict: "FIX_SUCCESSFUL" | "PARTIALLY_FIXED" | "FIX_FAILED";
}

export interface FunctionResult {
  function_name: string;
  vulnerabilities: Vulnerability[];
  audit_trail: string;
}
