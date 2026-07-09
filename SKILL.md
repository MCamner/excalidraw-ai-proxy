---
name: create-skill
description: "Guide the user through creating a reusable SKILL.md file for this workspace."
argument-hint: "Describe the workflow or outcome the new skill should produce."
disable-model-invocation: true
---

Use this skill when the user wants a new `SKILL.md` file for the current repository. It should help capture a real workflow, turn it into a reusable workspace skill, and save the resulting customization in the repo.

Steps:
1. Confirm the outcome: what should the skill produce, who is the audience, and what success looks like.
2. Capture the workflow: list concrete steps, decision points, branches, and validation checks.
3. Draft the skill structure: include purpose, inputs, workflow, branching logic, and completion criteria.
4. Review the draft: ensure it is actionable, workspace-scoped, and clearly written.
5. Save the file: write `SKILL.md` to the repo root or the repo's preferred customization location.

When writing the SKILL.md file, include:
- Purpose: what problem the skill solves.
- Inputs: expected user prompt or arguments.
- Workflow: ordered tasks with clear steps.
- Branching logic: alternate paths for different conditions.
- Completion criteria: how to know the work is done.

Example prompts:
- "Create a new SKILL.md for building and testing the proxy service."
- "Generate a workspace skill for standardizing README updates."
- "Help me write a SKILL.md that guides contributors through repo setup."

Next customization ideas:
- Add a follow-up skill that scaffolds workspace-specific prompt or `agent-customization` files.
- Create a skill that converts a checklist into a reusable prompt template.
