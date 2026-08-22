# Security Policy

## Supported Versions

Security fixes are currently provided for the latest version of the project.

| Version | Supported |
| ------- | --------- |
| Latest  | ✅ |
| Older   | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please do not publicly disclose it through a GitHub Issue, Discord message, or public discussion.

Instead, report it privately to the repository maintainer.

Include as much of the following information as possible:

- Description of the vulnerability
- Steps to reproduce
- Affected files or components
- Potential security impact
- Proof of concept, if available
- Suggested mitigation, if known

Please do not include real credentials, API keys, Discord bot tokens, passwords, or other secrets in the report.

## What to Report

Examples of security issues include:

- Authentication or authorization bypass
- Unauthorized access to the OpenCode workspace
- Arbitrary file access
- Arbitrary command execution
- Secret or credential exposure
- Prompt injection leading to unauthorized actions
- Path traversal
- Session isolation vulnerabilities
- OpenCode permission bypass
- Security issues involving model/tool execution

## Secret Handling

Never commit sensitive information to this repository.

This includes:

- `.env`
- Discord bot tokens
- API keys
- OAuth tokens
- Passwords
- SSH private keys
- Provider credentials

Use `.env.example` for configuration examples.

If a secret is accidentally committed, revoke or rotate it immediately. Removing the file from Git history does not invalidate an exposed credential.

## Security Boundaries

This project uses OpenCode as the coding agent.

The Discord bot provides an interface to OpenCode, while OpenCode is responsible for model interaction and tool execution.

Do not assume that Discord authorization alone provides filesystem isolation.

For production deployments:

- Use a dedicated workspace.
- Do not place sensitive files inside the agent workspace.
- Restrict OpenCode permissions where possible.
- Avoid exposing host-level credentials to the agent.
- Consider containerization or another isolation mechanism for untrusted workloads.

## Responsible Disclosure

Please allow reasonable time for a vulnerability to be investigated and addressed before publicly disclosing it.

Security reports made in good faith are appreciated.

## Scope

This policy applies to the code and configuration maintained in this repository.

Third-party services, OpenCode itself, Discord, Cohere, Google, hosting providers, and other external dependencies are outside the direct control of this project.

Security issues originating entirely from third-party services should be reported to the respective provider.