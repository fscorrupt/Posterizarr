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

# Capture any remaining arguments to pass to Posterizarr.ps1
$RemainingArgs = $MyInvocation.UnboundArguments


# Set default values for APP_ROOT and APP_DATA if not already provided
if (!$env:APP_ROOT) {
    $env:APP_ROOT = "/config"
}

if (!$env:APP_DATA) {
    $env:APP_DATA = "/config"
}

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

function GetLatestScriptVersion {
    try {
        return Invoke-RestMethod -Uri "https://github.com/fscorrupt/Posterizarr/raw/main/Release.txt" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Host "Could not query latest script version, Error: $($_.Exception.Message)"
        return $null
    }
}
function CompareScriptVersion {
    # Use Select-String to find the line containing the version assignment in Posterizarr.ps1
    try {
        $posterizarrPath = "$env:APP_ROOT/Posterizarr.ps1"
        if (Test-Path $posterizarrPath) {
            $lineContainingVersion = Select-String -Path $posterizarrPath -Pattern '^\$CurrentScriptVersion\s*=\s*"([^"]+)"' | Select-Object -ExpandProperty Line
            $LatestScriptVersion = GetLatestScriptVersion

            if ($lineContainingVersion) {
                # Extract the version from the line
                write-host ""
                $version = $lineContainingVersion -replace '^\$CurrentScriptVersion\s*=\s*"([^"]+)".*', '$1'
                write-host "Current Script Version: $version | Latest Script Version: $LatestScriptVersion" -ForegroundColor Green
            }
        } else {
            write-host "Warning: Could not find Posterizarr.ps1 at $posterizarrPath" -ForegroundColor Yellow
        }
    } catch {
        write-host "Error checking script version: $($_.Exception.Message)" -ForegroundColor Red
    }
}
function Run {

    # Output this message for tests to detect
    Write-Host "Run function was called"


    # Checking Config file
    if (-not (test-path "$env:APP_DATA/config.json")) {
        Write-Host ""
        Write-Host "Could not find a 'config.json' file" -ForegroundColor Red
        Write-Host "Please edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow
        # Output this message for tests to detect
        Write-Host "    After that restart the container..."
        Write-Host "Waiting for config.json file to be created..." -ForegroundColor Cyan
        do {
            Start-Sleep 600
        } until (
            test-path "$env:APP_DATA/config.json"
        )
    }

    # Check temp dir if there is a Currently running file present
    $CurrentlyRunning = "$env:APP_DATA/temp/Posterizarr.Running"

    # Clear Running File
    if (Test-Path $CurrentlyRunning) {
        Remove-Item -LiteralPath $CurrentlyRunning | out-null
        write-host "Cleared .running file..." -ForegroundColor Green
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
# Common function to check if we should run at the scheduled time
function ShouldRunAtScheduledTime {
    param (
        [Parameter(Mandatory=$true)]
        [DateTime]$currentTime,
        [Parameter(Mandatory=$false)]
        [Nullable[DateTime]]$lastExecutionDate = $null
    )

    # Check for RUN_TIME environment variable
    if (!$env:RUN_TIME) {
        $env:RUN_TIME = "05:00"  # Set default value if not provided
    }

    # Parse the RUN_TIME value
    $runTimes = $env:RUN_TIME -split ','
    $shouldRun = $false
    $closestTime = $null
    $minuteDifference = 1440  # Max minutes in a day

    # Check if current time matches any of the scheduled times (within a 5-minute window)
    foreach ($time in $runTimes) {
        # Add error handling for invalid time formats
        if ($time -match '^\s*(\d{1,2}):(\d{1,2})\s*$') {
            $hour = $matches[1]
            $minute = $matches[2]

            # Create a datetime for the scheduled time today
            $scheduledTime = Get-Date -Hour $hour -Minute $minute -Second 0

            # Calculate minutes difference
            $diff = [Math]::Abs(($currentTime - $scheduledTime).TotalMinutes)

            # If we're within 5 minutes of a scheduled time, we should run
            if ($diff -le 5) {
                # Check if we've already run today at this time (if lastExecutionDate is provided)
                if ($lastExecutionDate -eq $null -or
                    ($lastExecutionDate.Date -ne $currentTime.Date) -or
                    ([Math]::Abs(($lastExecutionDate - $scheduledTime).TotalMinutes) -gt 10)) {
                    $shouldRun = $true
                    break
                }
            }

            # Track the closest time for reporting
            if ($diff -lt $minuteDifference) {
                $minuteDifference = $diff
                $closestTime = $scheduledTime
            }
        } else {
            Write-Host "Invalid time format: $time. Expected format: HH:MM" -ForegroundColor Yellow
            continue
        }
    }

    return @{
        ShouldRun = $shouldRun
        ClosestTime = $closestTime
    }
}
function RunScheduled {

    Write-Host "RunScheduled function was called"

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
function ProcessPosterizarrFile {
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
    write-host "Processing .posterizarr file: $fileName"

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
    write-host "Calling Posterizarr with these args: $($Scriptargs -join ' ')"

    # Set the remaining args for the Run function to use
    $script:RemainingArgs = $Scriptargs

    # Call the Run function
    Run

    write-host ""
    write-host "Tautulli Recently added finished, removing trigger file: $fileName"
    write-host ""

    Remove-Item $FilePath -Force -Confirm:$false
}
function WatchDirectory {
    param (
        [Parameter(Mandatory=$false)]
        [int]$Timeout = -1
    )

    # Output this message for tests to detect
    Write-Host "WatchDirectory function was called"

    # Real-time file system watcher
    Write-Host "Starting real-time file watcher for directory: $watcherdir" -ForegroundColor Green
    if ($Timeout -gt 0) {
        Write-Host "Watching for .posterizarr files for $Timeout seconds..." -ForegroundColor Yellow
    } else {
        Write-Host "Watching for .posterizarr files... Press Ctrl+C to stop." -ForegroundColor Yellow
    }

    # Initialize variables for scheduled execution
    $lastExecutionDate = $null
    Write-Host "Watch mode will also run scheduled executions at: $env:RUN_TIME" -ForegroundColor Cyan

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

                # Check for scheduled execution every 30 seconds instead of every second
                $timeCheckInterval = 30
                if (($currentTime - $lastTimeCheck).TotalSeconds -ge $timeCheckInterval) {
                    $lastTimeCheck = $currentTime

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

function CreateDirectories {
    param (
        [string[]]$directories
    )

    foreach ($dir in $directories) {
        if (!(Test-Path -Path $dir)) {
            New-Item -Path $dir -ItemType Directory -Force | Out-Null
        }
    }
}
function CopyFiles {
    param (
        [string]$sourceDir,
        [string]$destDir,
        [string[]]$files
    )

    foreach ($file in $files) {
        $sourcePath = Join-Path -Path $sourceDir -ChildPath $file
        $destPath = Join-Path -Path $destDir -ChildPath $file

        if (Test-Path -Path $sourcePath) {
            Copy-Item -Path $sourcePath -Destination $destPath -Force | Out-Null
        }
    }

    # Copy config.example.json only if config.json is missing
    $configExample = Join-Path -Path $sourceDir -ChildPath "config.example.json"
    $configFile = Join-Path -Path $destDir -ChildPath "config.json"
    $configDest = Join-Path -Path $destDir -ChildPath "config.example.json"

    if (!(Test-Path -Path $configFile) -and (Test-Path -Path $configExample)) {
        Copy-Item -Path $configExample -Destination $configDest -Force | Out-Null
    }
}

# Define paths and files
$directories = @(
    "$env:APP_DATA/Logs",
    "$env:APP_DATA/temp",
    "$env:APP_DATA/watcher",
    "$env:APP_DATA/test"
)

$sourceDir = "/app/"
$destDir = "$env:APP_DATA/"
$files = @(
    "overlay.png",
    "backgroundoverlay.png",
    "overlay-innerglow.png",
    "backgroundoverlay-innerglow.png",
    "Rocky.ttf",
    "Colus-Regular.ttf",
    "Comfortaa-Medium.ttf",
    "Posterizarr.ps1"
)

# Execute functions
CreateDirectories -directories $directories
CopyFiles -sourceDir $sourceDir -destDir $destDir -files $files

# Posterizarr File Watcher for Tautulli Recently Added Files
$global:watcherdir = "$env:APP_DATA/watcher"

# Main execution based on mode
CompareScriptVersion

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
