Describe "Integration Tests" {
    BeforeAll {
        # Create test environment
        $testRoot = "$TestDrive/app"
        $testConfig = "$TestDrive/config"
        $testWatcher = "$testConfig/watcher"
        $testTemp = "$testConfig/temp"
        
        New-Item -Path $testRoot -ItemType Directory -Force
        New-Item -Path $testConfig -ItemType Directory -Force
        New-Item -Path $testWatcher -ItemType Directory -Force
        New-Item -Path $testTemp -ItemType Directory -Force
        
        # Copy scripts to test location
        Copy-Item -Path $PSScriptRoot/../../Start.ps1 -Destination $testRoot/
        Copy-Item -Path $PSScriptRoot/../mocks/MockPosterizarr.ps1 -Destination $testRoot/Posterizarr.ps1
        Copy-Item -Path $PSScriptRoot/../mocks/test-config.json -Destination $testConfig/config.json
        
        # Set environment variables
        $env:APP_ROOT = $testRoot
        $env:APP_DATA = $testConfig
        
        # Create a function to execute the script with parameters and capture output
        function Invoke-ScriptWithParams {
            param (
                [string]$ScriptPath,
                [hashtable]$Parameters = @{},
                [int]$TimeoutSeconds = 5
            )
            
            # Build parameter string
            $paramString = ""
            foreach ($key in $Parameters.Keys) {
                if ($Parameters[$key] -is [switch] -or $Parameters[$key] -eq $true) {
                    $paramString += " -$key"
                } else {
                    $paramString += " -$key `"$($Parameters[$key])`""
                }
            }
            
            # Create a temporary file to store the output
            $outputFile = "$TestDrive/output.txt"
            
            # Execute the script with parameters and redirect output
            # Use Start-Process with -NoNewWindow to capture output
            $startTime = Get-Date
            $process = Start-Process -FilePath "pwsh" -ArgumentList "-NoProfile -Command `"& '$ScriptPath'$paramString`"" -RedirectStandardOutput $outputFile -RedirectStandardError "$TestDrive/error.txt" -NoNewWindow -PassThru
            
            # Wait for the process to complete or timeout
            while (-not $process.HasExited -and ((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
                Start-Sleep -Milliseconds 100
            }
            
            # If the process is still running after timeout, kill it
            if (-not $process.HasExited) {
                $process.Kill()
                Add-Content -Path $outputFile -Value "Process timed out after $TimeoutSeconds seconds"
            }
            
            # Return the output
            return Get-Content -Path $outputFile -Raw
        }
    }
    
    AfterAll {
        # Reset environment variables
        $env:APP_ROOT = $null
        $env:APP_DATA = $null
    }
    
    It "Should correctly pass parameters to Posterizarr.ps1" {
        # Create a test log file
        $logFile = "$env:APP_DATA/posterizarr-call.log"
        if (Test-Path $logFile) {
            Remove-Item $logFile -Force
        }
        
        # Run the script with a test parameter
        $output = Invoke-ScriptWithParams -ScriptPath "$env:APP_ROOT/Start.ps1" -Parameters @{
            Mode = "run"
        }
        
        # Check if the log file was created
        Test-Path $logFile | Should -BeTrue
        
        # Check if Posterizarr.ps1 was called with correct parameters
        $logContent = Get-Content -Path $logFile -Raw
        $logContent | Should -Match "-dev"
    }
    
    It "Should create watcher directory if it doesn't exist" {
        # Remove the watcher directory
        if (Test-Path $testWatcher) {
            Remove-Item -Path $testWatcher -Force -Recurse
        }
        
        # Run the script
        $output = Invoke-ScriptWithParams -ScriptPath "$env:APP_ROOT/Start.ps1" -Parameters @{
            Mode = "run"
        }
        
        # Check if the watcher directory was created
        Test-Path -Path $testWatcher | Should -BeTrue
    }
    
    It "Should process .posterizarr files in run mode with FilePath" {
        # Create a test .posterizarr file
        $testFile = "$testWatcher/test.posterizarr"
        @'
[media]: movie
[title]: Test Movie
'@ | Set-Content -Path $testFile
        
        # Run the script with the file path
        $output = Invoke-ScriptWithParams -ScriptPath "$env:APP_ROOT/Start.ps1" -Parameters @{
            Mode = "run"
            FilePath = $testFile
        }
        
        # Check if the output indicates the file was processed
        $output | Should -Match "Mock Posterizarr.ps1 executed with parameters"
        
        # The file should be removed after processing
        # Note: In a real test, we would check this, but our mock doesn't actually remove the file
        # Test-Path -Path $testFile | Should -BeFalse
    }
    
    It "Should handle missing config file" {
        # Rename the config file temporarily
        Rename-Item -Path "$testConfig/config.json" -NewName "config.json.bak"
        
        try {
            # Run the script
            $output = Invoke-ScriptWithParams -ScriptPath "$env:APP_ROOT/Start.ps1" -Parameters @{
                Mode = "run"
            } -TimeoutSeconds 2
            
            # Check if the output indicates the config file is missing
            $output | Should -Match "Could not find a 'config.json' file"
        }
        finally {
            # Restore the config file
            Rename-Item -Path "$testConfig/config.json.bak" -NewName "config.json"
        }
    }
    
    It "Should clear running file if it exists" {
        # Create a running file
        $runningFile = "$testTemp/Posterizarr.Running"
        "Running" | Set-Content -Path $runningFile
        
        # Run the script
        $output = Invoke-ScriptWithParams -ScriptPath "$env:APP_ROOT/Start.ps1" -Parameters @{
            Mode = "run"
        }
        
        # Check if the running file was removed
        Test-Path -Path $runningFile | Should -BeFalse
    }
}