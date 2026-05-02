import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import yaml from 'js-yaml';
import { Result, err, ok } from 'neverthrow';

import { codepolicyError } from './errors';
import type { CodepolicyError, CodepolicyErrorCode } from './errors';
import { codepolicyConfigFileSchema } from './schema-definitions';
import type { CodepolicyConfig } from './types';

const ajv = new Ajv({
  allErrors: false,
  strict: false,
  useDefaults: true,
});

function compileValidator<T>(schema: object): ValidateFunction<T> {
  return ajv.compile<T>(schema);
}

const validateCodepolicyConfig = compileValidator<CodepolicyConfig>(codepolicyConfigFileSchema);

function isTopLevelObjectTypeError(error: ErrorObject): boolean {
  return error.keyword === 'type' && error.instancePath === '' && error.params.type === 'object';
}

function formatPath(error: ErrorObject): string {
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    return error.params.missingProperty;
  }

  const instancePath = error.instancePath.replace(/^\//, '').replaceAll('/', '.');
  return instancePath === '' ? '' : instancePath;
}

function formatPathValidationError(error: ErrorObject, path: string, objectLabel: string): string {
  if (error.keyword === 'anyOf' && path.startsWith('rules.')) {
    return `Invalid ${path}: must be a level string or { level, threshold? }.`;
  }

  if (path === '') {
    return `${objectLabel} is invalid: ${error.message ?? 'validation failed.'}`;
  }

  return `Invalid ${path}: ${error.message ?? 'validation failed.'}`;
}

function formatValidationError(
  error: ErrorObject | undefined,
  objectLabel: string,
  objectErrorMessage: string,
): string {
  if (!error) {
    return `${objectLabel} is invalid.`;
  }

  if (isTopLevelObjectTypeError(error)) {
    return objectErrorMessage;
  }

  return formatPathValidationError(error, formatPath(error), objectLabel);
}

function stripSchemaProperty<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }

  Reflect.deleteProperty(value, '$schema');
  return value;
}

export function parseYamlWithSchema<T>(
  content: string,
  validator: ValidateFunction<T>,
  options: {
    parseErrorCode: CodepolicyErrorCode;
    parseErrorMessage: string;
    objectErrorMessage: string;
    objectLabel: string;
  },
): Result<T, CodepolicyError> {
  const parseResult = Result.fromThrowable(
    () => yaml.load(content),
    (cause) => codepolicyError(options.parseErrorCode, options.parseErrorMessage, cause),
  )();

  if (parseResult.isErr()) {
    return err(parseResult.error);
  }

  const parsed = parseResult.value;

  if (!validator(parsed)) {
    return err(
      codepolicyError(
        options.parseErrorCode,
        formatValidationError(
          validator.errors?.[0],
          options.objectLabel,
          options.objectErrorMessage,
        ),
      ),
    );
  }

  return ok(stripSchemaProperty(parsed));
}

export { validateCodepolicyConfig };
