#!/usr/bin/env python3

import sys
import os
from datetime import datetime

def create_file(args):
    if len(args) == 4:
        # Case 1: 4 arguments provided
        arg_name1, arg_value1, arg_name2, arg_value2 = args

        # Get current timestamp for file name uniqueness
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Create a file with unique name in the /posterizarr directory
        filename = f"/posterizarr/watcher/recently_added_{timestamp}.posterizarr"

        # Create the file with provided content
        with open(filename, "w") as f:
            f.write(f"[{arg_name1}]: {arg_value1}\n")
            f.write(f"[{arg_name2}]: {arg_value2}\n")

        print(f"File '{filename}' created with content:")
        print(f"[{arg_name1}]: {arg_value1}")
        print(f"[{arg_name2}]: {arg_value2}")
    elif len(args) == 6:
        # Case 2: 6 arguments provided
        arg_name1, arg_value1, arg_name2, arg_value2, arg_name3, arg_value3 = args

        # Get current timestamp for file name uniqueness
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Create a file with unique name in the /posterizarr directory
        filename = f"/posterizarr/watcher/recently_added_{timestamp}.posterizarr"

        # Create the file with provided content
        with open(filename, "w") as f:
            f.write(f"[{arg_name1}]: {arg_value1}\n")
            f.write(f"[{arg_name2}]: {arg_value2}\n")
            f.write(f"[{arg_name3}]: {arg_value3}\n")

        print(f"File '{filename}' created with content:")
        print(f"[{arg_name1}]: {arg_value1}")
        print(f"[{arg_name2}]: {arg_value2}")
        print(f"[{arg_name3}]: {arg_value3}")
    elif len(args) == 8:
        # Case 3: 8 arguments provided
        arg_name1, arg_value1, arg_name2, arg_value2, arg_name3, arg_value3, arg_name4, arg_value4 = args

        # Get current timestamp for file name uniqueness
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Create a file with unique name in the /posterizarr directory
        filename = f"/posterizarr/watcher/recently_added_{timestamp}.posterizarr"

        # Create the file with provided content
        with open(filename, "w") as f:
            f.write(f"[{arg_name1}]: {arg_value1}\n")
            f.write(f"[{arg_name2}]: {arg_value2}\n")
            f.write(f"[{arg_name3}]: {arg_value3}\n")
            f.write(f"[{arg_name4}]: {arg_value4}\n")

        print(f"File '{filename}' created with content:")
        print(f"[{arg_name1}]: {arg_value1}")
        print(f"[{arg_name2}]: {arg_value2}")
        print(f"[{arg_name3}]: {arg_value3}")
        print(f"[{arg_name4}]: {arg_value4}")
    else:
        print("Usage:")
        print("Case 1 (2 arguments): create_file.py <arg_name1> <arg_value1> <arg_name2> <arg_value2>")
        print("Case 2 (3 arguments): create_file.py <arg_name1> <arg_value1> <arg_name2> <arg_value2> <arg_name3> <arg_value3>")
        print("Case 3 (4 arguments): create_file.py <arg_name1> <arg_value1> <arg_name2> <arg_value2> <arg_name3> <arg_value3> <arg_name4> <arg_value4>")
        sys.exit(1)

if __name__ == "__main__":
    create_file(sys.argv[1:])