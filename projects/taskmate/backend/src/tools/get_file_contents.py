import os
from .config import MAX_CHARS
from google.genai import types

schema_get_file_content = types.FunctionDeclaration(
    name="get_file_content",
    description="Get the contents of a file within the working directory, with truncation and error handling.",
    parameters=types.Schema(
        type="object",
        properties={
            "file_path": types.Schema(
                type=types.Type.STRING,
                description="The path to the file to read, relative to the working directory."
            ),
        },
    ),
)

def get_file_content(working_directory, file_path):
	abs_working_directory = os.path.abspath(working_directory)
	abs_file_path = os.path.abspath(os.path.join(abs_working_directory, file_path.lstrip("/")))
	if not abs_file_path.startswith(abs_working_directory):
		return f'Error: Cannot read "{file_path}" as it is outside the permitted working directory'
	if not os.path.isfile(abs_file_path):
		return f'Error: File not found or is not a regular file: "{file_path}"'
	try:
		with open(abs_file_path, "r", encoding="utf-8", errors="replace") as f:
			content = f.read(MAX_CHARS + 1)
		if len(content) >= MAX_CHARS:
			content = content[:MAX_CHARS] + f'\n[...File "{file_path}" truncated at {MAX_CHARS} characters]'
		return content
	except Exception as e:
		return f'Error: {str(e)}'
