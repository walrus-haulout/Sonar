/**
 * JSON Serialization Sanitizer
 * Detects and removes non-serializable objects that cause JSON.stringify errors
 */

/**
 * Validate an object for JSON serializability
 * Walks the entire object tree and reports the exact path to any non-serializable data
 * Throws error with the path for debugging
 */
export function validateJson(obj: unknown, path = 'root'): void {
  const seen = new WeakSet<object>();

  function walk(value: unknown, currentPath: string): void {
    if (value === null || value === undefined) return;

    // Check for functions
    if (typeof value === 'function') {
      throw new Error(
        `[JSON Validation] Non-serializable function at ${currentPath}`
      );
    }

    // Check for DOM nodes
    if (typeof value === 'object' && 'nodeType' in value) {
      throw new Error(
        `[JSON Validation] DOM node (${(value as any).tagName || 'unknown'}) at ${currentPath}`
      );
    }

    // Check for objects with custom toJSON that throw
    if (typeof value === 'object' && 'toJSON' in value) {
      try {
        (value as any).toJSON();
      } catch (err) {
        throw new Error(
          `[JSON Validation] Non-serializable object with throwing toJSON at ${currentPath}: ${err}`
        );
      }
    }

    if (typeof value === 'object') {
      // Circular reference check
      if (seen.has(value as object)) {
        throw new Error(
          `[JSON Validation] Circular reference detected at ${currentPath}`
        );
      }
      seen.add(value as object);

      // Recursively check properties
      if (Array.isArray(value)) {
        value.forEach((item, index) =>
          walk(item, `${currentPath}[${index}]`)
        );
      } else {
        Object.entries(value).forEach(([key, val]) =>
          walk(val, `${currentPath}.${key}`)
        );
      }
    }
  }

  walk(obj, path);
}

/**
 * Deep sanitize an object for JSON serialization
 * Removes functions, DOM nodes, circular refs, and objects with throwing toJSON
 * Returns a clean, JSON-safe deep clone of the object
 */
export function sanitizeForJson<T>(obj: T): T {
  const seen = new WeakMap<object, unknown>();

  function clone(value: unknown): unknown {
    // Primitives are always safe
    if (value === null || value === undefined) return value;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    // Drop functions entirely
    if (typeof value === 'function') return undefined;

    // Drop DOM nodes entirely
    if (typeof value === 'object' && 'nodeType' in value) return undefined;

    // Handle objects with throwing toJSON (e.g., Seal SessionKey)
    if (typeof value === 'object' && 'toJSON' in value) {
      try {
        // Try calling toJSON to see if it throws
        (value as any).toJSON();
      } catch {
        // This object has a throwing toJSON, extract only safe primitives
        const safe: Record<string, unknown> = {};
        Object.entries(value).forEach(([k, v]) => {
          if (
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean'
          ) {
            safe[k] = v;
          }
        });
        return Object.keys(safe).length > 0 ? safe : undefined;
      }
    }

    if (typeof value === 'object') {
      // Circular reference check - use cached clone if already seen
      if (seen.has(value as object)) {
        return seen.get(value as object);
      }

      // Arrays
      if (Array.isArray(value)) {
        const cloned: unknown[] = [];
        seen.set(value, cloned);
        value.forEach((item) => {
          const cleaned = clone(item);
          if (cleaned !== undefined) cloned.push(cleaned);
        });
        return cloned;
      }

      // Plain objects
      const cloned: Record<string, unknown> = {};
      seen.set(value, cloned);
      Object.entries(value).forEach(([key, val]) => {
        const cleaned = clone(val);
        if (cleaned !== undefined) {
          cloned[key] = cleaned;
        }
      });
      return cloned;
    }

    // Fallback for other types
    return value;
  }

  return clone(obj) as T;
}
