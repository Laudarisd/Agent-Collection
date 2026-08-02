import os
import re
import difflib
from pathlib import Path

class AgentUtils:
    def __init__(self, max_context_files=5, max_file_size=2000):
        self.max_context_files = max_context_files
        self.max_file_size = max_file_size
    
    def discover_relevant_files(self, user_prompt):
        """Smart discovery of relevant files based on user prompt"""
        relevant_files = {}
        
        # 1. Direct file/directory mentions
        mentioned_files = self._extract_file_mentions(user_prompt)
        
        # 2. Find actual files that match mentions
        for mention in mentioned_files:
            matches = self._find_matching_files(mention)
            for match in matches[:2]:  # Limit to 2 matches per mention
                if len(relevant_files) >= self.max_context_files:
                    break
                content = self._read_file_safely(match)
                if content:
                    relevant_files[match] = content
        
        # 3. If no specific files found, but prompt suggests directory work
        if not relevant_files:
            directory_hints = self._detect_directory_context(user_prompt)
            for dir_hint in directory_hints:
                if os.path.isdir(dir_hint):
                    files = self._get_key_files_from_directory(dir_hint)
                    for file in files[:self.max_context_files]:
                        content = self._read_file_safely(file)
                        if content:
                            relevant_files[file] = content
                    break
        
        return relevant_files
    
    def _extract_file_mentions(self, text):
        """Extract potential file/directory mentions from text"""
        mentions = set()
        
        # Common patterns for file mentions
        patterns = [
            r'\b(\w+\.py)\b',           # filename.py
            r'\b(\w+/[\w/]*)\b',        # directory/path
            r'\b(in \w+)\b',            # "in calculator"
            r'\b(\w+\.txt|\.json|\.md)\b',  # other extensions
            r'"([^"]+\.[a-zA-Z]+)"',    # quoted filenames
            r"'([^']+\.[a-zA-Z]+)'",    # quoted filenames
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                clean_match = match.replace('in ', '').strip()
                if clean_match:
                    mentions.add(clean_match)
        
        return list(mentions)
    
    def _find_matching_files(self, mention):
        """Find actual files that match a mention (with fuzzy matching)"""
        matches = []
        
        # Direct path check
        if os.path.exists(mention):
            if os.path.isfile(mention):
                matches.append(mention)
            elif os.path.isdir(mention):
                # Get main files from directory
                matches.extend(self._get_key_files_from_directory(mention))
        else:
            # Fuzzy search
            all_files = []
            for root, dirs, files in os.walk('.'):
                # Skip hidden directories and common ignore patterns
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['__pycache__', 'node_modules']]
                for file in files:
                    if not file.startswith('.') and file.endswith(('.py', '.txt', '.md', '.json')):
                        all_files.append(os.path.join(root, file))
            
            # Find close matches
            file_basenames = [os.path.basename(f) for f in all_files]
            close_matches = difflib.get_close_matches(mention, file_basenames, n=3, cutoff=0.6)
            
            for close_match in close_matches:
                for full_path in all_files:
                    if os.path.basename(full_path) == close_match:
                        matches.append(full_path)
                        break
        
        return matches
    
    def _detect_directory_context(self, text):
        """Detect if user is referring to a specific project/directory"""
        hints = []
        
        # Look for project-like words
        project_words = ['calculator', 'app', 'project', 'src', 'lib', 'main', 'core']
        for word in project_words:
            if word in text.lower():
                if os.path.isdir(word):
                    hints.append(word)
        
        # Check current directory if no specific hints
        if not hints:
            hints.append('.')
        
        return hints
    
    def _get_key_files_from_directory(self, directory):
        """Get the most important files from a directory"""
        key_files = []
        
        # Priority order for file discovery
        priority_names = ['main.py', '__init__.py', 'app.py', 'run.py', 'index.py']
        
        # First, look for priority files
        for priority in priority_names:
            file_path = os.path.join(directory, priority)
            if os.path.isfile(file_path):
                key_files.append(file_path)
        
        # Then add other Python files (limited)
        try:
            all_files = []
            for root, dirs, files in os.walk(directory):
                # Skip hidden directories
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    if file.endswith('.py') and not file.startswith('.'):
                        full_path = os.path.join(root, file)
                        if full_path not in key_files:
                            all_files.append(full_path)
            
            # Sort by file size (smaller first, likely more important)
            all_files.sort(key=lambda f: os.path.getsize(f) if os.path.exists(f) else 0)
            key_files.extend(all_files[:3])  # Add top 3
            
        except Exception as e:
            print(f"Warning: Could not scan directory {directory}: {e}")
        
        return key_files
    
    def _read_file_safely(self, file_path):
        """Read file with size limits and error handling"""
        try:
            if not os.path.isfile(file_path):
                return None
            
            # Check file size
            file_size = os.path.getsize(file_path)
            if file_size > 50000:  # Skip very large files
                return f"[File too large: {file_size} bytes]"
            
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read(self.max_file_size + 1)
            
            if len(content) > self.max_file_size:
                content = content[:self.max_file_size] + f'\n... [truncated at {self.max_file_size} chars]'
            
            return content
            
        except Exception as e:
            return f"[Error reading file: {e}]"
    
    def extract_file_references(self, text):
        """Extract file references from error messages or text"""
        references = []
        
        # Common error patterns
        patterns = [
            r'File "([^"]+)"',
            r"File '([^']+)'",
            r'in file (\S+)',
            r'(\S+\.py):\d+',  # filename:line_number
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            references.extend(matches)
        
        return list(set(references))  # Remove duplicates