/**
 * Centralized Zod validation middleware.
 * Usage: router.post('/route', validate(schema), handler)
 *
 * Validates req.body against schema, attaches parsed data to req.validated.
 * Returns consistent 400 error structure on failure.
 */

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten();
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    req.validated = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.flatten()
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}

/** UUID format check */
export function validateUUID(paramName) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (req, res, next) => {
    const val = req.params[paramName];
    if (!val || !UUID_RE.test(val)) {
      return res.status(400).json({ error: `Invalid ${paramName}: must be a valid UUID` });
    }
    next();
  };
}
