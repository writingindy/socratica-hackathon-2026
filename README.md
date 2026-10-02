# socratica-hackathon-2026

Project demos for the Socratica Hackathon. Each folder is one project and runs on its own.

## Projects

| Project | What it is | Run it | Port |
|---|---|---|---|
| [grandmas-till](grandmas-till/) | A bakery point-of-sale: a counter screen for Grandma and a self-order screen for customers, on one database | `cd grandmas-till && node server.js` | 3000 |

## Get started

```bash
git clone https://github.com/writingindy/socratica-hackathon-2026.git
cd socratica-hackathon-2026
```

Then follow the README inside the project you're working on.

## House rules

1. **Each project stands alone.** Nothing reaches into another project's folder. Add a `shared/` folder only when two projects actually need the same code.
2. **One repository.** Don't run `git init` inside a project folder; everything is committed from here.
3. **One port per project**, so demos can run side by side. Pick the next free port in the table above when you add a project.
4. **Deploying:** point the host's "Root Directory" setting at the project's folder.
5. **Branch names start with the project**, e.g. `till/forecast-tweak`.

## Adding a project

1. Make a new top-level folder with its own README, `package.json` (or equivalent) and `.gitignore`.
2. Add a row to the table above.
3. Commit and push.
