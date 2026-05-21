import os
import re

src_dir = 'src'

# Map old module names (without extension) -> new directory prefix (relative to lib/)
old_to_new = {
    # Core
    'alerts': 'lib/core',
    'auth-context': 'lib/core',
    'format-currency': 'lib/core',
    'insforge': 'lib/core',
    'query-client': 'lib/core',
    'query-keys': 'lib/core',
    'utils': 'lib/core',
    'validations': 'lib/core',
    # Hooks (barrel stays at lib/hooks/index.ts, imports of 'lib/hooks' still work)
    # Services
    'audit.service': 'lib/services',
    'circuit-breaker': 'lib/services',
    'csv-export': 'lib/services',
    'db-cleanup': 'lib/services',
    'deployment-check': 'lib/services',
    'feature-flags': 'lib/services',
    'kitchen-sound': 'lib/services',
    'logger': 'lib/services',
    'mutation-queue': 'lib/services',
    'observation': 'lib/services',
    'queue-db': 'lib/services',
    'queue-leader': 'lib/services',
    'realtime': 'lib/services',
    'release-channels': 'lib/services',
    'reports': 'lib/services',
    'security-monitor': 'lib/services',
    'sentry': 'lib/services',
    'sync': 'lib/services',
    'table-sessions': 'lib/services',
    'telemetry': 'lib/services',
    'upload': 'lib/services',
}

def fix_import_path(match):
    full = match.group(0)
    path = match.group(1)
    
    if 'lib/' not in path:
        return full
    
    # Find 'lib/' in the path
    idx = path.index('lib/')
    before_lib = path[:idx]
    after_lib = path[idx:]  # e.g. 'lib/hooks' or 'lib/insforge'
    
    # Extract module name (first segment after lib/)
    rest = after_lib[4:]  # after 'lib/'
    if '/' in rest:
        module = rest.split('/')[0]
    else:
        module = rest
    
    # Remove .ts or .tsx extension if present for matching
    mod_key = module.replace('.tsx', '').replace('.ts', '')
    
    if mod_key in old_to_new:
        new_prefix = old_to_new[mod_key]
        # Replace 'lib/module' with 'lib/core/module' or 'lib/services/module'
        new_path = before_lib + new_prefix + '/' + module
        if module.endswith('.ts') or module.endswith('.tsx'):
            new_path = before_lib + new_prefix + '/' + module
        else:
            new_path = before_lib + new_prefix + '/' + module
        return full.replace(path, new_path)
    
    return full

for root, dirs, files in os.walk(src_dir):
    for fname in files:
        if not (fname.endswith('.ts') or fname.endswith('.tsx')):
            continue
        fpath = os.path.join(root, fname)
        
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        
        content = re.sub(
            r"""from\s+['"]([^'"]*)['"]""",
            fix_import_path,
            content
        )
        
        if content != original:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Fixed: {fpath}')

print('\nDone updating imports')
