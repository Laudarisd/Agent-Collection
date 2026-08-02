import os
import sys
from dotenv import load_dotenv
from google import genai
from google.genai import types
from ..tools.get_files_info import schema_get_files_info
from ..tools.get_file_contents import schema_get_file_content
from ..tools.write_file import schema_write_file
from ..tools.run_python_file import schema_run_python_file
from .tools import call_function

def pretty_tool_output(function_call_result):
    # Extract and format the result for nicer output
    part = function_call_result.parts[0]
    if hasattr(part, "function_response") and part.function_response:
        resp = part.function_response.response
        if isinstance(resp, dict) and "result" in resp:
            result = resp["result"]
            if isinstance(result, str) and len(result) > 0:
                # If it's code, pretty-print
                if result.strip().startswith("class ") or result.strip().startswith("def "):
                    return "\n--- Tool Output (code) ---\n" + result + "\n--- End ---"
                return "\n--- Tool Output ---\n" + result + "\n--- End ---"
            else:
                return "\n--- Tool Output ---\n" + str(result) + "\n--- End ---"
        elif isinstance(resp, dict) and "error" in resp:
            return "\n[Tool Error] " + str(resp["error"])
        else:
            return "\n--- Tool Output ---\n" + str(resp) + "\n--- End ---"
    return ""

def main():
    if len(sys.argv) < 2:
        print("Usage: python main.py 'your request'")
        sys.exit(1)

    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    prompt = sys.argv[1]
    verbose = '--verbose' in sys.argv
    
    client = genai.Client(api_key=api_key)
    
    tools = types.Tool(function_declarations=[
        schema_get_files_info,
        schema_get_file_content,
        schema_write_file,
        schema_run_python_file
    ])
    
    system_prompt = """You are a coding agent. The calculator project is in the calculator/ directory.

Always start by calling get_files_info to see files in calculator directory.
Read files before making changes. Make actual code fixes."""

    messages = [types.Content(role="user", parts=[types.Part(text=prompt)])]
    
    config = types.GenerateContentConfig(
        tools=[tools],
        system_instruction=system_prompt
    )

    for iteration in range(10):
        response = client.models.generate_content(
            model="gemini-2.0-flash-001",
            contents=messages,
            config=config,
        )
        
        # Handle function calls
        if hasattr(response, 'function_calls') and response.function_calls:
            for function_call_part in response.function_calls:
                function_call_result = call_function(function_call_part, verbose=verbose)
                messages.append(types.Content(role="user", parts=function_call_result.parts))
                # Only print tool output if verbose
                if verbose:
                    print(f"\n - Calling function: {function_call_part.name}")
                    print(pretty_tool_output(function_call_result))

        # Add model responses
        if hasattr(response, 'candidates') and response.candidates:
            for candidate in response.candidates:
                if hasattr(candidate, 'content') and candidate.content and candidate.content.parts:
                    messages.append(candidate.content)
                    # Print model output if verbose
                    if verbose and hasattr(candidate.content, 'text') and candidate.content.text:
                        print("\n[Model Output]:")
                        print(candidate.content.text)
        
        # Final response
        if hasattr(response, 'text') and response.text:
            print("\nResponse:")
            print(response.text)
            return

    print("Agent completed")

if __name__ == "__main__":
    main()
