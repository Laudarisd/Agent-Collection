import os
from google.genai import types



def write_file(working_directory, file_path, content):
    """
    Write or overwrite a file within the working_directory.
    Ensures file_path is scoped to working_directory, creates parent directories if needed.
    Returns a success message or an error string.
    """
    abs_working_directory = os.path.abspath(working_directory)
    abs_file_path = os.path.abspath(os.path.join(abs_working_directory, file_path.lstrip("/")))
    if not abs_file_path.startswith(abs_working_directory):
        return f'Error: Cannot write to "{file_path}" as it is outside the permitted working directory'
    
    parent_directory = os.path.dirname(abs_file_path)
    if parent_directory and not os.path.exists(parent_directory):
        try:
            os.makedirs(parent_directory, exist_ok=True)
        except Exception as e:
            return f'Error: Failed to create directory "{parent_directory}": {type(e).__name__}: {e}'
    
    try:
        with open(abs_file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f'Successfully wrote to "{file_path}" ({len(content)} characters written)'
    except Exception as e:
        return f'Error: Failed to write file "{file_path}": {type(e).__name__}: {e}'

schema_write_file = types.FunctionDeclaration(
    name="write_file",
    description="Write or overwrite a file within the working directory. Creates the file if it does not exist.",
    parameters=types.Schema(
        type="object",
        properties={
            "file_path": types.Schema(
                type=types.Type.STRING,
                description="The path to the file to write, relative to the working directory."
            ),
            "content": types.Schema(
                type=types.Type.STRING,
                description="The content to write to the file."
            ),
        },
    ),
)