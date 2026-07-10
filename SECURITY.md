# Security policy

## Supported versions

Security fixes are applied to the latest version on the default branch. Older
commits and forks are not supported.

## Reporting a vulnerability

Do not report vulnerabilities in a public issue or discussion.

Use the repository's **Security** tab to submit a private vulnerability report
when that option is available. Otherwise, contact the repository owner through
their GitHub profile and ask for a private reporting channel. Do not include a
proof of concept, API key, token, prompt contents, or other sensitive data in a
public message.

Include enough information to reproduce and assess the issue:

- the affected endpoint or component
- the impact and required conditions
- minimal reproduction steps
- relevant versions or commit identifiers
- suggested mitigation, if known

Rotate any exposed credential immediately. An OpenAI API key belongs only in
the proxy's local `.env`; it must never be committed or added to browser-side
Excalidraw configuration.

## Deployment scope

The default configuration binds the proxy to `127.0.0.1`. Before exposing it to
a network, review origin restrictions, request limits, authentication, TLS, and
logging for that environment. The project does not provide authentication or
TLS termination by itself.
