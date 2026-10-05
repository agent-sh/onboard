# onboard

This repo is the onboard plugin: a quick, code-grounded summary of an unfamiliar codebase for developers new to it, followed by an interactive tour. Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem; skills follow https://agentskills.io.

## Rules

- Output is plain text: no emojis or ASCII art. Status markers are `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]`.
- Commit only product files. Summaries, plans and audit notes belong in the PR or the conversation.
- A change is done when its tests pass; a feature or fix comes with a test that covers it.
- Non-trivial changes go through a PR, not a direct push to main. Run the git hooks; do not bypass them.
- In prose use ` - ` (single dash with spaces), not ` -- `.
- If a script fails, report the failure before doing the step by hand, so broken tooling gets fixed.
- Agent models: Opus for complex reasoning and planning, Sonnet for validation and most agents, Haiku for mechanical work.
- Priorities, in order: plugin users' experience, automation that needs no babysitting, token efficiency, output quality, simplicity.

## Layout

- `commands/onboard.md`: the `/onboard` command ("what is this project?").
- `skills/onboard/SKILL.md`: the skill.
- `agents/onboard-agent.md`: the Sonnet agent that writes the summary and runs the tour.
- `scripts/collect.js`: deterministic data collection; writes `<stateDir>/onboard-data.json`.
- `lib/collector.js` and `lib/agentsys.js`: the collector and the resolver for the agentsys install.

## Checks

```bash
npm test   # collector and resolver tests
agnix .    # agent config lint
```

User-visible changes get a CHANGELOG entry under `[Unreleased]`.
