---
description: Merge dev branch into current branch with intelligent conflict resolution
---

Merge the "dev" branch from origin into the current branch with smart conflict resolution.

> ⚠️ **CRITICAL SAFETY RULE**: This command NEVER auto-commits. All changes remain staged for manual review before committing.

This command will:
1. Fetch the latest dev branch from origin
2. Attempt to merge it into the current branch
3. Auto-resolve easy conflicts (lock files, generated files)
4. Present guided choices for complex conflicts in your custom files
5. Stage all changes but **NEVER auto-commit**
6. Run typecheck to verify the merge

## Steps

### 1. Pre-merge Safety Checks

Check working tree status and verify we're in a git repository:

!`git status`

!`git rev-parse --abbrev-ref HEAD`

### 2. Fetch Origin Dev

Fetch the latest dev branch:

!`git fetch origin dev`

### 3. Show Commits to Merge

Display what will be merged:

!`git log --oneline --no-decorate HEAD..origin/dev | head -20`

!`git log --oneline --no-decorate HEAD..origin/dev | wc -l`

### 4. Attempt Merge

Start the merge without committing:

!`git merge origin/dev --no-commit --no-ff`

### 5. Handle Conflicts

If there are conflicts, analyze and resolve them intelligently:

Check for conflicts:

!`git diff --name-only --diff-filter=U`

For each conflicting file, determine the resolution strategy:

**Auto-resolve these file types:**
- `bun.lock` - Take dev version (regenerate later)
- `package.json` - Merge dependencies manually
- `*.generated.ts` - Take dev version
- Lock files - Take dev version

**Guided resolution for your custom files:**
For files in `packages/app/*` and `packages/desktop/*` (your custom features), present options:

1. **Keep custom-dev** - Your version (preserves your features)
2. **Keep dev** - Upstream version (takes their changes)
3. **Keep both** - Attempt to combine (imports, separate functions)
4. **Manual edit** - Open editor to resolve

**To show conflict context:**

!`git diff HEAD...origin/dev -- <file>`

!`git diff origin/dev...HEAD -- <file>`

**To resolve with specific strategy:**

```bash
# Keep custom-dev version
git checkout --ours <file>
git add <file>

# Keep dev version
git checkout --theirs <file>
git add <file>

# Combine both versions (manual merge)
# Edit file to remove conflict markers and combine code
git add <file>
```

### 6. Post-Merge Verification

After resolving all conflicts, verify the merge:

Check for remaining conflicts:

!`git diff --name-only --diff-filter=U`

Stage all resolved files:

!`git add -A`

Run typecheck to verify:

!`bun typecheck`

If typecheck fails in specific packages:

!`cd packages/opencode && bun typecheck`

!`cd packages/app && bun typecheck`

### 7. Final Status

Show the final merge status:

!`git status`

!`git diff --staged --stat`

**Merge complete - changes are staged but NOT committed.**

You must manually commit when ready:
```bash
git commit -m "Merge branch 'dev' into $(git branch --show-current)"
```

## Important Notes

- > ☠️ **NEVER AUTO-COMMIT**: Changes remain staged for your review. You MUST manually run `git commit` yourself.
- **Manual intervention**: If the merge fails catastrophically, you can abort with `git merge --abort`
- **Guided choices**: For conflicts in your custom features, I'll ask you how to resolve them
- **Type checking**: The merge isn't considered complete until typecheck passes
- **Your features**: Your custom changes (Docker web, credentials, remote-only mode) are prioritized

## Conflict Resolution Guidance

When conflicts occur in your custom files, I'll explain:
1. What the dev branch changed (upstream feature/fix)
2. What your branch changed (your custom feature)
3. The conflicting sections
4. Proposed resolution strategies

You can choose to:
- Keep your implementation
- Take the upstream version
- Combine both (for imports, separate functions)
- Edit manually
