from google.genai import types


def get_file_content_tool():
    """Schema definition for get_file_content tool"""
    return types.FunctionDeclaration(
        name="get_file_content",
        description="Read the contents of a file",
        parameters=types.Schema(
            type="object",
            properties={
                "file_path": types.Schema(
                    type=types.Type.STRING,
                    description="Path to the file to read"
                ),
            },
            required=["file_path"]
        ),
    )


def write_file_tool():
    """Schema definition for write_file tool"""
    return types.FunctionDeclaration(
        name="write_file",
        description="Write content to a file",
        parameters=types.Schema(
            type="object",
            properties={
                "file_path": types.Schema(
                    type=types.Type.STRING,
                    description="Path to the file to write"
                ),
                "content": types.Schema(
                    type=types.Type.STRING,
                    description="Content to write to the file"
                ),
            },
            required=["file_path", "content"]
        ),
    )


def run_python_tool():
    """Schema definition for run_python tool"""
    return types.FunctionDeclaration(
        name="run_python",
        description="Execute Python code",
        parameters=types.Schema(
            type="object",
            properties={
                "code": types.Schema(
                    type=types.Type.STRING,
                    description="Python code to execute"
                ),
            },
            required=["code"]
        ),
    )


def get_available_tools():
    """Get all available tools"""
    return [
        get_file_content_tool(),
        write_file_tool(),
        run_python_tool(),
    ]
