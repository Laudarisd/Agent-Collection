from .get_files_info import get_files_info
from .get_file_contents import get_file_content
from .write_file import write_file
from .run_python_file import run_python_file

def main():
    working_directory = "calculator"
    root_contents = get_files_info(working_directory)
    print("Root Directory Contents:")
    pkg_contents = get_files_info(working_directory, "pkg")
    print("pkg Directory Contents:")
    pkg_contents = get_files_info(working_directory, "/bin")
    print("bin Directory Contents:")
    pkg_contents = get_files_info(working_directory, "../")
    print("pkg_contents Directory Contents:")

# def test_get_file_content():
#     working_directory = "calculator"
#     print("\n--- File Content Tests ---\n")
#     # Test 1: Large file truncation
#     lorem_result = get_file_content(working_directory, "lorem.txt")
#     print("lorem.txt (should be truncated):\n", lorem_result[:300] + "...\n" if len(lorem_result) > 300 else lorem_result)
#     print("\n--- End of lorem.txt preview ---\n")

#     # Test 2: main.py
#     main_result = get_file_content(working_directory, "main.py")
#     print("main.py:\n", main_result[:300] + "...\n" if len(main_result) > 300 else main_result)
#     print("\n--- End of main.py preview ---\n")

#     # Test 3: pkg/calculator.py
#     pkg_calc_result = get_file_content(working_directory, "pkg/calculator.py")
#     print("pkg/calculator.py:\n", pkg_calc_result[:300] + "...\n" if len(pkg_calc_result) > 300 else pkg_calc_result)
#     print("\n--- End of pkg/calculator.py preview ---\n")

#     # Test 4: /bin/cat (should error)
#     bin_cat_result = get_file_content(working_directory, "/bin/cat")
#     print("/bin/cat:\n", bin_cat_result)
#     print("\n--- End of /bin/cat test ---\n")

#     # Test 5: Non-existent file (should error)
#     dne_result = get_file_content(working_directory, "pkg/does_not_exist.py")
#     print("pkg/does_not_exist.py:\n", dne_result)
#     print("\n--- End of does_not_exist.py test ---\n")

# def test_write_file():
#     working_directory = "calculator"
#     print("\n--- Write File Tests ---\n")
#     # Test 1: Overwrite lorem.txt
#     result1 = write_file(working_directory, "lorem.txt", "wait, this isn't lorem ipsum")
#     print("write_file to lorem.txt:\n", result1)
#     print("\n--- End of lorem.txt write test ---\n")

#     # Test 2: Create new file in pkg
#     result2 = write_file(working_directory, "pkg2/morelorem.txt", "lorem ipsum dolor sit amet")
#     print("write_file to pkg/morelorem.txt:\n", result2)
#     print("\n--- End of morelorem.txt write test ---\n")

#     # Test 3: Attempt to write outside working directory
#     result3 = write_file(working_directory, "/tmp/temp.txt", "this should not be allowed")
#     print("write_file to /tmp/temp.txt:\n", result3)
#     print("\n--- End of /tmp/temp.txt write test ---\n")

def test_run_python_file():
    working_directory = "calculator"
    print("\n--- Run Python File Tests ---\n")
    # Test 1: main.py usage instructions
    result1 = run_python_file(working_directory, "main.py")
    print("run_python_file main.py (usage):\n", result1)
    print("\n--- End of main.py usage test ---\n")

    # Test 2: main.py with argument
    result2 = run_python_file(working_directory, "main.py", ["3 + 5"])
    print("run_python_file main.py with arg:\n", result2)
    print("\n--- End of main.py arg test ---\n")

    # Test 2b: main.py with argument 3 + 2
    result2b = run_python_file(working_directory, "main.py", ["3 + 2"])
    print("run_python_file main.py with arg 3 + 2:\n", result2b)
    print("\n--- End of main.py arg 3 + 2 test ---\n")

    # Test 3: tests.py
    result3 = run_python_file(working_directory, "tests.py")
    print("run_python_file tests.py:\n", result3)
    print("\n--- End of tests.py test ---\n")

    # Test 4: ../main.py (should error)
    result4 = run_python_file(working_directory, "../main.py")
    print("run_python_file ../main.py (should error):\n", result4)
    print("\n--- End of ../main.py test ---\n")

    # Test 5: nonexistent.py (should error)
    result5 = run_python_file(working_directory, "nonexistent.py")
    print("run_python_file nonexistent.py (should error):\n", result5)
    print("\n--- End of nonexistent.py test ---\n")

if __name__ == "__main__":
    main()
    #test_get_file_content()
    #test_write_file()
    test_run_python_file()
