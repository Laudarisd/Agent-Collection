import os
import subprocess
import sys
from typing import List
from google.genai import types

def run_python_file(working_directory, file_path, args: List[str] = []):
    """
    Executes a Python file within the specified working_directory, with argument support and safety checks.
    Returns formatted stdout/stderr or error messages.
    """
    abs_working_directory = os.path.abspath(working_directory)
    abs_file_path = os.path.abspath(os.path.join(abs_working_directory, file_path.lstrip("/")))
    if not abs_file_path.startswith(abs_working_directory):
        return f'Error: Cannot execute "{file_path}" as it is outside the permitted working directory'
    if not os.path.isfile(abs_file_path):
        return f'Error: File "{file_path}" not found.'
    if not abs_file_path.endswith(".py"):
        return f'Error: "{file_path}" is not a Python file.'
    try:
        output = subprocess.run(
            [sys.executable, abs_file_path] + args,
            capture_output=True,
            text=True,
            cwd=abs_working_directory,
            timeout=30
        )
        result = (
            f"STDOUT:\n{output.stdout}"
            f"\nSTDERR:\n{output.stderr}"
            f"\nReturn Code: {output.returncode}"
        )
        if output.stdout == "" and output.stderr == "":
            return f'File "{file_path}" executed with no output.\nReturn Code: {output.returncode}'
        if output.returncode != 0:
            return f'Error executing file (code {output.returncode}):\n{result}'
        return result
    except Exception as e:


        return f'Error: Failed to execute file "{file_path}": {type(e).__name__}: {e}'
    

schema_run_python_file = types.FunctionDeclaration(
    name="run_python_file",
    description="Execute a Python file within the working directory, with optional arguments.",
    parameters=types.Schema(
        type="object",
        properties={
            "file_path": types.Schema(
                type=types.Type.STRING,
                description="The path to the Python file to execute, relative to the working directory.",
            ),
            "args": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(type=types.Type.STRING),
                description="A list of string arguments to pass to the Python file.",
            ),
        },
    ),
)