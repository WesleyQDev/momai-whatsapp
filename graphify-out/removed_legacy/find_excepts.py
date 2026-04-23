import os
import re

def find_empty_excepts(directory):
    # Regex to match except blocks that only have pass (and maybe comments)
    # This matches:
    # except...:
    #     pass
    pattern = re.compile(r'except(?P<exc>.*):[ \t]*\n[ \t]*pass[ \t]*(\n|$)', re.MULTILINE)
    results = []
    
    # Also match single line like "except: pass"
    single_line_pattern = re.compile(r'except.*:[ \t]*pass[ \t]*(\n|$)')

    for root, dirs, files in os.walk(directory):
        # Normalize path for comparison
        parts = root.split(os.sep)
        if any(d in parts for d in ['.venv', 'venv', '.git', '__pycache__', 'node_modules', 'bin']):
            continue
        # Also skip if it seems to be a bundled python lib
        if 'Lib' in parts and ('apps' in parts or 'desktop' in parts):
            continue
            
            
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                        # Find multi-line
                        for match in pattern.finditer(content):
                            line_no = content.count('\n', 0, match.start()) + 1
                            results.append({"file": path, "line": line_no, "content": match.group(0).strip()})
                            
                        # Find single-line (avoid overlapping if possible, but regexes are different)
                        for match in single_line_pattern.finditer(content):
                            # Check if it was already found (unlikely to have both with same start but possible)
                            line_no = content.count('\n', 0, match.start()) + 1
                            # Simple deduplication based on line number
                            if not any(r['file'] == path and r['line'] == line_no for r in results):
                                results.append({"file": path, "line": line_no, "content": match.group(0).strip()})
                                
                except Exception as e:
                    # print(f"Error reading {path}: {e}")
                    pass
    return results

if __name__ == "__main__":
    found = find_empty_excepts(".")
    import json
    with open("excepts_list.json", "w", encoding="utf-8") as f:
        json.dump(found, f, indent=2)
    print(f"Found {len(found)} empty except blocks. Results saved to excepts_list.json")
