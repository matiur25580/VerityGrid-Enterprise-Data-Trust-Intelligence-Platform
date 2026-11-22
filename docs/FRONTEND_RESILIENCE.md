# Frontend resilience

VerityGrid wraps the React application in a top-level error boundary.

## Failure behavior

- Uncaught render and lifecycle errors are contained instead of leaving a partially rendered application tree.
- The fallback explains that the view was interrupted and offers an explicit reload action.
- The boundary does not automatically reload, so a persistent failure cannot create a reload loop.
- The fallback does not expose stack traces, component props, session data, or server error payloads.
- The error hook intentionally does not transmit exception details to an external telemetry service. Add a reviewed provider only after retention, access, redaction, and regional data-processing requirements are agreed.

## Scope and limitations

Error boundaries catch errors thrown while rendering descendants and in descendant lifecycle methods. They do not catch event-handler exceptions, rejected asynchronous work, or errors thrown by the boundary itself. Those paths must continue to use explicit local error handling and API error states.

The boundary is a containment mechanism, not a substitute for monitoring or automated recovery. A reload may repeat an underlying server or data error.
