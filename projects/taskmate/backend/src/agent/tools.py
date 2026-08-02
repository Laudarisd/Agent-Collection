from google.genai import types
from ..tools.get_files_info import get_files_info
from ..tools.get_file_contents import get_file_content
from ..tools.write_file import write_file
from ..tools.run_python_file import run_python_file
import os
import glob
import difflib
from pathlib import Path

WORKING_DIRECTORY = "calculator"  # Keep your original hardcoded value

function_map = {
    "get_files_info": get_files_info,
    "get_file_content": get_file_content,
    "write_file": write_file,
    "run_python_file": run_python_file,
}

def smart_file_search(filename, working_directory=WORKING_DIRECTORY, max_matches=3):
    """
    Enhanced file search with fuzzy matching and priority scoring
    """
    if not isinstance(filename, str):
        return filename
    
    # If it's already a valid path, return it
    full_path = os.path.join(working_directory, filename)
    if os.path.exists(full_path):
        return filename
    
    matches = []
    
    # 1. Exact filename search in all subdirectories
    if "/" not in filename:
        exact_matches = glob.glob(os.path.join(working_directory, "**", filename), recursive=True)
        for match in exact_matches:
            rel_path = os.path.relpath(match, working_directory)
            matches.append((rel_path, 1.0, "exact"))
    
    # 2. Fuzzy search if no exact matches
    if not matches:
        all_files = []
        for root, dirs, files in os.walk(working_directory):
            # Skip hidden directories and common ignore patterns
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['__pycache__', 'node_modules']]
            for file in files:
                if not file.startswith('.'):
                    full_file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_file_path, working_directory)
                    all_files.append((rel_path, file))
        
        # Get close matches for just the filename
        base_filename = os.path.basename(filename)
        file_basenames = [f[1] for f in all_files]
        close_matches = difflib.get_close_matches(base_filename, file_basenames, n=max_matches, cutoff=0.6)
        
        for close_match in close_matches:
            for rel_path, basename in all_files:
                if basename == close_match:
                    similarity = difflib.SequenceMatcher(None, base_filename, close_match).ratio()
                    matches.append((rel_path, similarity, "fuzzy"))
                    break
    
    # 3. Sort by priority: exact matches first, then by similarity
    matches.sort(key=lambda x: (x[2] == "exact", x[1]), reverse=True)
    
    if matches:
        best_match = matches[0][0]
        return best_match
    
    return filename  # Return original if no matches found

def resolve_file_path(filename, working_directory=WORKING_DIRECTORY):
    """
    Enhanced file resolution with smart search capabilities
    """
    return smart_file_search(filename, working_directory)

def normalize_path_arg(arg, working_directory=WORKING_DIRECTORY):
    """
    Enhanced path normalization with better handling of edge cases
    """
    if not isinstance(arg, str):
        return arg
    
    # Handle empty or just whitespace
    arg = arg.strip()
    if not arg:
        return "."
    
    # Handle different representations of working directory
    working_dir_variations = [
        working_directory,
        f"./{working_directory}",
        f"{working_directory}/",
        os.path.abspath(working_directory)
    ]
    
    for variation in working_dir_variations:
        if arg == variation:
            return "."
        if arg.startswith(variation + "/"):
            return arg[len(variation) + 1:]
        if arg.startswith(variation + os.sep):
            return arg[len(variation) + 1:]
    
    # Handle relative paths that go outside working directory
    if arg.startswith("../"):
        return arg  # Let the function handle the security check
    
    return arg

def validate_and_enhance_args(function_name, args, working_directory=WORKING_DIRECTORY):
    """
    Validate and enhance function arguments based on function type
    """
    enhanced_args = args.copy()
    enhanced_args["working_directory"] = working_directory
    
    # Function-specific argument processing
    if function_name == "get_files_info":
        if "directory" in enhanced_args:
            enhanced_args["directory"] = normalize_path_arg(enhanced_args["directory"])
        else:
            enhanced_args["directory"] = "."  # This will scan inside calculator/
    
    elif function_name in ["get_file_content", "write_file"]:
        if "file_path" in enhanced_args:
            normalized = normalize_path_arg(enhanced_args["file_path"])
            enhanced_args["file_path"] = resolve_file_path(normalized)
    
    elif function_name == "run_python_file":
        if "file_path" in enhanced_args:
            normalized = normalize_path_arg(enhanced_args["file_path"])
            resolved = resolve_file_path(normalized)
            # Ensure it's a Python file
            if not resolved.endswith('.py'):
                # Try adding .py extension
                py_version = resolve_file_path(normalized + '.py')
                if py_version != (normalized + '.py'):  # If found something different
                    resolved = py_version
            enhanced_args["file_path"] = resolved
        
        # Ensure args is a list
        if "args" not in enhanced_args:
            enhanced_args["args"] = []
        elif not isinstance(enhanced_args["args"], list):
            enhanced_args["args"] = [str(enhanced_args["args"])]
    
    return enhanced_args

def format_function_result(function_name, result, success=True):
    """
    Format function results consistently
    """
    if success:
        return types.Content(
            role="tool",
            parts=[
                types.Part.from_function_response(
                    name=function_name,
                    response={"result": result},
                )
            ],
        )
    else:
        return types.Content(
            role="tool",
            parts=[
                types.Part.from_function_response(
                    name=function_name,
                    response={"error": result},
                )
            ],
        )

def call_function(function_call_part, verbose=False):
    """
    Enhanced function caller with smart file resolution and better error handling
    """
    function_name = function_call_part.name
    raw_args = dict(function_call_part.args) if function_call_part.args else {}
    
    # Validate and enhance arguments
    try:
        args = validate_and_enhance_args(function_name, raw_args, WORKING_DIRECTORY)
    except Exception as e:
        if verbose:
            print(f"Error processing arguments for {function_name}: {e}")
        return format_function_result(function_name, f"Argument processing error: {e}", success=False)
    
    # Log function call
    if verbose:
        print(f"Calling function: {function_name}")
        print(f"  Raw args: {raw_args}")
        print(f"  Enhanced args: {args}")
        if 'file_path' in args and 'file_path' in raw_args:
            if args['file_path'] != raw_args['file_path']:
                print(f"  File path resolved: '{raw_args['file_path']}' → '{args['file_path']}'")
    else:
        print(f" - Calling function: {function_name}", end="")
        if 'file_path' in args and 'file_path' in raw_args:
            if args['file_path'] != raw_args['file_path']:
                print(f" (resolved: {args['file_path']})")
            else:
                print()
        else:
            print()
    
    # Get and call the function
    func = function_map.get(function_name)
    if not func:
        error_msg = f"Unknown function: {function_name}"
        if verbose:
            print(f"Error: {error_msg}")
        return format_function_result(function_name, error_msg, success=False)
    
    # Execute function with error handling
    try:
        result = func(**args)
        
        # Post-process result if needed
        if function_name == "get_files_info" and isinstance(result, str):
            # Add working directory info for context
            if not result.startswith("Error") and not result.startswith("Directory"):
                result = f"Contents of '{args.get('directory', '.')}' in working directory '{WORKING_DIRECTORY}':\n{result}"
        
        if verbose:
            print(f"Function result: {result}")
        
        return format_function_result(function_name, result, success=True)
        
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        if verbose:
            print(f"Error executing {function_name}: {error_msg}")
        return format_function_result(function_name, error_msg, success=False)

# Utility function for getting current working directory info
def get_current_context():
    """Get current working directory context for debugging"""
    return {
        "working_directory": WORKING_DIRECTORY,
        "absolute_path": os.path.abspath(WORKING_DIRECTORY),
        "exists": os.path.exists(WORKING_DIRECTORY),
        "is_directory": os.path.isdir(WORKING_DIRECTORY),
        "contents": os.listdir(WORKING_DIRECTORY) if os.path.isdir(WORKING_DIRECTORY) else None
    }
