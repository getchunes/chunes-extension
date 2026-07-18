# Security Policy

## Supported versions

Security fixes are applied to the latest published release line of Chune ID.

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| Earlier versions | No |

Users should update through the Chrome Web Store when a release is available.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/getchunes/chunes-extension/security/advisories/new).
Do not include vulnerability details in a public issue.

Include the affected extension version, browser and operating-system versions,
reproduction steps, expected and actual behavior, impact, and any proof of
concept that is safe to share. Do not include real user data.

Maintainers will acknowledge and assess reports as availability permits. If a
report is confirmed, maintainers will coordinate remediation and disclosure
with the reporter. Please do not publish details before a fix or agreed
disclosure date is available.

For ordinary bugs and support requests, use
[GitHub Issues](https://github.com/getchunes/chunes-extension/issues).

## Scope notes

Chune ID communicates with the companion desktop app only through
`http://127.0.0.1:52846`. Reports involving a different process binding that
port, malformed `/tabs` handling, permission expansion, data leaving the local
machine, or remote-code execution are particularly useful. The project does
not currently offer a paid bug bounty or rewards program.
