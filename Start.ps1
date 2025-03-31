<#
.SYNOPSIS
    Posterizarr execution script with multiple operation modes.
.PARAMETER Mode
    Execution mode: run (default), watch (file monitoring), or scheduled (time-based).
.PARAMETER FilePath
    Path to a specific .posterizarr file to process (only used in run mode).
#>
param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("run", "watch", "scheduled")]
    [string]$Mode = "run",
    
    [Parameter(Mandatory=$false)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$false)]
    [int]$Timeout = -1
)

# Capture any remaining arguments to pass to Posterizarr.ps1
$RemainingArgs = $MyInvocation.UnboundArguments

$env:PSMODULE_ANALYSIS_CACHE_PATH = $null
$env:PSMODULE_ANALYSIS_CACHE_ENABLED = $false

# Set default values for APP_ROOT and APP_DATA if not already provided
if (!$env:APP_ROOT) {
    $env:APP_ROOT = "/config"
}

if (!$env:APP_DATA) {
    $env:APP_DATA = "/config"
}

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
    Write-Output "Run function was called"

    
    # Checking Config file
    if (-not (test-path "$env:APP_DATA/config.json")) {
        Write-Host ""
        Write-Host "Could not find a 'config.json' file" -ForegroundColor Red
        Write-Host "Please edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow        Write-Host "Pl    # Output this message for tests to detectease edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow
        Write-Host "    After that restart the container..."
        Write-Host "Exiting now"
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
    
    # Create watcher directory if it doesn't exist
    $inputDir = "$env:APP_DATA/watcher"
    if (!(Test-Path -Path $inputDir)) {
        Write-Host "Creating watcher directory at $inputDir"
        New-Item -Path $inputDir -ItemType Directory -Force | Out-Null
    }
    
    # Determine arguments to pass to Posterizarr.ps1
    $incomming_args = $RemainingArgs
    if (-not $args -or $args.Count -eq 0) {
        # todo: do I need this?
        $incomming_args = @("")  # Default argument if none provided
    }
    
    $argsString = $incomming_args -join " "
    write-host "Running Posterizarr.ps1 with arguments: $argsString"
    
    # Calling the Posterizarr Script
    if ((Get-Process | Where-Object commandline -like 'pwsh')) {
        Write-Warning "There is currently running another Process of Posterizarr, skipping this run."
    }
    Else {
        pwsh -NoProfile -Command "$env:APP_ROOT/Posterizarr.ps1 $argsString"
    }
    
    
    return $true
}

function RunScheduled {
    
    Write-Output "RunScheduled function was called"
    
    $CurrentTime = Get-Date
    
    # Check for RUN_TIME environment variable
    if (!$env:RUN_TIME) {
        $env:RUN_TIME = "05:00"  # Set default value if not provided
    }
    
    write-host ""
    write-host "Scheduled execution started at: $(Get-Date)" -ForegroundColor Green
    
    # Parse the RUN_TIME value
    $RunTimes = $env:RUN_TIME -split ','
    
    # Check if current time matches any of the scheduled times (within a 5-minute window)
    $script:ShouldRun = $false  # Make this a script-level variable for testing
    $ClosestTime = $null
    $MinuteDifference = 1440  # Max minutes in a day
    
    foreach ($Time in $RunTimes) {
        $Hour = $Time.Trim().Split(':')[0]
        $Minute = $Time.Trim().Split(':')[1]
        
        # Create a datetime for the scheduled time today
        $ScheduledTime = Get-Date -Hour $Hour -Minute $Minute -Second 0
        
        # Calculate minutes difference
        $Diff = [Math]::Abs(($CurrentTime - $ScheduledTime).TotalMinutes)
        
        # If we're within 5 minutes of a scheduled time, we should run
        if ($Diff -le 5) {
            $script:ShouldRun = $true
            break
        }
        
        # Track the closest time for reporting
        if ($Diff -lt $MinuteDifference) {
            $MinuteDifference = $Diff
            $ClosestTime = $ScheduledTime
        }
    }
    
    # Display information about run times
    write-host "Configured run times: $env:RUN_TIME"
    
    if ($script:ShouldRun) {
        write-host "Current time is within the scheduled window, executing Posterizarr..."
        
        # Call the Run function to execute Posterizarr
        Run
        
        write-host ""
        write-host "Scheduled execution completed at: $(Get-Date)" -ForegroundColor Green
    } else {
        write-host "Current time is not within any scheduled window."
        if ($ClosestTime) {
            write-host "Closest scheduled time is: $($ClosestTime.ToString('HH:mm'))"
        }
        write-host "Use cron to run this at the exact scheduled times."
    }
    
}

function ProcessPosterizarrFile {
    param (
        [Parameter(Mandatory=$true)]
        [string]$FilePath
    )
    
    # Output this message for tests to detect
    Write-Output "ProcessPosterizarrFile function was called with FilePath: $FilePath"
    
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
            $arg_name = $matches[1]
            $arg_value = $matches[2]
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
    Write-Output "WatchDirectory function was called"
    
    # Posterizarr File Watcher for Tautulli Recently Added Files
    $inputDir = "$env:APP_DATA/watcher"
    
    # Create watcher directory if it doesn't exist
    if (!(Test-Path -Path $inputDir)) {
        Write-Host "Creating watcher directory at $inputDir"
        New-Item -Path $inputDir -ItemType Directory -Force | Out-Null
    }
    
    # Real-time file system watcher
    Write-Host "Starting real-time file watcher for directory: $inputDir" -ForegroundColor Green
    if ($Timeout -gt 0) {
        Write-Host "Watching for .posterizarr files for $Timeout seconds..." -ForegroundColor Yellow
    } else {
        Write-Host "Watching for .posterizarr files... Press Ctrl+C to stop." -ForegroundColor Yellow
    }
    
    try {
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = $inputDir
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
        $existingFiles = Get-ChildItem $inputDir -Recurse | Where-Object -FilterScript {
            $_.Extension -match 'posterizarr'
        }
        
        if ($existingFiles.Count -gt 0) {
            Write-Host "Found $($existingFiles.Count) existing .posterizarr files. Processing..." -ForegroundColor Yellow
            foreach($item in $existingFiles) {
                ProcessPosterizarrFile -FilePath $item.FullName
            }
        }
        
        # Keep the script running with timeout support
        try {
            $startTime = Get-Date
            while ($true) {
                # Check if timeout is reached
                if ($Timeout -gt 0) {
                    $elapsedSeconds = ((Get-Date) - $startTime).TotalSeconds
                    if ($elapsedSeconds -ge $Timeout) {
                        Write-Host "Timeout of $Timeout seconds reached, exiting watch mode" -ForegroundColor Yellow
                        break
                    }
                }
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
