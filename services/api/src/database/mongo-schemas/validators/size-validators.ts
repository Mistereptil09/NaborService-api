import * as mongoose from 'mongoose';

export interface SizeConfig {
  binaryFields: Array<{
    path: string;
    isArray: boolean;
    sizeField: string;
  }>;
  maxTotalBytes: number;
}

export function createBinarySizeValidator(maxBytes: number, context: string) {
  return {
    validator: function (val: number) {
      return val <= maxBytes;
    },
    message: `size_bytes exceeds maximum of ${maxBytes} bytes for ${context}`,
  };
}

export function createArrayLengthValidator(maxLength: number, field: string) {
  return {
    validator: function (val: any[]) {
      return Array.isArray(val) && val.length <= maxLength;
    },
    message: `${field} exceeds maximum length of ${maxLength}`,
  };
}

export function createTotalSizePreSaveHook(config: SizeConfig) {
  return function (this: any, next: (err?: Error) => void) {
    let totalBytes = 0;
    for (const field of config.binaryFields) {
      const value = this.get(field.path);
      if (!value) continue;
      if (field.isArray) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item[field.sizeField] === 'number') {
              totalBytes += item[field.sizeField];
            }
          }
        }
      } else {
        if (typeof value[field.sizeField] === 'number') {
          totalBytes += value[field.sizeField];
        }
      }
    }
    if (totalBytes > config.maxTotalBytes) {
      const err = new mongoose.Error.ValidationError(this);
      err.addError(
        'total_size',
        new mongoose.Error.ValidatorError({
          message: `Total binary size (${totalBytes} bytes) exceeds maximum of ${config.maxTotalBytes} bytes`,
          path: 'total_size',
          value: totalBytes,
          type: 'maxBytes',
        }),
      );
      if (typeof next === 'function') {
        return next(err);
      }
      throw err;
    }
    if (typeof next === 'function') {
      next();
    }
  };
}
