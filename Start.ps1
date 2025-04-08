<#
.SYNOPSIS
    Posterizarr execution script with multiple operation modes.
.PARAMETER Mode
    Execution mode: run (default), watch (file monitoring and scheduled execution), or scheduled (time-based).
.PARAMETER FilePath
    Path to a specific .posterizarr file to process (only used in run mode).
.PARAMETER Timeout
    Optional timeout in seconds for watch mode. If specified, watch mode will exit after this many seconds.
#>
param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("run", "watch", "scheduled")]
    [string]$Mode = "watch",

    [Parameter(Mandatory=$false)]
    [string]$FilePath,

    [Parameter(Mandatory=$false)]
    [int]$Timeout = -1
)

#region SCRIPT INITIALIZATION

# Capture any remaining arguments to pass to Posterizarr.ps1
$RemainingArgs = $MyInvocation.UnboundArguments

# Set default values for environment variables
if (!$env:APP_ROOT) {
    $env:APP_ROOT = "/app"
}

if (!$env:APP_DATA) {
    $env:APP_DATA = "/config"
}
# Constants for scheduler configuration
$script:EXECUTION_WINDOW_MINUTES = 1             # Window in minutes to consider a scheduled time as "now"
$script:DUPLICATE_PREVENTION_WINDOW_MINUTES = 10 # Window in minutes to prevent duplicate runs
$script:SCHEDULED_TIMES_REFRESH_MINUTES = 5      # How often to refresh scheduled times

#endregion SCRIPT INITIALIZATION

#region DISPLAY HEADER

$Header = @"
----------------------------------------------------
Ideas for the container were taken from:
DapperDrivers & Onedr0p
----------------------------------------------------
======================================================
  _____          _            _
 |  __ \        | |          (_)
 | |__) |__  ___| |_ ___ _ __ _ ______ _ _ __ _ __
 |  ___/ _ \/ __| __/ _ \ '__| |_  / _``` | '__| '__|
 | |  | (_) \__ \ ||  __/ |  | |/ / (_| | |  | |
 |_|   \___/|___/\__\___|_|  |_/___\__,_|_|  |_|
 ======================================================
 To support the projects visit:
 https://github.com/fscorrupt/Posterizarr
----------------------------------------------------
"@

Write-Host $Header

#endregion DISPLAY HEADER



#region UTILITY FUNCTIONS


function GetLatestScriptVersion {
    <#
    .SYNOPSIS
        Retrieves the latest script version from GitHub
    .DESCRIPTION
        Attempts to download the Release.txt file from the GitHub repository
        to determine the latest available version of the script
    .OUTPUTS
        String containing the latest version or $null if retrieval fails
    #>
    try {
        return Invoke-RestMethod -Uri "https://github.com/fscorrupt/Posterizarr/raw/main/Release.txt" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Host "Could not query latest script version, Error: $($_.Exception.Message)"
        return $null
    }
}

function CompareScriptVersion {
    <#
    .SYNOPSIS
        Compares the current script version with the latest available version
    .DESCRIPTION
        Extracts the version from Posterizarr.ps1 and compares it with
        the latest version from GitHub, displaying the results
    #>
    try {
        $posterizarrPath = "$env:APP_ROOT/Posterizarr.ps1"
        if (Test-Path $posterizarrPath) {
            $lineContainingVersion = Select-String -Path $posterizarrPath -Pattern '^\$CurrentScriptVersion\s*=\s*"([^"]+)"' | Select-Object -ExpandProperty Line
            $LatestScriptVersion = GetLatestScriptVersion

            if ($lineContainingVersion) {
                # Extract the version from the line
                Write-Host ""
                $version = $lineContainingVersion -replace '^\$CurrentScriptVersion\s*=\s*"([^"]+)".*', '$1'
                Write-Host "Current Script Version: $version | Latest Script Version: $LatestScriptVersion" -ForegroundColor Green
                if ($version -ne $LatestScriptVersion) {
                    Write-Host "Updating posterizarr for you.." -ForegroundColor Yellow
                    Invoke-WebRequest -uri "https://github.com/fscorrupt/Posterizarr/raw/main/Posterizarr.ps1" -OutFile $posterizarrPath
                    $lineContainingVersion = Select-String -Path $posterizarrPath -Pattern '^\$CurrentScriptVersion\s*=\s*"([^"]+)"' | Select-Object -ExpandProperty Line
                    if ($lineContainingVersion -eq $LatestScriptVersion){
                        Write-Host "Posterizarr updated to the latest version: $LatestScriptVersion" -ForegroundColor Green
                    } else {
                        Write-Host "Failed to update Posterizarr to the latest version." -ForegroundColor Red
                    }
                }
            }
        } else {
            Write-Host "Warning: Could not find Posterizarr.ps1 at $posterizarrPath" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Error checking script version: $($_.Exception.Message)" -ForegroundColor Red
    }
}

function CopyAssetFiles {
    <#
    .SYNOPSIS
        Copies asset files from APP_ROOT to APP_DATA
    .DESCRIPTION
        Copies all .png and .ttf files from the APP_ROOT directory to the APP_DATA directory,
        which is necessary for the application to function properly
    #>
    # Get all asset files - using wildcard in path to make -Include work correctly
    $assetFiles = Get-ChildItem -Path "$env:APP_ROOT/*" -Include "*.png", "*.ttf" -File
    $fileCount = $assetFiles.Count

    if ($fileCount -eq 0) {
        Write-Host "No .png or .ttf files found in $env:APP_ROOT" -ForegroundColor Yellow
    } else {
        $successCount = 0
        $errorCount = 0

        $assetFiles | ForEach-Object {
            try {
                $destinationPath = Join-Path -Path $env:APP_DATA -ChildPath $_.Name
                Copy-Item -Path $_.FullName -Destination $destinationPath -Force
                $successCount++
            } catch {
                $errorCount++
                Write-Host "Failed to copy $($_.Name): $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        # Simple summary message
        Write-Host "Copied $successCount .png & .ttf files from $env:APP_ROOT to $env:APP_DATA" -ForegroundColor Cyan

        if ($errorCount -gt 0) {
            Write-Host "Failed to copy $errorCount files" -ForegroundColor Yellow
        }
    }
}


#endregion UTILITY FUNCTIONS

#region CORE EXECUTION FUNCTION

function Run {
    <#
    .SYNOPSIS
        Main function to execute Posterizarr.ps1
    .DESCRIPTION
        Checks for config file, clears running file if present,
        and executes Posterizarr.ps1 with the provided arguments
    .OUTPUTS
        Boolean indicating success
    #>
    # Output this message for tests to detect
    Write-Host "Run function was called"

    # Checking Config file
    if (-not (Test-Path "$env:APP_DATA/config.json")) {
        Write-Host ""
        Write-Host "Could not find a 'config.json' file" -ForegroundColor Red
        Write-Host "Please edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow
        # Output this message for tests to detect
        Write-Host "    After that restart the container..."
        Write-Host "Waiting for config.json file to be created..." -ForegroundColor Cyan
        do {
            Start-Sleep 600
        } until (
            Test-Path "$env:APP_DATA/config.json"
        )
    }

    # Check temp dir if there is a Currently running file present
    $CurrentlyRunning = "$env:APP_DATA/temp/Posterizarr.Running"

    # Clear Running File
    if (Test-Path $CurrentlyRunning) {
        Remove-Item -LiteralPath $CurrentlyRunning | Out-Null
        Write-Host "Cleared .running file..." -ForegroundColor Green
    }

    # Determine arguments to pass to Posterizarr.ps1
    $incoming_args = $RemainingArgs
    if (-not $incoming_args -or $incoming_args.Count -eq 0) {
        # No arguments provided
        $incoming_args = @()
        $argsString = ""
    } else {
        $argsString = $incoming_args -join " "
    }

    Write-Host "Running Posterizarr.ps1 with arguments: $argsString"

    # Calling the Posterizarr Script
    if ((Get-Process | Where-Object commandline -like '*Posterizarr.ps1*')) {
        Write-Warning "There is currently running another Process of Posterizarr, skipping this run."
    }
    Else {
        pwsh -NoProfile -Command "$env:APP_ROOT/Posterizarr.ps1 $argsString"
    }

    return $true
}

#endregion CORE EXECUTION FUNCTION

#region SCHEDULING FUNCTIONS

function ParseScheduledTimes {
    <#
    .SYNOPSIS
        Parses scheduled execution times from the RUN_TIME environment variable
    .DESCRIPTION
        Converts the comma-separated time strings in HH:MM format from the RUN_TIME
        environment variable into a collection of scheduled time objects
    .OUTPUTS
        Array of hashtables, each containing Hour and Minute properties
    #>
    # Set default run time if not provided
    if (!$env:RUN_TIME) {
        $env:RUN_TIME = "05:00"
    }

    $scheduledTimes = @()
    foreach ($timeString in ($env:RUN_TIME -split ',')) {
        # Validate time format
        if ($timeString -notmatch '^\s*(\d{1,2}):(\d{1,2})\s*$') {
            Write-Host "Invalid time format: $timeString. Expected format: HH:MM" -ForegroundColor Yellow
            continue
        }

        # Validate hour and minute ranges
        $hour = [int]$Matches[1]
        $minute = [int]$Matches[2]

        if ($hour -lt 0 -or $hour -gt 23 -or $minute -lt 0 -or $minute -gt 59) {
            Write-Host "Invalid time values in: $timeString. Hours must be 0-23, minutes 0-59" -ForegroundColor Yellow
            continue
        }

        $scheduledTimes += @{
            Hour = $hour
            Minute = $minute
        }
    }

    if ($scheduledTimes.Count -eq 0) {
        Write-Host "Warning: No valid scheduled times found in RUN_TIME: $env:RUN_TIME" -ForegroundColor Yellow
        # Add a default time (5:00 AM) to prevent errors
        $scheduledTimes += @{
            Hour = 5
            Minute = 0
        }
        Write-Host "Using default scheduled time: 05:00" -ForegroundColor Yellow
    }

    return $scheduledTimes
}

function ShouldRunAtScheduledTime {
    <#
    .SYNOPSIS
        Determines if the current time matches a scheduled execution time
    .DESCRIPTION
        Compares the current time with the scheduled times and determines
        if Posterizarr should be executed based on the execution window
        and duplicate prevention settings
    .PARAMETER currentTime
        The current date and time to check against scheduled times
    .PARAMETER lastExecutionDate
        The date and time of the last execution, used to prevent duplicates
    .OUTPUTS
        Hashtable with ShouldRun (boolean) and ClosestTime (DateTime) properties
    #>
    param (
        [Parameter(Mandatory=$true)]
        [DateTime]$currentTime,
        [Parameter(Mandatory=$false)]
        [Nullable[DateTime]]$lastExecutionDate = $null
    )

    # Initialize return values
    $shouldRun = $false
    $closestTime = $null
    $minuteDifference = 1440  # Max minutes in a day (24 hours * 60 minutes)

    # Process each scheduled time
    foreach ($timeObj in $script:ScheduledTimes) {
        # Create scheduled time object for today
        $scheduledTime = [DateTime]::new(
            $currentTime.Year,
            $currentTime.Month,
            $currentTime.Day,
            $timeObj.Hour,
            $timeObj.Minute,
            0
        )

        # Calculate time difference in minutes
        $diffMinutes = [Math]::Abs(($currentTime - $scheduledTime).TotalMinutes)

        # Check if we should run (within execution window and not already run)
        if ($diffMinutes -le $script:EXECUTION_WINDOW_MINUTES -and $currentTime -ge $scheduledTime) {
            # Skip if we already ran at this time today
            $alreadyRan = $null -ne $lastExecutionDate -and
                        $lastExecutionDate.Date -eq $currentTime.Date -and
                        [Math]::Abs(($lastExecutionDate - $scheduledTime).TotalMinutes) -le $script:DUPLICATE_PREVENTION_WINDOW_MINUTES

            if (-not $alreadyRan) {
                $shouldRun = $true
                $closestTime = $scheduledTime
                break
            }
        }

        # Track closest time for reporting
        if ($diffMinutes -lt $minuteDifference) {
            $minuteDifference = $diffMinutes
            $closestTime = $scheduledTime
        }
    }

    return @{
        ShouldRun = $shouldRun
        ClosestTime = $closestTime
    }
}

function RunScheduled {
    <#
    .SYNOPSIS
        Executes Posterizarr on a schedule
    .DESCRIPTION
        Checks if the current time matches any of the scheduled times
        and executes Posterizarr if it does
    #>
    Write-Host "RunScheduled function was called"

    # Refresh scheduled times in case RUN_TIME was changed
    $script:ScheduledTimes = ParseScheduledTimes

    $currentTime = Get-Date

    Write-Host ""
    Write-Host "Scheduled execution started at: $(Get-Date)" -ForegroundColor Green

    # Use the common function to check if we should run
    $result = ShouldRunAtScheduledTime -currentTime $currentTime
    $script:ShouldRun = $result.ShouldRun  # Make this a script-level variable for testing
    $closestTime = $result.ClosestTime

    # Display information about run times
    Write-Host "Configured run times: $env:RUN_TIME"

    if ($script:ShouldRun) {
        Write-Host "Current time is within the scheduled window, executing Posterizarr..." -ForegroundColor Green

        # Call the Run function to execute Posterizarr
        Run

        Write-Host ""
        Write-Host "Scheduled execution completed at: $(Get-Date)" -ForegroundColor Green
    } else {
        Write-Host "Current time is not within any scheduled window."
        if ($closestTime) {
            Write-Host "Closest scheduled time is: $($closestTime.ToString('HH:mm'))"
        }
        Write-Host "Use cron to run this at the exact scheduled times."
    }
}

#endregion SCHEDULING FUNCTIONS

#region FILE PROCESSING FUNCTIONS

function ProcessPosterizarrFile {
    <#
    .SYNOPSIS
        Processes a .posterizarr file
    .DESCRIPTION
        Reads a .posterizarr file, extracts arguments, and calls Posterizarr.ps1
        with those arguments, then removes the file after processing
    .PARAMETER FilePath
        The path to the .posterizarr file to process
    #>
    param (
        [Parameter(Mandatory=$true)]
        [string]$FilePath
    )

    # Output this message for tests to detect
    Write-Host "ProcessPosterizarrFile function was called with FilePath: $FilePath"

    if (!(Test-Path -Path $FilePath)) {
        Write-Host "File not found: $FilePath" -ForegroundColor Red
        return
    }

    $Scriptargs = @("-Tautulli")
    $fileName = [System.IO.Path]::GetFileName($FilePath)
    Write-Host "Processing .posterizarr file: $fileName"

    # Get trigger Values
    $triggerargs = Get-Content $FilePath

    # Replace args
    foreach ($line in $triggerargs) {
        if ($line -match '^\[(.+)\]: (.+)$') {
            $arg_name = $matches[1].TrimEnd(',')
            $arg_value = $matches[2].TrimEnd(',')
            $Scriptargs += "-$arg_name"
            $Scriptargs += "$arg_value"
        }
    }
    Write-Host "Calling Posterizarr with these args: $($Scriptargs -join ' ')"

    # Set the remaining args for the Run function to use
    $script:RemainingArgs = $Scriptargs

    # Call the Run function
    Run

    Write-Host ""
    Write-Host "Tautulli Recently added finished, removing trigger file: $fileName"
    Write-Host ""

    Remove-Item $FilePath -Force -Confirm:$false
}

#endregion FILE PROCESSING FUNCTIONS

#region WATCH MODE FUNCTIONS

function WatchDirectory {
    <#
    .SYNOPSIS
        Watches a directory for .posterizarr files and processes them
    .DESCRIPTION
        Sets up a FileSystemWatcher to monitor a directory for new .posterizarr files,
        processes them when they appear, and also handles scheduled executions
    .PARAMETER Timeout
        Optional timeout in seconds. If specified, watch mode will exit after this many seconds
    #>
    param (
        [Parameter(Mandatory=$false)]
        [int]$Timeout = -1
    )

    # Output this message for tests to detect
    Write-Host "WatchDirectory function was called"

    # Setup watch dir
    $watcherdir = "$env:APP_DATA/watcher"

    # Real-time file system watcher
    Write-Host "Starting real-time file watcher for directory: $watcherdir" -ForegroundColor Green
    if ($Timeout -gt 0) {
        Write-Host "Watching for .posterizarr files for $Timeout seconds..." -ForegroundColor Yellow
    } else {
        Write-Host "Watching for .posterizarr files... Press Ctrl+C to stop." -ForegroundColor Yellow
    }

    # Initialize variables for scheduled execution
    $lastExecutionDate = $null

    # Refresh scheduled times in case RUN_TIME was changed
    $script:ScheduledTimes = ParseScheduledTimes

    $scheduledTimesString = $env:RUN_TIME
    Write-Host "Watch mode will also run scheduled executions at: $scheduledTimesString" -ForegroundColor Cyan

    try {
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = $watcherdir
        $watcher.Filter = "*.posterizarr"
        $watcher.IncludeSubdirectories = $true
        $watcher.EnableRaisingEvents = $true

        # Define event handlers
        $onCreated = {
            $path = $Event.SourceEventArgs.FullPath
            $changeType = $Event.SourceEventArgs.ChangeType
            $timeStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

            Write-Host "[$timeStamp] File ${changeType}: $path" -ForegroundColor Green

            # Process the file
            ProcessPosterizarrFile -FilePath $path
        }

        # Register event handlers
        $handlers = @()
        $handlers += Register-ObjectEvent -InputObject $watcher -EventName Created -Action $onCreated

        Write-Host "Watcher started. Waiting for .posterizarr files..." -ForegroundColor Green

        # Check for existing files when starting
        $existingFiles = Get-ChildItem $watcherdir -Recurse | Where-Object -FilterScript {
            $_.Extension -match 'posterizarr'
        }

        if ($existingFiles.Count -gt 0) {
            Write-Host "Found $($existingFiles.Count) existing .posterizarr files. Processing..." -ForegroundColor Yellow
            foreach($item in $existingFiles) {
                ProcessPosterizarrFile -FilePath $item.FullName
            }
        }

        # Keep the script running with timeout support and scheduled execution
        try {
            $startTime = Get-Date
            $lastTimeCheck = Get-Date

            while ($true) {
                $currentTime = Get-Date

                # Check if timeout is reached
                if ($Timeout -gt 0) {
                    $elapsedSeconds = ($currentTime - $startTime).TotalSeconds
                    if ($elapsedSeconds -ge $Timeout) {
                        Write-Host "Timeout of $Timeout seconds reached, exiting watch mode" -ForegroundColor Yellow
                        break
                    }
                }

                # Check for scheduled execution every 15 seconds instead of every second
                $timeCheckInterval = 15
                if (($currentTime - $lastTimeCheck).TotalSeconds -ge $timeCheckInterval) {
                    $lastTimeCheck = $currentTime

                    # Periodically refresh scheduled times in case RUN_TIME was changed
                    # Only refresh every 5 minutes to avoid unnecessary processing
                    $timeSinceStart = ($currentTime - $startTime).TotalSeconds
                    $shouldRefreshSchedule = ($timeSinceStart % ($script:SCHEDULED_TIMES_REFRESH_MINUTES * 60)) -lt $timeCheckInterval

                    if ($shouldRefreshSchedule) {
                        $script:ScheduledTimes = ParseScheduledTimes
                    }

                    # Use the common function to check if we should run
                    $result = ShouldRunAtScheduledTime -currentTime $currentTime -lastExecutionDate $lastExecutionDate
                    $script:ShouldRun = $result.ShouldRun

                    # If it's time to run, check if Posterizarr is already running
                    if ($script:ShouldRun) {
                        $currentlyRunning = "$env:APP_DATA/temp/Posterizarr.Running"
                        $isRunning = (Test-Path $currentlyRunning) -or (Get-Process | Where-Object commandline -like '*Posterizarr.ps1*')

                        if ($isRunning) {
                            Write-Host "Watch mode: Scheduled execution skipped at $(Get-Date -Format 'HH:mm:ss') - Posterizarr is already running" -ForegroundColor Yellow
                        } else {
                            Write-Host ""
                            Write-Host "Watch mode: Scheduled execution started at: $(Get-Date)" -ForegroundColor Cyan

                            # Call the Run function to execute Posterizarr
                            Run

                            Write-Host ""
                            Write-Host "Watch mode: Scheduled execution completed at: $(Get-Date)" -ForegroundColor Cyan

                            # Update the last execution date
                            $lastExecutionDate = Get-Date
                        }
                    }
                }

                # Sleep for 1 second before checking again
                Start-Sleep -Seconds 1
            }
        }
        finally {
            # Clean up event handlers
            $handlers | ForEach-Object {
                Unregister-Event -SourceIdentifier $_.Name
            }

            # Dispose the watcher
            $watcher.Dispose()
            Write-Host "File watcher stopped." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Error in file watcher: $_" -ForegroundColor Red
    }
}

#endregion WATCH MODE FUNCTIONS

#region MAIN EXECUTION

# Initialize scheduled times at startup
$script:ScheduledTimes = ParseScheduledTimes

# Check script version
CompareScriptVersion

# Move assets to APP_DATA
CopyAssetFiles

# Execute based on mode
switch ($Mode) {
    "scheduled" {
        RunScheduled
    }
    "watch" {
        WatchDirectory -Timeout $Timeout
    }
    "run" {
        if ($FilePath) {
            # Process a specific file
            ProcessPosterizarrFile -FilePath $FilePath
        } else {
            Run
        }
    }
    default {
        Write-Host "Invalid mode specified. Valid modes are: run, watch, scheduled" -ForegroundColor Red
        exit 1
    }
}

#endregion MAIN EXECUTION
