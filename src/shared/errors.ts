export type CodepolicyErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'CONFIG_PARSE_ERROR'
  | 'RULE_NOT_FOUND'
  | 'GIT_NOT_REPO'
  | 'GIT_DIFF_ERROR'
  | 'GIT_INVALID_BASE'
  | 'GIT_BASE_NOT_FOUND'
  | 'AST_PARSE_ERROR'
  | 'LLM_API_ERROR'
  | 'FILE_READ_ERROR'
  | 'LLM_RESPONSE_PARSE_ERROR'
  | 'RULE_INIT_ERROR'
  | 'CACHE_READ_ERROR'
  | 'CACHE_WRITE_ERROR';

export type CodepolicyError = {
  code: CodepolicyErrorCode;
  message: string;
  cause?: unknown;
};

export const codepolicyError = (
  code: CodepolicyErrorCode,
  message: string,
  cause?: unknown,
): CodepolicyError => ({ code, message, cause });

export function formatErrorCauseChain(error: CodepolicyError): string[] {
  const lines = [`Error [${error.code}]: ${error.message}`];
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    lines.push(`  Caused by: ${cause.message}`);
    cause = cause.cause;
  }
  return lines;
}
