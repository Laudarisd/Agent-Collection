from google.genai import types
import os


def get_files_info(working_directory, directory="."):
    abs_working_directory = os.path.abspath(working_directory)
    abs_directory = os.path.abspath(os.path.join(abs_working_directory, directory.lstrip("/")))
    if not abs_directory.startswith(abs_working_directory):
        return f"Directory is outside the working directory: {directory}"

    final_response = ""
    try:
        contents = os.listdir(abs_directory)
    except FileNotFoundError:
        return f"Directory not found: {abs_directory}"
    for content in contents:
        content_path = os.path.join(abs_directory, content)
        is_dir = os.path.isdir(content_path)
        size = os.path.getsize(content_path) if not is_dir else 0
        final_response += f"{content} - {'Directory' if is_dir else 'File'} - {size} bytes\n"
        print(f"Found {'directory' if is_dir else 'file'}: {content} - {size} bytes")
    return final_response


schema_get_files_info = types.FunctionDeclaration(
    name="get_files_info",
    description="Get a list of files and directories in the specified directory within the working directory.",
    parameters=types.Schema(
        type="object",
        properties={
            "directory": types.Schema(
                type=types.Type.STRING,
                description="The directory to list files from, relative to the working directory. Use '.' for the root of the working directory."
            ),
        },
    ),
)