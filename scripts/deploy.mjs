// Build the site and force-push dist/ to the gh-pages branch, which GitHub Pages serves.
// Usage: npm run deploy
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd });
const out = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

const remote = out('git remote get-url origin');
const sha = out('git rev-parse --short HEAD');
run('npm run build');
writeFileSync('dist/.nojekyll', '');
rmSync('dist/.git', { recursive: true, force: true });  // Vite keeps .git when it empties dist/
run('git init -q -b gh-pages', 'dist');
run('git add -A', 'dist');
run(`git -c user.name="deploy" -c user.email="deploy@localhost" commit -q -m "Deploy ${sha}"`, 'dist');
run(`git push -f -q ${remote} gh-pages`, 'dist');
console.log('Deployed ' + sha + ' to gh-pages');
