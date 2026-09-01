# Syncing Upstream Changes Guide

This guide explains how to keep this repository (**Zero To AI**) in sync with the upstream parent repository (`https://github.com/ArnasDon/wacrm.git`) while preserving our branding and custom configuration.

---

## 1. Prerequisites & Remotes Setup

Ensure your git remotes are properly configured:

```bash
git remote -v
```

You should see both `origin` and `upstream`:

```text
origin    https://github.com/zerotoaiyourwerbung-bit/wacrm.git (fetch)
origin    https://github.com/zerotoaiyourwerbung-bit/wacrm.git (push)
upstream  https://github.com/ArnasDon/wacrm.git (fetch)
upstream  https://github.com/ArnasDon/wacrm.git (push)
```

If `upstream` is missing on any machine, add it with:

```bash
git remote add upstream https://github.com/ArnasDon/wacrm.git
```

---

## 2. Syncing Workflow (Step-by-Step)

### Step 1: Fetch Latest Changes from Upstream

Fetch all commits and branches from the parent repository without changing your working directory:

```bash
git fetch upstream
```

### Step 2: Inspect Incoming Changes

Inspect the list of commits available upstream that are not yet in your local branch:

```bash
git log HEAD..upstream/main --oneline
```

To see a summary of modified files:

```bash
git diff --stat HEAD..upstream/main
```

### Step 3: Merge Upstream into `main`

Ensure your local branch is clean and on `main`:

```bash
git checkout main
git pull origin main
git merge upstream/main
```

---

## 3. Resolving Conflicts & Preserving Branding

Because our repository is rebranded to **Zero To AI**, git may occasionally flag conflicts if upstream edits lines that we customized.

### Key Files to Watch During Conflicts:

1. **`src/app/layout.tsx`**
   - Retain `<title>` and metadata as **Zero To AI**.
2. **`messages/en.json` & `messages/ko.json`**
   - Retain sidebar titles and customer-facing strings with **Zero To AI**.
3. **`package.json` & `mcp-server/package.json`**
   - Retain repository links (`zerotoaiyourwerbung-bit/wacrm`), homepage (`https://zerotoai.in`), and description.
4. **`README.md` & `docs/`**
   - Retain **Zero To AI** branding, links to `https://zerotoai.in`, and setup notes.

### Resolving and Finalizing Merge:

Once any conflicting files are inspected and resolved:

```bash
git add .
git commit -m "merge: sync updates from upstream parent repo"
```

---

## 4. Applying New Database Migrations

Whenever upstream introduces new features or schema improvements, new SQL files are added to `supabase/migrations/`.

Check if any migrations were added during the sync:

```bash
git diff HEAD~1 --name-only supabase/migrations/
```

If new `.sql` migration files appear:
1. Open your Supabase Dashboard for your project.
2. Go to the **SQL Editor**.
3. Run the new migration script(s) in sequential order.
4. Verify that tables, columns, or RLS policies applied cleanly.

---

## 5. Push Updates to GitHub Fork

After verifying tests and local dev (`npm run dev`):

```bash
git push origin main
```

---

## Alternative: Using the GitHub UI ("Sync fork")

You can also use GitHub's web interface:
1. Navigate to [github.com/zerotoaiyourwerbung-bit/wacrm](https://github.com/zerotoaiyourwerbung-bit/wacrm).
2. Click the **Sync fork** button and select **Update branch**.
3. Pull the updated branch to your local workspace:
   ```bash
   git checkout main
   git pull origin main
   ```
4. If merge conflicts arise, resolve them locally as described above.
