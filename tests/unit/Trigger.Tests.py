#!/usr/bin/env python3

import unittest
import os
import sys
import shutil
import tempfile
from datetime import datetime
from unittest.mock import patch
from io import StringIO

# Setup the Python path before importing the trigger module
# This is necessary because the trigger module is not in the Python path
# by default. We need to add the parent directory to the path.
sys.path.insert(0, os.path.abspath(os.path.join(
    os.path.dirname(__file__), '../..')))

# Import the trigger module after path setup
import trigger  # noqa: E402


class MockDateTime:
    """A mock class to replace datetime.datetime in tests"""
    
    @classmethod
    def set_fixed_datetime(cls, fixed_datetime):
        cls.fixed_datetime = fixed_datetime
    
    @classmethod
    def now(cls):
        return cls.fixed_datetime


class TestTrigger(unittest.TestCase):
    def setUp(self):
        # Create a temporary directory for testing
        self.test_dir = tempfile.mkdtemp()
        # Create the watcher directory
        self.watcher_dir = os.path.join(
            self.test_dir, "posterizarr", "watcher")
        os.makedirs(self.watcher_dir, exist_ok=True)
        
        # Store the original open function to patch it
        self.original_open = open
        
        # Patch the built-in open function to redirect file operations
        def patched_open(file, mode='r', *args, **kwargs):
            # Redirect file operations from /posterizarr/watcher to test dir
            if file.startswith('/posterizarr/watcher'):
                file = os.path.join(self.watcher_dir, os.path.basename(file))
            return self.original_open(file, mode, *args, **kwargs)
        
        # Apply the patch
        builtins_dict = getattr(trigger, '__builtins__', None)
        if isinstance(builtins_dict, dict):
            builtins_dict['open'] = patched_open
        else:
            import builtins
            self.original_open = builtins.open
            builtins.open = patched_open
        
        # Set up stdout capture for print statements
        self.stdout_patcher = patch('sys.stdout', new_callable=StringIO)
        self.mock_stdout = self.stdout_patcher.start()
    
    def tearDown(self):
        # Restore original functions
        builtins_dict = getattr(trigger, '__builtins__', None)
        if isinstance(builtins_dict, dict):
            builtins_dict['open'] = self.original_open
        else:
            import builtins
            builtins.open = self.original_open
        
        # Stop patchers
        self.stdout_patcher.stop()
        
        # Clean up the temporary directory
        shutil.rmtree(self.test_dir)
    
    @patch('trigger.datetime', MockDateTime)
    def test_create_file_with_2_arguments(self):
        """Test creating a file with 2 name-value pairs (4 arguments)"""
        # Set up the fixed datetime
        fixed_datetime = datetime(2025, 3, 29, 12, 0, 0)
        MockDateTime.set_fixed_datetime(fixed_datetime)
        
        args = ["media", "movie", "title", "Test Movie"]
        trigger.create_file(args)
        
        # Check that a file was created with the expected name pattern
        files = os.listdir(self.watcher_dir)
        self.assertEqual(len(files), 1, f"Expected 1 file, got: {files}")
        
        # The filename should match the expected pattern
        expected_filename = "recently_added_20250329120000.posterizarr"
        self.assertTrue(
            any(expected_filename == f for f in files),
            f"Expected file {expected_filename} not found in {files}"
        )
        
        # Get the created file
        created_file = next(f for f in files if f == expected_filename)
        file_path = os.path.join(self.watcher_dir, created_file)
        
        # Check the file content
        with open(file_path, "r") as f:
            content = f.read()
        
        # Verify the content format [key]: value
        self.assertIn("[media]: movie", content)
        self.assertIn("[title]: Test Movie", content)
        
        # Check the print output
        stdout_value = self.mock_stdout.getvalue()
        expected_output_path = f"/posterizarr/watcher/{created_file}"
        self.assertIn(
            f"File '{expected_output_path}' created with content:", 
            stdout_value
        )
        
        print("✓ test_create_file_with_2_arguments passed")
    
    @patch('trigger.datetime', MockDateTime)
    def test_create_file_with_3_arguments(self):
        """Test creating a file with 3 name-value pairs (6 arguments)"""
        # Set up the fixed datetime
        fixed_datetime = datetime(2025, 3, 29, 12, 0, 0)
        MockDateTime.set_fixed_datetime(fixed_datetime)
        
        args = ["media", "movie", "title", "Test Movie", "year", "2025"]
        trigger.create_file(args)
        
        # Check that a file was created
        files = os.listdir(self.watcher_dir)
        self.assertEqual(len(files), 1, f"Expected 1 file, got: {files}")
        
        # Get the created file
        expected_filename = "recently_added_20250329120000.posterizarr"
        self.assertTrue(
            any(expected_filename == f for f in files),
            f"Expected file {expected_filename} not found in {files}"
        )
        
        created_file = next(f for f in files if f == expected_filename)
        file_path = os.path.join(self.watcher_dir, created_file)
        
        # Check the file content
        with open(file_path, "r") as f:
            content = f.read()
        
        # Verify the content format [key]: value
        self.assertIn("[media]: movie", content)
        self.assertIn("[title]: Test Movie", content)
        self.assertIn("[year]: 2025", content)
        
        # Check the print output
        stdout_value = self.mock_stdout.getvalue()
        expected_output_path = f"/posterizarr/watcher/{created_file}"
        self.assertIn(
            f"File '{expected_output_path}' created with content:", 
            stdout_value
        )
        
        print("✓ test_create_file_with_3_arguments passed")
    
    @patch('trigger.datetime', MockDateTime)
    def test_create_file_with_4_arguments(self):
        """Test creating a file with 4 name-value pairs (8 arguments)"""
        # Set up the fixed datetime
        fixed_datetime = datetime(2025, 3, 29, 12, 0, 0)
        MockDateTime.set_fixed_datetime(fixed_datetime)
        
        args = [
            "media", "movie", "title", "Test Movie",
            "year", "2025", "rating", "PG-13"
        ]
        trigger.create_file(args)
        
        # Check that a file was created
        files = os.listdir(self.watcher_dir)
        self.assertEqual(len(files), 1, f"Expected 1 file, got: {files}")
        
        # Get the created file
        expected_filename = "recently_added_20250329120000.posterizarr"
        self.assertTrue(
            any(expected_filename == f for f in files),
            f"Expected file {expected_filename} not found in {files}"
        )
        
        created_file = next(f for f in files if f == expected_filename)
        file_path = os.path.join(self.watcher_dir, created_file)
        
        # Check the file content
        with open(file_path, "r") as f:
            content = f.read()
        
        # Verify the content format [key]: value
        self.assertIn("[media]: movie", content)
        self.assertIn("[title]: Test Movie", content)
        self.assertIn("[year]: 2025", content)
        self.assertIn("[rating]: PG-13", content)
        
        # Check the print output
        stdout_value = self.mock_stdout.getvalue()
        expected_output_path = f"/posterizarr/watcher/{created_file}"
        self.assertIn(
            f"File '{expected_output_path}' created with content:", 
            stdout_value
        )
        
        print("✓ test_create_file_with_4_arguments passed")
    
    @patch('sys.exit')
    def test_invalid_argument_count(self, mock_exit):
        """Test with an invalid number of arguments"""
        args = ["media", "movie", "title"]  # 3 arguments (odd number)
        
        # Call the function with invalid arguments
        trigger.create_file(args)
        
        # Check that sys.exit was called
        mock_exit.assert_called_once()
        
        # Check that no file was created
        files = os.listdir(self.watcher_dir)
        self.assertEqual(
            len(files), 0,
            f"Unexpected files were created: {files}"
        )
        
        # Check the print output for usage instructions
        stdout_value = self.mock_stdout.getvalue()
        self.assertIn("Usage:", stdout_value)
        
        print("✓ test_invalid_argument_count passed")
    
    @patch('trigger.datetime')
    def test_file_naming_with_timestamp(self, mock_datetime):
        """Test that files are created with unique timestamps"""
        # Create a sequence of timestamps for testing
        timestamps = [
            datetime(2025, 3, 29, 12, 0, 0),
            datetime(2025, 3, 29, 12, 0, 1),
            datetime(2025, 3, 29, 12, 0, 2)
        ]
        
        # Configure the mock to return different timestamps for each call
        mock_datetime.now.side_effect = timestamps
        
        # Create three files
        for i in range(3):
            # Clear stdout between calls
            self.mock_stdout.truncate(0)
            self.mock_stdout.seek(0)
            
            args = ["media", "movie", "title", f"Test Movie {i}"]
            trigger.create_file(args)
        
        # Check that three files were created
        files = sorted(os.listdir(self.watcher_dir))
        self.assertEqual(len(files), 3, f"Expected 3 files, got: {files}")
        
        # Check that each file has a unique timestamp in the name
        expected_filenames = [
            "recently_added_20250329120000.posterizarr",
            "recently_added_20250329120001.posterizarr",
            "recently_added_20250329120002.posterizarr"
        ]
        
        for expected_filename in expected_filenames:
            self.assertTrue(
                any(expected_filename == f for f in files),
                f"Expected file {expected_filename} not found in {files}"
            )
            
            # Find the file with this timestamp
            file_path = os.path.join(self.watcher_dir, expected_filename)
            
            # Check the file content
            with open(file_path, "r") as f:
                content = f.read()
                self.assertIn("[media]: movie", content)
                self.assertIn("[title]: Test Movie", content)
        
        print("✓ test_file_naming_with_timestamp passed")


if __name__ == "__main__":
    # Run the tests with verbose output
    unittest.main(argv=['first-arg-is-ignored', '-v'])