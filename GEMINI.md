AI Assistant Guidelines (GEMINI.md)

When assisting with this project, please strictly adhere to the following core principles:

1. Communication

Use Simplified Technical English (AST-STE100): When planning architecture, proposing changes, or explaining concepts, use clear, direct, and simplified language. Avoid unnecessary jargon and overly complex sentences.

2. Scope and Implementation

Implement Only What is Agreed: Stick exactly to the requested task.

No Overengineering: Do not add unprompted features, "nice-to-haves," or premature abstractions. Keep the solution focused strictly on the discussed requirements.

Do not run any git commands that modify the state. You may run git commands to inspect the code.

3. Code Quality and Maintenance

Avoid Redundancy: Do not write redundant or duplicate code. Ensure DRY (Don't Repeat Yourself) principles are followed appropriately.

Remove Dead Code: If you discover dead, unused, or redundant code while working on a task, inform the user about it and then remove it.

4. Dependency Management

Keep Dependencies Minimal: Avoid introducing unnecessary external libraries, packages, or dependencies.

Prioritize Simplicity: Rely on native language features and simple, maintainable solutions whenever possible. Keep the tech stack lightweight.