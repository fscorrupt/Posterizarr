Describe "Trigger.py Integration Tests" {
    BeforeAll {
        # Create test environment using TestDrive: instead of actual filesystem
        $testRoot = "$TestDrive/app"
        $testWatcher = "$TestDrive/posterizarr/watcher"  # Our test directory that will replace the hardcoded path
        
        Write-Host "Setting up test environment..."
        Write-Host "Test root: $testRoot"
        Write-Host "Test watcher: $testWatcher"
        
        # Create test directories
        New-Item -Path $testRoot -ItemType Directory -Force
        New-Item -Path $testWatcher -ItemType Directory -Force
        
        Write-Host "Created test directories"
        
        # Copy trigger.py to test location
        Write-Host "Copying trigger.py to test location..."
        Copy-Item -Path $PSScriptRoot/../../trigger.py -Destination $testRoot/
        
        # Create a Python script that directly imports and calls trigger.py
        # This is similar to how the unit tests work
        $directScript = @"
#!/usr/bin/env python3

import sys
import os
import builtins
import traceback
from datetime import datetime

# Store the original open function
original_open = open

# Define a patched open function that redirects file operations
def patched_open(file, mode='r', *args, **kwargs):
    # Redirect file operations from /posterizarr/watcher to our test directory
    if isinstance(file, str) and file.startswith('/posterizarr/watcher'):
        new_file = os.path.join('$testWatcher', os.path.basename(file))
        print(f"DEBUG: Redirecting file operation from {file} to {new_file}")
        return original_open(new_file, mode, *args, **kwargs)
    return original_open(file, mode, *args, **kwargs)

# Patch the built-in open function
builtins.open = patched_open

# Add the test root to the Python path
sys.path.insert(0, '$testRoot')

try:
    # Import the trigger module
    import trigger

    # Get the command line arguments
    # We need to handle the case where PowerShell splits arguments with spaces
    raw_args = sys.argv[1:]
    print(f"DEBUG: Raw arguments: {raw_args}")
    
    # Process the arguments based on the test case
    if len(raw_args) == 3:  # Invalid argument count test
        args = raw_args
    elif len(raw_args) == 5:  # 2 name-value pairs (with "Test Movie" split)
        args = [raw_args[0], raw_args[1], raw_args[2], raw_args[3] + " " + raw_args[4]]
    elif len(raw_args) == 7:  # 3 name-value pairs (with "Test Movie" split)
        args = [raw_args[0], raw_args[1], raw_args[2], raw_args[3] + " " + raw_args[4], raw_args[5], raw_args[6]]
    elif len(raw_args) == 9:  # 4 name-value pairs (with "Test Movie" split)
        args = [raw_args[0], raw_args[1], raw_args[2], raw_args[3] + " " + raw_args[4], raw_args[5], raw_args[6], raw_args[7], raw_args[8]]
    else:
        args = raw_args
    
    print(f"DEBUG: Processed arguments: {args}")
    
    # Run the script with the provided arguments
    trigger.create_file(args)
    
    # Check if files were created
    if os.path.exists('$testWatcher'):
        files = os.listdir('$testWatcher')
        print(f"DEBUG: Files in test watcher directory: {files}")
    else:
        print("DEBUG: Test watcher directory does not exist")
except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()
"@
        
        # Write the direct script to a file
        $directScriptPath = "$testRoot/direct_trigger.py"
        Set-Content -Path $directScriptPath -Value $directScript
        
        # Make the direct script executable
        if ($IsLinux -or $IsMacOS) {
            & chmod +x $directScriptPath
        }
        
        # Create a function to execute the Python script with parameters
        function Invoke-PythonScript {
            param (
                [string[]]$Arguments,
                [int]$TimeoutSeconds = 5
            )
            
            Write-Host "Executing direct_trigger.py with arguments: $Arguments"
            
            # Create a temporary file to store the output
            $outputFile = "$TestDrive/python_output.txt"
            $errorFile = "$TestDrive/python_error.txt"
            
            # Build the command with proper argument handling
            $pythonArgs = @("$testRoot/direct_trigger.py")
            $pythonArgs += $Arguments
            
            # Execute the script directly
            $startTime = Get-Date
            $process = Start-Process -FilePath "python3" -ArgumentList $pythonArgs -RedirectStandardOutput $outputFile -RedirectStandardError $errorFile -NoNewWindow -PassThru
            
            # Wait for the process to complete or timeout
            while (-not $process.HasExited -and ((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
                Start-Sleep -Milliseconds 100
            }
            
            # If the process is still running after timeout, kill it
            if (-not $process.HasExited) {
                $process.Kill()
                Add-Content -Path $outputFile -Value "Process timed out after $TimeoutSeconds seconds"
                Write-Host "Process timed out after $TimeoutSeconds seconds"
            }
            
            # Return the output
            $output = Get-Content -Path $outputFile -Raw -ErrorAction SilentlyContinue
            $output_error = Get-Content -Path $errorFile -Raw -ErrorAction SilentlyContinue
            
            if ([string]::IsNullOrEmpty($output) -and -not [string]::IsNullOrEmpty($output_error)) {
                Write-Host "Error executing Python script: $error"
                return $output_error
            }
            
            Write-Host "Python script output: $output"
            return $output
        }
        
        Write-Host "Test setup complete."
    }
    
    AfterAll {
        Write-Host "Cleaning up test environment..."
        Write-Host "Test cleanup complete."
    }
    
    It "Should create a .posterizarr file with 2 name-value pairs" {
        Write-Host "Running test: Should create a .posterizarr file with 2 name-value pairs"
        
        # Execute the direct_trigger.py script with 4 arguments (2 name-value pairs)
        $output = Invoke-PythonScript -Arguments @("media", "movie", "title", "Test Movie")
        
        # Check if a .posterizarr file was created in the watcher directory
        $files = Get-ChildItem -Path $testWatcher -Filter "*.posterizarr" | Where-Object { $_.Name -match "recently_added_" }
        $files.Count | Should -BeGreaterThan 0 -Because "A .posterizarr file should be created"
        
        # If no file was created, output the script output for debugging
        if ($files.Count -eq 0) {
            Write-Host "Script output: $output"
            Write-Host "Test watcher directory: $testWatcher"
            
            # Check if the directory exists
            if (Test-Path $testWatcher) {
                Write-Host "Test watcher directory exists"
                Write-Host "Directory contents:"
                Get-ChildItem -Path $testWatcher | ForEach-Object { Write-Host $_.FullName }
            } else {
                Write-Host "Test watcher directory does not exist"
            }
            
            $false | Should -BeTrue -Because "A .posterizarr file should be created"
        }
        
        Write-Host "Created file: $($files[0].FullName)"
        
        # Check the content of the file
        $fileContent = Get-Content -Path $files[0].FullName -Raw
        Write-Host "File content: $fileContent"
        
        # Verify the file content format [key]: value
        $fileContent | Should -Match "\[media\]: movie" -Because "The file should contain the media type"
        $fileContent | Should -Match "\[title\]: Test Movie" -Because "The file should contain the title"
        
        # Clean up the file for the next test
        Write-Host "Removing file: $($files[0].FullName)"
        Remove-Item -Path $files[0].FullName -Force
        
        Write-Host "Test completed successfully."
    }
    
    It "Should create a .posterizarr file with 3 name-value pairs" {
        Write-Host "Running test: Should create a .posterizarr file with 3 name-value pairs"
        
        # Execute the direct_trigger.py script with 6 arguments (3 name-value pairs)
        $output = Invoke-PythonScript -Arguments @("media", "movie", "title", "Test Movie", "year", "2025")
        
        # Check if a .posterizarr file was created in the watcher directory
        $files = Get-ChildItem -Path $testWatcher -Filter "*.posterizarr" | Where-Object { $_.Name -match "recently_added_" }
        $files.Count | Should -BeGreaterThan 0 -Because "A .posterizarr file should be created"
        
        # If no file was created, output the script output for debugging
        if ($files.Count -eq 0) {
            Write-Host "Script output: $output"
            Write-Host "Test watcher directory: $testWatcher"
            
            # Check if the directory exists
            if (Test-Path $testWatcher) {
                Write-Host "Test watcher directory exists"
                Write-Host "Directory contents:"
                Get-ChildItem -Path $testWatcher | ForEach-Object { Write-Host $_.FullName }
            } else {
                Write-Host "Test watcher directory does not exist"
            }
            
            $false | Should -BeTrue -Because "A .posterizarr file should be created"
        }
        
        Write-Host "Created file: $($files[0].FullName)"
        
        # Check the content of the file
        $fileContent = Get-Content -Path $files[0].FullName -Raw
        Write-Host "File content: $fileContent"
        
        # Verify the file content format [key]: value
        $fileContent | Should -Match "\[media\]: movie" -Because "The file should contain the media type"
        $fileContent | Should -Match "\[title\]: Test Movie" -Because "The file should contain the title"
        $fileContent | Should -Match "\[year\]: 2025" -Because "The file should contain the year"
        
        # Clean up the file for the next test
        Write-Host "Removing file: $($files[0].FullName)"
        Remove-Item -Path $files[0].FullName -Force
        
        Write-Host "Test completed successfully."
    }
    
    It "Should create a .posterizarr file with 4 name-value pairs" {
        Write-Host "Running test: Should create a .posterizarr file with 4 name-value pairs"
        
        # Execute the direct_trigger.py script with 8 arguments (4 name-value pairs)
        $output = Invoke-PythonScript -Arguments @("media", "movie", "title", "Test Movie", "year", "2025", "rating", "PG-13")
        
        # Check if a .posterizarr file was created in the watcher directory
        $files = Get-ChildItem -Path $testWatcher -Filter "*.posterizarr" | Where-Object { $_.Name -match "recently_added_" }
        $files.Count | Should -BeGreaterThan 0 -Because "A .posterizarr file should be created"
        
        # If no file was created, output the script output for debugging
        if ($files.Count -eq 0) {
            Write-Host "Script output: $output"
            Write-Host "Test watcher directory: $testWatcher"
            
            # Check if the directory exists
            if (Test-Path $testWatcher) {
                Write-Host "Test watcher directory exists"
                Write-Host "Directory contents:"
                Get-ChildItem -Path $testWatcher | ForEach-Object { Write-Host $_.FullName }
            } else {
                Write-Host "Test watcher directory does not exist"
            }
            
            $false | Should -BeTrue -Because "A .posterizarr file should be created"
        }
        
        Write-Host "Created file: $($files[0].FullName)"
        
        # Check the content of the file
        $fileContent = Get-Content -Path $files[0].FullName -Raw
        Write-Host "File content: $fileContent"
        
        # Verify the file content format [key]: value
        $fileContent | Should -Match "\[media\]: movie" -Because "The file should contain the media type"
        $fileContent | Should -Match "\[title\]: Test Movie" -Because "The file should contain the title"
        $fileContent | Should -Match "\[year\]: 2025" -Because "The file should contain the year"
        $fileContent | Should -Match "\[rating\]: PG-13" -Because "The file should contain the rating"
        
        # Clean up the file for the next test
        Write-Host "Removing file: $($files[0].FullName)"
        Remove-Item -Path $files[0].FullName -Force
        
        Write-Host "Test completed successfully."
    }
    
    It "Should reject invalid argument count" {
        Write-Host "Running test: Should reject invalid argument count"
        
        # Execute the direct_trigger.py script with 3 arguments (invalid)
        $output = Invoke-PythonScript -Arguments @("media", "movie", "title")
        
        # Check if the output indicates an error
        $output | Should -Match "Usage:" -Because "The script should display usage information for invalid argument count"
        
        # Check that no file was created
        $files = Get-ChildItem -Path $testWatcher -Filter "*.posterizarr" | Where-Object { $_.Name -match "recently_added_" }
        $files.Count | Should -Be 0 -Because "No file should be created with invalid arguments"
        
        Write-Host "Test completed successfully."
    }
}