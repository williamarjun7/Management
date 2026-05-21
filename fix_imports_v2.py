import os
import re

# Map old relative path -> correct new relative path for files that moved
# These are keyed by the file that moved, mapping its old import paths to new ones
file_fixes = {}

# For files in src/components/rooms/ (moved from src/modules/motel/rooms/)
# Old depth: 3 levels up (../../../)
# New depth: 2 levels up (../../)
# So all relative imports go from ../../../ to ../../
rooms_files = [
    'src/components/rooms/room.utils.ts',
    'src/components/rooms/RoomCard.tsx',
    'src/components/rooms/RoomDetailModal.tsx',
    'src/components/rooms/RoomFilters.tsx',
    'src/components/rooms/RoomGrid.tsx',
    'src/components/rooms/RoomList.tsx',
    'src/components/rooms/index.ts',
]

# For files in src/components/tables/ (moved from src/modules/restaurant/tables/)
tables_files = [
    'src/components/tables/table.service.ts',
    'src/components/tables/TableCard.tsx',
    'src/components/tables/TableGrid.tsx',
]

# For __tests__ files inside lib/core/__tests__ (moved from lib/__tests__)
test_dir = 'src/lib/core/__tests__'
test_files = []
for root, dirs, files in os.walk(test_dir):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            test_files.append(os.path.join(root, f).replace('\\', '/'))

# For lib internal files (core, hooks, services)
for root, dirs, files in os.walk('src/lib'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            filepath = os.path.join(root, f).replace('\\', '/')
            if filepath not in rooms_files and filepath not in tables_files and filepath not in test_files:
                # Only process lib files (not in test files)
                if filepath.startswith('src/lib/') and '__tests__' not in filepath:
                    pass  # will handle below

def fix_relative_imports(filepath, content):
    """Fix relative imports based on the file's new location"""
    
    # Determine the directory of this file
    dir_path = os.path.dirname(filepath).replace('\\', '/')
    
    # Calculate depth from src/
    rel_to_src = os.path.relpath('src', dir_path).replace('\\', '/') if dir_path != 'src' else '.'
    
    def replace_import(match):
        full = match.group(0)
        path = match.group(1)
        
        # Only handle relative imports
        if not path.startswith('../') and not path.startswith('./'):
            return full
        
        # Resolve the import path relative to the file's directory
        # dir_path is like 'src/components/rooms'
        # import path is like '../../types'
        # We need to resolve it to the actual module
        
        # First resolve to absolute (relative to src/)
        segments = dir_path.split('/')
        import_parts = path.split('/')
        
        # Strip leading ../
        while import_parts and import_parts[0] == '..':
            if segments:
                segments.pop()
            import_parts.pop(0)
        
        # Handle ./
        if import_parts and import_parts[0] == '.':
            import_parts.pop(0)
        
        # Now segments + import_parts gives the absolute path relative to project root
        resolved_path = '/'.join(segments + import_parts)
        
        # The original import was for this resolved path
        # Now check if that resolved path has moved
        # We need to know the actual file on disk
        
        # Check possible file extensions
        possible_paths = [
            resolved_path + '.ts',
            resolved_path + '.tsx',
            resolved_path + '/index.ts',
        ]
        
        actual_path = None
        for pp in possible_paths:
            if os.path.exists(pp):
                actual_path = pp
                break
        
        if actual_path:
            # This module exists - compute new relative path from current file
            new_rel = os.path.relpath(actual_path, dir_path).replace('\\', '/')
            # Remove extension for import
            new_rel_no_ext = re.sub(r'\.(ts|tsx)$', '', new_rel)
            return full.replace(path, new_rel_no_ext)
        
        return full
    
    return re.sub(r"""from\s+['"]([^'"]*)['"]""", replace_import, content)


def fix_test_imports(filepath, content):
    """Test files moved from lib/__tests__/ to lib/core/__tests__/
    Old relative depth: ../../  (from lib/__tests__/ -> lib/)
    New relative depth: ../../  (from lib/core/__tests__/ -> lib/core/)
    
    But files they import from (mutation-queue, queue-db, etc.) moved to lib/services/
    So we need to go from lib/core/__tests__/ up to lib/, then into services/
    """
    dir_path = os.path.dirname(filepath).replace('\\', '/')
    rel_to_src = os.path.relpath('src', dir_path).replace('\\', '/')
    
    def replace_import(match):
        full = match.group(0)
        path = match.group(1)
        
        if not path.startswith('../') and not path.startswith('./'):
            return full
        
        segments = dir_path.split('/')
        import_parts = path.split('/')
        
        while import_parts and import_parts[0] == '..':
            if segments:
                segments.pop()
            import_parts.pop(0)
        if import_parts and import_parts[0] == '.':
            import_parts.pop(0)
        
        resolved_path = '/'.join(segments + import_parts)
        
        possible_paths = [
            resolved_path + '.ts',
            resolved_path + '.tsx',
            resolved_path + '/index.ts',
        ]
        
        actual_path = None
        for pp in possible_paths:
            if os.path.exists(pp):
                actual_path = pp
                break
        
        if actual_path:
            new_rel = os.path.relpath(actual_path, dir_path).replace('\\', '/')
            new_rel_no_ext = re.sub(r'\.(ts|tsx)$', '', new_rel)
            return full.replace(path, new_rel_no_ext)
        
        return full
    
    return re.sub(r"""from\s+['"]([^'"]*)['"]""", replace_import, content)


# Fix rooms files
for fp in rooms_files:
    if os.path.exists(fp):
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        original = content
        content = fix_relative_imports(fp, content)
        if content != original:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Fixed: {fp}')

# Fix tables files
for fp in tables_files:
    if os.path.exists(fp):
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        original = content
        content = fix_relative_imports(fp, content)
        if content != original:
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Fixed: {fp}')

# Fix test files
for fp in test_files:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    content = fix_test_imports(fp, content)
    if content != original:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed: {fp}')

# Fix lib internal files (core, hooks, services)
lib_internal_files = []
for root, dirs, files in os.walk('src/lib'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            fp = os.path.join(root, f).replace('\\', '/')
            if '__tests__' not in fp:
                lib_internal_files.append(fp)

for fp in lib_internal_files:
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    # First try to fix all relative imports by resolving them
    content = fix_relative_imports(fp, content)
    # Also fix 'lib/' absolute-style imports that the first script handled
    # (for imports like '../core/insforge' from services/ etc.)
    if content != original:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed: {fp}')

print('\nDone fixing imports v2')
