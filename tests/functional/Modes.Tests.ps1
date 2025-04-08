Describe "Mode Selection" {
    BeforeAll {
        # Create a temporary copy of the script to test
        $originalScript = Get-Content -Path $PSScriptRoot/../../Start.ps1 -Raw

        # Replace the WatchDirectory function with a test-friendly version
        $modifiedScript = $originalScript -replace 'function WatchDirectory \{[\s\S]*?# Real-time file system watcher[\s\S]*?try \{', @'
function WatchDirectory {
    # Output this message for tests to detect
    Write-Output "WatchDirectory function was called"
    # In test environment, just return immediately
    Write-Host "Running in test environment, skipping file watcher setup"
    return

    # Real-time file system watcher
    try {
'@

        # Replace the ProcessPosterizarrFile function with a test-friendly version
        $modifiedScript = $modifiedScript -replace 'function ProcessPosterizarrFile \{[\s\S]*?if \(!\(Test-Path -Path \$FilePath\)\) \{', @'
function ProcessPosterizarrFile {
    param (
        [Parameter(Mandatory=$true)]
        [string]$FilePath
    )

    # Output this message for tests to detect
    Write-Output "ProcessPosterizarrFile function was called with FilePath: $FilePath"

    # In test environment, just return immediately
    if ($FilePath -like "*test.posterizarr*") {
        Write-Host "Running in test environment, skipping file processing"
        return
    }

    if (!(Test-Path -Path $FilePath)) {
'@

        $tempScriptPath = "$TestDrive/Start.ps1"
        Set-Content -Path $tempScriptPath -Value $modifiedScript

        # Set up environment variables
        $env:APP_ROOT = "$TestDrive/app"
        $env:APP_DATA = "$TestDrive/config"

        # Create necessary directories
        New-Item -Path "$TestDrive/app" -ItemType Directory -Force
        New-Item -Path "$TestDrive/config" -ItemType Directory -Force
        New-Item -Path "$TestDrive/config/watcher" -ItemType Directory -Force
        New-Item -Path "$TestDrive/config/temp" -ItemType Directory -Force

        # Create a mock config.json
        $configJson = @'
{
  "plex": {
    "url": "http://localhost:32400",
    "token": "test-token"
  },
  "fanart": {
    "apikey": "test-api-key"
  }
}
'@
        Set-Content -Path "$TestDrive/config/config.json" -Value $configJson

        # Create a function to execute the script with parameters and capture output
        function Invoke-ScriptWithParams {
            param (
                [string]$ScriptPath,
                [hashtable]$Parameters = @{},
                [hashtable]$Mocks = @{},
                [int]$TimeoutSeconds = 30
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

            # Create a temporary script that includes mocks and then calls the original script
            $mockScriptPath = "$TestDrive/MockRunner.ps1"

            $mockScript = @"
# Set up mocks
"@

            # Add each mock function
            foreach ($mockName in $Mocks.Keys) {
                $mockBody = $Mocks[$mockName]
                $mockScript += @"

function $mockName {
$mockBody
}

"@
            }

            # Add code to call the original script
            $mockScript += @"
# Call the original script
& '$ScriptPath'$paramString *> '$outputFile'
"@

            # Save the mock script
            Set-Content -Path $mockScriptPath -Value $mockScript
            # Create a job to execute the script with a timeout
            $job = Start-Job -ScriptBlock {
                param($scriptPath)
                & pwsh -NoProfile -Command $scriptPath
            } -ArgumentList $mockScriptPath

            # Wait for the job to complete with a timeout
            $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds

            if ($completed -eq $null) {
                # Job timed out
                Stop-Job -Job $job
                Remove-Job -Job $job -Force
                Write-Warning "Script execution timed out after $TimeoutSeconds seconds"
                return "ERROR: Script execution timed out after $TimeoutSeconds seconds"
            } else {
                # Job completed, get the results
                Receive-Job -Job $job | Out-Null
                Remove-Job -Job $job

                # Return the output if the file exists
                if (Test-Path -Path $outputFile) {
                    return Get-Content -Path $outputFile -Raw
                } else {
                    return "ERROR: Output file not created"
                }
            }
            return Get-Content -Path $outputFile -Raw
        }
    }

    AfterAll {
        # Clean up environment variables
        $env:APP_ROOT = $null
        $env:APP_DATA = $null
    }

    It "Should execute WatchDirectory mode by default" {
        # Mock the WatchDirectory function to capture its execution
        $mocks = @{
            "WatchDirectory" = @'
                Write-Output "WatchDirectory function was called"
                return $true
'@
            "CompareScriptVersion" = @'
                Write-Output "CompareScriptVersion was called"
                return
'@
            "GetLatestScriptVersion" = @'
                return "1.9.37"
'@
            "pwsh" = @'
                param($args)
                Write-Output "pwsh was called with: $args"
                return
'@
            "Start-Sleep" = @'
                param($seconds)
                Write-Output "Sleep skipped in test"
                return
'@
        }

        $output = Invoke-ScriptWithParams -ScriptPath "$TestDrive/Start.ps1" -Mocks $mocks
        $output | Should -Match "WatchDirectory function was called"
    }

    It "Should execute Run mode when specified" {
        # Mock the Run function to capture its execution
        $mocks = @{
            "Run" = @'
                Write-Output "Run function was called"
                return $true
'@
            "CompareScriptVersion" = @'
                Write-Output "CompareScriptVersion was called"
                return
'@
            "GetLatestScriptVersion" = @'
                return "1.9.37"
'@
            "pwsh" = @'
                param($args)
                Write-Output "pwsh was called with: $args"
                return
'@
            "Start-Sleep" = @'
                param($seconds)
                Write-Output "Sleep skipped in test"
                return
'@
        }

        $output = Invoke-ScriptWithParams -ScriptPath "$TestDrive/Start.ps1" -Parameters @{
            Mode = "run"
        } -Mocks $mocks

        $output | Should -Match "Run function was called"
    }

    It "Should execute RunScheduled when scheduled mode is specified" {
        # Mock the RunScheduled function to capture its execution
        $mocks = @{
            "RunScheduled" = @'
                Write-Output "RunScheduled function was called"
                return
'@
            "CompareScriptVersion" = @'
                Write-Output "CompareScriptVersion was called"
                return
'@
            "GetLatestScriptVersion" = @'
                return "1.9.37"
'@
            "Run" = @'
                Write-Output "Run function was called"
                return $true
'@
            "pwsh" = @'
                param($args)
                Write-Output "pwsh was called with: $args"
                return
'@
            "Start-Sleep" = @'
                param($seconds)
                Write-Output "Sleep skipped in test"
                return
'@
        }

        $output = Invoke-ScriptWithParams -ScriptPath "$TestDrive/Start.ps1" -Parameters @{
            Mode = "scheduled"
        } -Mocks $mocks

        $output | Should -Match "RunScheduled function was called"
    }

    It "Should execute WatchDirectory when watch mode is specified" {
        # Mock the WatchDirectory function to capture its execution
        $mocks = @{
            "WatchDirectory" = @'
                Write-Output "WatchDirectory function was called"
                # Return immediately to prevent hanging
                return
'@
            "CompareScriptVersion" = @'
                Write-Output "CompareScriptVersion was called"
                return
'@
            "GetLatestScriptVersion" = @'
                return "1.9.37"
'@
            "Run" = @'
                Write-Output "Run function was called"
                return $true
'@
            "pwsh" = @'
                param($args)
                Write-Output "pwsh was called with: $args"
                return
'@
            "Start-Sleep" = @'
                param($seconds)
                Write-Output "Sleep skipped in test"
                return
'@
        }

        $output = Invoke-ScriptWithParams -ScriptPath "$TestDrive/Start.ps1" -Parameters @{
            Mode = "watch"
        } -Mocks $mocks

        $output | Should -Match "WatchDirectory function was called"
    }

    It "Should process a specific file when FilePath is provided" {
        # Mock the ProcessPosterizarrFile function to capture its execution
        $mocks = @{
            "ProcessPosterizarrFile" = @'
                param (
                    [Parameter(Mandatory=$true)]
                    [string]$FilePath
                )
                Write-Output "ProcessPosterizarrFile function was called with FilePath: $FilePath"
                # Return immediately to prevent hanging
                return
'@
            "CompareScriptVersion" = @'
                Write-Output "CompareScriptVersion was called"
                return
'@
            "GetLatestScriptVersion" = @'
                return "1.9.37"
'@
            "Run" = @'
                Write-Output "Run function was called"
                return $true
'@
            "pwsh" = @'
                param($args)
                Write-Output "pwsh was called with: $args"
                return
'@
            "Start-Sleep" = @'
                param($seconds)
                Write-Output "Sleep skipped in test"
                return
                Write-Output "pwsh was called with: $args"
'@
        }

        $output = Invoke-ScriptWithParams -ScriptPath "$TestDrive/Start.ps1" -Parameters @{
            Mode = "run"
            FilePath = "test.posterizarr"
        } -Mocks $mocks

        $output | Should -Match "ProcessPosterizarrFile function was called with FilePath: test.posterizarr"
    }

    It "Should display error for invalid mode" {
        # For this test, we need to modify the script to remove the ValidateSet attribute
        # so we can test the default case in the switch statement

        # Read the script content
        $scriptContent = Get-Content -Path "$TestDrive/Start.ps1" -Raw

        # Replace the ValidateSet attribute with a comment
        $modifiedScript = $scriptContent -replace '\[ValidateSet\("run", "watch", "scheduled"\)\]', '# [ValidateSet("run", "watch", "scheduled")]'

        # Write the modified script back
        $modifiedScriptPath = "$TestDrive/ModifiedStart.ps1"
        Set-Content -Path $modifiedScriptPath -Value $modifiedScript

        # No need to mock functions for this test as it should fail before calling any functions
        $output = Invoke-ScriptWithParams -ScriptPath $modifiedScriptPath -Parameters @{
            Mode = "invalid"
        }

        $output | Should -Match "Invalid mode specified"
    }
}