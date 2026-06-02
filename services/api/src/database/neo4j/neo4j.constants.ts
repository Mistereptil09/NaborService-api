export const NEO4J_DRIVER = 'NEO4J_DRIVER';

export const TRANSIENT_ERROR_CODES = [
  'Neo.TransientError.General.DatabaseUnavailable',
  'Neo.TransientError.Transaction.DeadlockDetected',
  'ServiceUnavailable',
  'SessionExpired',
];

export const INDEX_EXISTS_CODE =
  'Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists';
